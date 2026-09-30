import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { ApiError, requireSession, route } from '@/server/http';

/**
 * GET /api/v1/landlord/listings/:id/photos - the listing's photography with
 * its server-asserted provenance (field_officer | lister |
 * development_fixture). The client renders the labels; it never decides
 * them. Uploads are deliberately absent from this port: imagery enters via
 * field verification, and a provenance rule worth having is worth not
 * faking.
 */
export const GET = route(async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const session = await requireSession();
  const { id } = await ctx.params;

  const listing = await db.listing.findUnique({
    where: { id },
    include: { property: { select: { ownerPartyId: true } } },
  });
  if (!listing) throw new ApiError(404, 'LISTING_NOT_FOUND', 'listing not found');

  const isOwner = listing.property.ownerPartyId === session.partyId;
  const isStaff = session.role === 'admin' || session.role === 'foo';
  if (!isOwner && !isStaff) throw new ApiError(404, 'LISTING_NOT_FOUND', 'listing not found');

  const photos = await db.listingPhoto.findMany({
    where: { listingId: id },
    orderBy: { sortOrder: 'asc' },
  });

  return NextResponse.json({
    photos: photos.map((p) => ({
      id: p.id,
      mediaAssetId: p.mediaAssetId,
      url: `/api/v1/media/${p.mediaAssetId}`,
      caption: p.caption,
      sortOrder: p.sortOrder,
      // Provenance is on the photo row itself (PhotoSource) - no media join.
      source: p.source,
      isFieldVerified: p.source === 'field_officer',
      isDevelopmentFixture: p.source === 'development_fixture',
    })),
  });
});
