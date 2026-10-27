import { NextRequest, NextResponse } from 'next/server';
import { requireRole, route } from '@/server/http';
import { uploadViewingMedia } from '@/server/media';
import { clientIp, uploadRateLimit } from '@/server/rate-limit';

/**
 * POST /api/v1/viewings/:id/media - the field officer's camera roll enters
 * the platform here (FR-5.5).
 *
 * multipart/form-data: file (required), caption (optional).
 *
 * The rules live in src/server/media.ts: content-sniffed JPEG/PNG/WebP only,
 * size-capped, dimension-guarded, assigned-officer-only, open-visit-only,
 * rate-limited, and transactional — the bytes and the evidence rows move
 * together, so a failed upload can never leave a listing pointing at
 * nothing. Video stays out of launch scope on purpose (heavy on serverless
 * bandwidth); the MediaKind enum already reserves the room.
 */
export const POST = route(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const session = await requireRole(['foo', 'admin']);
  const { id } = await ctx.params;

  // Rate limit BEFORE the body is read (same contract as the lister route).
  const verdict = uploadRateLimit({ ip: clientIp(req), identifier: session.partyId });
  if (!verdict.ok) {
    return NextResponse.json(
      { error: { code: 'RATE_LIMITED', message: 'too many uploads in a short window - try again shortly' } },
      { status: 429, headers: { 'Retry-After': String(verdict.retryAfterSeconds) } },
    );
  }

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
  const result = await uploadViewingMedia({
    viewingId: id,
    actorPartyId: session.partyId,
    actorIsAdmin: session.role === 'admin',
    bytes,
    declaredMime: file.type || null,
    caption,
  });
  return NextResponse.json(
    {
      mediaAssetId: result.mediaAssetId,
      listingPhotoId: result.listingPhotoId,
      url: `/api/v1/media/${result.mediaAssetId}`,
      variants: result.variants,
      originalWidth: result.originalWidth,
      originalHeight: result.originalHeight,
      processingMs: result.processingMs,
      sortOrder: result.sortOrder,
      mimeType: result.mimeType,
      byteSize: result.byteSize,
      source: 'field_officer',
    },
    { status: 201 },
  );
});
