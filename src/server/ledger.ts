/**
 * The double-entry ledger and the escrow primitives — the authoritative
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
import { db } from '@/lib/db';
import type { LedgerAccountType } from './domain';

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
 * What this deal STILL OWES BACK — the credit-side magnitude of
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
 * on the caller's transaction client when there is one — an account created
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

/** Settlement part 2: the custodian moves it — debit landlord_payable, credit psp_clearing. */
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
 * The PSP seam. The real repo defines a PaymentProvider abstraction with a
 * mock implementation; the sandbox keeps the seam and the instruction
 * record, and the mock resolves collects immediately. Every surface that
 * shows this says it is a mock — the ledger is correct regardless.
 */
export async function issuePspInstruction(params: {
  dealId: string;
  kind: 'collect' | 'release' | 'refund';
  amount: bigint;
  idempotencyKey: string;
  reference?: string;
}) {
  const existing = await db.pspInstruction.findFirst({
    where: { dealId: params.dealId, kind: params.kind, reference: params.idempotencyKey },
  });
  if (existing) return existing;

  const instruction = await db.pspInstruction.create({
    data: {
      dealId: params.dealId,
      kind: params.kind,
      state: 'succeeded', // the sandbox mock settles instantly and says so
      amount: params.amount,
      reference: params.idempotencyKey,
    },
  });
  await db.pspInstructionEvent.create({
    data: {
      instructionId: instruction.id,
      state: 'succeeded',
      detail: 'MOCK PSP: instruction resolved immediately by the sandbox provider. Not real money movement.',
      occurredAt: new Date(),
    },
  });
  return instruction;
}
