/**
 * The double-entry ledger and the escrow primitives - the authoritative
 * record of all value movement (Data_Model.md §8, FR-7.2).
 *
 * Ported from apps/api/src/ledger/{ledger,escrow}.service.ts. Behaviour is
 * unchanged; only the client differs:
 *
 *  - Every mutation goes through `post()`, the ONLY place ledger entries are
 *    written. It validates before committing: ≥ 2 legs, every amount > 0,
 *    sum(debits) === sum(credits). A posting that fails throws before any
 *    row is written.
 *  - Posted entries are never updated or deleted. Corrections are new
 *    reversing postings. (The real database also enforces this with a
 *    BEFORE UPDATE OR DELETE trigger; SQLite keeps the invariant by the
 *    service layer being the only writer.)
 *  - All money is bigint integer shillings. No float appears anywhere.
 *  - SQLite has no SELECT … FOR UPDATE; it serialises writers, and the
 *    settlement/refund liability read runs INSIDE the same transaction as
 *    the posting, which preserves the no-double-release property the row
 *    lock provides on Postgres.
 */
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import type { PspInstructionState } from '@prisma/client';
import { db } from '@/lib/db';
import type { LedgerAccountType } from './domain';
import { initiateNylonCollect, nylonPayMode } from './nylonpay';

/**
 * An instruction's CURRENT state is the `toState` of its most recent event
 * (psp_instruction is immutable - the `state` column only ever holds the
 * initial `pending`). Every reader MUST go through this helper.
 */
export function derivedPspState(
  instruction: { state: string } & { events?: Array<{ toState: string }> | null },
): string {
  return instruction.events?.[0]?.toState ?? instruction.state;
}

const PSP_EVENT_ORDER: Prisma.PspInstructionEventOrderByWithRelationInput[] = [
  { occurredAt: 'desc' },
  { createdAt: 'desc' },
];

type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0];

export class EmptyPostingError extends Error {
  constructor() {
    super('a posting needs at least two legs');
    this.name = 'EmptyPostingError';
  }
}

export class InvalidAmountError extends Error {
  constructor(amount: bigint) {
    super(`a ledger leg must be a positive amount; got ${amount}`);
    this.name = 'InvalidAmountError';
  }
}

export class UnbalancedPostingError extends Error {
  constructor(
    readonly debits: bigint,
    readonly credits: bigint,
  ) {
    super(`posting does not balance: debits ${debits} ≠ credits ${credits}`);
    this.name = 'UnbalancedPostingError';
  }
}

export interface PostingLeg {
  accountId: string;
  direction: 'debit' | 'credit';
  amount: bigint;
}

export interface PostingInput {
  legs: PostingLeg[];
  reference: string;
  dealId?: string;
  occurredAt?: Date;
}

/** Validates a posting. Public so the invariant can be tested directly. */
export function validatePosting(input: PostingInput): void {
  if (input.legs.length < 2) throw new EmptyPostingError();

  let debits = 0n;
  let credits = 0n;
  for (const leg of input.legs) {
    if (leg.amount <= 0n) throw new InvalidAmountError(leg.amount);
    if (leg.direction === 'debit') debits += leg.amount;
    else credits += leg.amount;
  }
  if (debits !== credits) throw new UnbalancedPostingError(debits, credits);
}

/** Writes one balanced posting atomically. Returns the postingId. */
export async function post(input: PostingInput, tx?: Tx): Promise<string> {
  validatePosting(input);

  const postingId = randomUUID();
  const occurredAt = input.occurredAt ?? new Date();

  const write = async (client: Tx) => {
    await client.ledgerEntry.createMany({
      data: input.legs.map((leg) => ({
        postingId,
        accountId: leg.accountId,
        direction: leg.direction,
        amount: leg.amount,
        dealId: input.dealId,
        reference: input.reference,
        occurredAt,
      })),
    });
  };

  if (tx) await write(tx);
  else await db.$transaction(write);

  return postingId;
}

/** Corrections are new reversing postings, never edits (FR-7.2). */
export async function reversePosting(postingId: string, reason: string, tx?: Tx): Promise<string> {
  const client = tx ?? db;
  const original = await client.ledgerEntry.findMany({ where: { postingId } });
  if (original.length === 0) {
    throw new Error(`cannot reverse unknown posting ${postingId}`);
  }
  return post(
    {
      legs: original.map((entry) => ({
        accountId: entry.accountId,
        direction: entry.direction === 'debit' ? ('credit' as const) : ('debit' as const),
        amount: entry.amount,
      })),
      reference: `reversal:${reason}`,
      dealId: original[0].dealId ?? undefined,
    },
    tx,
  );
}

