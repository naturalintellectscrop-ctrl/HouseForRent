/**
 * Refunds, reversals, provider fees and financial adjustments
 * (docs/FINANCIAL_ARCHITECTURE.md §6).
 *
 * Distinctions this module exists to keep honest:
 *  - refund BEFORE settlement (platform money back to the tenant) vs refund
 *    AFTER settlement (the LANDLORD's contractual responsibility, coordinated
 *    here, never an HFR liability, never a platform balance);
 *  - full vs partial refunds (partial is a human decision, but bounded by
 *    the ledger and recorded with its reason);
 *  - duplicate payments (booked once - the duplicate is recorded, not
 *    double-booked, and returned through the provider's payout path);
 *  - provider payment reversals (exact reversing postings; commission
 *    reversal only within the approved categories);
 *  - provider processing fees (HFR operating expense - never the tenant's
 *    deposit, never a silent change to a tenant's payment).
 *
 * Every decision lands as a FinancialAdjustment or RefundRecord row plus an
 * audit event; every money effect goes through the ledger's single writer.
 */
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { applyRefundCompletion, applyTransition, requireDeal, systemPartyId, transactional } from '../deals';
import * as ledger from '../ledger';
import { APPROVED_COMMISSION_REVERSAL_CATEGORIES, type DealStatus } from '../domain';
import { ApiError } from '../http';

type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0];

const REVERSIBLE_STATUSES: readonly DealStatus[] = [
  'escrow_funded',
  'move_in_awaiting_verification',
  'move_in_disputed',
  'partially_refunded',
];
const POST_SETTLEMENT_STATUSES = ['settled', 'settlement_pending'] as const;

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

async function outstandingRent(dealId: string, tx?: Tx): Promise<bigint> {
  if (await ledger.hasSplitCustody(dealId, tx)) {
    return ledger.outstandingLiability(dealId, 'rent_escrow_liability', tx);
  }
  return ledger.outstandingEscrowLiability(dealId, tx);
}

/** Admin: refund PART of the rent still held. Bounded by the ledger, recorded. */
export async function partialRefund(params: {
  dealId: string;
  actorPartyId: string;
  amount: bigint;
  reason: string;
}) {
  if (params.amount <= 0n) throw new ApiError(422, 'VALIDATION', 'the refund amount must be positive');
  const outstanding = await outstandingRent(params.dealId);
  if (outstanding <= 0n) throw new ApiError(409, 'NOTHING_HELD', 'no rent is held for this deal');
  if (params.amount > outstanding) {
    throw new ApiError(
      422,
      'AMOUNT_EXCEEDS_HELD',
      `the refund (${params.amount}) exceeds the rent actually held (${outstanding})`,
    );
  }

  const record = await db.refundRecord.create({
    data: {
      dealId: params.dealId,
      kind: 'partial_pre_settlement',
      amount: params.amount,
      reason: params.reason,
      requestedByPartyId: params.actorPartyId,
    },
  });
  const instruction = await ledger.issuePspInstruction({
    dealId: params.dealId,
    kind: 'refund',
    amount: params.amount,
    idempotencyKey: `refund:${record.id}`,
  });
  await db.refundRecord.update({ where: { id: record.id }, data: { instructionId: instruction.id } });

  const pspState = ledger.derivedPspState(instruction);
  if (pspState === 'pending') {
    return transactional(async (tx) => {
      const deal = await requireDeal(params.dealId, tx);
      if (deal.status !== 'refund_pending') {
        return applyTransition(
          {
            deal,
            to: 'refund_pending',
            actorPartyId: params.actorPartyId,
            reason: `Partial refund (${params.amount}) instructed - awaiting provider confirmation.`,
          },
          tx,
        );
      }
      return deal;
    });
  }

  return applyRefundCompletion({
    dealId: params.dealId,
    actorPartyId: params.actorPartyId,
    actorRole: 'admin',
    reason: params.reason,
    refundRecordId: record.id,
    instructionId: instruction.id,
    amountOverride: params.amount,
  });
}

/**
 * Admin: record a DUPLICATE-PAYMENT refund. The ledger booked the payment
 * once; the duplicate is a provider-side collection that must be returned to
 * the tenant. No second booking is made - the decision is recorded, the
 * amount is bounded by what was actually collected, and the payout follows
 * the provider's payout path (unwired in live mode; the record stays pending
 * honestly).
 */
