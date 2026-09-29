import { NextRequest, NextResponse } from 'next/server';
import { conduct } from '@/server/viewings';
import { readJson, requireRole, route } from '@/server/http';

/**
 * POST /api/v1/viewings/:id/conduct — THE stage invariant. Refuses without
 * a field report (FIELD_REPORT_REQUIRED), then writes the immutable
 * introduction record and the conducted status together.
 */
export const POST = route(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const session = await requireRole(['foo', 'admin']);
  await readJson(req);
  const { id } = await ctx.params;
  const { viewing, introduction } = await conduct({ viewingId: id, fooPartyId: session.partyId });
  return NextResponse.json(
    { viewingId: viewing.id, status: viewing.status, introductionRecordId: introduction.id },
    { status: 201 },
  );
});
