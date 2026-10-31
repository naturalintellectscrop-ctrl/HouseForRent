/**
 * The admin finance OPERATIONS read-model: the unresolved work a finance
 * administrator has to act on, each item carrying its actual execution
 * state - never a synthesised success indicator.
 *
 * Sections (all consumed by /ops/finance through the operations endpoint):
 *  - unresolvedDuplicatePayments: provider double-collection confirmations
 *    from the audit trail, each paired with whatever resolution exists -
 *    resolved (confirmed returns cover the payment), partially_resolved
 *    (some confirmed), refund_in_progress (open record, nothing confirmed)
 *    or unresolved (nothing at all);
 *  - refundRecords: every refund record with its kind, state, failure
 *    reason and whether it is retryable;
 *  - pendingDeals: deals parked on a money wait (payment / settlement /
 *    refund), with the instruction states they wait on;
 *  - blockedPayouts: payouts that CANNOT proceed and why - in live mode
 *    that is every undispatched payout (no provider payout integration);
 *  - audit tail: the most recent money events, verbatim.
 */
import { db } from '@/lib/db';
import { derivedPspState } from '../ledger';
import { nylonPayMode } from '../nylonpay';

export async function unresolvedDuplicatePayments(limit = 50) {
  const events = await db.auditEvent.findMany({
    where: { eventType: 'psp_duplicate_collect_confirmation' },
    orderBy: { occurredAt: 'desc' },
    take: limit,
  });
  if (events.length === 0) return [];

  const rows = await Promise.all(
    events.map(async (event) => {
      const payload = event.payload as { dealId?: string; confirmed?: string };
      const instructionId = event.subjectRef;
      const instruction = instructionId
        ? await db.pspInstruction.findUnique({ where: { id: instructionId } })
        : null;
      // A deal has exactly ONE live collection instruction (the machine
      // refuses a second funding), so the deal scope IS the correct
      // attribution for its duplicate refunds - including segments recorded
      // before the source-link field existed or without it.
      const resolutions = await db.refundRecord.findMany({
        where: {
          kind: 'duplicate_payment',
          dealId: payload.dealId ?? instruction?.dealId ?? '',
        },
        orderBy: { createdAt: 'desc' },
      });
      // Resolution semantics: a duplicate may be returned in SEGMENTS, so
      // "resolved" means the confirmed returns cover the whole payment;
      // "partiallyResolved" means confirmed returns exist but the decision
      // is not complete; "unresolved" means nothing has come back yet.
      const confirmedTotal = resolutions
        .filter((r) => r.state === 'confirmed')
        .reduce((acc, r) => acc + r.amount, 0n);
      const sourceAmount = instruction?.amount ?? null;
      const resolutionState =
        sourceAmount !== null && confirmedTotal >= sourceAmount
          ? 'resolved'
          : confirmedTotal > 0n
            ? 'partially_resolved'
            : resolutions.length > 0
              ? 'refund_in_progress'
              : 'unresolved';
      return {
        eventId: event.id,
        seenAt: event.occurredAt.toISOString(),
        dealId: payload.dealId ?? null,
        instructionId: instructionId ?? null,
        confirmedAmount: payload.confirmed ?? instruction?.amount.toString() ?? null,
        resolutionState,
        resolved: resolutionState === 'resolved',
        confirmedReturned: confirmedTotal.toString(),
        resolutions: resolutions.map((r) => ({
          id: r.id,
          state: r.state,
          amount: r.amount.toString(),
          createdAt: r.createdAt.toISOString(),
        })),
      };
    }),
  );
  return rows;
}

export async function refundRecordRows(limit = 50) {
  const records = await db.refundRecord.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: {
      deal: { select: { id: true, status: true } },
    },
  });
  const instructionIds = records.map((r) => r.instructionId).filter((v): v is string => Boolean(v));
  const instructions = await db.pspInstruction.findMany({
    where: { id: { in: instructionIds } },
    include: { events: { orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }], take: 1 } },
  });
  const stateById = new Map(instructions.map((i) => [i.id, derivedPspState(i)]));

  return records.map((r) => ({
    id: r.id,
    dealId: r.dealId,
    dealStatus: r.deal.status,
    kind: r.kind,
    state: r.state,
    amount: r.amount.toString(),
    reason: r.reason,
    createdAt: r.createdAt.toISOString(),
    confirmedAt: r.confirmedAt?.toISOString() ?? null,
    failureReason: r.failureReason,
    instructionId: r.instructionId,
    instructionState: r.instructionId ? stateById.get(r.instructionId) ?? null : null,
    retryable: r.state === 'failed',
  }));
}

