/**
 * Saved listings — a tenant's bookmarks.
 *
 * ADDITIVE (QA round): this service introduces no new financial or legal
 * state. A saved listing is a bookmark: it records interest, nothing else.
 * It is NOT a viewing request, NOT a deal signal, and no landlord can see
 * who saved their listing (deliberately — saving is private to the tenant).
 *
 * Rules:
 * - Saving is per-party (from the session), never per client-chosen id.
 * - Any listing that exists can be bookmarked; the saved list only SHOWS
 *   listings that still pass the public gates (live, verified, in-corridor,
 *   fresh). A bookmark whose home left search is counted honestly instead
 *   of being shown or silently dropped.
 * - Idempotent: saving twice is one row (upsert on the natural key).
 */
import { db } from '@/lib/db';
import { freshnessWindowDays, photoToView, withFreshness, type SearchResult } from '@/server/listings';

export class ListingNotFoundError extends Error {
  constructor() {
    super('listing not found');
  }
}

/** Is this listing in the caller's saved set? (For the detail-page toggle.) */
export async function isSaved(partyId: string, listingId: string): Promise<boolean> {
  const row = await db.savedListing.findUnique({
    where: { partyId_listingId: { partyId, listingId } },
    select: { id: true },
  });
  return row !== null;
}

/** All saved listing ids for a party — cheap read for list pages. */
export async function savedIdsFor(partyId: string): Promise<Set<string>> {
  const rows = await db.savedListing.findMany({
    where: { partyId },
    select: { listingId: true },
  });
  return new Set(rows.map((r) => r.listingId));
}

/** Bookmark a listing. Idempotent. Returns whether the row now exists. */
export async function saveListing(partyId: string, listingId: string): Promise<{ saved: boolean }> {
  const listing = await db.listing.findUnique({
    where: { id: listingId },
    select: { id: true },
  });
  if (!listing) throw new ListingNotFoundError();

  await db.savedListing.upsert({
    where: { partyId_listingId: { partyId, listingId } },
    create: { partyId, listingId },
    update: {},
  });
  return { saved: true };
}

/** Remove a bookmark. Idempotent — removing a non-saved listing succeeds. */
export async function unsaveListing(partyId: string, listingId: string): Promise<{ saved: boolean }> {
  await db.savedListing.deleteMany({
    where: { partyId, listingId },
  });
  return { saved: false };
}

/**
 * The tenant's saved homes, in the SAME card shape as the public feed
 * (SearchResult), newest bookmark first. Only listings still visible
 * publicly are returned as cards; anything else is reported in
 * `hiddenCount` so the UI can be honest about the difference.
 */
export async function listSaved(
  partyId: string,
  asOf: Date = new Date(),
): Promise<{ results: SearchResult[]; hiddenCount: number; totalCount: number }> {
  const saved = await db.savedListing.findMany({
    where: { partyId },
    orderBy: { createdAt: 'desc' },
    include: {
      listing: {
        include: {
          property: { include: { neighbourhood: true } },
          photos: { orderBy: { sortOrder: 'asc' } },
        },
      },
    },
  });

  const windowDays = await freshnessWindowDays();
  const staleCutoff = new Date(asOf.getTime() - windowDays * 24 * 60 * 60 * 1000);

  const results: SearchResult[] = [];
  let hiddenCount = 0;

  for (const s of saved) {
    const l = s.listing;
    // The same public gates the feed applies — no special treatment for
    // things you bookmarked, because the bookmark is not a promise.
    const stillPublic =
      l.publicationState === 'live' &&
      l.verificationState === 'verified' &&
      l.property.neighbourhood.inServiceArea &&
      l.availabilityStatus === 'available' &&
      l.availabilityConfirmedAt !== null &&
      l.availabilityConfirmedAt >= staleCutoff;
    if (!stillPublic) {
      hiddenCount += 1;
      continue;
    }
    const f = withFreshness(l, windowDays, asOf);
    results.push({
      listingId: l.id,
      propertyId: l.propertyId,
      monthlyRent: l.monthlyRent.toString(),
      requiredMonthsUpfront: l.requiredMonthsUpfront,
      depositAmount: l.depositAmount.toString(),
      bedrooms: l.property.bedrooms,
      bathrooms: l.property.bathrooms,
      propertyType: l.property.propertyType,
      furnished: l.property.furnished,
      neighbourhoodName: l.property.neighbourhood.name,
      landmarkText: l.property.landmarkText,
      isVerified: l.verificationState === 'verified',
      isStale: f.isStale,
      daysSinceConfirmed: f.daysSinceConfirmed,
      photos: l.photos.map(photoToView),
      freeForTenants: true,
    });
  }

  return { results, hiddenCount, totalCount: saved.length };
}
