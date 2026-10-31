/**
 * Security deposit lifecycle (docs/FINANCIAL_ARCHITECTURE.md §5).
 *
 * The deposit is SEPARATE from rent from the moment of collection: it sits in
 * its own `deposit_liability` ledger account, is never platform revenue,
 * never landlord rent proceeds, and never subject to commission. The money
 * truth is the ledger; THIS module is the multi-party workflow around it:
 *
 *   landlord proposes a deduction (amount ≤ held, reason, evidence)
 *     → HFR review (admin approves / rejects, with reasons; normal
 *       wear-and-tear is never charged to the tenant)
 *     → tenant accepts or disputes
 *     → apply: the deduction leaves the ledger, the deducted share is paid
 *       to the landlord, any balance the proposal covered returns to the
 *       tenant
 *   …and separately: release of the deposit balance to the tenant, and case
 *   closure when the ledger balance is zero.
 *
 * Every step writes an audit event in the same transaction. Deadlines and
 * legal limits are policy-pending config keys - nothing here invents them.
 */
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { systemPartyId, transactional } from '../deals';
import * as ledger from '../ledger';
import { ApiError } from '../http';

type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0];

const DEDUCTION_DECIDABLE = ['proposed', 'under_review', 'disputed_by_tenant'] as const;
/** Deal statuses a deposit action may run in (mirrors the action catalogue). */
const DEPOSIT_ACTION_STATUSES = [
  'escrow_funded',
  'partially_refunded',
  'settlement_pending',
  'settled',
  'closed',
] as const;

async function audit(
  tx: Tx,
  actorPartyId: string,
  eventType: string,
  dealId: string,
  payload: Prisma.InputJsonObject,
) {
  await tx.auditEvent.create({
    data: { actorPartyId, eventType, subjectRef: dealId, payload, occurredAt: new Date() },
  });
}

async function requireCase(tx: Tx, dealId: string) {
  const kase = await tx.depositCase.findUnique({ where: { dealId } });
  if (!kase) throw new ApiError(409, 'DEPOSIT_CASE_MISSING', 'this deal has no deposit case - the deposit lifecycle opens when escrow is funded');
  return kase;
}

async function requireOpenCase(tx: Tx, dealId: string) {
  const kase = await requireCase(tx, dealId);
  if (kase.state === 'closed') {
    throw new ApiError(409, 'DEPOSIT_CASE_CLOSED', 'the deposit case for this deal is closed');
  }
  return kase;
}

async function requireDealInDepositStatus(dealId: string, tx: Tx) {
  const deal = await tx.deal.findUnique({ where: { id: dealId } });
  if (!deal) throw new ApiError(404, 'DEAL_NOT_FOUND', 'deal not found');
  if (!(DEPOSIT_ACTION_STATUSES as readonly string[]).includes(deal.status)) {
    throw new ApiError(409, 'ILLEGAL_TRANSITION', `deposit actions run after funding; deal is ${deal.status}`);
  }
  return deal;
}

/** The landlord proposes a deduction against the held deposit. */
export async function proposeDeduction(params: {
  dealId: string;
  actorPartyId: string;
  amount: bigint;
  reason: string;
  evidenceRef?: string;
}) {
  if (params.amount <= 0n) throw new ApiError(422, 'VALIDATION', 'the deduction amount must be positive');
  return transactional(async (tx) => {
    await requireDealInDepositStatus(params.dealId, tx);
    const kase = await requireOpenCase(tx, params.dealId);
    const held = await ledger.outstandingLiability(params.dealId, 'deposit_liability', tx);
    if (params.amount > held) {
      throw new ApiError(
        422,
        'AMOUNT_EXCEEDS_DEPOSIT',
        `the proposed deduction (${params.amount}) exceeds the deposit actually held (${held})`,
      );
    }
    const deduction = await tx.depositDeduction.create({
      data: {
        caseId: kase.id,
        proposedByPartyId: params.actorPartyId,
        amount: params.amount,
        reason: params.reason,
        evidenceRef: params.evidenceRef ?? null,
      },
    });
    await tx.depositCase.update({ where: { id: kase.id }, data: { state: 'deduction_proposed' } });
    await audit(tx, params.actorPartyId, 'deposit_deduction_proposed', params.dealId, {
      deductionId: deduction.id,
      amount: params.amount.toString(),
      reason: params.reason,
      evidenceRef: params.evidenceRef ?? null,
      depositHeld: held.toString(),
    });
    return deduction;
  });
}

