import { Test } from '@nestjs/testing';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigModule } from '../config/config.module';
import {
  ConfigService,
  CONFIG_KEYS,
  ConfigNotSetError,
} from '../config/config.service';
import { IdentityModule } from '../identity/identity.module';
import { MandateService } from '../identity/mandate.service';
import { ListingsModule } from './listings.module';
import {
  ListingsService,
  MissingMandateError,
  OutsideServiceAreaError,
  UnverifiedListingError,
} from './listings.service';

/**
 * Stage 5 tests (FR-2.x, FR-3.1, FR-3.2, FR-2.5).
 *
 * The assertions that matter:
 *   - an out-of-service-area listing cannot be published;
 *   - an unmandated broker listing cannot be published (server-side);
 *   - staleness is computed against CONFIG, so changing the window changes
 *     the answer with no data migration;
 *   - a listing publishes with no street address.
 */
describe('Listings (Stage 5)', () => {
  let listings: ListingsService;
  let mandates: MandateService;
  let config: ConfigService;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PrismaModule, ConfigModule, IdentityModule, ListingsModule],
    }).compile();

    listings = moduleRef.get(ListingsService);
    mandates = moduleRef.get(MandateService);
    config = moduleRef.get(ConfigService);
    prisma = moduleRef.get(PrismaService);

    await config.defineParameter(CONFIG_KEYS.freshnessWindowDays, 'int');
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  let seq = 0;
  function phone(tag: string) {
    seq += 1;
    return `+2565${String(Date.now()).slice(-8)}${seq}${tag}`.slice(0, 19);
  }

  async function admin() {
    return prisma.party.create({
      data: { displayName: 'Cfg Admin', primaryPhone: phone('cfg') },
    });
  }

  /** Seeds the freshness window so tests are explicit about the value. */
  async function setFreshnessWindow(days: number) {
    const by = await admin();
    await config.setValue({
      key: CONFIG_KEYS.freshnessWindowDays,
      value: days,
      createdByPartyId: by.id,
      effectiveFrom: new Date(Date.now() - 60_000),
    });
  }

  async function seedListing(opts?: {
    tier?: 'property_owner' | 'broker_agent' | 'property_mgmt_company';
    inServiceArea?: boolean;
    streetAddress?: string;
  }) {
    seq += 1;
    const lister = await prisma.party.create({
      data: { displayName: 'Lister', primaryPhone: phone('l') },
    });
    if (opts?.tier) {
      await prisma.listerProfile.create({
        data: { partyId: lister.id, tier: opts.tier },
      });
    }
    const neighbourhood = await prisma.neighbourhood.create({
      data: {
        name: `Hood-${Date.now()}-${seq}`,
        inServiceArea: opts?.inServiceArea ?? true,
      },
    });
    const property = await listings.createProperty({
      ownerPartyId: lister.id,
      propertyType: 'apartment',
      bedrooms: 2,
      bathrooms: 1,
      furnished: 'furnished',
      neighbourhoodId: neighbourhood.id,
      landmarkText: 'past the blue kiosk',
      streetAddress: opts?.streetAddress,
    });
    const listing = await listings.createListing({
      propertyId: property.id,
      monthlyRent: 1_200_000n,
      requiredMonthsUpfront: 3,
      depositAmount: 1_200_000n,
    });
    return { lister, neighbourhood, property, listing };
  }

  describe('taxonomy-first location (FR-2.2)', () => {
    test('a listing publishes with neighbourhood + landmark and NO street address', async () => {
      const s = await seedListing();
      expect(s.property.streetAddress).toBeNull();
      expect(s.property.landmarkText).toBe('past the blue kiosk');

      await listings.markVerified(s.listing.id);
      const published = await listings.publish(s.listing.id);
      expect(published.publicationState).toBe('live');
    });

    test('a street address is accepted when offered, but never required', async () => {
      const s = await seedListing({ streetAddress: 'Plot 4, Kira Road' });
      expect(s.property.streetAddress).toBe('Plot 4, Kira Road');
    });
  });

  describe('money is integer shillings (FR-2.1)', () => {
    test('monthly rent and deposit round-trip as bigint', async () => {
      const s = await seedListing();
      expect(typeof s.listing.monthlyRent).toBe('bigint');
      expect(s.listing.monthlyRent).toBe(1_200_000n);
      expect(typeof s.listing.depositAmount).toBe('bigint');
    });
  });

  describe('CORRIDOR SCOPING (FR-2.5)', () => {
    test('an out-of-service-area listing CANNOT be published', async () => {
      const s = await seedListing({ inServiceArea: false });
      await listings.markVerified(s.listing.id);

      await expect(listings.publish(s.listing.id)).rejects.toThrow(
        OutsideServiceAreaError,
      );

      const reloaded = await listings.getListing(s.listing.id);
      expect(reloaded?.publicationState).toBe('draft');
    });

    test('adding a corridor is a DATA change — flipping the flag makes the same listing publishable', async () => {
      const s = await seedListing({ inServiceArea: false });
      await listings.markVerified(s.listing.id);
      await expect(listings.publish(s.listing.id)).rejects.toThrow(
        OutsideServiceAreaError,
      );

      // no code change, no migration — just the flag
      await prisma.neighbourhood.update({
        where: { id: s.neighbourhood.id },
        data: { inServiceArea: true },
      });

      const published = await listings.publish(s.listing.id);
      expect(published.publicationState).toBe('live');
    });
  });

  describe('VERIFICATION GATE (FR-3.1)', () => {
    test('an unverified listing CANNOT be published', async () => {
      const s = await seedListing();
      await expect(listings.publish(s.listing.id)).rejects.toThrow(
        UnverifiedListingError,
      );
    });
  });

  describe('MANDATE ENFORCEMENT AT PUBLISH (FR-3.2) — server-side, not UI', () => {
    test('an unmandated BROKER listing cannot be published', async () => {
      const s = await seedListing({ tier: 'broker_agent' });
      await listings.markVerified(s.listing.id);

      await expect(listings.publish(s.listing.id)).rejects.toThrow(
        MissingMandateError,
      );

      const reloaded = await listings.getListing(s.listing.id);
      expect(reloaded?.publicationState).toBe('draft');
    });

    test('an unmandated MANAGEMENT COMPANY listing cannot be published either', async () => {
      const s = await seedListing({ tier: 'property_mgmt_company' });
      await listings.markVerified(s.listing.id);
      await expect(listings.publish(s.listing.id)).rejects.toThrow(
        MissingMandateError,
      );
    });

    test('a broker WITH a verified mandate for that property CAN publish', async () => {
      const s = await seedListing({ tier: 'broker_agent' });
      await listings.markVerified(s.listing.id);

      const verifier = await admin();
      const mandate = await mandates.submitMandate({
        listerPartyId: s.lister.id,
        propertyId: s.property.id,
      });
      await mandates.decideMandate({
        mandateId: mandate.id,
        verifiedByPartyId: verifier.id,
        approve: true,
      });

      const published = await listings.publish(s.listing.id);
      expect(published.publicationState).toBe('live');
    });

    test('a PROPERTY OWNER publishes with no mandate at all', async () => {
      const s = await seedListing({ tier: 'property_owner' });
      await listings.markVerified(s.listing.id);
      const published = await listings.publish(s.listing.id);
      expect(published.publicationState).toBe('live');
    });

    test('a broker mandated on ANOTHER property still cannot publish this one', async () => {
      const s = await seedListing({ tier: 'broker_agent' });
      await listings.markVerified(s.listing.id);

      // mandate for a different property entirely
      const other = await listings.createProperty({
        ownerPartyId: s.lister.id,
        propertyType: 'house',
        bedrooms: 3,
        bathrooms: 2,
        furnished: 'unfurnished',
        neighbourhoodId: s.neighbourhood.id,
        landmarkText: 'other property',
      });
      const verifier = await admin();
      const mandate = await mandates.submitMandate({
        listerPartyId: s.lister.id,
        propertyId: other.id,
      });
      await mandates.decideMandate({
        mandateId: mandate.id,
        verifiedByPartyId: verifier.id,
        approve: true,
      });

      await expect(listings.publish(s.listing.id)).rejects.toThrow(
        MissingMandateError,
      );
    });
  });

  describe('AVAILABILITY FRESHNESS IS COMPUTED FROM CONFIG (FR-2.3)', () => {
    test('a listing confirmed today is fresh; one confirmed beyond the window is stale', async () => {
      await setFreshnessWindow(7);
      const s = await seedListing();

      await listings.confirmAvailability({
        listingId: s.listing.id,
        status: 'available',
      });
      const fresh = await listings.getListing(s.listing.id);
      expect((await listings.withFreshness(fresh!)).isStale).toBe(false);

      // confirmed 10 days ago
      await listings.confirmAvailability({
        listingId: s.listing.id,
        status: 'available',
        confirmedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
      });
      const old = await listings.getListing(s.listing.id);
      const staleResult = await listings.withFreshness(old!);
      expect(staleResult.isStale).toBe(true);
      expect(staleResult.daysSinceConfirmed).toBe(10);
    });

    test('THE config test: widening the window makes the SAME listing fresh again, with no data change', async () => {
      await setFreshnessWindow(7);
      const s = await seedListing();
      await listings.confirmAvailability({
        listingId: s.listing.id,
        status: 'available',
        confirmedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
      });

      const listing = await listings.getListing(s.listing.id);
      expect((await listings.withFreshness(listing!)).isStale).toBe(true);

      // ops widens the window to 14 days — configuration only
      await setFreshnessWindow(14);

      // same row, untouched; different answer
      const unchanged = await listings.getListing(s.listing.id);
      expect(unchanged!.availabilityConfirmedAt).toEqual(
        listing!.availabilityConfirmedAt,
      );
      expect((await listings.withFreshness(unchanged!)).isStale).toBe(false);
    });

    test('a listing whose availability was NEVER confirmed is stale', async () => {
      await setFreshnessWindow(7);
      const s = await seedListing();
      const result = await listings.withFreshness(s.listing);
      expect(result.isStale).toBe(true);
      expect(result.daysSinceConfirmed).toBeNull();
    });
  });

  describe('config refuses to invent business parameters', () => {
    test('reading an unset parameter THROWS rather than silently defaulting', async () => {
      await config.defineParameter('never_set_param', 'int');
      await expect(config.getValue('never_set_param')).rejects.toThrow(
        ConfigNotSetError,
      );
    });

    test('a future-dated version is invisible until its effective date', async () => {
      const key = `future_test_${Date.now()}`;
      await config.defineParameter(key, 'int');
      const by = await admin();

      await config.setValue({
        key,
        value: 7,
        createdByPartyId: by.id,
        effectiveFrom: new Date(Date.now() - 60_000),
      });
      await config.setValue({
        key,
        value: 99,
        createdByPartyId: by.id,
        effectiveFrom: new Date(Date.now() + 60 * 60 * 1000),
      });

      expect(await config.getValue<number>(key)).toBe(7);
      // ...but visible once time passes
      expect(
        await config.getValue<number>(
          key,
          new Date(Date.now() + 2 * 60 * 60 * 1000),
        ),
      ).toBe(99);
    });

    test('config versions are immutable — history stays interpretable', async () => {
      const key = `immutable_test_${Date.now()}`;
      await config.defineParameter(key, 'int');
      const by = await admin();
      const version = await config.setValue({
        key,
        value: 5,
        createdByPartyId: by.id,
      });

      await expect(
        prisma.$executeRawUnsafe(
          `UPDATE "config_version" SET value = '"999"' WHERE id = $1`,
          version.id,
        ),
      ).rejects.toThrow();
    });
  });
});
