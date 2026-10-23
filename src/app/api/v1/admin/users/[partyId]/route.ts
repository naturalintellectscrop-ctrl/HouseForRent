import { NextRequest, NextResponse } from 'next/server';
import { api } from '@/lib/api';
import { requireRole, route } from '@/server/http';

/**
 * GET /api/v1/admin/users/:partyId - one account in full (Task 13).
 *
 * A subject-scoped read for dispute handling and landlord phone calls:
 * standing, identity state (the mock says so itself), holdings, and the
 * account's own audit trail. It deliberately does NOT return ledger
 * balances or other parties' records - money detail lives on the deal
 * page, where the deal's audit trail lives too.
 */
export const GET = route(async (_req: NextRequest, ctx: { params: Promise<{ partyId: string }> }) => {
  await requireRole(['admin']);
  const { partyId } = await ctx.params;
  return NextResponse.json(await api(`/v1/admin/users/${partyId}`));
});

export const dynamic = 'force-dynamic';
