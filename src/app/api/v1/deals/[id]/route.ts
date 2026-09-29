import { NextRequest, NextResponse } from 'next/server';
import { getDealForCaller } from '@/server/deals';
import { requireSession, route } from '@/server/http';

/**
 * GET /api/v1/deals/:id — the deal, its context, its ledger-derived figures
 * and the caller's availableActions. 404, not 403, for non-parties.
 */
export const GET = route(async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const session = await requireSession();
  const { id } = await ctx.params;
  const deal = await getDealForCaller(id, session.partyId, session.role);
  return NextResponse.json(deal);
});
