import { NextRequest, NextResponse } from 'next/server';
import { markNoShow } from '@/server/viewings';
import { readJson, requireRole, route } from '@/server/http';

/** POST /api/v1/viewings/:id/no-show — no-shows are tracked, not deleted. */
export const POST = route(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const session = await requireRole(['foo', 'admin']);
  await readJson(req);
  const { id } = await ctx.params;
  const viewing = await markNoShow({ viewingId: id, fooPartyId: session.partyId });
  return NextResponse.json({ id: viewing.id, status: viewing.status });
});
