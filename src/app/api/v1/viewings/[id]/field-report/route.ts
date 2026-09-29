import { NextRequest, NextResponse } from 'next/server';
import { fileFieldReport } from '@/server/viewings';
import { readJson, requireRole, requireString, route } from '@/server/http';

/**
 * POST /api/v1/viewings/:id/field-report — the structured visit record.
 * conditionRating / matchesListing / isAvailable are structured fields, not
 * free text: they become the baseline for partner standards. Immutable once
 * filed; corrections are new evidence.
 */
export const POST = route(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const session = await requireRole(['foo', 'admin']);
  const body = await readJson(req);
  const { id } = await ctx.params;

  const conditionRating = requireString(body, 'conditionRating');
  if (!['excellent', 'good', 'fair', 'poor'].includes(conditionRating)) {
    throw new Error('conditionRating must be one of excellent, good, fair, poor');
  }

  const report = await fileFieldReport({
    viewingId: id,
    fooPartyId: session.partyId,
    conditionRating: conditionRating as never,
    matchesListing: Boolean(body.matchesListing),
    isAvailable: Boolean(body.isAvailable),
    issuesText: typeof body.issuesText === 'string' && body.issuesText.trim() ? body.issuesText.trim() : undefined,
    timingNote: typeof body.timingNote === 'string' && body.timingNote.trim() ? body.timingNote.trim() : undefined,
  });
  return NextResponse.json({ id: report.id }, { status: 201 });
});
