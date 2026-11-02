import { NextRequest, NextResponse } from 'next/server';
import { evaluatePublish, publishListing } from '@/server/listings';
import { ApiError, readJson, requireRole, route } from '@/server/http';

/**
 * POST /api/v1/landlord/listings/:id/publish.
 * With `{"dryRun": true}` it reports what is still blocking without
 * flipping state; otherwise the four gates decide (server-side).
 *
 * B-4: the dry-run takes the caller's identity TOO - the gate evaluation
 * verifies ownership before it reports anything, so a dry-run can never
 * succeed where the real publish would refuse.
 */
export const POST = route(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const session = await requireRole(['lister']);
  const body = await readJson(req);
  const { id } = await ctx.params;

  if (body.dryRun) {
    return NextResponse.json(await evaluatePublish(id, true, session.partyId));
  }

  const listing = await publishListing({ listingId: id, listerPartyId: session.partyId });
  if (!listing) throw new ApiError(404, 'LISTING_NOT_FOUND', 'listing not found');
  return NextResponse.json({ publicationState: listing.publicationState });
});
