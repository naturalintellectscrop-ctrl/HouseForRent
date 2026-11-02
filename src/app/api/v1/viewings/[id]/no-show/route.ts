import { NextRequest, NextResponse } from 'next/server';
import { markNoShow } from '@/server/viewings';
import { readJson, requireRole, route } from '@/server/http';

/** POST /api/v1/viewings/:id/no-show - no-shows are tracked, not deleted. */
export const POST = route(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const session = await requireRole(['foo', 'admin']);
  await readJson(req);
  const { id } = await ctx.params;
  // The actor's role rides along (B-3): admins close any visit from the
  // console; officers are bound to their own assignment by the service.
  const viewing = await markNoShow({ viewingId: id, fooPartyId: session.partyId, actorRole: session.role });
  return NextResponse.json({ id: viewing.id, status: viewing.status });
});
