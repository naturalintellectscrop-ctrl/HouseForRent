import { NextRequest, NextResponse } from 'next/server';
import * as deals from '@/server/deals';
import * as moveIn from '@/server/finance/move-in';
import * as deposit from '@/server/finance/deposit';
import * as refunds from '@/server/finance/refunds';
import { DEAL_ACTIONS, type AuthRole } from '@/server/domain';
import { ApiError, jsonSafe, parseShillings, readJson, requireSession, route } from '@/server/http';

/**
 * POST /api/v1/deals/:id/{action} - the transition endpoints.
 *
 * The action name must be one of DEAL_ACTIONS (there is no endpoint for a
 * transition the machine cannot reach, because there is no route for one).
 * Authorisation re-runs here on every request: the role list comes from the
 * SAME table the action catalogue was rendered from, so what was offered
 * and what is allowed cannot drift. Party-scoped actions additionally
 * require the caller to be on the deal - staff pass, as DealPartyGuard lets
 * them.
 *
 * `availableActions` decides what the client is OFFERED; this decides what
 * is ALLOWED. A client that ignores the catalogue and posts anyway is
 * refused exactly as before.
 */
const HANDLERS: Record<string, (args: { dealId: string; actorPartyId: string; role: AuthRole; body: Record<string, unknown> }) => Promise<unknown>> = {
  matchTenant: async ({ dealId, actorPartyId, body }) =>
    deals.matchTenant({ dealId, actorPartyId, reason: optionalText(body.reason) }),
  signAgreement: async ({ dealId, actorPartyId, body }) =>
    deals.signAgreement({
      dealId,
      actorPartyId,
      agreementId: typeof body.agreementId === 'string' && body.agreementId.trim() ? body.agreementId.trim() : undefined,
      reason: optionalText(body.reason),
    }),
  fundEscrow: async ({ dealId, actorPartyId, body }) =>
    deals.fundEscrow({
      dealId,
      actorPartyId,
      // Transitional compatibility field: checked against the derived
      // figure and rejected on mismatch - never trusted (F-012).
      expectedAmount: body.expectedAmount !== undefined ? parseShillings(body.expectedAmount, 'expectedAmount') : undefined,
      reason: optionalText(body.reason),
    }),
  confirmMoveIn: async ({ dealId, actorPartyId, role, body }) =>
    deals.confirmMoveIn({
      dealId,
      actorPartyId,
      actorRole: role,
      reason: optionalText(body.reason),
      note: optionalText(body.note),
      evidenceRef: optionalText(body.evidenceRef),
    }),
  confirmMoveInByLandlord: async ({ dealId, actorPartyId, role, body }) =>
    moveIn.confirmMoveInByLandlord({
      dealId,
      actorPartyId,
      actorRole: role,
      note: optionalText(body.note),
      evidenceRef: optionalText(body.evidenceRef),
    }),
  disputeMoveIn: async ({ dealId, actorPartyId, role, body }) =>
    moveIn.disputeMoveIn({
      dealId,
      actorPartyId,
      actorRole: role,
      reason: requiredText(body.reason, 'dispute-move-in'),
      evidenceRef: optionalText(body.evidenceRef),
    }),
  addMoveInEvidence: async ({ dealId, actorPartyId, role, body }) =>
    moveIn.addMoveInEvidence({
      dealId,
      actorPartyId,
      actorRole: role,
      note: requiredText(body.note, 'add-move-in-evidence'),
      evidenceRef: optionalText(body.evidenceRef),
    }),
  verifyMoveIn: async ({ dealId, actorPartyId, role, body }) =>
    moveIn.verifyMoveIn({
      dealId,
      actorPartyId,
      actorRole: role,
      reason: requiredText(body.reason, 'verify-move-in'),
      evidenceRef: optionalText(body.evidenceRef),
    }),
  rejectMoveIn: async ({ dealId, actorPartyId, role, body }) =>
    moveIn.rejectMoveIn({
      dealId,
      actorPartyId,
      actorRole: role,
      reason: requiredText(body.reason, 'reject-move-in'),
      evidenceRef: optionalText(body.evidenceRef),
    }),
  proposeDeduction: async ({ dealId, actorPartyId, body }) =>
    deposit.proposeDeduction({
      dealId,
      actorPartyId,
      amount: parseShillings(body.amount, 'amount'),
      reason: requiredText(body.reason, 'propose-deduction'),
      evidenceRef: optionalText(body.evidenceRef),
    }),
  approveDeduction: async ({ dealId, actorPartyId, body }) =>
    deposit.approveDeduction({
      dealId,
      deductionId: requiredText(body.deductionId, 'approve-deduction'),
      actorPartyId,
      reason: requiredText(body.reason, 'approve-deduction'),
    }),
  rejectDeduction: async ({ dealId, actorPartyId, body }) =>
    deposit.rejectDeduction({
      dealId,
      deductionId: requiredText(body.deductionId, 'reject-deduction'),
      actorPartyId,
      reason: requiredText(body.reason, 'reject-deduction'),
    }),
  acceptDeduction: async ({ dealId, actorPartyId, body }) =>
    deposit.acceptDeduction({
      dealId,
      deductionId: requiredText(body.deductionId, 'accept-deduction'),
      actorPartyId,
      note: optionalText(body.note),
    }),
  disputeDeduction: async ({ dealId, actorPartyId, body }) =>
    deposit.disputeDeduction({
      dealId,
      deductionId: requiredText(body.deductionId, 'dispute-deduction'),
      actorPartyId,
      reason: requiredText(body.reason, 'dispute-deduction'),
    }),
  applyDeduction: async ({ dealId, actorPartyId, body }) =>
    deposit.applyDeduction({
      dealId,
      deductionId: requiredText(body.deductionId, 'apply-deduction'),
      actorPartyId,
    }),
  withdrawDeduction: async ({ dealId, actorPartyId, body }) =>
    deposit.withdrawDeduction({
      dealId,
      deductionId: requiredText(body.deductionId, 'withdraw-deduction'),
      actorPartyId,
    }),
  refundDeposit: async ({ dealId, actorPartyId, body }) =>
    deposit.refundDeposit({
      dealId,
      actorPartyId,
      reason: requiredText(body.reason, 'refund-deposit'),
    }),
  closeDepositCase: async ({ dealId, actorPartyId, body }) =>
    deposit.closeDepositCase({
      dealId,
      actorPartyId,
      reason: requiredText(body.reason, 'close-deposit-case'),
    }),
  partialRefund: async ({ dealId, actorPartyId, body }) =>
    refunds.partialRefund({
      dealId,
      actorPartyId,
      amount: parseShillings(body.amount, 'amount'),
      reason: requiredText(body.reason, 'partial-refund'),
    }),
  duplicatePaymentRefund: async ({ dealId, actorPartyId, body }) =>
    refunds.duplicatePaymentRefund({
      dealId,
      actorPartyId,
      amount: parseShillings(body.amount, 'amount'),
      reason: requiredText(body.reason, 'duplicate-payment-refund'),
      duplicateOfInstructionId: optionalText(body.duplicateOfInstructionId),
    }),
  reversePayment: async ({ dealId, actorPartyId, body }) =>
    refunds.reversePayment({
      dealId,
      actorPartyId,
      reason: requiredText(body.reason, 'reverse-payment'),
      evidenceRef: optionalText(body.evidenceRef),
    }),
  reverseCommission: async ({ dealId, actorPartyId, body }) =>
    refunds.reverseCommission({
      dealId,
      actorPartyId,
      reasonCategory: requiredText(body.reasonCategory, 'reverse-commission'),
      reason: requiredText(body.reason, 'reverse-commission'),
    }),
  recordProviderFee: async ({ dealId, actorPartyId, body }) =>
    refunds.recordProviderFee({
      dealId,
      actorPartyId,
      amount: parseShillings(body.amount, 'amount'),
      sourceRef: requiredText(body.reason, 'record-provider-fee'),
    }),
  restoreFromPending: async ({ dealId, actorPartyId, body }) =>
    deals.restoreFromPending({
      dealId,
      actorPartyId,
      reason: requiredText(body.reason, 'restore-from-pending'),
    }),
  recordPostSettlementRefund: async ({ dealId, actorPartyId, body }) =>
    refunds.recordPostSettlementRefund({
      dealId,
      actorPartyId,
      amount: parseShillings(body.amount, 'amount'),
      reason: requiredText(body.reason, 'record-post-settlement-refund'),
    }),
  progressPostSettlementRefund: async ({ dealId, actorPartyId, role, body }) =>
    refunds.progressPostSettlementRefund({
      dealId,
      refundId: requiredText(body.refundId, 'progress-post-settlement-refund'),
      actorPartyId,
      actorRole: role,
      outcome: requiredText(body.outcome, 'progress-post-settlement-refund'),
      note: optionalText(body.note),
    }),
  earnCommission: async ({ dealId, actorPartyId, body }) =>
    deals.earnCommission({ dealId, actorPartyId, reason: optionalText(body.reason) }),
  settle: async ({ dealId, actorPartyId, body }) => deals.settle({ dealId, actorPartyId, reason: optionalText(body.reason) }),
  close: async ({ dealId, actorPartyId, body }) => deals.close({ dealId, actorPartyId, reason: optionalText(body.reason) }),
  refund: async ({ dealId, actorPartyId, body }) => deals.refund({ dealId, actorPartyId, reason: optionalText(body.reason) }),
  cancel: async ({ dealId, actorPartyId, body }) =>
    deals.cancel({ dealId, actorPartyId, reason: requiredText(body.reason, 'cancel') }),
  disputeHold: async ({ dealId, actorPartyId, body }) =>
    deals.disputeHold({ dealId, actorPartyId, reason: requiredText(body.reason, 'dispute-hold') }),
  resolveDispute: async ({ dealId, actorPartyId, body }) =>
    deals.resolveDispute({ dealId, actorPartyId, reason: optionalText(body.reason) }),
};