export async function duplicatePaymentRefund(params: {
  dealId: string;
  actorPartyId: string;
  amount: bigint;
  reason: string;
}) {
  if (params.amount <= 0n) throw new ApiError(422, 'VALIDATION', 'the duplicate amount must be positive');
  return transactional(async (tx) => {
    const deal = await requireDeal(params.dealId, tx);

    const entries = await tx.ledgerEntry.findMany({
      where: { dealId: params.dealId, reference: { startsWith: 'fund_escrow' }, direction: 'credit' },
      select: { amount: true },
    });
    const collected = entries.reduce((acc, e) => acc + e.amount, 0n);
    if (params.amount > collected) {
      throw new ApiError(
        422,
        'AMOUNT_EXCEEDS_COLLECTED',
        `the duplicate (${params.amount}) exceeds what was ever collected for this deal (${collected})`,
      );
    }

    const record = await tx.refundRecord.create({
      data: {
        dealId: params.dealId,
        kind: 'duplicate_payment',
        amount: params.amount,
        reason: params.reason,
        requestedByPartyId: params.actorPartyId,
        // No PSP instruction: the payout dispatch is provider-side. Pending
        // until the provider actually returns the money - never pre-marked.
      },
    });
    await tx.financialAdjustment.create({
      data: {
        dealId: params.dealId,
        kind: 'correction',
        reasonCategory: 'duplicate_payment',
        reason: params.reason,
        amount: params.amount,
        actorPartyId: params.actorPartyId,
        actorRole: 'admin',
      },
    });
    await audit(tx, params.actorPartyId, 'duplicate_payment_refund_recorded', params.dealId, {
      recordId: record.id,
      amount: params.amount.toString(),
      reason: params.reason,
      note: 'No ledger booking: the payment was booked once. The duplicate returns through the provider payout path.',
    });
    return { recordId: record.id, state: 'pending' };
  });
}

/**
 * Admin: a PROVIDER PAYMENT REVERSAL - the provider clawed back a confirmed
 * collection (e.g. a mobile-money sender dispute). Pre-settlement: exact
 * reversing postings of funding and commission, the deal ends REVERSED.
 * Post-settlement: no automatic money movement - the deal is flagged
 * financial_review_required and the adjustment is recorded for ops.
 */
export async function reversePayment(params: {
  dealId: string;
  actorPartyId: string;
  reason: string;
  evidenceRef?: string;
}) {
  return transactional(async (tx) => {
    const deal = await requireDeal(params.dealId, tx);
    const status = deal.status as DealStatus;

    if (status === 'closed') {
      throw new ApiError(
        409,
        'DEAL_CLOSED',
        'a closed deal cannot be reversed automatically - record a financial adjustment for the clawback instead',
      );
    }

    if ((POST_SETTLEMENT_STATUSES as readonly string[]).includes(status)) {
      // Post-settlement reversal: the money already left custody. No automatic
      // movement - an authorized review decides what the clawback means.
      await tx.financialAdjustment.create({
        data: {
          dealId: params.dealId,
          kind: 'provider_reversal',
          reasonCategory: 'provider_payment_reversal',
          reason: params.reason,
          amount: await ledger.commissionRecognised(params.dealId, tx),
          actorPartyId: params.actorPartyId,
          actorRole: 'admin',
          evidenceRef: params.evidenceRef ?? null,
        },
      });
      await audit(tx, params.actorPartyId, 'provider_reversal_post_settlement', params.dealId, {
        reason: params.reason,
        evidenceRef: params.evidenceRef ?? null,
        note: 'The provider clawed back a payment after settlement. No automatic movement - ops review required.',
      });
      return applyTransition(
        {
          deal,
          to: 'financial_review_required',
          actorPartyId: params.actorPartyId,
          actorRole: 'admin',
          reason: `Provider payment reversal after settlement - ${params.reason}`,
        },
        tx,
      );
    }

    if (!REVERSIBLE_STATUSES.includes(status)) {
      throw new ApiError(409, 'ILLEGAL_TRANSITION', `a payment reversal is not available from status ${status}`);
    }
    const funded = await outstandingRent(params.dealId, tx);
    const collected = await ledger.commissionRecognised(params.dealId, tx);
    if (funded <= 0n && collected <= 0n) {
      throw new ApiError(409, 'NOTHING_TO_REVERSE', 'no confirmed collection is booked for this deal');
    }

    // Exact reversing postings - funding AND commission, both flipped leg by
    // leg. Net effect: custody, both liabilities and the commission revenue
    // ALL return to zero (the clawback returned the whole payment - including
    // the commission share - to the sender). Partial-payout edge cases leave
    // their honest trace in reconciliation.
    const fundEntries = await tx.ledgerEntry.findMany({
      where: { dealId: params.dealId, reference: { startsWith: 'fund_escrow' } },
      select: { postingId: true },
    });
    const fundPostingIds = [...new Set(fundEntries.map((e) => e.postingId))];
    let reversalPostingId: string | undefined;
    for (const postingId of fundPostingIds) {
      reversalPostingId = await ledger.reversePosting(postingId, `provider reversal: ${params.reason}`, tx);
    }
    if (collected > 0n) {
      const commissionEntries = await tx.ledgerEntry.findMany({
        where: { dealId: params.dealId, reference: 'recognise_commission' },
        select: { postingId: true },
      });
      for (const postingId of [...new Set(commissionEntries.map((e) => e.postingId))]) {
        await ledger.reversePosting(postingId, `provider reversal: ${params.reason}`, tx);
      }
    }

    await tx.financialAdjustment.create({
      data: {
        dealId: params.dealId,
        kind: 'provider_reversal',
        reasonCategory: 'provider_payment_reversal',
        reason: params.reason,
        amount: funded + collected,
        actorPartyId: params.actorPartyId,
        actorRole: 'admin',
        targetPostingId: fundPostingIds[0] ?? null,
        resultingPostingId: reversalPostingId ?? null,
        evidenceRef: params.evidenceRef ?? null,
      },
    });

    return applyTransition(
      {
        deal,
        to: 'reversed',
        actorPartyId: params.actorPartyId,
        actorRole: 'admin',
        reason: `Provider payment reversal - ${params.reason}`,
      },
      tx,
    );
  });
}

