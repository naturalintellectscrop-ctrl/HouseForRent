import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { ApiError, readJson, requireRole, requireSession, route } from '@/server/http';
import { deleteMediaAsset, uploadListerMedia } from '@/server/media';

/**
 * GET /api/v1/landlord/listings/:id/photos - the listing's photography with
 * its server-asserted provenance (field_officer | lister |
 * development_fixture). The client renders the labels; it never decides
 * them.
 *
 * POST (multipart: file required, caption optional) - the lister's own
 * photograph onto their own listing. The rules live in src/server/media.ts
 * (`uploadListerMedia`): content-sniffed JPEG/PNG only, size-capped,
 * owner-only, PRE-publication only (a live gallery is managed by staff),
 * transactional with the same bytes-rows compensation contract as the
 * officer path. Provenance is stamped 'lister' on the row - a landlord's
 * upload can never wear the officer's "taken in the actual room" label.
 *
 * DELETE (JSON body: mediaAssetId) - removes the caller's OWN lister-source
 * photo from their own unpublished listing. Officer photography is not the
 * landlord's to delete: it is the verification record.
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

export const POST = route(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const session = await requireRole(['lister']);
  const { id } = await ctx.params;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'expected multipart/form-data with a file field' } },
      { status: 400 },
    );
  }

  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'the file field is required' } },
      { status: 400 },
    );
  }
  const captionField = form.get('caption');
  const caption = typeof captionField === 'string' ? captionField : undefined;

  const bytes = new Uint8Array(await file.arrayBuffer());
  const result = await uploadListerMedia({
    listingId: id,
    actorPartyId: session.partyId,
    bytes,
    declaredMime: file.type || null,
    caption,
  });
  return NextResponse.json(
    {
      mediaAssetId: result.mediaAssetId,
      listingPhotoId: result.listingPhotoId,
      url: `/api/v1/media/${result.mediaAssetId}`,
      sortOrder: result.sortOrder,
      mimeType: result.mimeType,
      byteSize: result.byteSize,
      source: 'lister',
    },
    { status: 201 },
  );
});

export const DELETE = route(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const session = await requireRole(['lister']);
  const { id } = await ctx.params;
  const body = await readJson(req);
  const mediaAssetId = typeof body.mediaAssetId === 'string' ? body.mediaAssetId.trim() : '';
  if (!mediaAssetId) throw new ApiError(400, 'VALIDATION', 'mediaAssetId is required');

  // Ownership + scoping first: the photo must sit on THIS listing, and the
  // listing must be the caller's. 404, not 403 - existence is not disclosed.
  const listing = await db.listing.findUnique({
    where: { id },
    select: { publicationState: true, property: { select: { ownerPartyId: true } } },
  });
  if (!listing || listing.property.ownerPartyId !== session.partyId) {
    throw new ApiError(404, 'LISTING_NOT_FOUND', 'listing not found');
  }
  const photo = await db.listingPhoto.findFirst({
    where: { listingId: id, mediaAssetId },
    select: { id: true, source: true },
  });
  if (!photo) throw new ApiError(404, 'LISTING_NOT_FOUND', 'listing not found');
  if (photo.source !== 'lister') {
    throw new ApiError(
      403,
      'FORBIDDEN',
      'officer photography is the verification record - staff manage it, not the listing owner',
    );
  }
  if (listing.publicationState === 'live' || listing.publicationState === 'rented') {
    throw new ApiError(
      409,
      'MEDIA_WINDOW_CLOSED',
      'photographs on a live listing are managed by staff - withdraw it first if you need to change yours',
    );
  }

  const result = await deleteMediaAsset({ mediaAssetId, actorPartyId: session.partyId });
  return NextResponse.json(result);
});
