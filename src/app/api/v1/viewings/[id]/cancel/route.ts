import { NextRequest, NextResponse } from 'next/server';
import { cancelViewing } from '@/server/viewings';
import { requireRole, route } from '@/server/http';

/**
 * POST /api/v1/viewings/:id/cancel — the tenant withdraws a requested or
 * scheduled viewing.
 *
 * The service owns every rule (ownership, frozen transition graph, audit
 * row); the HTTP edge adds the session/role gate and nothing else. A
 * conducted viewing arrives here and leaves as a 409
 * ILLEGAL_VIEWING_TRANSITION — deliberately, because retroactively
 * denying an introduction that happened is exactly what the record
 * exists to prevent.
 */
export const POST = route(async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const session = await requireRole(['tenant']);
  const { id } = await ctx.params;
  const viewing = await cancelViewing({ viewingId: id, tenantPartyId: session.partyId });
  return NextResponse.json({ id: viewing.id, status: viewing.status });
});
