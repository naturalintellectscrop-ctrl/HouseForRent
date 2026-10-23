import { NextRequest, NextResponse } from 'next/server';
import * as deals from '@/server/deals';
import { DEAL_ACTIONS, type AuthRole } from '@/server/domain';
import { ApiError, parseShillings, readJson, requireSession, route } from '@/server/http';

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
  confirmMoveIn: async ({ dealId, actorPartyId, body }) =>
    deals.confirmMoveIn({ dealId, actorPartyId, reason: optionalText(body.reason) }),
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
  const deal = (await handler({ dealId: id, actorPartyId: session.partyId, role: session.role, body })) as { id: string; status: string };
  return NextResponse.json({ id: deal.id, status: deal.status });
});
