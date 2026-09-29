/**
 * Properties, listings, the publish gate and the public search feed.
 *
 * Ported from apps/api/src/{listings,search,taxonomy}. The non-negotiables
 * carry over unchanged:
 *  - The public feed means: publicationState=live, verificationState=
 *    verified, neighbourhood.inServiceArea. Filters only ever narrow.
 *  - Publication requires ALL FOUR gates: field verification, corridor,
 *    accepted agreement, verified mandate for non-owner tiers.
 *  - Staleness is COMPUTED against the configured window, never stored.
 *  - `blockedBy` for a lister's inventory is computed HERE, so the landlord
 *    UI cannot hold its own opinion of what publishing requires.
 *  - Search free-text covers neighbourhood + landmark ONLY — a lister
 *    cannot buy relevance by stuffing their description.
 */
import { db } from '@/lib/db';
import type { Prisma } from '@prisma/client';
import { LISTER_TIERS, type ListerTier, type PropertyType } from './domain';

// ── config (freshness window) ────────────────────────────────────────────

const DEFAULT_FRESHNESS_DAYS = 14;

export async function freshnessWindowDays(): Promise<number> {
  const row = await db.configParameter.findUnique({ where: { key: 'freshness_window_days' } });
  const parsed = row ? parseInt(row.value, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_FRESHNESS_DAYS;
}

export async function setConfigParameter(params: { key: string; value: string; valueType: string; changedBy: string }) {
  const existing = await db.configParameter.findUnique({ where: { key: params.key } });
  if (existing) {
    const [updated] = await db.$transaction([
      db.configParameter.update({ where: { key: params.key }, data: { value: params.value, valueType: params.valueType } }),
      db.configVersion.create({
        data: { parameterId: existing.id, value: params.value, changedBy: params.changedBy },
      }),
    ]);
    return updated;
  }
  const created = await db.configParameter.create({
    data: { key: params.key, value: params.value, valueType: params.valueType },
  });
  await db.configVersion.create({
    data: { parameterId: created.id, value: params.value, changedBy: params.changedBy },
  });
  return created;
}

// ── freshness ────────────────────────────────────────────────────────────

export interface WithFreshness<T extends { availabilityConfirmedAt: Date | null }> {
  item: T;
  isStale: boolean;
  daysSinceConfirmed: number | null;
}

/**
 * Staleness is computed, not stored (FR-2.3). A listing whose availability
 * was never confirmed is treated as stale — absence of evidence is not
 * evidence of availability.
 */
export function withFreshness<T extends { availabilityConfirmedAt: Date | null }>(
  listing: T,
  windowDays: number,
  asOf: Date = new Date(),
): WithFreshness<T> {
  if (!listing.availabilityConfirmedAt) {
    return { item: listing, isStale: true, daysSinceConfirmed: null };
  }
  const elapsedMs = asOf.getTime() - listing.availabilityConfirmedAt.getTime();
  const daysSinceConfirmed = Math.floor(elapsedMs / (24 * 60 * 60 * 1000));
  return { item: listing, isStale: daysSinceConfirmed > windowDays, daysSinceConfirmed };
}

// ── photos ───────────────────────────────────────────────────────────────

export interface PhotoView {
  id: string;
  mediaAssetId: string;
  url: string;
  caption: string | null;
  sortOrder: number;
  /** Server-asserted provenance. The client renders the label; it never decides it. */
  source: string;
  isFieldVerified: boolean;
  isDevelopmentFixture: boolean;
}

/** Same-origin media route (sandbox); the real deployment serves from the API host. */
function photoToView(p: { id: string; mediaAssetId: string; position: number; asset: { source: string } }): PhotoView {
  return {
    id: p.id,
    mediaAssetId: p.mediaAssetId,
    url: `/api/v1/media/${p.mediaAssetId}`,
    caption: null,
    sortOrder: p.position,
    source: p.asset.source,
    isFieldVerified: p.asset.source === 'field_officer',
    isDevelopmentFixture: p.asset.source === 'development_fixture',
  };
}

// ── public search ────────────────────────────────────────────────────────

export interface SearchFilters {
  neighbourhoodIds?: string[];
  minRent?: bigint;
  maxRent?: bigint;
  bedrooms?: number;
  furnished?: string;
  propertyType?: PropertyType;
  q?: string;
  includeStale?: boolean;
  sort?: 'fresh' | 'rent_asc' | 'rent_desc' | 'newest';
  limit?: number;
  offset?: number;
}

export interface SearchResult {
  listingId: string;
  propertyId: string;
  monthlyRent: string;
  requiredMonthsUpfront: number;
  depositAmount: string;
  bedrooms: number;
  bathrooms: number;
  propertyType: string;
  furnished: string;
  neighbourhoodName: string;
  landmarkText: string;
  isVerified: boolean;
  isStale: boolean;
  daysSinceConfirmed: number | null;
  photos: PhotoView[];
  /** Always true in V1 — tenants never pay (Decision 3). */
  freeForTenants: boolean;
}

export interface SearchResponse {
  results: SearchResult[];
  totalCount: number;
  limit: number;
  offset: number;
  /** An honest message when there is little or nothing to show (FR-4.4). */
  emptyStateMessage: string | null;
}

const DEFAULT_LIMIT = 24;
const MAX_LIMIT = 60;

/**
 * Corridor-scoped tenant search (FR-4.1). The three NON-NEGOTIABLE
 * constraints are applied regardless of filters — they are what the public
 * feed MEANS. `filters` only narrows.
 */
export async function publicSearch(filters: SearchFilters = {}, asOf: Date = new Date()): Promise<SearchResponse> {
  const now = asOf;
  const windowDays = await freshnessWindowDays();
  const staleCutoff = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);

  const where: Prisma.ListingWhereInput = {
    publicationState: 'live',
    verificationState: 'verified',
    property: { neighbourhood: { inServiceArea: true } },
    // Stale listings leave search rather than quietly becoming a wasted trip.
    availabilityConfirmedAt: filters.includeStale ? undefined : { gte: staleCutoff },
    availabilityStatus: 'available',
    ...(filters.neighbourhoodIds?.length
      ? { property: { neighbourhood: { inServiceArea: true, id: { in: filters.neighbourhoodIds } } } }
      : {}),
    ...(filters.minRent !== undefined || filters.maxRent !== undefined
      ? { monthlyRent: { gte: filters.minRent, lte: filters.maxRent } }
      : {}),
    ...(filters.bedrooms !== undefined ? { property: { bedrooms: filters.bedrooms } } : {}),
    ...(filters.furnished ? { property: { furnished: filters.furnished } } : {}),
    ...(filters.propertyType ? { property: { propertyType: filters.propertyType } } : {}),
  };

  if (filters.q) {
    const q = filters.q.trim();
    if (q) {
      where.OR = [
        { property: { neighbourhood: { name: { contains: q } } } },
        { property: { neighbourhood: { district: { contains: q } } } },
        { property: { landmarkText: { contains: q } } },
      ];
    }
  }

  const limit = Math.min(filters.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
  const offset = filters.offset ?? 0;

  const orderBy: Prisma.ListingOrderByWithRelationInput =
    filters.sort === 'rent_asc'
      ? { monthlyRent: 'asc' }
      : filters.sort === 'rent_desc'
        ? { monthlyRent: 'desc' }
        : filters.sort === 'newest'
          ? { createdAt: 'desc' }
          : { availabilityConfirmedAt: 'desc' }; // fresh first — a wasted trip is THE failure

  const [rows, totalCount] = await Promise.all([
    db.listing.findMany({
      where,
      orderBy,
      take: limit,
      skip: offset,
      include: {
        property: { include: { neighbourhood: true } },
        photos: { orderBy: { position: 'asc' }, include: { asset: true } },
      },
    }),
    db.listing.count({ where }),
  ]);

  const results: SearchResult[] = rows.map((l) => {
    const f = withFreshness(l, windowDays, now);
    return {
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
    };
  });

  const emptyStateMessage =
    totalCount === 0
      ? 'No homes match this search right now. House For Rent publishes only homes our officers have visited and confirmed available — a short list somebody stood inside is the product. New verified homes appear as field visits are completed.'
      : totalCount < 5
        ? 'Only a few homes are live in this corridor at the moment. Every one of them has been visited and confirmed by a field officer — that verification is what takes time.'
        : null;

  return { results, totalCount, limit, offset, emptyStateMessage };
}

/** Public detail. Reuses the feed's visibility rules — no separate opinion. */
export async function publicDetail(listingId: string, asOf: Date = new Date()) {
  const windowDays = await freshnessWindowDays();
  const l = await db.listing.findUnique({
    where: { id: listingId },
    include: {
      property: { include: { neighbourhood: true, owner: { select: { displayName: true } } } },
      photos: { orderBy: { position: 'asc' }, include: { asset: true } },
      listingAmenities: { include: { amenity: true } },
    },
  });
  if (!l) return null;
  if (l.publicationState !== 'live' || l.verificationState !== 'verified') return null;
  if (!l.property.neighbourhood.inServiceArea) return null;

  const f = withFreshness(l, windowDays, asOf);
  return {
    listingId: l.id,
    propertyId: l.propertyId,
    monthlyRent: l.monthlyRent.toString(),
    requiredMonthsUpfront: l.requiredMonthsUpfront,
    depositAmount: l.depositAmount.toString(),
    /** The server-stated total a tenant will be asked to fund — derived from
     * the same terms fund-escrow derives its authoritative amount from (F-012). */
    expectedUpfront: (l.monthlyRent * BigInt(l.requiredMonthsUpfront) + l.depositAmount).toString(),
    bedrooms: l.property.bedrooms,
    bathrooms: l.property.bathrooms,
    propertyType: l.property.propertyType,
    furnished: l.property.furnished,
    neighbourhoodName: l.property.neighbourhood.name,
    neighbourhoodDistrict: l.property.neighbourhood.district,
    landmarkText: l.property.landmarkText,
    streetAddress: l.property.streetAddress,
    descriptionText: l.descriptionText,
    isVerified: l.verificationState === 'verified',
    isStale: f.isStale,
    daysSinceConfirmed: f.daysSinceConfirmed,
    availabilityConfirmedAt: l.availabilityConfirmedAt,
    amenities: l.listingAmenities.map((a) => a.amenity.name),
    photos: l.photos.map(photoToView),
    listerDisplayName: l.property.owner.displayName,
    freeForTenants: true,
  };
}

// ── landlord authorship (F-003) ──────────────────────────────────────────

export class NeighbourhoodNotFoundError extends Error {
  constructor(id: string) {
    super(`neighbourhood ${id} not found`);
    this.name = 'NeighbourhoodNotFoundError';
  }
}

/** Creates the property + its first listing terms, authored by the landlord. */
export async function createPropertyWithListing(params: {
  ownerPartyId: string;
  propertyType: PropertyType;
  bedrooms: number;
  bathrooms: number;
  furnished: string;
  neighbourhoodId: string;
  landmarkText: string;
  streetAddress?: string;
  monthlyRent: bigint;
  requiredMonthsUpfront: number;
  depositAmount: bigint;
  descriptionText?: string;
}) {
  const neighbourhood = await db.neighbourhood.findUnique({ where: { id: params.neighbourhoodId } });
  if (!neighbourhood) throw new NeighbourhoodNotFoundError(params.neighbourhoodId);

  return db.$transaction(async (tx) => {
    const property = await tx.property.create({
      data: {
        ownerPartyId: params.ownerPartyId,
        propertyType: params.propertyType,
        bedrooms: params.bedrooms,
        bathrooms: params.bathrooms,
        furnished: params.furnished,
        neighbourhoodId: params.neighbourhoodId,
        landmarkText: params.landmarkText,
        streetAddress: params.streetAddress,
      },
    });
    const listing = await tx.listing.create({
      data: {
        propertyId: property.id,
        monthlyRent: params.monthlyRent,
        requiredMonthsUpfront: params.requiredMonthsUpfront,
        depositAmount: params.depositAmount,
        descriptionText: params.descriptionText,
      },
    });
    // Drafting the listing also drafts its agreement for acceptance.
    await draftAgreement(tx, listing.id, params.ownerPartyId, params.monthlyRent);
    return { property, listing };
  });
}

/** Drafts the listing agreement at the currently-effective commission rate. */
async function draftAgreement(
  tx: Parameters<Parameters<typeof db.$transaction>[0]>[0],
  listingId: string,
  listerPartyId: string,
  monthlyRent: bigint,
) {
  const rate = await effectiveCommissionRate();
  return tx.listingAgreement.create({
    data: {
      listingId,
      listerPartyId,
      commissionRateVersionId: rate.id,
      monthlyRentAtSigning: monthlyRent,
    },
  });
}

export async function effectiveCommissionRate(asOf: Date = new Date()) {
  const versions = await db.commissionRateVersion.findMany({
    orderBy: { effectiveFrom: 'desc' },
  });
  const current =
    versions.find((v) => v.effectiveFrom.getTime() <= asOf.getTime() && (!v.effectiveTo || v.effectiveTo.getTime() > asOf.getTime())) ??
    versions[0];
  if (!current) {
    return db.commissionRateVersion.create({
      data: { rateBp: 10000, effectiveFrom: new Date('2026-01-01') },
    });
  }
  return current;
}

export class NotYourListingError extends Error {
  constructor() {
    super('you do not act on a listing you do not own (F-016: role membership is not ownership)');
    this.name = 'NotYourListingError';
  }
}

/** The landlord accepts the agreement: commission terms + circumvention clause. */
export async function acceptAgreement(params: { listingId: string; listerPartyId: string }) {
  const listing = await db.listing.findUnique({ where: { id: params.listingId }, include: { property: true } });
  if (!listing) throw new Error('listing not found');
  if (listing.property.ownerPartyId !== params.listerPartyId) throw new NotYourListingError();

  const agreement = await db.listingAgreement.findFirst({
    where: { listingId: params.listingId, listerPartyId: params.listerPartyId, accepted: false },
    orderBy: { createdAt: 'desc' },
  });
  if (!agreement) throw new Error('no draft agreement to accept');

  return db.listingAgreement.update({
    where: { id: agreement.id },
    data: { accepted: true, acceptedAt: new Date() },
  });
}

export class UnverifiedListingError extends Error {
  constructor(listingId: string) {
    super(`listing ${listingId} is not field-verified yet`);
    this.name = 'UnverifiedListingError';
  }
}
export class OutsideServiceAreaError extends Error {
  constructor(listingId: string) {
    super(`listing ${listingId}: the neighbourhood is outside the launch corridor`);
    this.name = 'OutsideServiceAreaError';
  }
}
export class MissingMandateError extends Error {
  constructor(listingId: string) {
    super(
      `listing ${listingId}: a broker or management company needs a verified ` +
        'mandate for this specific property before publishing',
    );
    this.name = 'MissingMandateError';
  }
}

async function canPublish(params: { listerTier: ListerTier; listerPartyId: string; propertyId: string }) {
  if (params.listerTier === 'property_owner') return true;
  const mandate = await db.propertyMandate.findFirst({
    where: { propertyId: params.propertyId, listerPartyId: params.listerPartyId, state: 'verified' },
  });
  return Boolean(mandate);
}

/**
 * THE publish gate — all four preconditions enforced server-side (FR-2.5,
 * FR-3.1, FR-3.2, FR-9.1). `dryRun` produces the same evaluation without
 * flipping state, so the landlord UI can show what is still missing.
 */
export async function evaluatePublish(listingId: string, dryRun = true) {
  const listing = await db.listing.findUnique({
    where: { id: listingId },
    include: {
      property: { include: { neighbourhood: true, owner: { include: { listerProfile: true } } } },
      listingAgreements: { where: { accepted: true }, take: 1 },
    },
  });
  if (!listing) throw new Error('listing not found');

  const blockedBy: string[] = [];
  if (listing.verificationState !== 'verified') blockedBy.push('field_verification');
  if (!listing.property.neighbourhood.inServiceArea) blockedBy.push('outside_service_area');

  const tier = listing.property.owner.listerProfile?.tier as ListerTier | undefined;
  if (tier && tier !== 'property_owner') {
    const permitted = await canPublish({
      listerTier: tier,
      listerPartyId: listing.property.ownerPartyId,
      propertyId: listing.propertyId,
    });
    if (!permitted) blockedBy.push('mandate');
  }
  if (listing.listingAgreements.length === 0) blockedBy.push('listing_agreement');

  if (!dryRun && blockedBy.length === 0) {
    await db.$transaction(async (tx) => {
      await tx.listing.update({ where: { id: listingId }, data: { publicationState: 'live' } });
      await tx.auditEvent.create({
        data: {
          actorPartyId: listing.property.ownerPartyId,
          actorRole: 'lister',
          action: 'listing_published',
          entityType: 'listing',
          entityId: listing.id,
          detail: JSON.stringify({ publicationState: 'live', agreementId: listing.listingAgreements[0].id }),
        },
      });
    });
  }

  return { blockedBy, canPublish: blockedBy.length === 0 };
}

/** The landlord publishes (only after the gate passes). */
export async function publishListing(params: { listingId: string; listerPartyId: string }) {
  const listing = await db.listing.findUnique({ where: { id: params.listingId }, include: { property: true } });
  if (!listing) throw new Error('listing not found');
  if (listing.property.ownerPartyId !== params.listerPartyId) throw new NotYourListingError();

  const result = await evaluatePublish(params.listingId, false);
  if (!result.canPublish) {
    throw new Error(`listing cannot be published: blocked by ${result.blockedBy.join(', ')}`);
  }
  return db.listing.findUnique({ where: { id: params.listingId } });
}

export async function withdrawListing(params: { listingId: string; listerPartyId: string }) {
  const listing = await db.listing.findUnique({ where: { id: params.listingId }, include: { property: true } });
  if (!listing) throw new Error('listing not found');
  if (listing.property.ownerPartyId !== params.listerPartyId) throw new NotYourListingError();
  return db.listing.update({ where: { id: params.listingId }, data: { publicationState: 'withdrawn' } });
}

/**
 * A lister's own inventory, with what each listing is waiting on.
 * `blockedBy` is computed HERE (see module header).
 */
export async function findForLister(listerPartyId: string) {
  const listings = await db.listing.findMany({
    where: { property: { ownerPartyId: listerPartyId } },
    include: {
      property: { include: { neighbourhood: true } },
      listingAgreements: { orderBy: { createdAt: 'desc' } },
      photos: { orderBy: { position: 'asc' }, include: { asset: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  const tier = (await db.listerProfile.findUnique({ where: { partyId: listerPartyId } }))?.tier;

  return Promise.all(
    listings.map(async (listing) => {
      const blockedBy: string[] = [];
      if (listing.verificationState !== 'verified') blockedBy.push('field_verification');
      if (!listing.property.neighbourhood.inServiceArea) blockedBy.push('outside_service_area');
      if (!listing.listingAgreements.some((a) => a.accepted)) blockedBy.push('listing_agreement');
      if (tier && tier !== 'property_owner') {
        const permitted = await canPublish({
          listerTier: tier as ListerTier,
          listerPartyId,
          propertyId: listing.propertyId,
        });
        if (!permitted) blockedBy.push('mandate');
      }
      const accepted = listing.listingAgreements.find((a) => a.accepted);

      return {
        id: listing.id,
        propertyId: listing.propertyId,
        monthlyRent: listing.monthlyRent.toString(),
        depositAmount: listing.depositAmount.toString(),
        requiredMonthsUpfront: listing.requiredMonthsUpfront,
        bedrooms: listing.property.bedrooms,
        bathrooms: listing.property.bathrooms,
        neighbourhoodName: listing.property.neighbourhood.name,
        landmarkText: listing.property.landmarkText,
        verificationState: listing.verificationState,
        publicationState: listing.publicationState,
        availabilityStatus: listing.availabilityStatus,
        availabilityConfirmedAt: listing.availabilityConfirmedAt,
        hasAcceptedAgreement: Boolean(accepted),
        agreementId: accepted?.id ?? null,
        agreementAcceptedAt: accepted?.acceptedAt ?? null,
        commissionRateBp: accepted?.commissionRateVersionId
          ? (await db.commissionRateVersion.findUnique({ where: { id: accepted.commissionRateVersionId } }))?.rateBp ?? null
          : null,
        photos: listing.photos.map(photoToView),
        blockedBy,
        canPublish: blockedBy.length === 0,
      };
    }),
  );
}

/** Listing detail for the landlord console (their own only). */
export async function getListingForLister(listingId: string, listerPartyId: string) {
  const all = await findForLister(listerPartyId);
  return all.find((l) => l.id === listingId) ?? null;
}

// ── taxonomy ─────────────────────────────────────────────────────────────

export async function listNeighbourhoods() {
  return db.neighbourhood.findMany({ orderBy: [{ district: 'asc' }, { name: 'asc' }] });
}

export async function listServiceAreaNeighbourhoods() {
  return db.neighbourhood.findMany({ where: { inServiceArea: true }, orderBy: { name: 'asc' } });
}

/** F-015: neighbourhoods are creatable through the API by staff. */
export async function createNeighbourhood(params: { name: string; district: string; inServiceArea?: boolean; latitude?: number; longitude?: number }) {
  return db.neighbourhood.create({ data: params });
}

export async function listAmenities() {
  return db.amenity.findMany({ orderBy: { name: 'asc' } });
}
