/**
 * Media domain service — validation, visibility, and the transactional
 * path from an officer's camera roll to a listing photograph.
 *
 * ── The rules this module enforces ──
 * 1. Bytes are validated by CONTENT (magic bytes), not by the client's
 *    declared Content-Type. A renamed executable never becomes a photograph.
 * 2. Size is capped (MEDIA_MAX_BYTES, default 4 MB — the Vercel serverless
 *    request body ceiling is 4.5 MB; a limit the platform could not honour
 *    would be theatre).
 * 3. Ownership: media enters through the assigned field officer during an
 *    open visit (status 'scheduled', before the field report closes it),
 *    or by an admin on the officer's behalf. A tenant, landlord, or
 *    unassigned officer can never attach media to someone else's visit.
 *    A lister may photograph their OWN listing, but only BEFORE it is
 *    published (draft / awaiting_verification / withdrawn) — a live
 *    gallery is never quietly swapped behind a tenant's search result,
 *    and officer photography stays in the officer's hands.
 * 4. Publication honesty: the DB rows and the stored bytes move together.
 *    Bytes are stored first; the rows are written in one transaction; if
 *    the transaction fails the bytes are compensated away. A failed upload
 *    can therefore never leave a published listing pointing at nothing.
 * 5. Privacy: an asset is publicly readable ONLY while it decorates a LIVE
 *    listing. Everything else (visit drafts, mandate evidence scans) is
 *    readable by its uploader, staff, or the owning lister — proxied, never
 *    a public object URL.
 */
import { db } from '@/lib/db';
import { ApiError } from './http';
import { processImage } from './image-pipeline';
import { NotYourListingError } from './listings';
import {
  assertSafeStorageRef,
  assertUploadableStorage,
  MediaNotFoundError,
  mediaStorage,
} from './media-storage';

/** A listing's gallery is a short list, not a dump: 12 photographs cover
 * every room a tenant decides from, and the cap keeps one account from
 * filling the bucket. */
export const MAX_PHOTOS_PER_LISTING = 12;

export class MediaWindowClosedError extends Error {
  constructor() {
    super('this visit is closed - media had to be captured during it');
    this.name = 'MediaWindowClosedError';
  }
}

export class MediaReferencedByLiveListingError extends Error {
  constructor() {
    super('this photograph is live on a listing - withdraw the listing first');
    this.name = 'MediaReferencedByLiveListingError';
  }
}

// ── Validation ──────────────────────────────────────────────────────────────

/** Bytes are the truth; declared MIME is a claim we verify. WebP joins the
 * accepted set (2026-10-27 pipeline round): Android camera rolls and web
 * downloads increasingly arrive as WebP, and every accepted file is
 * re-encoded to WebP derivatives anyway — the input format is just what the
 * decoder accepts first. */
const ACCEPTED_IMAGE_TYPES = [
  { mime: 'image/jpeg', ext: 'jpg', magic: [0xff, 0xd8, 0xff] },
  { mime: 'image/png', ext: 'png', magic: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mime: 'image/webp', ext: 'webp', magic: null }, // RIFF container + WEBP fourCC, checked in sniffImageType
] as const;

/** 4 MB default: Vercel's serverless request body ceiling is 4.5 MB — a
 * limit the platform could not honour would be theatre. */
const MAX_BYTES = Number(process.env.MEDIA_MAX_BYTES ?? 4_000_000);

export function sniffImageType(bytes: Uint8Array): { mime: string; ext: string } | null {
  for (const t of ACCEPTED_IMAGE_TYPES) {
    if (t.magic) {
      if (t.magic.every((b, i) => bytes[i] === b)) return { mime: t.mime, ext: t.ext };
    } else if (
      // WebP: bytes 0-3 = 'RIFF', bytes 8-11 = 'WEBP'
      bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
      bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
    ) {
      return { mime: t.mime, ext: t.ext };
    }
  }
  return null;
}

export function assertMediaSize(byteLength: number): void {
  if (!Number.isFinite(MAX_BYTES) || MAX_BYTES <= 0) {
    throw new ApiError(500, 'MEDIA_CONFIG', 'MEDIA_MAX_BYTES is misconfigured');
  }
  if (byteLength === 0) throw new ApiError(400, 'MEDIA_EMPTY', 'the file is empty');
  if (byteLength > MAX_BYTES) {
    throw new ApiError(413, 'MEDIA_TOO_LARGE', `files over ${Math.floor(MAX_BYTES / 1024 / 1024)} MB are not accepted`);
  }
}

export function assertDeclaredMimeMatches(declared: string | null | undefined, actual: string): void {
  if (!declared) return; // absent claim is not a false claim
  const normalized = declared.split(';')[0].trim().toLowerCase();
  if (normalized && normalized !== actual) {
    throw new ApiError(415, 'MEDIA_TYPE_MISMATCH', 'the file content does not match its declared type');
  }
}

