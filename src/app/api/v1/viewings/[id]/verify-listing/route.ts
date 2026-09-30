import { NextRequest, NextResponse } from 'next/server';
import { verifyListingFromVisit } from '@/server/viewings';
import { readJson, requireRole, requireString, route } from '@/server/http';

/**
 * POST /api/v1/viewings/:id/verify-listing - the officer's verification
 * verdict from the ground: sets verification_state, availability, and
 * resets the freshness clock. Audited.
 */
export const POST = route(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const session = await requireRole(['foo', 'admin']);
  const body = await readJson(req);
  await ctx.params;

  const listing = await verifyListingFromVisit({
    listingId: requireString(body, 'listingId'),
    fooPartyId: session.partyId,
    verified: Boolean(body.verified),
    available: Boolean(body.available),
    note: typeof body.note === 'string' && body.note.trim() ? body.note.trim() : undefined,
  });
  return NextResponse.json({
    listingId: listing.id,
    verificationState: listing.verificationState,
    availabilityStatus: listing.availabilityStatus,
  });
});
