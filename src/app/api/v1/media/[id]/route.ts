import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { resolveSession } from '@/server/auth';
import { requireRole, route } from '@/server/http';
import { deleteMediaAsset, readMediaBytes, resolveMediaAccess } from '@/server/media';
import { MediaNotFoundError } from '@/server/media-storage';

/**
 * GET /api/v1/media/:id - the proxied read for stored media.
 *
 * Every byte leaves through this door or it does not leave at all: the
 * bucket (or disk) is never exposed directly, so a private document cannot
 * become world-readable through a predictable object URL. Access is decided
 * by resolveMediaAccess: public only while the asset decorates a LIVE
 * listing; otherwise uploader, staff, owning lister, or property owner.
 *
 * ── Variants (image-pipeline round) ──
 * `?variant=thumb|card|detail` selects a derived rendition when the asset
 * has one ready. A missing/failed variant FALLS BACK to the original bytes:
 * a listing page must never render a broken image just because one
 * rendition did not process. The ORIGINAL itself is only served when no
 * variant is requested (legacy URLs) — the renditions are what pages ask
 * for, and the original carries the camera's EXIF/GPS baggage, so it stays
 * a private-by-default fallback rather than the normal serving path.
 *
 * The storage ref behaves as DEPLOYMENT.md §2.3 describes: the row names
 * the file and carries its own provenance (field_officer | lister |
 * development_fixture). The client renders the label; it never decides it.
 */
const VARIANT_NAMES = new Set(['thumb', 'card', 'detail']);

export const GET = route(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const requested = req.nextUrl.searchParams.get('variant');
  if (requested && !VARIANT_NAMES.has(requested)) {
    return NextResponse.json(
      { error: { code: 'MEDIA_VARIANT_UNKNOWN', message: 'unknown media variant' } },
      { status: 400 },
    );
  }
  const session = await resolveSession();
  const access = await resolveMediaAccess(id, session);
  if (!access.allowed) {
    return NextResponse.json({ error: { code: 'MEDIA_NOT_FOUND', message: 'no such media' } }, { status: 404 });
  }

  const asset = await db.mediaAsset.findUnique({
    where: { id },
    select: { storageRef: true, mimeType: true, variants: { where: { processingStatus: 'ready' }, select: { variant: true, storageRef: true, mimeType: true } } },
  });
  if (!asset) {
    return NextResponse.json({ error: { code: 'MEDIA_NOT_FOUND', message: 'no such media' } }, { status: 404 });
  }

  // Variant selection with honest fallback: requested → ready row → original.
  let ref = asset.storageRef;
  let contentType = asset.mimeType ?? 'application/octet-stream';
  const variant = requested ? asset.variants.find((v) => v.variant === requested) : undefined;
  if (requested && variant) {
    ref = variant.storageRef;
    contentType = variant.mimeType;
  }

  try {
    const { bytes } = await readMediaBytes(ref);
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        'Content-Type': contentType,
        // Public live-listing photography is immutable content at a stable
        // id; private assets must never linger in a shared cache.
        'Cache-Control': access.publiclyReadable
          ? 'public, max-age=31536000, immutable'
          : 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (err) {
    // A rendition that is MISSING from the store falls back to the original
    // rather than breaking the page; an original that is missing is the real
    // MEDIA_GONE. (MediaNotFoundError only escapes readMediaBytes here.)
    if (err instanceof MediaNotFoundError && ref !== asset.storageRef) {
      const { bytes } = await readMediaBytes(asset.storageRef);
      return new NextResponse(new Uint8Array(bytes), {
        headers: {
          'Content-Type': asset.mimeType ?? 'application/octet-stream',
          'Cache-Control': access.publiclyReadable ? 'public, max-age=31536000, immutable' : 'private, no-store',
          'X-Content-Type-Options': 'nosniff',
        },
      });
    }
    throw err;
  }
});

/**
 * DELETE /api/v1/media/:id - staff-controlled removal. Refused while a LIVE
 * listing still shows the asset (withdraw first); otherwise removes photo
 * references, the asset row, its variant rows, and the stored bytes together.
 */
export const DELETE = route(async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const session = await requireRole(['admin']);
  const { id } = await ctx.params;
  const result = await deleteMediaAsset({ mediaAssetId: id, actorPartyId: session.partyId });
  return NextResponse.json({ deleted: true, removedPhotoCount: result.removedPhotoCount });
});
