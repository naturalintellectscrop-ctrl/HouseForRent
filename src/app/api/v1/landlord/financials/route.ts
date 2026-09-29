import { NextResponse } from 'next/server';
import { landlordFinancials } from '@/server/deals';
import { requireRole, route } from '@/server/http';

/**
 * GET /api/v1/landlord/financials — the signed-in landlord's money position.
 *
 * Every figure is derived here from the ledger, the same rows the
 * reconciliation and deal consoles read. The landlord cannot see anyone
 * else's position and no client-side input can influence the numbers:
 * there are no parameters at all beyond the session.
 */
export const GET = route(async () => {
  const session = await requireRole(['lister']);
  return NextResponse.json(await landlordFinancials(session.partyId));
});

export const dynamic = 'force-dynamic';