/** Net balance of an account: debits − credits. The sign is preserved. */
export async function balanceOf(accountId: string): Promise<bigint> {
  const entries = await db.ledgerEntry.findMany({
    where: { accountId },
    select: { direction: true, amount: true },
  });
  return entries.reduce(
    (acc, e) => (e.direction === 'debit' ? acc + e.amount : acc - e.amount),
    0n,
  );
}

/**
 * What this deal STILL OWES BACK - the credit-side magnitude of
 * escrow_liability, positive. Must be read inside the transaction that
 * posts against it (see module header).
 */
export async function outstandingEscrowLiability(dealId: string, tx?: Tx): Promise<bigint> {
  const client = tx ?? db;
  const entries = await client.ledgerEntry.findMany({
    where: { dealId, account: { accountType: 'escrow_liability' } },
    select: { direction: true, amount: true },
  });
  return entries.reduce(
    (acc, e) => (e.direction === 'credit' ? acc + e.amount : acc - e.amount),
    0n,
  );
}

/** Global integrity check: every posting in the ledger balances. */
export async function everyPostingBalances(): Promise<boolean> {
  const rows = await db.ledgerEntry.findMany({
    select: { postingId: true, direction: true, amount: true },
  });
  const byPosting = new Map<string, bigint>();
  for (const row of rows) {
    const net = byPosting.get(row.postingId) ?? 0n;
    byPosting.set(
      row.postingId,
      row.direction === 'debit' ? net + row.amount : net - row.amount,
    );
  }
  for (const net of byPosting.values()) {
    if (net !== 0n) return false;
  }
  return true;
}

// ── escrow primitives (escrow.service.ts) ────────────────────────────────

/**
 * Finds (or lazily creates) the per-deal account of a given type. Must run
 * on the caller's transaction client when there is one - an account created
 * outside the transaction would survive a rollback that discarded the
 * postings referencing it.
 */
async function accountFor(accountType: LedgerAccountType, dealId: string, tx?: Tx) {
  const client = tx ?? db;
  const existing = await client.ledgerAccount.findFirst({
    where: { accountType, dealId },
  });
  if (existing) return existing;
  return client.ledgerAccount.create({ data: { accountType, dealId } });
}

/** Client money enters custody: debit psp_clearing, credit escrow_liability. NO revenue. */
export async function fundEscrow(params: { dealId: string; amount: bigint }, tx?: Tx) {
  const pspClearing = await accountFor('psp_clearing', params.dealId, tx);
  const escrowLiability = await accountFor('escrow_liability', params.dealId, tx);
  return post(
    {
      legs: [
        { accountId: pspClearing.id, direction: 'debit', amount: params.amount },
        { accountId: escrowLiability.id, direction: 'credit', amount: params.amount },
      ],
      reference: 'fund_escrow',
      dealId: params.dealId,
    },
    tx,
  );
}

/** Commission EARNED (FR-7.5): debit escrow_liability, credit commission_revenue. */
export async function recogniseCommission(params: { dealId: string; amount: bigint }, tx?: Tx) {
  const escrowLiability = await accountFor('escrow_liability', params.dealId, tx);
  const commissionRevenue = await accountFor('commission_revenue', params.dealId, tx);
  return post(
    {
      legs: [
        { accountId: escrowLiability.id, direction: 'debit', amount: params.amount },
        { accountId: commissionRevenue.id, direction: 'credit', amount: params.amount },
      ],
      reference: 'recognise_commission',
      dealId: params.dealId,
    },
    tx,
  );
}

/** Settlement part 1: debit escrow_liability, credit landlord_payable. */
export async function settle(params: { dealId: string; amount: bigint }, tx?: Tx) {
  const escrowLiability = await accountFor('escrow_liability', params.dealId, tx);
  const landlordPayable = await accountFor('landlord_payable', params.dealId, tx);
  return post(
    {
      legs: [
        { accountId: escrowLiability.id, direction: 'debit', amount: params.amount },
        { accountId: landlordPayable.id, direction: 'credit', amount: params.amount },
      ],
      reference: 'settle',
      dealId: params.dealId,
    },
    tx,
  );
}

/** Settlement part 2: the custodian moves it - debit landlord_payable, credit psp_clearing. */
export async function releaseToLandlord(params: { dealId: string; amount: bigint }, tx?: Tx) {
  const landlordPayable = await accountFor('landlord_payable', params.dealId, tx);
  const pspClearing = await accountFor('psp_clearing', params.dealId, tx);
  return post(
    {
      legs: [
        { accountId: landlordPayable.id, direction: 'debit', amount: params.amount },
        { accountId: pspClearing.id, direction: 'credit', amount: params.amount },
      ],
      reference: 'release_to_landlord',
      dealId: params.dealId,
    },
    tx,
  );
}