export async function pendingMoneyDeals(limit = 50) {
  const deals = await db.deal.findMany({
    where: { status: { in: ['payment_pending', 'settlement_pending', 'refund_pending'] } },
    orderBy: { updatedAt: 'desc' },
    take: limit,
    select: {
      id: true,
      status: true,
      updatedAt: true,
      monthlyRentSnapshot: true,
      advanceRentSnapshot: true,
      depositAmountSnapshot: true,
      tenantParty: { select: { displayName: true } },
      landlordParty: { select: { displayName: true } },
    },
  });
  const ids = deals.map((d) => d.id);
  const instructions = ids.length
    ? await db.pspInstruction.findMany({
        where: { dealId: { in: ids } },
        include: { events: { orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }], take: 1 } },
      })
    : [];
  const byDeal = new Map<string, typeof instructions>();
  for (const i of instructions) {
    const list = byDeal.get(i.dealId) ?? [];
    list.push(i);
    byDeal.set(i.dealId, list);
  }

  return deals.map((d) => ({
    id: d.id,
    status: d.status,
    updatedAt: d.updatedAt.toISOString(),
    tenantName: d.tenantParty.displayName,
    landlordName: d.landlordParty.displayName,
    advanceRentSnapshot: d.advanceRentSnapshot?.toString() ?? null,
    depositAmountSnapshot: d.depositAmountSnapshot?.toString() ?? null,
    instructions: (byDeal.get(d.id) ?? []).map((i) => ({
      id: i.id,
      kind: i.kind,
      amount: i.amount.toString(),
      state: derivedPspState(i),
    })),
  }));
}

/**
 * Payouts that cannot proceed and the reason. In live mode every pending
 * release/refund instruction is BLOCKED - the provider payout API is not
 * integrated, and pretending otherwise would be the lie this console must
 * never tell. In sandbox mode pending payouts are a transient state (the
 * mock settles instantly), so the section honestly reports none.
 */
export async function blockedPayouts(limit = 50) {
  const mode = nylonPayMode();
  if (mode !== 'live') return [];
  const instructions = await db.pspInstruction.findMany({
    where: { kind: { in: ['release', 'refund'] } },
    include: { events: { orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }], take: 1 } },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
  return instructions
    .filter((i) => derivedPspState(i) === 'pending')
    .map((i) => ({
      instructionId: i.id,
      dealId: i.dealId,
      kind: i.kind,
      amount: i.amount.toString(),
      state: derivedPspState(i),
      blockedReason:
        'Provider payout dispatch is not integrated: the instruction is parked pending and NO money has moved. It completes only through a provider confirmation.',
    }));
}

/** The most recent money-relevant audit events, verbatim. */
export async function financeAuditTail(limit = 30) {
  const events = await db.auditEvent.findMany({
    where: {
      eventType: {
        in: [
          'escrow_funded',
          'deal_settled',
          'commission_reversed',
          'commission_reversal_payout_completed',
          'duplicate_payment_refund_recorded',
          'duplicate_refund_completed',
          'refund_retry_issued',
          'provider_fee_recorded',
          'provider_reversal_post_settlement',
          'post_settlement_refund_recorded',
          'post_settlement_refund_progressed',
          'psp_duplicate_collect_confirmation',
          'psp_amount_mismatch',
          'psp_terminal_refused',
          'psp_booking_failed',
          'provider_statement_imported',
        ],
      },
    },
    orderBy: { occurredAt: 'desc' },
    take: limit,
    include: { actorParty: { select: { displayName: true } } },
  });
  return events.map((e) => ({
    id: e.id,
    eventType: e.eventType,
    actorName: e.actorParty?.displayName ?? 'system',
    subjectRef: e.subjectRef,
    payload: e.payload,
    occurredAt: e.occurredAt.toISOString(),
  }));
}