// ── Upload (field-officer path) ─────────────────────────────────────────────

export interface UploadedMediaResult {
  mediaAssetId: string;
  listingPhotoId: string | null;
  sortOrder: number;
  mimeType: string;
  byteSize: number;
  /** Derived renditions written for this asset (thumb/card/detail).
   * Additive since the image-pipeline round; older clients ignore it. */
  variants: Array<{ variant: string; width: number; height: number; byteSize: number }>;
  originalWidth: number;
  originalHeight: number;
  processingMs: number;
}

/**
 * The one transactional path both upload routes share. Order matters:
 * 1. process (already done by the caller — corrupt/pixel-bomb bytes never
 *    reach storage);
 * 2. store the ORIGINAL (private, metadata intact, served to nobody) plus
 *    the three WebP renditions;
 * 3. commit asset + variant + photo + audit rows in ONE transaction;
 * 4. any step-3 failure compensates EVERY stored object away, so the bucket
 *    can never hold objects no row names, and a listing can never point at
 *    bytes that are not there.
 */
async function persistPhotoAsset(params: {
  baseDir: string;
  listingId: string;
  actorPartyId: string;
  sniffed: { mime: string; ext: string };
  bytes: Uint8Array;
  processed: Awaited<ReturnType<typeof processImage>>;
  source: 'field_officer' | 'lister';
  caption: string | null;
  auditVia: 'officer' | 'lister';
  auditExtras: Record<string, unknown>;
}): Promise<UploadedMediaResult> {
  const { provider } = mediaStorage();
  const assetId = crypto.randomUUID();
  const base = `${params.baseDir}/${assetId}`;
  const originalRef = `${base}/original.${params.sniffed.ext}`;
  for (const ref of [originalRef, ...params.processed.variants.map((v) => `${base}/${v.variant}.webp`)]) {
    assertSafeStorageRef(ref);
  }

  const storedRefs: string[] = [];
  try {
    await provider.put(originalRef, params.bytes, params.sniffed.mime);
    storedRefs.push(originalRef);
    for (const v of params.processed.variants) {
      const ref = `${base}/${v.variant}.webp`;
      await provider.put(ref, v.bytes, v.mimeType);
      storedRefs.push(ref);
    }
  } catch (err) {
    await Promise.allSettled(storedRefs.map((ref) => provider.delete(ref)));
    throw err;
  }

  try {
    return await db.$transaction(async (tx) => {
      const asset = await tx.mediaAsset.create({
        data: {
          id: assetId,
          storageRef: originalRef,
          kind: 'image',
          uploadedByPartyId: params.actorPartyId,
          mimeType: params.sniffed.mime,
          byteSize: params.bytes.length,
        },
      });
      for (const v of params.processed.variants) {
        await tx.mediaVariant.create({
          data: {
            mediaAssetId: asset.id,
            variant: v.variant,
            storageRef: `${base}/${v.variant}.webp`,
            mimeType: v.mimeType,
            width: v.width,
            height: v.height,
            byteSize: v.byteSize,
          },
        });
      }
      const last = await tx.listingPhoto.findFirst({
        where: { listingId: params.listingId },
        orderBy: { sortOrder: 'desc' },
        select: { sortOrder: true },
      });
      const photo = await tx.listingPhoto.create({
        data: {
          listingId: params.listingId,
          mediaAssetId: asset.id,
          sortOrder: (last?.sortOrder ?? 0) + 1,
          caption: params.caption,
          source: params.source,
        },
      });
      await tx.auditEvent.create({
        data: {
          actorPartyId: params.actorPartyId,
          eventType: 'media_uploaded',
          subjectRef: asset.id,
          payload: {
            listingId: params.listingId,
            via: params.auditVia,
            byteSize: params.bytes.length,
            mimeType: params.sniffed.mime,
            originalDimensions: { width: params.processed.width, height: params.processed.height },
            variants: params.processed.variants.map((v) => ({ variant: v.variant, byteSize: v.byteSize })),
            processingMs: params.processed.processingMs,
            ...params.auditExtras,
          },
          occurredAt: new Date(),
        },
      });
      return {
        mediaAssetId: asset.id,
        listingPhotoId: photo.id,
        sortOrder: photo.sortOrder,
        mimeType: params.sniffed.mime,
        byteSize: params.bytes.length,
        variants: params.processed.variants.map((v) => ({
          variant: v.variant,
          width: v.width,
          height: v.height,
          byteSize: v.byteSize,
        })),
        originalWidth: params.processed.width,
        originalHeight: params.processed.height,
        processingMs: params.processed.processingMs,
      };
    });
  } catch (err) {
    // Compensation: the bytes exist but the rows do not. Remove them so
    // storage cannot accumulate objects no row will ever name — and so the
    // bucket cannot become an un-governed archive.
    await Promise.allSettled(storedRefs.map((ref) => provider.delete(ref)));
    throw err;
  }
}