/** Pre-move-in refund (FR-7.7): debit escrow_liability, credit psp_clearing. */
export async function refund(params: { dealId: string; amount: bigint }, tx?: Tx) {
  const escrowLiability = await accountFor('escrow_liability', params.dealId, tx);
  const pspClearing = await accountFor('psp_clearing', params.dealId, tx);
  return post(
    {
      legs: [
        { accountId: escrowLiability.id, direction: 'debit', amount: params.amount },
        { accountId: pspClearing.id, direction: 'credit', amount: params.amount },
      ],
      reference: 'refund',
      dealId: params.dealId,
    },
    tx,
  );
}

/**
 * The PSP seam. Two providers sit behind it:
 *  - the sandbox mock (default), which settles instantly and labels every
 *    instruction MOCK in the database itself; and
 *  - Nylon Pay (NYLONPAY_MODE=live + credentials), whose collections are
 *    async - the instruction goes `pending` and only a verified webhook
 *    completes it. See issueLiveInstruction below.
 * The ledger is correct under both; what differs is the truth about money,
 * and the instruction record is what carries that truth.
 */
export async function issuePspInstruction(params: {
  dealId: string;
  kind: 'collect' | 'release' | 'refund';
  amount: bigint;
  idempotencyKey: string;
  reference?: string;
}) {
  if (nylonPayMode() === 'live') return issueLiveInstruction(params);

  // ── Sandbox mock ──
  // Unchanged behaviour: the mock settles instantly and says so, in the
  // database itself. The ledger stays correct either way; only the truth
  // about the money differs, and the truth is what this row records.
  const existing = await db.pspInstruction.findFirst({
    where: { dealId: params.dealId, kind: params.kind, idempotencyKey: params.idempotencyKey },
  });
  if (existing) {
    return db.pspInstruction.findUniqueOrThrow({
      where: { id: existing.id },
      include: { events: { orderBy: PSP_EVENT_ORDER, take: 1 } },
    });
  }

  // The row is immutable, so the mock's instant settlement is expressed the
  // same way the real provider's confirmation is: an event. The +1ms on the
  // settlement event keeps it strictly after the initial pending event even
  // within the same millisecond, so the derived state is unambiguous.
  const pendingAt = new Date();
  const instruction = await db.pspInstruction.create({
    data: {
      dealId: params.dealId,
      kind: params.kind,
      state: 'pending',
      amount: params.amount,
      idempotencyKey: params.idempotencyKey,
    },
  });
  await db.pspInstructionEvent.createMany({
    data: [
      {
        instructionId: instruction.id,
        toState: 'pending',
        detail: 'Instruction issued.',
        occurredAt: pendingAt,
      },
      {
        instructionId: instruction.id,
        toState: 'succeeded',
        detail: 'MOCK PSP: instruction resolved immediately by the sandbox provider. Not real money movement.',
        occurredAt: new Date(pendingAt.getTime() + 1),
      },
    ],
  });
  return db.pspInstruction.findUniqueOrThrow({
    where: { id: instruction.id },
    include: { events: { orderBy: PSP_EVENT_ORDER, take: 1 } },
  });
}

/**
 * ── Live Nylon Pay path ──
 * A collection is ASYNC: the tenant approves a prompt on their phone, so the
 * instruction is created `pending` and only a signature-verified webhook
 * (see /api/v1/payments/nylonpay/webhook) moves it to `succeeded` - which is
 * the only moment custody is booked (the deal service gates its booking on
 * this state). A provider initiation failure marks the instruction `failed`
 * and rethrows: nothing is booked, the retry creates a fresh instruction.
 *
 * Release/refund instructions are parked `pending` until the payout dispatch
 * is wired to the provider's payout API - the honest alternative to the mock
 * pretending the landlord was paid.
 */
