import { Injectable } from '@nestjs/common';
import { Prisma, PropertyType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '../config/config.service';

export interface SearchFilters {
  neighbourhoodIds?: string[];
  minRent?: bigint;
  maxRent?: bigint;
  bedrooms?: number;
  amenityIds?: string[];
  /** Include listings past the freshness window. Default false. */
  includeStale?: boolean;
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
  /** Always true in V1 — tenants never pay (Decision 3, FR-9.2). */
  freeForTenants: boolean;
}

export interface SearchResponse {
  results: SearchResult[];
  totalCount: number;
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
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

    const listings = await this.prisma.listing.findMany({
      where,
      include: { property: { include: { neighbourhood: true } } },
      // Fresh first: the most recently confirmed listing is the one a tenant
      // is least likely to waste a trip on (Decision 2, Decision 9).
      orderBy: [{ availabilityConfirmedAt: 'desc' }],
    });

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
        freeForTenants: true,
      };
    });

    return {
      results,
      totalCount: results.length,
      emptyStateMessage: this.emptyStateFor(results.length),
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
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      select: { propertyId: true },
    });
    if (!listing) return null;

    const feed = await this.search(
      { neighbourhoodIds: undefined, includeStale: true },
      asOf,
    );
    const result = feed.results.find((r) => r.listingId === listingId);
    if (!result) return null;

    const [full, fieldConfirmed] = await Promise.all([
      this.prisma.listing.findUniqueOrThrow({
        where: { id: listingId },
        include: { property: { include: { neighbourhood: true } } },
      }),
      this.fieldConfirmedSummary(listingId),
    ]);

    return {
      ...result,
      depositAmount: full.depositAmount,
      requiredMonthsUpfront: full.requiredMonthsUpfront,
      descriptionText: full.descriptionText,
      furnished: full.property.furnished,
      propertyType: full.property.propertyType,
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