/**
 * Admin: reverse the commission and RETURN IT TO THE TENANT. Legal ONLY for
 * the approved categories - the landlord failing to provide the property, or
 * a provider payment reversal. Any other category is refused until the
 * business approves a retention rule for it; nothing is invented here.
 */
export async function reverseCommission(params: {
  dealId: string;
  actorPartyId: string;
  reasonCategory: string;
  reason: string;
}) {
  if (!(APPROVED_COMMISSION_REVERSAL_CATEGORIES as readonly string[]).includes(params.reasonCategory)) {
    throw new ApiError(
      422,
      'COMMISSION_RETENTION_POLICY_PENDING',
      `"${params.reasonCategory}" is not an approved commission-reversal category. Only landlord failure to provide the property and provider payment reversals are approved; every other retention rule awaits business approval.`,
    );
  }
  // The PSP instruction is issued OUTSIDE any transaction (the seam makes
  // network-free mock calls but reads on the global pool; holding the only
  // pool connection open while awaiting it deadlocks a size-1 pool). The
  // decision tx below records the record first; the instruction links after.
  const staged = await transactional(async (tx) => {
    const deal = await requireDeal(params.dealId, tx);
    const commission = await ledger.commissionRecognised(params.dealId, tx);
    if (commission <= 0n) {
      throw new ApiError(409, 'NO_COMMISSION_TO_REVERSE', 'no commission is recognised for this deal');
    }

    const split = await ledger.hasSplitCustody(params.dealId, tx);
    // Leg 1 (split deals, always immediate): commission revenue reverses into
    // the rent liability it was taken from. Legacy deals strike nothing yet -
    // their single revenue→clearing payout posting lands at completion.
    if (split) {
      await ledger.reverseCommissionPosting({ dealId: params.dealId, amount: commission }, tx);
    }

    const record = await tx.refundRecord.create({
      data: {
        dealId: params.dealId,
        kind: 'commission_reversal_payout',
        amount: commission,
        reason: `${params.reasonCategory}: ${params.reason}`,
        requestedByPartyId: params.actorPartyId,
      },
    });
    await tx.financialAdjustment.create({
      data: {
        dealId: params.dealId,
        kind: 'commission_reversal',
        reasonCategory: params.reasonCategory,
        reason: params.reason,
        amount: commission,
        actorPartyId: params.actorPartyId,
        actorRole: 'admin',
      },
    });

    await audit(tx, params.actorPartyId, 'commission_reversed', params.dealId, {
      amount: commission.toString(),
      reasonCategory: params.reasonCategory,
      reason: params.reason,
      recordId: record.id,
    });
    return { recordId: record.id, amount: commission };
  });

  const instruction = await ledger.issuePspInstruction({
    dealId: params.dealId,
    kind: 'refund',
    amount: staged.amount,
    idempotencyKey: `refund:${staged.recordId}`,
  });
  await db.refundRecord.update({
    where: { id: staged.recordId },
    data: { instructionId: instruction.id },
  });

  if (ledger.derivedPspState(instruction) !== 'pending') {
    // Mock PSP: the payout completes immediately.
    await applyCommissionReversalPayout({ recordId: staged.recordId, actorRole: 'admin' });
  }
  return { recordId: staged.recordId, amount: staged.amount.toString() };
}

