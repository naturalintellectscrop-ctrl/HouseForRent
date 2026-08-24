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
import { AuditService } from '../audit/audit.service';

export class MissingListingAgreementError extends Error {
  constructor(listingId: string) {
    super(
      `listing ${listingId} cannot go live: its lister has not accepted the ` +
        'listing agreement. The commission terms and the circumvention ' +
        'clause must be presented and accepted BEFORE a listing is public ' +
        '(FR-9.1) — an agreement signed afterwards is one the landlord ' +
        'never had the chance to decline.',
    );
    this.name = 'MissingListingAgreementError';
  }
}

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

export class PropertyNotFoundError extends Error {
  constructor(propertyId: string) {
    super(`property ${propertyId} not found`);
    this.name = 'PropertyNotFoundError';
  }
}

/**
 * The caller holds the `lister` role but does not own this property.
 *
 * ── Why this exists (F-016) ──
 * `@Roles('lister')` answers "is this caller a landlord?" It does not
 * answer "is this caller THIS landlord?", and the two were being conflated:
 * any registered lister could create a listing on someone else's property,
 * publish it, or withdraw a competitor's live inventory, simply by knowing
 * an id. Role membership is not ownership, and the API — not the UI that
 * happens not to offer the button — is where that distinction has to hold.
 */
export class NotThePropertyOwnerError extends Error {
  constructor(propertyId: string) {
    super(
      `you are not the owner of property ${propertyId}. Holding the lister ` +
        'role is not the same as owning this property (API Spec §7.3).',
    );
    this.name = 'NotThePropertyOwnerError';
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
    private readonly audit: AuditService,
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

  /**
   * The listing, or a 404. Used wherever a caller supplies an id.
   */
  async getListingOrThrow(listingId: string) {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
    });
    if (!listing) throw new ListingNotFoundError(listingId);
    return listing;
  }

  /**
   * Asserts the caller owns the property behind a listing (F-016).
   *
   * Every lister-callable mutation runs through this. It is deliberately
   * NOT a guard decorator: a guard is opt-in, and the failure mode of this
   * particular check is silent — an endpoint written without it looks
   * exactly like one written with it, and works, for the owner.
   */
  async assertOwnsListing(listingId: string, callerPartyId: string) {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      include: { property: { select: { id: true, ownerPartyId: true } } },
    });
    if (!listing) throw new ListingNotFoundError(listingId);
    if (listing.property.ownerPartyId !== callerPartyId) {
      throw new NotThePropertyOwnerError(listing.property.id);
    }
    return listing;
  }

  async assertOwnsProperty(propertyId: string, callerPartyId: string) {
    const property = await this.prisma.property.findUnique({
      where: { id: propertyId },
    });
    if (!property) throw new PropertyNotFoundError(propertyId);
    if (property.ownerPartyId !== callerPartyId) {
      throw new NotThePropertyOwnerError(propertyId);
    }
    return property;
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
  /**
   * `verifiedByPartyId` is REQUIRED, not optional. An audit row naming the
   * wrong actor is worse than none: it asserts something false about who
   * inspected a property, which is exactly the claim the trust proposition
   * rests on (NFR-2, FR-3.1).
   */
  async markVerified(listingId: string, verifiedByPartyId: string) {
    return this.prisma.$transaction(async (tx) => {
      const listing = await tx.listing.update({
        where: { id: listingId },
        data: { verificationState: 'verified' },
      });

      await this.audit.record(
        {
          eventType: 'listing_verified',
          actorPartyId: verifiedByPartyId,
          subjectRef: listing.id,
          payload: { verificationState: listing.verificationState },
        },
        tx,
      );

      return listing;
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
        listingAgreements: { where: { accepted: true }, take: 1 },
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

    // 4. an accepted listing agreement (FR-9.1). The landlord must have
    //    been shown the commission terms and the circumvention clause, and
    //    have accepted them, BEFORE the listing is public — an agreement
    //    signed afterwards is one they never had the chance to decline.
    if (listing.listingAgreements.length === 0) {
      throw new MissingListingAgreementError(listingId);
    }

    return this.prisma.$transaction(async (tx) => {
      const published = await tx.listing.update({
        where: { id: listingId },
        data: { publicationState: 'live' },
      });

      await this.audit.record(
        {
          eventType: 'listing_published',
          actorPartyId: listing.property.ownerPartyId,
          subjectRef: published.id,
          payload: {
            publicationState: published.publicationState,
            agreementId: listing.listingAgreements[0].id,
          },
        },
        tx,
      );

      return published;
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

  /**
   * A lister's own inventory, with what each listing is waiting on.
   *
   * `blockedBy` is computed HERE rather than in the client, mirroring the
   * admin verification queue: a landlord's app must not hold its own
   * opinion about what publishing requires, or the two will disagree and
   * the app will be the one that is wrong.
   */
  async findForLister(listerPartyId: string) {
    const listings = await this.prisma.listing.findMany({
      where: { property: { ownerPartyId: listerPartyId } },
      include: {
        property: { include: { neighbourhood: true } },
        listingAgreements: { where: { accepted: true }, take: 1 },
      },
      orderBy: { createdAt: 'desc' },
    });

    const tier = (
      await this.prisma.listerProfile.findUnique({
        where: { partyId: listerPartyId },
      })
    )?.tier;

    return Promise.all(
      listings.map(async (listing) => {
        const blockedBy: string[] = [];
        if (listing.verificationState !== 'verified') {
          blockedBy.push('field_verification');
        }
        if (!listing.property.neighbourhood.inServiceArea) {
          blockedBy.push('outside_service_area');
        }
        if (listing.listingAgreements.length === 0) {
          blockedBy.push('listing_agreement');
        }
        if (tier && tier !== 'property_owner') {
          const permitted = await this.mandates.canPublish({
            listerTier: tier,
            listerPartyId,
            propertyId: listing.propertyId,
          });
          if (!permitted) blockedBy.push('mandate');
        }

        return {
          id: listing.id,
          propertyId: listing.propertyId,
          monthlyRent: listing.monthlyRent,
          depositAmount: listing.depositAmount,
          requiredMonthsUpfront: listing.requiredMonthsUpfront,
          bedrooms: listing.property.bedrooms,
          bathrooms: listing.property.bathrooms,
          neighbourhoodName: listing.property.neighbourhood.name,
          landmarkText: listing.property.landmarkText,
          verificationState: listing.verificationState,
          publicationState: listing.publicationState,
          availabilityStatus: listing.availabilityStatus,
          availabilityConfirmedAt: listing.availabilityConfirmedAt,
          hasAcceptedAgreement: listing.listingAgreements.length > 0,
          blockedBy,
          canPublish: blockedBy.length === 0,
        };
      }),
    );
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
