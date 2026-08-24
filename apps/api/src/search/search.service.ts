import { Injectable } from '@nestjs/common';
import { Prisma, PropertyType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '../config/config.service';
import { PhotosService } from '../photos/photos.service';
import type { ListingPhotoView } from '../photos/photos.service';

export interface SearchFilters {
  /**
   * Restricts to specific listings. NOT exposed as a query parameter — it
   * exists so `publicDetail` can reuse this method's visibility rules
   * without depending on the listing happening to land on page one.
   */
  listingIds?: string[];
  neighbourhoodIds?: string[];
  minRent?: bigint;
  maxRent?: bigint;
  bedrooms?: number;
  amenityIds?: string[];
  /** Include listings past the freshness window. Default false. */
  includeStale?: boolean;
  furnished?: 'furnished' | 'semi_furnished' | 'unfurnished';
  propertyType?: PropertyType;
  /**
   * Free-text over neighbourhood and landmark ONLY.
   *
   * Deliberately not over the description: a lister writing their own copy
   * must not be able to buy relevance by stuffing it with the names of
   * neighbourhoods the property is not in.
   */
  q?: string;
  /**
   * `fresh` (default) — most recently confirmed available first, because a
   * wasted trip is the failure this product exists to prevent.
   */
  sort?: 'fresh' | 'rent_asc' | 'rent_desc' | 'newest';
  limit?: number;
  offset?: number;
}

/**
 * A search result carrying its trust signals as DATA (FR-4.2). The client
 * renders these; it does not compute them, and it cannot fabricate them —
 * "verified" and "confirmed X days ago" mean something only if the server
 * is the one asserting them.
 */
export interface SearchResult {
  listingId: string;
  propertyId: string;
  monthlyRent: bigint;
  bedrooms: number;
  bathrooms: number;
  /** Drives the client's type filter; V1 values: apartment, house, room, other. */
  propertyType: PropertyType;
  neighbourhoodName: string;
  landmarkText: string;
  isVerified: boolean;
  isStale: boolean;
  daysSinceConfirmed: number | null;
  furnished: string;
  /**
   * Photographs, newest-ordered, each carrying its own provenance. A card
   * with none renders an honest empty frame — never a stock photograph
   * standing in for a home nobody has seen.
   */
  photos: ListingPhotoView[];
  /** Always true in V1 — tenants never pay (Decision 3, FR-9.2). */
  freeForTenants: boolean;
}

export interface SearchResponse {
  results: SearchResult[];
  /** Matches BEFORE the page window — what the filter actually found. */
  totalCount: number;
  limit: number;
  offset: number;
  /**
   * An honest message when there is little or nothing to show (FR-4.4).
   * Null when results are plentiful. Communicates ongoing verification
   * rather than failure — a thin corridor early on is the expected state of
   * a trust-first marketplace, not an error.
   */
  emptyStateMessage: string | null;
}

@Injectable()
export class SearchService {
  /** A page a phone browser can render without scrolling for a minute. */
  private static readonly DEFAULT_LIMIT = 24;
  private static readonly MAX_LIMIT = 60;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly photos: PhotosService,
  ) {}

  /**
   * Corridor-scoped tenant search (FR-4.1).
   *
   * Three constraints are NON-NEGOTIABLE and applied regardless of filters,
   * because they are what the public feed means:
   *   - publicationState = 'live'
   *   - verificationState = 'verified'   (FR-3.1)
   *   - neighbourhood.inServiceArea      (FR-2.5)
   * A caller cannot widen past them; `filters` only narrows.
   */
  async search(
    filters: SearchFilters = {},
    asOf?: Date,
  ): Promise<SearchResponse> {
    const now = asOf ?? new Date();
    const windowDays = await this.config.freshnessWindowDays(now);
    const staleCutoff = new Date(
      now.getTime() - windowDays * 24 * 60 * 60 * 1000,
    );

    const where: Prisma.ListingWhereInput = {
      ...(filters.listingIds ? { id: { in: filters.listingIds } } : {}),
      publicationState: 'live',
      verificationState: 'verified',
      availabilityStatus: 'available',
      property: {
        neighbourhood: { inServiceArea: true },
        ...(filters.neighbourhoodIds?.length
          ? { neighbourhoodId: { in: filters.neighbourhoodIds } }
          : {}),
        ...(filters.bedrooms !== undefined
          ? { bedrooms: filters.bedrooms }
          : {}),
      },
      ...(filters.minRent !== undefined || filters.maxRent !== undefined
        ? {
            monthlyRent: {
              ...(filters.minRent !== undefined
                ? { gte: filters.minRent }
                : {}),
              ...(filters.maxRent !== undefined
                ? { lte: filters.maxRent }
                : {}),
            },
          }
        : {}),
      ...(filters.amenityIds?.length
        ? {
            listingAmenities: {
              some: { amenityId: { in: filters.amenityIds } },
            },
          }
        : {}),
      // Stale listings are excluded by default and opt-in only (FR-2.3).
      // A listing never confirmed available is stale by definition, so the
      // null case is excluded too.
      ...(filters.includeStale
        ? {}
        : { availabilityConfirmedAt: { gte: staleCutoff } }),
    };

    // Property-level narrowing is merged rather than reassigned, so a later
    // filter cannot quietly drop `neighbourhood.inServiceArea` above — the
    // constraint a caller must never be able to widen past.
    const propertyWhere = where.property as Prisma.PropertyWhereInput;
    if (filters.furnished) propertyWhere.furnished = filters.furnished;
    if (filters.propertyType) propertyWhere.propertyType = filters.propertyType;
    if (filters.q?.trim()) {
      const q = filters.q.trim();
      propertyWhere.OR = [
        { neighbourhood: { name: { contains: q, mode: 'insensitive' } } },
        { landmarkText: { contains: q, mode: 'insensitive' } },
      ];
    }

    const limit = Math.min(
      Math.max(filters.limit ?? SearchService.DEFAULT_LIMIT, 1),
      SearchService.MAX_LIMIT,
    );
    const offset = Math.max(filters.offset ?? 0, 0);

    const orderBy: Prisma.ListingOrderByWithRelationInput[] =
      filters.sort === 'rent_asc'
        ? [{ monthlyRent: 'asc' }]
        : filters.sort === 'rent_desc'
          ? [{ monthlyRent: 'desc' }]
          : filters.sort === 'newest'
            ? [{ createdAt: 'desc' }]
            : // Fresh first: the most recently confirmed listing is the one a
              // tenant is least likely to waste a trip on (Decision 2, 9).
              [{ availabilityConfirmedAt: 'desc' }];

    const [totalCount, listings] = await Promise.all([
      this.prisma.listing.count({ where }),
      this.prisma.listing.findMany({
        where,
        include: { property: { include: { neighbourhood: true } } },
        orderBy,
        skip: offset,
        take: limit,
      }),
    ]);

    // One query for the whole page rather than one per card.
    const photosByListing = await this.photos.forListings(
      listings.map((l) => l.id),
    );

    const results: SearchResult[] = listings.map((listing) => {
      const daysSinceConfirmed = listing.availabilityConfirmedAt
        ? Math.floor(
            (now.getTime() - listing.availabilityConfirmedAt.getTime()) /
              (24 * 60 * 60 * 1000),
          )
        : null;

      return {
        listingId: listing.id,
        propertyId: listing.propertyId,
        monthlyRent: listing.monthlyRent,
        bedrooms: listing.property.bedrooms,
        bathrooms: listing.property.bathrooms,
        propertyType: listing.property.propertyType,
        neighbourhoodName: listing.property.neighbourhood.name,
        landmarkText: listing.property.landmarkText,
        isVerified: listing.verificationState === 'verified',
        isStale: daysSinceConfirmed === null || daysSinceConfirmed > windowDays,
        daysSinceConfirmed,
        furnished: listing.property.furnished,
        photos: photosByListing.get(listing.id) ?? [],
        freeForTenants: true,
      };
    });

    return {
      results,
      totalCount,
      limit,
      offset,
      // Keyed off the TOTAL, not the page: page 3 of 80 results is not an
      // empty state, and telling a tenant it is would be a lie of omission.
      emptyStateMessage: this.emptyStateFor(totalCount),
    };
  }

  /**
   * FR-4.4 — honest, non-dead-end messaging. Deliberately does not apologise
   * or imply failure: verification takes feet on the ground, and saying so
   * is more trust-building than "no results found".
   */
  private emptyStateFor(count: number): string | null {
    if (count === 0) {
      return (
        'No verified homes match this search yet. Our field officers verify ' +
        'every property in person, so new listings appear as they are ' +
        'confirmed — widen your filters or check back shortly.'
      );
    }
    if (count < 3) {
      return (
        'Only a few verified homes match right now. More are being verified ' +
        'in this area — widening your budget or neighbourhood will show more.'
      );
    }
    return null;
  }

  /**
   * One listing's public detail (API Spec §9.1).
   *
   * Reuses `search()` with a single-listing filter rather than querying
   * directly, so the three public-feed constraints (live, verified,
   * in-corridor) and the freshness rule apply identically. A separate query
   * here would be a second implementation of "what a tenant may see" — and
   * the one that eventually disagrees is the one that leaks an unverified
   * property into a deep link.
   *
   * Returns null when the listing is not publicly visible, so the caller
   * can 404 rather than disclose that an unpublished listing exists.
   */
  async publicDetail(listingId: string, asOf?: Date) {
    // Scoped by id rather than scanned out of the feed: the feed is now
    // paginated, and finding a listing by paging through it would have made
    // deep links work only for whatever happened to be on page one.
    const feed = await this.search(
      { listingIds: [listingId], includeStale: true, limit: 1 },
      asOf,
    );
    const result = feed.results[0];
    if (!result) return null;

    const [full, fieldConfirmed] = await Promise.all([
      this.prisma.listing.findUniqueOrThrow({
        where: { id: listingId },
        include: {
          property: { include: { neighbourhood: true } },
          listingAmenities: { include: { amenity: true } },
        },
      }),
      this.fieldConfirmedSummary(listingId),
    ]);

    return {
      ...result,
      depositAmount: full.depositAmount,
      requiredMonthsUpfront: full.requiredMonthsUpfront,
      /**
       * What a tenant is asked to fund at agreement, computed HERE from the
       * listing's own published terms.
       *
       * ── Why the server does this arithmetic ──
       * It is the same figure `fund-escrow` derives authoritatively (F-012).
       * A client multiplying rent by months itself would hold a second copy
       * of the number a tenant is about to pay — and the two disagreeing is
       * exactly the class of defect the caller-supplied-amount finding was
       * about. The client displays this; it never recomputes it.
       */
      expectedUpfront:
        full.monthlyRent * BigInt(full.requiredMonthsUpfront) +
        full.depositAmount,
      descriptionText: full.descriptionText,
      furnished: full.property.furnished,
      propertyType: full.property.propertyType,
      neighbourhoodId: full.property.neighbourhoodId,
      geoLat: full.property.geoLat,
      geoLng: full.property.geoLng,
      amenities: full.listingAmenities.map((la) => ({
        id: la.amenity.id,
        name: la.amenity.name,
      })),
      /** null when no report exists — never a fabricated placeholder. */
      fieldConfirmed,
    };
  }

  /**
   * What our officer confirmed on site (FR-4.3) — projected from the
   * STRUCTURED field report, never free text.
   */
  async fieldConfirmedSummary(listingId: string) {
    const report = await this.prisma.fieldReport.findFirst({
      where: { viewing: { listingId } },
      orderBy: { reportedAt: 'desc' },
    });
    if (!report) {
      return null;
    }
    return {
      conditionRating: report.conditionRating,
      matchesListing: report.matchesListing,
      isAvailable: report.isAvailable,
      reportedAt: report.reportedAt,
    };
  }
}