/** Webhook completion for a commission-reversal payout. */
export async function applyCommissionReversalPayout(params: { recordId: string; actorRole?: string }) {
  return transactional(async (tx) => {
    const record = await tx.refundRecord.findUnique({ where: { id: params.recordId } });
    if (!record) throw new ApiError(404, 'REFUND_RECORD_NOT_FOUND', 'refund record not found');
    if (record.state !== 'pending') return record;

    if (await ledger.hasSplitCustody(record.dealId, tx)) {
      const outstanding = await ledger.outstandingLiability(record.dealId, 'rent_escrow_liability', tx);
      if (record.amount > outstanding) {
        throw new ApiError(409, 'AMOUNT_NOT_HELD', 'the commission-reversal payout exceeds the restored liability');
      }
      await ledger.refundRentLiability(
        { dealId: record.dealId, amount: record.amount, instructionId: record.instructionId ?? undefined },
        tx,
      );
    } else {
      // Legacy: single revenue→clearing payout posting.
      const commissionRevenue = await tx.ledgerAccount.findFirst({
        where: { dealId: record.dealId, accountType: 'commission_revenue' },
      });
      const pspClearing = await tx.ledgerAccount.findFirst({
        where: { dealId: record.dealId, accountType: 'psp_clearing' },
      });
      if (!commissionRevenue || !pspClearing) {
        throw new ApiError(500, 'ACCOUNT_MISSING', 'ledger accounts missing for the commission payout');
      }
      await ledger.post(
        {
          legs: [
            { accountId: commissionRevenue.id, direction: 'debit', amount: record.amount },
            { accountId: pspClearing.id, direction: 'credit', amount: record.amount },
          ],
          reference: `commission_reversal_payout:${record.instructionId ?? record.id}`,
          dealId: record.dealId,
        },
        tx,
      );
    }

    await tx.refundRecord.update({
      where: { id: record.id },
      data: { state: 'confirmed', confirmedAt: new Date() },
    });
    await audit(tx, await systemPartyId(tx), 'commission_reversal_payout_completed', record.dealId, {
      recordId: record.id,
      amount: record.amount.toString(),
      byRole: params.actorRole ?? null,
    });
    return record;
  });
}

/**
 * Admin: record a provider processing fee as an HFR operating expense. The
 * amount comes from VERIFIED provider data (the caller names the source);
 * it never touches the deposit and never changes a tenant's payment.
 */
export async function recordProviderFee(params: {
  dealId: string;
  actorPartyId: string;
  amount: bigint;
  sourceRef: string;
}) {
  if (params.amount <= 0n) throw new ApiError(422, 'VALIDATION', 'the fee amount must be positive');
  if (!params.sourceRef.trim()) {
    throw new ApiError(422, 'VALIDATION', 'the provider source reference is required - fees are never fabricated');
  }
  return transactional(async (tx) => {
    await requireDeal(params.dealId, tx);
    const postingId = await ledger.recordProviderFee(
      { dealId: params.dealId, amount: params.amount, sourceRef: params.sourceRef.trim() },
      tx,
    );
    await tx.financialAdjustment.create({
      data: {
        dealId: params.dealId,
        kind: 'fee_correction',
        reasonCategory: 'provider_processing_fee',
        reason: params.sourceRef.trim(),
        amount: params.amount,
        actorPartyId: params.actorPartyId,
        actorRole: 'admin',
        resultingPostingId: postingId,
      },
    });
    await audit(tx, params.actorPartyId, 'provider_fee_recorded', params.dealId, {
      amount: params.amount.toString(),
      sourceRef: params.sourceRef.trim(),
      postingId,
    });
    return { postingId, amount: params.amount.toString() };
  });
}

// ── post-settlement landlord refund responsibility ────────────────────────

/**
 * Record unearned prepaid rent the LANDLORD is contractually responsible for
 * after settlement. NOT an HFR liability - no ledger posting, no platform
 * balance, no refund promise. HFR coordinates and keeps the record.
 */