async function issueLiveInstruction(params: {
  dealId: string;
  kind: 'collect' | 'release' | 'refund';
  amount: bigint;
  idempotencyKey: string;
}) {
  // Reuse any instruction still in flight or already honoured - the CURRENT
  // state is derived from events (the row itself is immutable and always
  // reads `pending`). A failed/cancelled instruction does not block a retry.
  const existing = await db.pspInstruction.findFirst({
    where: { dealId: params.dealId, kind: params.kind },
    include: { events: { orderBy: PSP_EVENT_ORDER, take: 1 } },
  });
  if (existing && !PSP_TERMINAL_FAILED.has(derivedPspState(existing))) return existing;

  // The provider's reference must be a UUID - it is their dedupe key and the
  // key webhooks use to find this instruction. Fresh instruction, fresh UUID:
  // a FAILED instruction does not block a retry, a live one does.
  const reference = randomUUID();

  if (params.kind === 'collect') {
    const deal = await db.deal.findUniqueOrThrow({
      where: { id: params.dealId },
      include: { tenantParty: true },
    });

    const instruction = await db.pspInstruction.create({
      data: {
        dealId: params.dealId,
        kind: params.kind,
        state: 'pending',
        amount: params.amount,
        idempotencyKey: params.idempotencyKey,
        providerRef: reference,
      },
    });
    await db.pspInstructionEvent.create({
      data: {
        instructionId: instruction.id,
        toState: 'pending',
        detail: 'Submitted to Nylon Pay - awaiting the tenant’s approval of the payment prompt.',
        occurredAt: new Date(),
      },
    });

    try {
      await initiateNylonCollect({
        reference,
        // UGX has no subunit: integer shillings map 1:1. Rent-scale amounts
        // are far below Number.MAX_SAFE_INTEGER.
        amountUGX: Number(params.amount),
        description: 'Rent escrow - House For Rent',
        customerName: deal.tenantParty.displayName,
        customerPhone: deal.tenantParty.primaryPhone,
        metadata: { dealId: params.dealId },
      });
    } catch (err) {
      await transitionPspInstruction({
        instructionId: instruction.id,
        toState: 'failed',
        detail: 'Nylon Pay did not accept the instruction. No money moved; retry the action.',
      });
      throw err;
    }
    return instruction;
  }

  const instruction = await db.pspInstruction.create({
    data: {
      dealId: params.dealId,
      kind: params.kind,
      state: 'pending',
      amount: params.amount,
      idempotencyKey: params.idempotencyKey,
    },
  });
  await db.pspInstructionEvent.create({
    data: {
      instructionId: instruction.id,
      toState: 'pending',
      detail:
        'Awaiting payout dispatch: payouts are dispatched through the provider’s payout API at go-live. No money has moved yet.',
      occurredAt: new Date(),
    },
  });
  return db.pspInstruction.findUniqueOrThrow({
    where: { id: instruction.id },
    include: { events: { orderBy: PSP_EVENT_ORDER, take: 1 } },
  });
}

/** Webhook lookup: the provider only ever speaks our reference (a UUID). */
export async function pspInstructionByReference(reference: string) {
  return db.pspInstruction.findFirst({ where: { providerRef: reference }, include: { deal: true } });
}

const PSP_TERMINAL_STATES = new Set(['succeeded', 'failed']);
const PSP_TERMINAL_FAILED = new Set(['failed']);

/**
 * Advance an instruction and append the event - idempotent under the
 * provider's at-least-once delivery. Rules:
 *  - same state again → acknowledged, no duplicate row (the (instruction,
 *    toState) unique enforces it);
 *  - an already-terminal instruction NEVER changes state (a late `failed`
 *    after `succeeded` is refused and logged - booked custody is only ever
 *    undone through the refund deal action);
 *  - the production state model is three-state (pending/succeeded/failed);
 *    provider "processing" progress belongs in the audit log, not here.
 */
export async function transitionPspInstruction(params: {
  instructionId: string;
  toState: PspInstructionState;
  detail: string;
  occurredAt?: Date;
  providerRef?: string | null;
}) {
  const instruction = await db.pspInstruction.findUnique({
    where: { id: params.instructionId },
    include: { events: { orderBy: PSP_EVENT_ORDER, take: 1 } },
  });
  if (!instruction) return null;

  // The instruction row is IMMUTABLE (BEFORE UPDATE OR DELETE trigger raises
  // on any mutation) - state advances by appending an event; the current
  // state is always the latest event's toState.
  const current = derivedPspState(instruction);
  const effective = params.toState;
  const occurredAt = params.occurredAt ?? new Date();

  if (current === effective) {
    // Redelivery of an already-recorded state - acknowledge silently (the
    // (instruction, toState) unique would reject the duplicate anyway).
    return instruction;
  }
  if (PSP_TERMINAL_STATES.has(current)) {
    // The first terminal outcome stands. A late contradicting delivery is
    // refused here and must never flip the derived state backwards.
    console.error(
      `[ledger] PSP anomaly: instruction ${instruction.id} already ${current}; ignoring late "${params.toState}" - ${params.detail}`,
    );
    return instruction;
  }

  try {
    await db.pspInstructionEvent.create({
      data: {
        instructionId: instruction.id,
        toState: effective,
        providerRef: params.providerRef ?? null,
        detail: params.detail,
        occurredAt,
      },
    });
  } catch (err) {
    // A concurrent delivery recorded the same transition first - the dedup
    // unique ((instruction_id, to_state)) did its job. Idempotent no-op.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return instruction;
    }
    throw err;
  }

  return db.pspInstruction.findUnique({
    where: { id: instruction.id },
    include: { events: { orderBy: PSP_EVENT_ORDER, take: 1 } },
  });
}