/** HFR review: the deduction is valid (never a wear-and-tear charge). */
export async function approveDeduction(params: {
  dealId: string;
  deductionId: string;
  actorPartyId: string;
  reason: string;
}) {
  return transactional(async (tx) => {
    await requireDealInDepositStatus(params.dealId, tx);
    const deduction = await requireDeduction(tx, params.dealId, params.deductionId);
    if (!(DEDUCTION_DECIDABLE as readonly string[]).includes(deduction.state)) {
      throw new ApiError(409, 'DEDUCTION_NOT_DECIDABLE', `a ${deduction.state} deduction cannot be approved`);
    }
    await tx.depositDeduction.update({
      where: { id: deduction.id },
      data: {
        state: 'approved',
        reviewedByPartyId: params.actorPartyId,
        reviewedAt: new Date(),
        reviewReason: params.reason,
      },
    });
    await tx.depositCase.update({ where: { id: deduction.caseId }, data: { state: 'under_review' } });
    await audit(tx, params.actorPartyId, 'deposit_deduction_approved', params.dealId, {
      deductionId: deduction.id,
      amount: deduction.amount.toString(),
      reason: params.reason,
      priorState: deduction.state,
    });
    return { id: deduction.id, state: 'approved' };
  });
}

/** HFR review: the deduction is not valid. */
export async function rejectDeduction(params: {
  dealId: string;
  deductionId: string;
  actorPartyId: string;
  reason: string;
}) {
  return transactional(async (tx) => {
    await requireDealInDepositStatus(params.dealId, tx);
    const deduction = await requireDeduction(tx, params.dealId, params.deductionId);
    if (!(DEDUCTION_DECIDABLE as readonly string[]).includes(deduction.state)) {
      throw new ApiError(409, 'DEDUCTION_NOT_DECIDABLE', `a ${deduction.state} deduction cannot be rejected`);
    }
    await tx.depositDeduction.update({
      where: { id: deduction.id },
      data: {
        state: 'rejected',
        reviewedByPartyId: params.actorPartyId,
        reviewedAt: new Date(),
        reviewReason: params.reason,
      },
    });
    await recomputeCaseState(tx, deduction.caseId);
    await audit(tx, params.actorPartyId, 'deposit_deduction_rejected', params.dealId, {
      deductionId: deduction.id,
      amount: deduction.amount.toString(),
      reason: params.reason,
      priorState: deduction.state,
    });
    return { id: deduction.id, state: 'rejected' };
  });
}

/** The tenant accepts the reviewed deduction. */
export async function acceptDeduction(params: {
  dealId: string;
  deductionId: string;
  actorPartyId: string;
  note?: string;
}) {
  return transactional(async (tx) => {
    await requireDealInDepositStatus(params.dealId, tx);
    const deduction = await requireDeduction(tx, params.dealId, params.deductionId);
    if (deduction.state !== 'approved') {
      throw new ApiError(409, 'DEDUCTION_NOT_APPROVED', 'only an HFR-approved deduction can be accepted by the tenant');
    }
    await tx.depositDeduction.update({
      where: { id: deduction.id },
      data: { state: 'accepted_by_tenant', tenantRespondedAt: new Date(), tenantResponseNote: params.note ?? null },
    });
    await audit(tx, params.actorPartyId, 'deposit_deduction_accepted', params.dealId, {
      deductionId: deduction.id,
      amount: deduction.amount.toString(),
      note: params.note ?? null,
    });
    return { id: deduction.id, state: 'accepted_by_tenant' };
  });
}

/** The tenant disputes the deduction - it cannot be applied while disputed. */
export async function disputeDeduction(params: {
  dealId: string;
  deductionId: string;
  actorPartyId: string;
  reason: string;
}) {
  return transactional(async (tx) => {
    await requireDealInDepositStatus(params.dealId, tx);
    const deduction = await requireDeduction(tx, params.dealId, params.deductionId);
    if (deduction.state !== 'approved' && deduction.state !== 'proposed') {
      throw new ApiError(409, 'DEDUCTION_NOT_DISPUTABLE', `a ${deduction.state} deduction cannot be disputed`);
    }
    await tx.depositDeduction.update({
      where: { id: deduction.id },
      data: {
        state: 'disputed_by_tenant',
        tenantRespondedAt: new Date(),
        tenantResponseNote: params.reason,
      },
    });
    await tx.depositCase.update({ where: { id: deduction.caseId }, data: { state: 'under_review' } });
    await audit(tx, params.actorPartyId, 'deposit_deduction_disputed', params.dealId, {
      deductionId: deduction.id,
      amount: deduction.amount.toString(),
      reason: params.reason,
    });
    return { id: deduction.id, state: 'disputed_by_tenant' };
  });
}

