import { Injectable } from '@nestjs/common';
import {
  AvailabilityStatus,
  FurnishedState,
  Listing,
  PropertyType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '../config/config.service';
import { MandateService } from '../identity/mandate.service';

export class ListingNotFoundError extends Error {
  constructor(listingId: string) {
    super(`listing ${listingId} not found`);
    this.name = 'ListingNotFoundError';
  }
}

export class UnverifiedListingError extends Error {
  constructor(listingId: string) {
    super(
      `listing ${listingId} cannot go live: it has not passed field ` +
        'verification (FR-3.1)',
    );
    this.name = 'UnverifiedListingError';
  }
}

export class MissingMandateError extends Error {
  constructor(listingId: string) {
    super(
      `listing ${listingId} cannot go live: its lister is a broker/management ` +
        'company without a verified mandate for this specific property ' +
        '(FR-3.2). This is enforced at the domain level, not only in the UI.',
    );
    this.name = 'MissingMandateError';
  }
}

export class OutsideServiceAreaError extends Error {
  constructor(listingId: string) {
    super(
      `listing ${listingId} cannot go live: its neighbourhood is outside the ` +
        'active service area (FR-2.5)',
    );
    this.name = 'OutsideServiceAreaError';
  }
}

/** A listing plus its computed trust signals (FR-4.2). */
export interface ListingWithFreshness {
  listing: Listing;
  isStale: boolean;
  /** Whole days since availability was last confirmed; null if never. */
  daysSinceConfirmed: number | null;
}

@Injectable()
export class ListingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly mandates: MandateService,
  ) {}

  async createProperty(params: {
    ownerPartyId: string;
    propertyType: PropertyType;
    bedrooms: number;
    bathrooms: number;
    furnished: FurnishedState;
    neighbourhoodId: string;
    landmarkText: string;
    geoLat?: number;
    geoLng?: number;
    /** Optional by design — never a required field (FR-2.2). */
    streetAddress?: string;
  }) {
    return this.prisma.property.create({
      data: {
        ownerPartyId: params.ownerPartyId,
        propertyType: params.propertyType,
        bedrooms: params.bedrooms,
        bathrooms: params.bathrooms,
        furnished: params.furnished,
        neighbourhoodId: params.neighbourhoodId,
        landmarkText: params.landmarkText,
        geoLat: params.geoLat,
        geoLng: params.geoLng,
        streetAddress: params.streetAddress,
        // transactionType defaults to 'rental'; V1 has no other value
      },
    });
  }

  /** Money is bigint shillings throughout (FR-2.1). */
  async createListing(params: {
    propertyId: string;
    monthlyRent: bigint;
    requiredMonthsUpfront: number;
    depositAmount: bigint;
    descriptionText?: string;
  }) {
    return this.prisma.listing.create({
      data: {
        propertyId: params.propertyId,
        monthlyRent: params.monthlyRent,
        requiredMonthsUpfront: params.requiredMonthsUpfront,
        depositAmount: params.depositAmount,
        descriptionText: params.descriptionText,
      },
    });
  }

  /**
   * Records that a field visit verified this listing (FR-3.1, FR-5.5). Only
   * a verified listing may go live.
   */
  async markVerified(listingId: string) {
    return this.prisma.listing.update({
      where: { id: listingId },
      data: { verificationState: 'verified' },
    });
  }

  /**
   * Publishes a listing to the public feed. THE gate — all three
   * preconditions are enforced here, server-side, so no client can route
   * around them (FR-2.5, FR-3.1, FR-3.2).
   */
  async publish(listingId: string): Promise<Listing> {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      include: {
        property: {
          include: {
            neighbourhood: true,
            ownerParty: { include: { listerProfile: true } },
          },
        },
      },
    });
    if (!listing) {
      throw new ListingNotFoundError(listingId);
    }

    // 1. field verification (FR-3.1)
    if (listing.verificationState !== 'verified') {
      throw new UnverifiedListingError(listingId);
    }

    // 2. corridor scoping (FR-2.5) — a data flag, so adding a corridor is a
    //    configuration change rather than a code change
    if (!listing.property.neighbourhood.inServiceArea) {
      throw new OutsideServiceAreaError(listingId);
    }

    // 3. per-property mandate for brokers/management companies (FR-3.2).
    //    Property owners need none. Delegated to Identity so the rule lives
    //    with the verification data, not duplicated here.
    const tier = listing.property.ownerParty.listerProfile?.tier;
    if (tier) {
      const permitted = await this.mandates.canPublish({
        listerTier: tier,
        listerPartyId: listing.property.ownerPartyId,
        propertyId: listing.propertyId,
      });
      if (!permitted) {
        throw new MissingMandateError(listingId);
      }
    }

    return this.prisma.listing.update({
      where: { id: listingId },
      data: { publicationState: 'live' },
    });
  }

  /**
   * An FOO confirming on the ground that the unit is (or is not) available
   * (FR-2.3, FR-5.4). Resets the freshness clock.
   */
  async confirmAvailability(params: {
    listingId: string;
    status: AvailabilityStatus;
    confirmedAt?: Date;
  }) {
    return this.prisma.listing.update({
      where: { id: params.listingId },
      data: {
        availabilityStatus: params.status,
        availabilityConfirmedAt: params.confirmedAt ?? new Date(),
      },
    });
  }

  /**
   * Staleness is COMPUTED against the configured window, never stored
   * (FR-2.3). Storing it would freeze yesterday's policy into the data and
   * mean a window change required a backfill; computing it means the window
   * is genuinely configuration.
   *
   * A listing whose availability was never confirmed is treated as stale —
   * absence of evidence is not evidence of availability, and this platform's
   * entire proposition is that a live listing is genuinely available.
   */
  async withFreshness(
    listing: Listing,
    asOf?: Date,
  ): Promise<ListingWithFreshness> {
    const now = asOf ?? new Date();
    const windowDays = await this.config.freshnessWindowDays(now);

    if (!listing.availabilityConfirmedAt) {
      return { listing, isStale: true, daysSinceConfirmed: null };
    }

    const elapsedMs = now.getTime() - listing.availabilityConfirmedAt.getTime();
    const daysSinceConfirmed = Math.floor(elapsedMs / (24 * 60 * 60 * 1000));

    return {
      listing,
      isStale: daysSinceConfirmed > windowDays,
      daysSinceConfirmed,
    };
  }

  async getListing(listingId: string) {
    return this.prisma.listing.findUnique({ where: { id: listingId } });
  }

  /** Withdraws a listing from the public feed. */
  async withdraw(listingId: string) {
    return this.prisma.listing.update({
      where: { id: listingId },
      data: { publicationState: 'withdrawn' },
    });
  }

  /** Marks a listing as rented once its deal settles. */
  async markRented(listingId: string) {
    return this.prisma.listing.update({
      where: { id: listingId },
      data: { publicationState: 'rented' },
    });
  }
}
