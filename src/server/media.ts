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

/** Bytes are the truth; declared MIME is a claim we verify. */
const ACCEPTED_IMAGE_TYPES = [
  { mime: 'image/jpeg', ext: 'jpg', magic: [0xff, 0xd8, 0xff] },
  { mime: 'image/png', ext: 'png', magic: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
] as const;

/** 4 MB default: Vercel's serverless request body ceiling is 4.5 MB — a
 * limit the platform could not honour would be theatre. */
const MAX_BYTES = Number(process.env.MEDIA_MAX_BYTES ?? 4_000_000);

export function sniffImageType(bytes: Uint8Array): { mime: string; ext: string } | null {
  for (const t of ACCEPTED_IMAGE_TYPES) {
    if (t.magic.every((b, i) => bytes[i] === b)) return { mime: t.mime, ext: t.ext };
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
}

/**
 * Attaches a photograph to a viewing's listing during the visit.
 * Transactional: rows commit only after bytes are stored; a failed commit
 * compensates the bytes away, so no half-uploaded state can exist.
 */
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
    throw new ApiError(415, 'MEDIA_TYPE_NOT_ACCEPTED', 'only JPEG and PNG photographs are accepted');
  }
  assertDeclaredMimeMatches(params.declaredMime, sniffed.mime);

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

  const { provider } = mediaStorage();
  const ref = `viewings/${viewing.id}/${crypto.randomUUID()}.${sniffed.ext}`;
  assertSafeStorageRef(ref);
  await provider.put(ref, params.bytes, sniffed.mime);

  try {
    return await db.$transaction(async (tx) => {
      const asset = await tx.mediaAsset.create({
        data: {
          storageRef: ref,
          kind: 'image',
          uploadedByPartyId: params.actorPartyId,
          mimeType: sniffed.mime,
          byteSize: params.bytes.length,
        },
      });
      const last = await tx.listingPhoto.findFirst({
        where: { listingId: viewing.listingId },
        orderBy: { sortOrder: 'desc' },
        select: { sortOrder: true },
      });
      const photo = await tx.listingPhoto.create({
        data: {
          listingId: viewing.listingId,
          mediaAssetId: asset.id,
          sortOrder: (last?.sortOrder ?? 0) + 1,
          caption: params.caption?.trim() || null,
          source: 'field_officer',
        },
      });
      await tx.auditEvent.create({
        data: {
          actorPartyId: params.actorPartyId,
          eventType: 'media_uploaded',
          subjectRef: asset.id,
          payload: { viewingId: viewing.id, listingId: viewing.listingId, byteSize: params.bytes.length, mimeType: sniffed.mime },
          occurredAt: new Date(),
        },
      });
      return {
        mediaAssetId: asset.id,
        listingPhotoId: photo.id,
        sortOrder: photo.sortOrder,
        mimeType: sniffed.mime,
        byteSize: params.bytes.length,
      };
    });
  } catch (err) {
    // Compensation: the bytes exist but the evidence row does not. Remove
    // them so storage cannot accumulate objects no row will ever name —
    // and so the bucket cannot become an un-governed archive.
    await provider.delete(ref);
    throw err;
  }
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
    throw new ApiError(415, 'MEDIA_TYPE_NOT_ACCEPTED', 'only JPEG and PNG photographs are accepted');
  }
  assertDeclaredMimeMatches(params.declaredMime, sniffed.mime);

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

  const { provider } = mediaStorage();
  const ref = `listings/${listing.id}/${crypto.randomUUID()}.${sniffed.ext}`;
  assertSafeStorageRef(ref);
  await provider.put(ref, params.bytes, sniffed.mime);

  try {
    return await db.$transaction(async (tx) => {
      const asset = await tx.mediaAsset.create({
        data: {
          storageRef: ref,
          kind: 'image',
          uploadedByPartyId: params.actorPartyId,
          mimeType: sniffed.mime,
          byteSize: params.bytes.length,
        },
      });
      const last = await tx.listingPhoto.findFirst({
        where: { listingId: listing.id },
        orderBy: { sortOrder: 'desc' },
        select: { sortOrder: true },
      });
      const photo = await tx.listingPhoto.create({
        data: {
          listingId: listing.id,
          mediaAssetId: asset.id,
          sortOrder: (last?.sortOrder ?? 0) + 1,
          caption: params.caption?.trim() || null,
          source: 'lister',
        },
      });
      await tx.auditEvent.create({
        data: {
          actorPartyId: params.actorPartyId,
          eventType: 'media_uploaded',
          subjectRef: asset.id,
          payload: { listingId: listing.id, via: 'lister', byteSize: params.bytes.length, mimeType: sniffed.mime },
          occurredAt: new Date(),
        },
      });
      return {
        mediaAssetId: asset.id,
        listingPhotoId: photo.id,
        sortOrder: photo.sortOrder,
        mimeType: sniffed.mime,
        byteSize: params.bytes.length,
      };
    });
  } catch (err) {
    // Same compensation contract as the officer path: rows failed to commit,
    // so the bytes must not outlive them.
    await provider.delete(ref);
    throw err;
  }
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
    select: { id: true, storageRef: true },
  });
  if (!asset) throw new ApiError(404, 'MEDIA_NOT_FOUND', 'no such media');

  const references = await db.listingPhoto.findMany({
    where: { mediaAssetId: asset.id },
    select: { id: true, listing: { select: { publicationState: true } } },
  });
  if (references.some((r) => r.listing.publicationState === 'live')) {
    throw new MediaReferencedByLiveListingError();
  }

  assertSafeStorageRef(asset.storageRef);
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
  await provider.delete(asset.storageRef);
  return { removedPhotoCount };
}
