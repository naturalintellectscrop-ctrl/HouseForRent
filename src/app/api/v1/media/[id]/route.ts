import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { resolveSession } from '@/server/auth';
import { requireRole, route } from '@/server/http';
import { deleteMediaAsset, readMediaBytes, resolveMediaAccess } from '@/server/media';

/**
 * GET /api/v1/media/:id - the proxied read for stored media.
 *
 * Every byte leaves through this door or it does not leave at all: the
 * bucket (or disk) is never exposed directly, so a private document cannot
 * become world-readable through a predictable object URL. Access is decided
 * by resolveMediaAccess: public only while the asset decorates a LIVE
 * listing; otherwise uploader, staff, owning lister, or property owner.
 *
 * The storage ref behaves as DEPLOYMENT.md §2.3 describes: the row names
 * the file and carries its own provenance (field_officer | lister |
 * development_fixture). The client renders the label; it never decides it.
 */
export const GET = route(async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const session = await resolveSession();
  const access = await resolveMediaAccess(id, session);
  if (!access.allowed) {
    return NextResponse.json({ error: { code: 'MEDIA_NOT_FOUND', message: 'no such media' } }, { status: 404 });
  }

  const asset = await db.mediaAsset.findUnique({
    where: { id },
    select: { storageRef: true, mimeType: true },
  });
  if (!asset) {
    return NextResponse.json({ error: { code: 'MEDIA_NOT_FOUND', message: 'no such media' } }, { status: 404 });
  }

  const { bytes } = await readMediaBytes(asset.storageRef);
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      'Content-Type': asset.mimeType ?? 'application/octet-stream',
      // Public live-listing photography is immutable content at a stable
      // id; private assets must never linger in a shared cache.
      'Cache-Control': access.publiclyReadable
        ? 'public, max-age=31536000, immutable'
        : 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
});

/**
 * DELETE /api/v1/media/:id - staff-controlled removal. Refused while a LIVE
 * listing still shows the asset (withdraw first); otherwise removes photo
 * references, the asset row, and the stored bytes together.
 */
export const DELETE = route(async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const session = await requireRole(['admin']);
  const { id } = await ctx.params;
  const result = await deleteMediaAsset({ mediaAssetId: id, actorPartyId: session.partyId });
  return NextResponse.json({ deleted: true, removedPhotoCount: result.removedPhotoCount });
});