/**
 * APPLY the deduction - the only deposit-deduction money movement: the
 * deducted share is paid to the landlord out of the deposit, and the balance
 * the proposal covers (deduction against held deposit) stays - what returns
 * to the tenant is any LATER release of the remainder. The ledger posts:
 *   debit deposit_liability (amount) / credit landlord_payable → release.
 */
export async function applyDeduction(params: {
  dealId: string;
  deductionId: string;
  actorPartyId: string;
}) {
  // The payout instruction is issued BEFORE the transaction (PSP seam
  // discipline); the ledger postings run only once it is confirmed - the
  // sandbox mock confirms instantly, live mode parks pending and a retry
  // reuses the instruction (idempotent per deduction).
  return transactional(async (tx) => {
    await requireDealInDepositStatus(params.dealId, tx);
    const deduction = await requireDeduction(tx, params.dealId, params.deductionId);
    if (deduction.state !== 'accepted_by_tenant') {
      throw new ApiError(
        409,
        'DEDUCTION_NOT_APPLICABLE',
        'only a tenant-accepted deduction can be applied - the tenant must accept (or a dispute must be resolved) first',
      );
    }
    const held = await ledger.outstandingLiability(params.dealId, 'deposit_liability', tx);
    if (deduction.amount > held) {
      throw new ApiError(409, 'AMOUNT_EXCEEDS_DEPOSIT', 'the deposit no longer covers this deduction - reconcile first');
    }
    return { deduction, held };
  }).then(async ({ deduction, held }) => {
    const instruction = await ledger.issuePspInstruction({
      dealId: params.dealId,
      kind: 'release',
      amount: deduction.amount,
      idempotencyKey: `deduction:${deduction.id}`,
    });
    if (ledger.derivedPspState(instruction) === 'pending') {
      await db.auditEvent.create({
        data: {
          actorPartyId: params.actorPartyId,
          eventType: 'deposit_deduction_payout_pending',
          subjectRef: params.dealId,
          payload: {
            deductionId: deduction.id,
            amount: deduction.amount.toString(),
            instructionId: instruction.id,
            note: 'Deduction payout instructed - awaiting provider dispatch; retry apply once confirmed.',
          },
          occurredAt: new Date(),
        },
      });
      return { id: deduction.id, state: 'payout_pending', depositRemaining: held.toString() };
    }

    return transactional(async (tx) => {
      const fresh = await requireDeduction(tx, params.dealId, params.deductionId);
      if (fresh.state !== 'accepted_by_tenant') {
        throw new ApiError(409, 'DEDUCTION_NOT_APPLICABLE', 'the deduction is no longer applicable');
      }
      // RE-CHECK the held balance inside the transaction that posts. The
      // earlier check ran in a different transaction, before the PSP
      // instruction was issued - a release, refund or second deduction that
      // completed in between must not be able to drive deposit_liability
      // negative. This read-and-post pair is the no-double-spend guard.
      const heldNow = await ledger.outstandingLiability(params.dealId, 'deposit_liability', tx);
      if (fresh.amount > heldNow) {
        throw new ApiError(
          409,
          'AMOUNT_EXCEEDS_DEPOSIT',
          `the deposit no longer covers this deduction (${fresh.amount} > ${heldNow}) - reconcile first`,
        );
      }
      const postingId = await ledger.payDeductionToLandlord({ dealId: params.dealId, amount: fresh.amount }, tx);
      await ledger.releaseToLandlord({ dealId: params.dealId, amount: fresh.amount }, tx);

      await tx.depositDeduction.update({
        where: { id: fresh.id },
        data: { state: 'applied', appliedPostingId: postingId },
      });
      const remaining = await ledger.outstandingLiability(params.dealId, 'deposit_liability', tx);
      await tx.depositCase.update({
        where: { id: fresh.caseId },
        data: { state: remaining === 0n ? 'closed' : 'partially_released', closedAt: remaining === 0n ? new Date() : null },
      });
      await audit(tx, params.actorPartyId, 'deposit_deduction_applied', params.dealId, {
        deductionId: fresh.id,
        amount: fresh.amount.toString(),
        postingId,
        instructionId: instruction.id,
        depositRemaining: remaining.toString(),
      });
      return { id: fresh.id, state: 'applied', depositRemaining: remaining.toString() };
    });
  });
}

