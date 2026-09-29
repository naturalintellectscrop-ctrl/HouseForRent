import { NextResponse } from 'next/server';
import { saveListing, unsaveListing } from '@/server/saved';
import { requireRole, route } from '@/server/http';

/**
 * POST /api/v1/listings/:id/saved — bookmark a listing for the signed-in
 * tenant. The party comes from the session, never the body; the action is
 * idempotent. Saving is private to the tenant (landlords cannot see who
 * saved their listing) and creates no viewing/deal obligation.
 */
export const POST = route(async (_req, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const session = await requireRole(['tenant']);
  const result = await saveListing(session.partyId, id);
  return NextResponse.json(result, { status: 201 });
});

/**
 * DELETE /api/v1/listings/:id/saved — remove a bookmark for the signed-in
 * tenant. Idempotent: removing a listing that was never saved succeeds, so
 * a stale detail page can always resolve.
 */
export const DELETE = route(async (_req, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const session = await requireRole(['tenant']);
  const result = await unsaveListing(session.partyId, id);
  return NextResponse.json(result);
});
