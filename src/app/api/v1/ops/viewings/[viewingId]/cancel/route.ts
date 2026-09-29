import { NextRequest, NextResponse } from 'next/server';
import { opsCancelViewing } from '@/server/viewings';
import { readJson, requireRole, route } from '@/server/http';

/**
 * POST /api/v1/ops/viewings/:id/cancel — operations cancels a requested
 * or scheduled viewing.
 *
 * The landlord-reported case: the owner says the home was let, the officer
 * cannot be sent, and the request must leave the dispatch queue without
 * anybody pretending the visit happened. The frozen graph permits
 * requested/scheduled → cancelled; the audit row carries WHO cancelled it
 * (actorRole admin, `by: operations` in the detail) so a tenant's own
 * cancellation and an operations cancellation never blur.
 */
export const POST = route(async (req: NextRequest, ctx: { params: Promise<{ viewingId: string }> }) => {
  const session = await requireRole(['admin']);
  const { viewingId } = await ctx.params;
  const body = await readJson(req);
  const note = typeof body.note === 'string' && body.note.trim() ? body.note.trim() : undefined;

  const viewing = await opsCancelViewing({
    viewingId,
    adminPartyId: session.partyId,
    note,
  });

  return NextResponse.json({ id: viewing.id, status: viewing.status });
});

export const dynamic = 'force-dynamic';