/** The landlord withdraws their own proposal (or an admin does, for them). */
export async function withdrawDeduction(params: {
  dealId: string;
  deductionId: string;
  actorPartyId: string;
}) {
  return transactional(async (tx) => {
    await requireDealInDepositStatus(params.dealId, tx);
    const deduction = await requireDeduction(tx, params.dealId, params.deductionId);
    if (!(DEDUCTION_DECIDABLE as readonly string[]).includes(deduction.state)) {
      throw new ApiError(409, 'DEDUCTION_NOT_WITHDRAWABLE', `a ${deduction.state} deduction cannot be withdrawn`);
    }
    await tx.depositDeduction.update({ where: { id: deduction.id }, data: { state: 'withdrawn' } });
    await recomputeCaseState(tx, deduction.caseId);
    await audit(tx, params.actorPartyId, 'deposit_deduction_withdrawn', params.dealId, {
      deductionId: deduction.id,
      amount: deduction.amount.toString(),
    });
    return { id: deduction.id, state: 'withdrawn' };
  });
}

/**
 * Release the WHOLE remaining deposit to the tenant. The amount is the
 * ledger balance of the deposit liability - never a typed figure. Live PSP:
 * a RefundRecord + refund instruction are issued and the payout completes on
 * the webhook; the sandbox mock completes immediately.
 */
export async function refundDeposit(params: { dealId: string; actorPartyId: string; reason: string }) {
  const held = await ledger.outstandingLiability(params.dealId, 'deposit_liability');
  if (held <= 0n) throw new ApiError(409, 'NOTHING_HELD', 'no deposit balance is held for this deal');

  // Duplicate release request: one deposit release may be in flight at a
  // time. In live mode an instructed release stays pending until the
  // provider confirms, so stacking a second full-balance instruction would
  // instruct the provider twice for the same money. (The completion path's
  // ledger-balance check remains the hard guard; this keeps the record set
  // honest so the provider is never instructed twice.)
  const pendingRelease = await db.refundRecord.findFirst({
    where: { dealId: params.dealId, kind: 'deposit_refund', state: 'pending' },
    select: { id: true },
  });
  if (pendingRelease) {
    throw new ApiError(
      409,
      'RELEASE_ALREADY_PENDING',
      `a deposit release for this deal is already pending (record ${pendingRelease.id}) - wait for the provider's confirmation instead of instructing a second payout`,
    );
  }

  const record = await db.refundRecord.create({
    data: {
      dealId: params.dealId,
      kind: 'deposit_refund',
      amount: held,
      reason: params.reason,
      requestedByPartyId: params.actorPartyId,
    },
  });
  const instruction = await ledger.issuePspInstruction({
    dealId: params.dealId,
    kind: 'refund',
    amount: held,
    idempotencyKey: `refund:${record.id}`,
  });
  await db.refundRecord.update({ where: { id: record.id }, data: { instructionId: instruction.id } });

  const pspState = ledger.derivedPspState(instruction);
  if (pspState === 'failed') {
    await db.refundRecord.update({
      where: { id: record.id },
      data: { state: 'failed', failureReason: 'the payout instruction failed at issue time - nothing moved' },
    });
    throw new ApiError(502, 'PSP_INSTRUCTION_FAILED', 'the provider refused the deposit-release instruction; nothing moved - retry it from the finance console');
  }
  if (pspState === 'pending') {
    await db.auditEvent.create({
      data: {
        actorPartyId: params.actorPartyId,
        eventType: 'deposit_refund_pending',
        subjectRef: params.dealId,
        payload: {
          recordId: record.id,
          amount: held.toString(),
          instructionId: instruction.id,
          note: 'Deposit release instructed - awaiting provider confirmation.',
        },
        occurredAt: new Date(),
      },
    });
    return { recordId: record.id, state: 'pending', amount: held.toString() };
  }

  await applyDepositRefundCompletion({ recordId: record.id, actorRole: 'admin', actorPartyId: params.actorPartyId });
  return { recordId: record.id, state: 'confirmed', amount: held.toString() };
}