export async function uploadViewingMedia(params: {
  viewingId: string;
  actorPartyId: string;
  actorIsAdmin: boolean;
  bytes: Uint8Array;
  declaredMime: string | null;
  caption?: string;
}): Promise<UploadedMediaResult> {
  assertUploadableStorage();
  assertMediaSize(params.bytes.length);
  const sniffed = sniffImageType(params.bytes);
  if (!sniffed) {
    throw new ApiError(415, 'MEDIA_TYPE_NOT_ACCEPTED', 'only JPEG, PNG and WebP photographs are accepted');
  }
  assertDeclaredMimeMatches(params.declaredMime, sniffed.mime);
  // Decode-and-derive BEFORE any ownership/window check touches storage: a
  // corrupt or pixel-bomb image is refused without side effects.
  const processed = await processImage(params.bytes);

  const viewing = await db.viewing.findUnique({
    where: { id: params.viewingId },
    select: { id: true, listingId: true, status: true, conductedByPartyId: true },
  });
  if (!viewing) throw new ApiError(404, 'VIEWING_NOT_FOUND', 'viewing not found');
  if (viewing.conductedByPartyId !== params.actorPartyId && !params.actorIsAdmin) {
    throw new ApiError(403, 'NOT_ASSIGNED_OFFICER', 'only the assigned officer may capture this visit');
  }
  // The capture window is the open visit — the same window the ops console
  // renders the capture control in (scheduled, before the field report).
  if (viewing.status !== 'scheduled') throw new MediaWindowClosedError();

  return persistPhotoAsset({
    baseDir: `viewings/${viewing.id}`,
    listingId: viewing.listingId,
    actorPartyId: params.actorPartyId,
    sniffed,
    bytes: params.bytes,
    processed,
    source: 'field_officer',
    caption: params.caption?.trim() || null,
    auditVia: 'officer',
    auditExtras: { viewingId: viewing.id },
  });
}

// ── Upload (lister path — own listing, pre-publication only) ─────────────

/**
 * Attaches the lister's own photograph to their own listing while the
 * listing is still unpublished. The same content rules as the officer path
 * (magic bytes, size cap, declared-MIME cross-check), the same transactional
 * row/bytes contract — but provenance is 'lister' and the window closes at
 * publication: a live gallery cannot be swapped without withdrawing first.
 */
export async function uploadListerMedia(params: {
  listingId: string;
  actorPartyId: string;
  bytes: Uint8Array;
  declaredMime: string | null;
  caption?: string;
}): Promise<UploadedMediaResult> {
  assertUploadableStorage();
  assertMediaSize(params.bytes.length);
  const sniffed = sniffImageType(params.bytes);
  if (!sniffed) {
    throw new ApiError(415, 'MEDIA_TYPE_NOT_ACCEPTED', 'only JPEG, PNG and WebP photographs are accepted');
  }
  assertDeclaredMimeMatches(params.declaredMime, sniffed.mime);
  const processed = await processImage(params.bytes);

  const listing = await db.listing.findUnique({
    where: { id: params.listingId },
    select: { id: true, publicationState: true, property: { select: { ownerPartyId: true } } },
  });
  if (!listing) throw new ApiError(404, 'LISTING_NOT_FOUND', 'listing not found');
  // 403 with the domain's own words: role membership is not ownership.
  if (listing.property.ownerPartyId !== params.actorPartyId) throw new NotYourListingError();
  if (listing.publicationState === 'live' || listing.publicationState === 'rented') {
    throw new ApiError(
      409,
      'MEDIA_WINDOW_CLOSED',
      'photographs on a live listing are managed by staff - withdraw it first if you need to change yours',
    );
  }
  const photoCount = await db.listingPhoto.count({ where: { listingId: listing.id } });
  if (photoCount >= MAX_PHOTOS_PER_LISTING) {
    throw new ApiError(409, 'PHOTO_LIMIT_REACHED', `a listing carries at most ${MAX_PHOTOS_PER_LISTING} photographs`);
  }

  return persistPhotoAsset({
    baseDir: `listings/${listing.id}`,
    listingId: listing.id,
    actorPartyId: params.actorPartyId,
    sniffed,
    bytes: params.bytes,
    processed,
    source: 'lister',
    caption: params.caption?.trim() || null,
    auditVia: 'lister',
    auditExtras: {},
  });
}

// ── Visibility ──────────────────────────────────────────────────────────────

export type MediaAccess = { allowed: boolean; publiclyReadable: boolean };

/**
 * Public ⇔ the asset decorates at least one LIVE listing. Everything else
 * requires the uploader, staff, a property owner of a referencing listing,
 * or the lister whose mandate carries this evidence — decided server-side,
 * never by the client.
 */
