import { NextRequest, NextResponse } from 'next/server';
import { withdrawListing } from '@/server/listings';
import { readJson, requireRole, route } from '@/server/http';

/** POST /api/v1/landlord/listings/:id/withdraw - pull it from the public feed. */
export const POST = route(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const session = await requireRole(['lister']);
  await readJson(req);
  const { id } = await ctx.params;
  const listing = await withdrawListing({ listingId: id, listerPartyId: session.partyId });
  return NextResponse.json({ publicationState: listing.publicationState });
});
