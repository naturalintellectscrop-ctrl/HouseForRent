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
import type { ConfigValueType, Prisma } from '@prisma/client';
import { LISTER_TIERS, type FurnishedState, type ListerTier, type PropertyType } from './domain';
import { ApiError } from './http';

// ── config (freshness window) ────────────────────────────────────────────

const DEFAULT_FRESHNESS_DAYS = 14;

/** Mirrors the ConfigValueType enum; the parameter row's value_type is native now. */
const CONFIG_VALUE_TYPES = ['int', 'json', 'text'] as const;

/**
 * The CURRENT value of an int-valued config parameter. The parameter row no
 * longer carries a value — the current value is the LATEST ConfigVersion's
 * (append-only history, FR-10.1); the row holds only key and value_type.
 */
export async function configIntValue(key: string, fallback: number): Promise<number> {
  const param = await db.configParameter.findUnique({ where: { key } });
  if (!param) return fallback;
  const version = await db.configVersion.findFirst({
    where: { parameterId: param.id },
    orderBy: { effectiveFrom: 'desc' },
  });
  if (!version) return fallback;
  const parsed = parseInt(String(version.value), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function freshnessWindowDays(): Promise<number> {
  const days = await configIntValue('freshness_window_days', DEFAULT_FRESHNESS_DAYS);
  return days > 0 ? days : DEFAULT_FRESHNESS_DAYS;
}

/**
 * Records a parameter change. Append-only by construction: the value lives
 * on a NEW config_version row (who, when, what it became), never an edit of
 * the parameter row (FR-10.1) — the row's valueType is the only mutable fact.
 */
export async function setConfigParameter(params: { key: string; value: string; valueType: string; createdByPartyId: string }) {
  if (!(CONFIG_VALUE_TYPES as readonly string[]).includes(params.valueType)) {
    throw new ApiError(422, 'VALIDATION', `valueType must be one of: ${CONFIG_VALUE_TYPES.join(', ')}`);
  }
  const valueType = params.valueType as ConfigValueType;
  const existing = await db.configParameter.findUnique({ where: { key: params.key } });
  if (existing) {
    const [updated] = await db.$transaction([
      db.configParameter.update({ where: { key: params.key }, data: { valueType } }),
      db.configVersion.create({
        data: { parameterId: existing.id, value: params.value, effectiveFrom: new Date(), createdByPartyId: params.createdByPartyId },
      }),
    ]);
    return updated;
  }
  const created = await db.configParameter.create({
    data: { key: params.key, valueType },
  });
  await db.configVersion.create({
    data: { parameterId: created.id, value: params.value, effectiveFrom: new Date(), createdByPartyId: params.createdByPartyId },
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
export function photoToView(p: { id: string; mediaAssetId: string; sortOrder: number; caption: string | null; source: string }): PhotoView {
  return {
    id: p.id,
    mediaAssetId: p.mediaAssetId,
    url: `/api/v1/media/${p.mediaAssetId}`,
    caption: p.caption,
    sortOrder: p.sortOrder,
    source: p.source,
    isFieldVerified: p.source === 'field_officer',
    isDevelopmentFixture: p.source === 'development_fixture',
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
    // furnished is a native enum now; the value arrives from a fixed select.
    ...(filters.furnished ? { property: { furnished: filters.furnished as FurnishedState } } : {}),
    ...(filters.propertyType ? { property: { propertyType: filters.propertyType } } : {}),
  };

  if (filters.q) {
    const q = filters.q.trim();
    if (q) {
      where.OR = [
        { property: { neighbourhood: { name: { contains: q } } } },
        // The old district column is the parent relation now: match the
        // parent's name — never invent a district.
        { property: { neighbourhood: { parent: { name: { contains: q } } } } },
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
        photos: { orderBy: { sortOrder: 'asc' } },
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
      property: {
        include: {
          neighbourhood: { include: { parent: true } },
          ownerParty: { select: { displayName: true } },
        },
      },
      photos: { orderBy: { sortOrder: 'asc' } },
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
    // No district column: the parent's name is the district-level label.
    neighbourhoodDistrict: l.property.neighbourhood.parent?.name ?? null,
    landmarkText: l.property.landmarkText,
    streetAddress: l.property.streetAddress,
    descriptionText: l.descriptionText,
    isVerified: l.verificationState === 'verified',
    isStale: f.isStale,
    daysSinceConfirmed: f.daysSinceConfirmed,
    availabilityConfirmedAt: l.availabilityConfirmedAt,
    amenities: l.listingAmenities.map((a) => a.amenity.name),
    photos: l.photos.map(photoToView),
    listerDisplayName: l.property.ownerParty.displayName,
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
        furnished: params.furnished as FurnishedState,
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
  const rate = await effectiveCommissionRate(new Date(), listerPartyId);
  return tx.listingAgreement.create({
    data: {
      listingId,
      listerPartyId,
      commissionRateVersionId: rate.id,
      monthlyRentAtSigning: monthlyRent,
      circumventionClauseVersion: 'v1',
    },
  });
}

export async function effectiveCommissionRate(asOf: Date = new Date(), bootstrapByPartyId?: string) {
  const versions = await db.commissionRateVersion.findMany({
    orderBy: { effectiveFrom: 'desc' },
  });
  // A later version supersedes an earlier one outright — there is no
  // effective_to column; the latest version effective at `asOf` is current.
  const current = versions.find((v) => v.effectiveFrom.getTime() <= asOf.getTime()) ?? versions[0];
  if (!current) {
    // First-ever rate on an empty table: the 10000 bp default (SSOT
    // Decision 4). The immutable version row names a real creator — the
    // party whose action triggered the bootstrap — so a caller with no
    // actor in scope (a public read) fails loudly rather than fabricating one.
    if (!bootstrapByPartyId) {
      throw new Error('no commission rate version exists and no actor was provided to record the default');
    }
    return db.commissionRateVersion.create({
      data: { rateBpOfMonth: 10000, effectiveFrom: new Date('2026-01-01'), createdByPartyId: bootstrapByPartyId },
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
 * The ONE implementation of "what stands between this listing and the live
 * feed" (the publish gate, expressed as blocker codes). evaluatePublish,
 * findForLister and the admin verification queue all call this — three
 * surfaces, one opinion. `mandateVerified` is resolved by the caller (it
 * needs a (lister, property) query only for non-owner tiers).
 */
function publishBlockers(input: {
  verificationState: string;
  inServiceArea: boolean;
  hasAcceptedAgreement: boolean;
  listerTier: ListerTier | undefined;
  mandateVerified: boolean;
}): string[] {
  const blockedBy: string[] = [];
  if (input.verificationState !== 'verified') blockedBy.push('field_verification');
  if (!input.inServiceArea) blockedBy.push('outside_service_area');
  if (input.listerTier && input.listerTier !== 'property_owner' && !input.mandateVerified) {
    blockedBy.push('mandate');
  }
  if (!input.hasAcceptedAgreement) blockedBy.push('listing_agreement');
  return blockedBy;
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
      property: { include: { neighbourhood: true, ownerParty: { include: { listerProfile: true } } } },
      listingAgreements: { where: { accepted: true }, take: 1 },
    },
  });
  if (!listing) throw new Error('listing not found');

  const tier = listing.property.ownerParty.listerProfile?.tier as ListerTier | undefined;
  const mandateVerified = tier
    ? await canPublish({ listerTier: tier, listerPartyId: listing.property.ownerPartyId, propertyId: listing.propertyId })
    : true;
  const blockedBy = publishBlockers({
    verificationState: listing.verificationState,
    inServiceArea: listing.property.neighbourhood.inServiceArea,
    hasAcceptedAgreement: listing.listingAgreements.length > 0,
    listerTier: tier,
    mandateVerified,
  });

  if (!dryRun && blockedBy.length === 0) {
    await db.$transaction(async (tx) => {
      await tx.listing.update({ where: { id: listingId }, data: { publicationState: 'live' } });
      await tx.auditEvent.create({
        data: {
          actorPartyId: listing.property.ownerPartyId,
          eventType: 'listing_published',
          subjectRef: listing.id,
          payload: { publicationState: 'live', agreementId: listing.listingAgreements[0].id },
          occurredAt: new Date(),
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
      photos: { orderBy: { sortOrder: 'asc' } },
    },
    orderBy: { createdAt: 'desc' },
  });

  const tier = (await db.listerProfile.findUnique({ where: { partyId: listerPartyId } }))?.tier;

  // The mandate state each listing's publish panel needs — one read for the
  // whole inventory, mapped per property. Null means "no mandate on file",
  // which is itself the state the panel must render for a non-owner tier.
  const mandates = await db.propertyMandate.findMany({
    where: { listerPartyId },
    orderBy: { createdAt: 'desc' },
  });

  return Promise.all(
    listings.map(async (listing) => {
      const tierCast = tier as ListerTier | undefined;
      const mandateVerified = tierCast
        ? await canPublish({ listerTier: tierCast, listerPartyId, propertyId: listing.propertyId })
        : true;
      const blockedBy = publishBlockers({
        verificationState: listing.verificationState,
        inServiceArea: listing.property.neighbourhood.inServiceArea,
        hasAcceptedAgreement: listing.listingAgreements.some((a) => a.accepted),
        listerTier: tierCast,
        mandateVerified,
      });
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
        mandateState: mandates.find((m) => m.propertyId === listing.propertyId)?.state ?? null,
        hasAcceptedAgreement: Boolean(accepted),
        agreementId: accepted?.id ?? null,
        agreementAcceptedAt: accepted?.acceptedAt ?? null,
        commissionRateBp: accepted?.commissionRateVersionId
          ? (await db.commissionRateVersion.findUnique({ where: { id: accepted.commissionRateVersionId } }))?.rateBpOfMonth ?? null
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

/**
 * FR-10.2 — the admin verification queue: every listing not yet live (and
 * not withdrawn), with what each is actually waiting on.
 *
 * The previous implementation hard-coded `verificationState: 'unverified'`,
 * `mandateState: null` and `hasAcceptedAgreement: false` — so the console
 * showed a mandate column that could never hold a value and a queue that
 * could never name its real blockers. This version reads the states and
 * computes `blockedBy` through the same `publishBlockers` gate the publish
 * endpoint enforces, so the console and the gate cannot disagree.
 */
export async function adminVerificationQueue() {
  const listings = await db.listing.findMany({
    where: { publicationState: { in: ['draft', 'awaiting_verification'] } },
    include: {
      property: { include: { neighbourhood: true, ownerParty: { include: { listerProfile: true } } } },
      listingAgreements: { where: { accepted: true }, take: 1 },
    },
    orderBy: { createdAt: 'asc' },
  });

  return Promise.all(
    listings.map(async (listing) => {
      const tier = listing.property.ownerParty.listerProfile?.tier as ListerTier | undefined;
      const mandateVerified = tier
        ? await canPublish({ listerTier: tier, listerPartyId: listing.property.ownerPartyId, propertyId: listing.propertyId })
        : true;
      const blockedBy = publishBlockers({
        verificationState: listing.verificationState,
        inServiceArea: listing.property.neighbourhood.inServiceArea,
        hasAcceptedAgreement: listing.listingAgreements.length > 0,
        listerTier: tier,
        mandateVerified,
      });
      const mandate = tier && tier !== 'property_owner'
        ? await db.propertyMandate.findFirst({
            where: { propertyId: listing.propertyId, listerPartyId: listing.property.ownerPartyId },
            orderBy: { createdAt: 'desc' },
          })
        : null;

      return {
        listingId: listing.id,
        propertyId: listing.propertyId,
        listerPartyId: listing.property.ownerPartyId,
        listerName: listing.property.ownerParty.displayName,
        listerTier: tier ?? null,
        neighbourhood: listing.property.neighbourhood.name,
        inServiceArea: listing.property.neighbourhood.inServiceArea,
        verificationState: listing.verificationState,
        publicationState: listing.publicationState,
        mandateState: mandate?.state ?? null,
        hasAcceptedAgreement: listing.listingAgreements.length > 0,
        blockedBy,
        createdAt: listing.createdAt.toISOString(),
      };
    }),
  );
}

// ── taxonomy ─────────────────────────────────────────────────────────────

export async function listNeighbourhoods() {
  // No district column: group ordering follows the parent's name.
  return db.neighbourhood.findMany({ orderBy: [{ parent: { name: 'asc' } }, { name: 'asc' }] });
}

export async function listServiceAreaNeighbourhoods() {
  return db.neighbourhood.findMany({
    where: { inServiceArea: true },
    orderBy: { name: 'asc' },
    include: { parent: true },
  });
}

// F-015 note: neighbourhood CREATION moved to ops.ts
// (createServiceAreaNeighbourhood) when it gained its first real UI —
// duplicate protection, validation and an audit row. The old bare
// db.neighbourhood.create wrapper here was unreachable dead code and is
// gone (consolidate, don't duplicate).

export async function listAmenities() {
  return db.amenity.findMany({ orderBy: { name: 'asc' } });
}