export async function resolveMediaAccess(
  mediaAssetId: string,
  session: { partyId: string; role: string } | null,
): Promise<MediaAccess> {
  const asset = await db.mediaAsset.findUnique({
    where: { id: mediaAssetId },
    select: { id: true, uploadedByPartyId: true, storageRef: true },
  });
  if (!asset) throw new ApiError(404, 'MEDIA_NOT_FOUND', 'no such media');

  const references = await db.listingPhoto.findMany({
    where: { mediaAssetId },
    select: {
      listing: {
        select: {
          publicationState: true,
          property: { select: { ownerPartyId: true } },
        },
      },
    },
  });

  const onLiveListing = references.some((r) => r.listing.publicationState === 'live');
  if (onLiveListing) return { allowed: true, publiclyReadable: true };

  if (!session) return { allowed: false, publiclyReadable: false };
  const isStaff = session.role === 'admin' || session.role === 'foo';
  if (isStaff || asset.uploadedByPartyId === session.partyId) {
    return { allowed: true, publiclyReadable: false };
  }

  if (references.some((r) => r.listing.property.ownerPartyId === session.partyId)) {
    return { allowed: true, publiclyReadable: false };
  }

  const mandate = await db.propertyMandate.findFirst({
    where: { evidenceMediaId: mediaAssetId },
    select: { listerPartyId: true, verifiedByPartyId: true },
  });
  if (mandate && (mandate.listerPartyId === session.partyId || mandate.verifiedByPartyId === session.partyId)) {
    return { allowed: true, publiclyReadable: false };
  }

  return { allowed: false, publiclyReadable: false };
}

/** Fetches the bytes behind an authorized read (after resolveMediaAccess). */
export async function readMediaBytes(storageRef: string): Promise<{ bytes: Uint8Array }> {
  assertSafeStorageRef(storageRef);
  const { provider } = mediaStorage();
  try {
    return { bytes: await provider.get(storageRef) };
  } catch (err) {
    if (err instanceof MediaNotFoundError) {
      throw new ApiError(404, 'MEDIA_GONE', 'media file missing from store');
    }
    throw new ApiError(503, 'MEDIA_STORE_UNAVAILABLE', 'the media store could not be reached');
  }
}

// ── Deletion (staff-controlled, publication-honest) ─────────────────────────

/**
 * Removes an asset and its bytes. Refuses while any LIVE listing still
 * decorates itself with it (a live page must never show a broken image);
 * staff withdraw the listing first. Non-live references are removed with
 * the asset in one transaction; bytes are compensated last.
 * The landlord delete route authorises lister-sourced photos on the
 * caller's own unpublished listing BEFORE calling this; the live-refusal
 * here is the second gate, not the only one.
 */
export async function deleteMediaAsset(params: {
  mediaAssetId: string;
  actorPartyId: string;
}): Promise<{ removedPhotoCount: number }> {
  const asset = await db.mediaAsset.findUnique({
    where: { id: params.mediaAssetId },
    select: { id: true, storageRef: true, variants: { select: { storageRef: true } } },
  });
  if (!asset) throw new ApiError(404, 'MEDIA_NOT_FOUND', 'no such media');

  const references = await db.listingPhoto.findMany({
    where: { mediaAssetId: asset.id },
    select: { id: true, listing: { select: { publicationState: true } } },
  });
  if (references.some((r) => r.listing.publicationState === 'live')) {
    throw new MediaReferencedByLiveListingError();
  }

  for (const ref of [asset.storageRef, ...asset.variants.map((v) => v.storageRef)]) {
    assertSafeStorageRef(ref);
  }
  const { provider } = mediaStorage();

  const removedPhotoCount = references.length;
  try {
    await db.$transaction(async (tx) => {
      if (references.length > 0) {
        await tx.listingPhoto.deleteMany({ where: { mediaAssetId: asset.id } });
      }
      await tx.mediaAsset.delete({ where: { id: asset.id } });
      await tx.auditEvent.create({
        data: {
          actorPartyId: params.actorPartyId,
          eventType: 'media_deleted',
          subjectRef: asset.id,
          payload: { removedPhotoCount },
          occurredAt: new Date(),
        },
      });
    });
  } catch (err) {
    // Rows survive → the object stays readable through them. Compensating
    // the bytes on a failed row-delete would orphan the rows.
    throw err;
  }
  // The variant rows CASCADE with the asset; the objects follow here. A
  // rendition left behind would be inert (private bucket) but the sweep
  // contract is "rows and bytes move together", so they go too.
  await Promise.allSettled([
    provider.delete(asset.storageRef),
    ...asset.variants.map((v) => provider.delete(v.storageRef)),
  ]);
  return { removedPhotoCount };
}