export async function recordPostSettlementRefund(params: {
  dealId: string;
  actorPartyId: string;
  amount: bigint;
  reason: string;
}) {
  if (params.amount <= 0n) throw new ApiError(422, 'VALIDATION', 'the claimed amount must be positive');
  return transactional(async (tx) => {
    const deal = await requireDeal(params.dealId, tx);
    if (deal.status !== 'settled' && deal.status !== 'closed') {
      throw new ApiError(
        409,
        'DEAL_NOT_SETTLED',
        'the landlord refund responsibility exists only after settlement',
      );
    }
    const record = await tx.postSettlementRefund.create({
      data: {
        dealId: params.dealId,
        amountClaimed: params.amount,
        reason: params.reason,
        requestedByPartyId: params.actorPartyId,
      },
    });
    await audit(tx, params.actorPartyId, 'post_settlement_refund_recorded', params.dealId, {
      recordId: record.id,
      amount: params.amount.toString(),
      reason: params.reason,
      note: 'The landlord is contractually responsible; this is a coordination record, not a platform liability.',
    });
    return { recordId: record.id, state: record.state };
  });
}

const PROGRESS_OUTCOMES = [
  'landlord_acknowledged',
  'coordinating',
  'resolved_paid_by_landlord',
  'resolved_waived_by_tenant',
  'escalated',
] as const;

const PROGRESS_ALLOWED_FROM: Record<(typeof PROGRESS_OUTCOMES)[number], readonly string[]> = {
  landlord_acknowledged: ['recorded'],
  coordinating: ['recorded', 'landlord_acknowledged'],
  resolved_paid_by_landlord: ['recorded', 'landlord_acknowledged', 'coordinating', 'escalated'],
  resolved_waived_by_tenant: ['recorded', 'landlord_acknowledged', 'coordinating', 'escalated'],
  escalated: ['recorded', 'landlord_acknowledged', 'coordinating'],
};

/**
 * Advance the coordination record. The landlord acknowledges or coordinates
 * (lister/admin); resolutions and escalation are admin decisions. Resolution
 * states name what ACTUALLY happened - paid by the landlord, or waived by
 * the tenant - never what is promised.
 */
export async function progressPostSettlementRefund(params: {
  dealId: string;
  refundId: string;
  actorPartyId: string;
  actorRole: string;
  outcome: string;
  note?: string;
}) {
  if (!(PROGRESS_OUTCOMES as readonly string[]).includes(params.outcome)) {
    throw new ApiError(422, 'VALIDATION', `outcome must be one of: ${PROGRESS_OUTCOMES.join(' | ')}`);
  }
  const outcome = params.outcome as (typeof PROGRESS_OUTCOMES)[number];

  return transactional(async (tx) => {
    const record = await tx.postSettlementRefund.findUnique({ where: { id: params.refundId } });
    if (!record || record.dealId !== params.dealId) {
      throw new ApiError(404, 'REFUND_RECORD_NOT_FOUND', 'post-settlement refund record not found');
    }
    if (!(PROGRESS_ALLOWED_FROM[outcome] as readonly string[]).includes(record.state)) {
      throw new ApiError(
        409,
        'INVALID_REFUND_TRANSITION',
        `cannot move a ${record.state} record to ${outcome}`,
      );
    }
    const isStaffDecision = params.actorRole === 'admin';
    const isLandlordActor = params.actorRole === 'lister';
    if (!isStaffDecision && !(isLandlordActor && (outcome === 'landlord_acknowledged' || outcome === 'coordinating'))) {
      throw new ApiError(403, 'FORBIDDEN', 'resolutions and escalations are admin decisions');
    }

    const resolved = outcome.startsWith('resolved_');
    await tx.postSettlementRefund.update({
      where: { id: record.id },
      data: {
        state: outcome,
        landlordAcknowledgedAt:
          outcome === 'landlord_acknowledged' ? new Date() : record.landlordAcknowledgedAt,
        landlordNote: isLandlordActor ? (params.note ?? record.landlordNote) : record.landlordNote,
        resolutionNote: resolved || outcome === 'escalated' ? (params.note ?? null) : record.resolutionNote,
        resolvedAt: resolved ? new Date() : record.resolvedAt,
        resolvedByPartyId: resolved ? params.actorPartyId : record.resolvedByPartyId,
      },
    });
    await audit(tx, params.actorPartyId, 'post_settlement_refund_progressed', params.dealId, {
      recordId: record.id,
      from: record.state,
      to: outcome,
      note: params.note ?? null,
    });
    return { recordId: record.id, state: outcome };
  });
}