/**
 * The deposit-refund completion - the ONLY place deposit custody is released
 * to the tenant. Webhook path (live) and mock path share it.
 */
export async function applyDepositRefundCompletion(params: {
  recordId: string;
  actorRole?: string;
  actorPartyId?: string;
}) {
  return transactional(async (tx) => {
    const record = await tx.refundRecord.findUnique({ where: { id: params.recordId } });
    if (!record) throw new ApiError(404, 'REFUND_RECORD_NOT_FOUND', 'refund record not found');
    if (record.state !== 'pending') return record;

    const held = await ledger.outstandingLiability(record.dealId, 'deposit_liability', tx);
    if (record.amount > held) {
      throw new ApiError(
        409,
        'AMOUNT_EXCEEDS_DEPOSIT',
        `the instructed deposit release (${record.amount}) exceeds the deposit actually held (${held}) - reconcile before releasing`,
      );
    }
    await ledger.releaseDepositToTenant(
      { dealId: record.dealId, amount: record.amount, instructionId: record.instructionId ?? undefined },
      tx,
    );
    await tx.refundRecord.update({
      where: { id: record.id },
      data: { state: 'confirmed', confirmedAt: new Date() },
    });

    const remaining = await ledger.outstandingLiability(record.dealId, 'deposit_liability', tx);
    const kase = await tx.depositCase.findUnique({ where: { dealId: record.dealId } });
    if (kase && kase.state !== 'closed') {
      await tx.depositCase.update({
        where: { id: kase.id },
        data: { state: remaining === 0n ? 'closed' : 'partially_released' },
      });
    }
    await audit(tx, params.actorPartyId ?? (await systemPartyId(tx)), 'deposit_refund_completed', record.dealId, {
      recordId: record.id,
      amount: record.amount.toString(),
      depositRemaining: remaining.toString(),
      byRole: params.actorRole ?? null,
    });
    return record;
  });
}

/** Close the deposit case - only when the ledger balance is zero. */
export async function closeDepositCase(params: { dealId: string; actorPartyId: string; reason: string }) {
  return transactional(async (tx) => {
    await requireDealInDepositStatus(params.dealId, tx);
    const kase = await requireCase(tx, params.dealId);
    if (kase.state === 'closed') throw new ApiError(409, 'DEPOSIT_CASE_CLOSED', 'the deposit case is already closed');
    const held = await ledger.outstandingLiability(params.dealId, 'deposit_liability', tx);
    if (held !== 0n) {
      throw new ApiError(
        409,
        'DEPOSIT_STILL_HELD',
        `the deposit ledger balance is ${held} - every shilling must be released, deducted or refunded before closure`,
      );
    }
    await tx.depositCase.update({
      where: { id: kase.id },
      data: { state: 'closed', closedAt: new Date(), closedReason: params.reason },
    });
    await audit(tx, params.actorPartyId, 'deposit_case_closed', params.dealId, {
      reason: params.reason,
    });
    return { state: 'closed' };
  });
}

// ── internals ─────────────────────────────────────────────────────────────

async function requireDeduction(tx: Tx, dealId: string, deductionId: string) {
  const deduction = await tx.depositDeduction.findUnique({ where: { id: deductionId } });
  if (!deduction) throw new ApiError(404, 'DEDUCTION_NOT_FOUND', 'deduction not found');
  const kase = await tx.depositCase.findUnique({ where: { id: deduction.caseId } });
  if (!kase || kase.dealId !== dealId) {
    throw new ApiError(404, 'DEDUCTION_NOT_FOUND', 'deduction does not belong to this deal');
  }
  return deduction;
}

/** Recompute the coarse case state after a decision/withdrawal. */
async function recomputeCaseState(tx: Tx, caseId: string) {
  const kase = await tx.depositCase.findUniqueOrThrow({ where: { id: caseId } });
  if (kase.state === 'closed') return;
  const open = await tx.depositDeduction.findFirst({
    where: {
      caseId,
      state: { in: ['proposed', 'under_review', 'disputed_by_tenant', 'approved', 'accepted_by_tenant'] },
    },
  });
  const held = await ledger.outstandingLiability(kase.dealId, 'deposit_liability', tx);
  await tx.depositCase.update({
    where: { id: caseId },
    data: {
      state: open ? 'deduction_proposed' : held === 0n ? 'closed' : 'partially_released',
    },
  });
}
