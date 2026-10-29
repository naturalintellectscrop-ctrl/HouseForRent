import { NextRequest, NextResponse } from 'next/server';
import { ApiError, requireRole, route } from '@/server/http';
import { deleteKycEvidence, uploadKycEvidence } from '@/server/kyc';
import { clientIp, uploadRateLimit } from '@/server/rate-limit';

/**
 * POST /api/v1/landlord/kyc/media — multipart evidence upload for the
 * caller's onboarding application (kind: id_front | id_back | selfie |
 * ownership_evidence | property_photo).
 *
 * The bytes go through the SAME pipeline as listing photography (magic-byte
 * sniff, size cap, pixel-bomb guard, EXIF/GPS-stripped WebP renditions,
 * transactional rows+bytes with compensation) but land under kyc/<party>/
 * and never become listing photos — so they can never be publicly readable
 * through a listing, and resolveMediaAccess leaves them visible to the
 * uploader and staff only.
 *
 * DELETE (JSON body: mediaAssetId) — removes the caller's OWN evidence
 * while nothing decided still cites it (409 otherwise).
 */
export const POST = route(async (req: NextRequest) => {
  const session = await requireRole(['lister']);

  // Rate limit BEFORE the body is read: the pipeline is the expensive part,
  // and a byte-bomb loop should hit the window before it costs anything.
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
      { error: { code: 'VALIDATION', message: 'expected multipart/form-data with file and kind fields' } },
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
  const kindField = form.get('kind');
  if (typeof kindField !== 'string' || !kindField) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'the kind field is required' } },
      { status: 400 },
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const result = await uploadKycEvidence({
    partyId: session.partyId,
    kind: kindField,
    bytes,
    declaredMime: file.type || null,
  });
  return NextResponse.json(result, { status: 201 });
});

export const DELETE = route(async (req: NextRequest) => {
  const session = await requireRole(['lister']);
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    // fall through to the validation error below
  }
  const mediaAssetId = typeof body.mediaAssetId === 'string' ? body.mediaAssetId.trim() : '';
  if (!/^[0-9a-f-]{36}$/i.test(mediaAssetId)) {
    throw new ApiError(400, 'VALIDATION', 'mediaAssetId is required');
  }
  const result = await deleteKycEvidence({ partyId: session.partyId, mediaAssetId });
  return NextResponse.json(result);
});