function optionalText(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}
function requiredText(v: unknown, action: string): string {
  if (typeof v !== 'string' || !v.trim()) {
    throw new ApiError(400, 'VALIDATION', `the ${action} action requires a reason - it is recorded permanently on the transition`);
  }
  return v.trim();
}

export const POST = route(async (req: NextRequest, ctx: { params: Promise<{ id: string; action: string }> }) => {
  const session = await requireSession();
  const { id, action } = await ctx.params;
  const body = await readJson(req);

  const spec = DEAL_ACTIONS.find((a) => a.action === action);
  if (!spec) throw new ApiError(404, 'UNKNOWN_ACTION', `no transition named ${action}`);

  // Authorisation: role (same table the catalogue rendered from)…
  if (!spec.roles.includes(session.role)) {
    throw new ApiError(403, 'FORBIDDEN', 'your role cannot perform this action');
  }
  // …and, for party-scoped handlers, being on the deal (staff pass).
  if (spec.partyScoped) {
    const deal = await deals.getDealRow(id);
    if (!deal) throw new ApiError(404, 'DEAL_NOT_FOUND', 'deal not found');
    const isParty = deal.tenantPartyId === session.partyId || deal.landlordPartyId === session.partyId;
    const isStaff = session.role === 'admin' || session.role === 'foo';
    if (!isParty && !isStaff) throw new ApiError(404, 'DEAL_NOT_FOUND', 'deal not found');
  }

  const handler = HANDLERS[spec.handler];
  const result = (await handler({ dealId: id, actorPartyId: session.partyId, role: session.role, body })) as
    | { id: string; status: string }
    | Record<string, unknown>
    | null
    | undefined;
  // Transition handlers return the deal ({id, status}); lifecycle handlers
  // (deductions, refunds, coordination) return their own record shapes. The
  // actual result is returned verbatim - never flattened into a fake deal -
  // with BigInt money serialised as strings (the wire contract everywhere).
  return NextResponse.json(jsonSafe(result ?? null));
});

