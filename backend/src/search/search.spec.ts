import { Test } from '@nestjs/testing';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigModule } from '../config/config.module';
import { ConfigService, CONFIG_KEYS } from '../config/config.service';
import { IdentityModule } from '../identity/identity.module';
import { ListingsModule } from '../listings/listings.module';
import { ListingsService } from '../listings/listings.service';
import { SearchModule } from './search.module';
import { SearchService } from './search.service';

/**
 * Stage 5 search tests (FR-4.1 – FR-4.4).
 *
 * The non-negotiables asserted here: search NEVER returns an unverified,
 * out-of-corridor, or (by default) stale listing, no matter what filters
 * are passed.
 */
describe('Search (Stage 5)', () => {
  let search: SearchService;
  let listings: ListingsService;
  let config: ConfigService;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        PrismaModule,
        ConfigModule,
        IdentityModule,
        ListingsModule,
        SearchModule,
      ],
    }).compile();

    search = moduleRef.get(SearchService);
    listings = moduleRef.get(ListingsService);
    config = moduleRef.get(ConfigService);
    prisma = moduleRef.get(PrismaService);

    await config.defineParameter(CONFIG_KEYS.freshnessWindowDays, 'int');
    const admin = await prisma.party.create({
      data: {
        displayName: 'Search Admin',
        primaryPhone: `+2566${String(Date.now()).slice(-9)}`,
      },
    });
    await config.setValue({
      key: CONFIG_KEYS.freshnessWindowDays,
      value: 7,
      createdByPartyId: admin.id,
      effectiveFrom: new Date(Date.now() - 60_000),
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  let seq = 0;
  function phone(tag: string) {
    seq += 1;
    return `+2564${String(Date.now()).slice(-8)}${seq}${tag}`.slice(0, 19);
  }

  /**
   * Creates a listing in a NEW neighbourhood each time, so tests filter to
   * their own data and cannot be polluted by other suites' rows.
   */
  async function makeListing(opts: {
    inServiceArea?: boolean;
    verified?: boolean;
    live?: boolean;
    confirmedDaysAgo?: number | null;
    monthlyRent?: bigint;
    bedrooms?: number;
  }) {
    seq += 1;
    const lister = await prisma.party.create({
      data: { displayName: 'S Lister', primaryPhone: phone('s') },
    });
    const neighbourhood = await prisma.neighbourhood.create({
      data: {
        name: `SearchHood-${Date.now()}-${seq}`,
        inServiceArea: opts.inServiceArea ?? true,
      },
    });
    const property = await listings.createProperty({
      ownerPartyId: lister.id,
      propertyType: 'apartment',
      bedrooms: opts.bedrooms ?? 2,
      bathrooms: 1,
      furnished: 'furnished',
      neighbourhoodId: neighbourhood.id,
      landmarkText: 'near the mosque',
    });
    const listing = await listings.createListing({
      propertyId: property.id,
      monthlyRent: opts.monthlyRent ?? 1_000_000n,
      requiredMonthsUpfront: 3,
      depositAmount: 1_000_000n,
    });

    if (opts.verified !== false) {
      await listings.markVerified(listing.id);
    }
    if (opts.confirmedDaysAgo !== null) {
      await listings.confirmAvailability({
        listingId: listing.id,
        status: 'available',
        confirmedAt: new Date(
          Date.now() - (opts.confirmedDaysAgo ?? 0) * 24 * 60 * 60 * 1000,
        ),
      });
    }
    if (
      opts.live !== false &&
      opts.verified !== false &&
      opts.inServiceArea !== false
    ) {
      await listings.publish(listing.id);
    }

    return { listing, neighbourhood, property, lister };
  }

  describe('the public feed is verified, in-corridor and fresh (FR-4.1)', () => {
    test('a fresh, verified, in-corridor listing IS returned', async () => {
      const s = await makeListing({ confirmedDaysAgo: 1 });
      const res = await search.search({
        neighbourhoodIds: [s.neighbourhood.id],
      });

      expect(res.results.map((r) => r.listingId)).toContain(s.listing.id);
      expect(res.totalCount).toBe(1);
    });

    test('an OUT-OF-CORRIDOR listing is never returned', async () => {
      const s = await makeListing({
        inServiceArea: false,
        confirmedDaysAgo: 1,
      });
      // force it live to prove search excludes it independently of publish
      await prisma.listing.update({
        where: { id: s.listing.id },
        data: { publicationState: 'live' },
      });

      const res = await search.search({
        neighbourhoodIds: [s.neighbourhood.id],
      });
      expect(res.results).toHaveLength(0);
    });

    test('an UNVERIFIED listing is never returned, even if forced live', async () => {
      const s = await makeListing({ verified: false, confirmedDaysAgo: 1 });
      await prisma.listing.update({
        where: { id: s.listing.id },
        data: { publicationState: 'live' },
      });

      const res = await search.search({
        neighbourhoodIds: [s.neighbourhood.id],
      });
      expect(res.results).toHaveLength(0);
    });

    test('a DRAFT listing is never returned', async () => {
      const s = await makeListing({ live: false, confirmedDaysAgo: 1 });
      const res = await search.search({
        neighbourhoodIds: [s.neighbourhood.id],
      });
      expect(res.results).toHaveLength(0);
    });
  });

  describe('stale listings are excluded by default and opt-in only (FR-2.3)', () => {
    test('a listing confirmed beyond the window is excluded', async () => {
      const s = await makeListing({ confirmedDaysAgo: 30 });
      const res = await search.search({
        neighbourhoodIds: [s.neighbourhood.id],
      });
      expect(res.results).toHaveLength(0);
    });

    test('...but is returned when the caller explicitly opts in, flagged as stale', async () => {
      const s = await makeListing({ confirmedDaysAgo: 30 });
      const res = await search.search({
        neighbourhoodIds: [s.neighbourhood.id],
        includeStale: true,
      });

      expect(res.results).toHaveLength(1);
      expect(res.results[0].isStale).toBe(true);
      expect(res.results[0].daysSinceConfirmed).toBe(30);
    });

    test('a listing never confirmed available is treated as stale and excluded', async () => {
      const s = await makeListing({ confirmedDaysAgo: null });
      await prisma.listing.update({
        where: { id: s.listing.id },
        data: { publicationState: 'live' },
      });

      const res = await search.search({
        neighbourhoodIds: [s.neighbourhood.id],
      });
      expect(res.results).toHaveLength(0);
    });
  });

  describe('mid-market filters (FR-4.1)', () => {
    test('budget band filters on integer shillings', async () => {
      const cheap = await makeListing({
        monthlyRent: 600_000n,
        confirmedDaysAgo: 1,
      });
      const dear = await makeListing({
        monthlyRent: 2_400_000n,
        confirmedDaysAgo: 1,
      });

      const res = await search.search({
        neighbourhoodIds: [cheap.neighbourhood.id, dear.neighbourhood.id],
        minRent: 500_000n,
        maxRent: 1_000_000n,
      });

      const ids = res.results.map((r) => r.listingId);
      expect(ids).toContain(cheap.listing.id);
      expect(ids).not.toContain(dear.listing.id);
    });

    test('bedrooms filter narrows correctly', async () => {
      const oneBed = await makeListing({ bedrooms: 1, confirmedDaysAgo: 1 });
      const threeBed = await makeListing({ bedrooms: 3, confirmedDaysAgo: 1 });

      const res = await search.search({
        neighbourhoodIds: [oneBed.neighbourhood.id, threeBed.neighbourhood.id],
        bedrooms: 3,
      });

      const ids = res.results.map((r) => r.listingId);
      expect(ids).toEqual([threeBed.listing.id]);
    });
  });

  describe('trust signals are DATA, not client-side copy (FR-4.2)', () => {
    test('each result carries verified, freshness and free-for-tenants as fields', async () => {
      const s = await makeListing({ confirmedDaysAgo: 2 });
      const res = await search.search({
        neighbourhoodIds: [s.neighbourhood.id],
      });
      const result = res.results[0];

      expect(result.isVerified).toBe(true);
      expect(result.daysSinceConfirmed).toBe(2);
      expect(result.isStale).toBe(false);
      // "Free for tenants" is a structural commitment, so it is asserted by
      // the server rather than being a string the client can drift from
      expect(result.freeForTenants).toBe(true);
      expect(result.neighbourhoodName).toContain('SearchHood');
      expect(result.landmarkText).toBe('near the mosque');
    });

    test('results are ordered freshest-first', async () => {
      const older = await makeListing({ confirmedDaysAgo: 5 });
      const newer = await makeListing({ confirmedDaysAgo: 1 });

      const res = await search.search({
        neighbourhoodIds: [older.neighbourhood.id, newer.neighbourhood.id],
      });

      expect(res.results[0].listingId).toBe(newer.listing.id);
      expect(res.results[1].listingId).toBe(older.listing.id);
    });
  });

  describe('honest empty states (FR-4.4)', () => {
    test('a zero-result search explains ongoing verification, not failure', async () => {
      const empty = await prisma.neighbourhood.create({
        data: { name: `EmptyHood-${Date.now()}`, inServiceArea: true },
      });

      const res = await search.search({ neighbourhoodIds: [empty.id] });

      expect(res.results).toHaveLength(0);
      expect(res.emptyStateMessage).toBeTruthy();
      expect(res.emptyStateMessage).toContain('verif');
      // not a dead end, not an apology for failure
      expect(res.emptyStateMessage).not.toMatch(/error|sorry|failed/i);
    });

    test('a thin-result search still nudges rather than going silent', async () => {
      const s = await makeListing({ confirmedDaysAgo: 1 });
      const res = await search.search({
        neighbourhoodIds: [s.neighbourhood.id],
      });

      expect(res.results).toHaveLength(1);
      expect(res.emptyStateMessage).toBeTruthy();
    });
  });

  describe('field-confirmed summary comes from the structured report (FR-4.3)', () => {
    test('the summary projects structured fields, not free text', async () => {
      const s = await makeListing({ confirmedDaysAgo: 1 });
      const foo = await prisma.party.create({
        data: { displayName: 'Search FOO', primaryPhone: phone('f') },
      });
      const tenant = await prisma.party.create({
        data: { displayName: 'Search Tenant', primaryPhone: phone('t') },
      });
      const viewing = await prisma.viewing.create({
        data: {
          listingId: s.listing.id,
          tenantPartyId: tenant.id,
          conductedByPartyId: foo.id,
          scheduledFor: new Date(),
          status: 'conducted',
        },
      });
      await prisma.fieldReport.create({
        data: {
          viewingId: viewing.id,
          fooPartyId: foo.id,
          conditionRating: 'good',
          matchesListing: true,
          isAvailable: true,
          reportedAt: new Date(),
        },
      });

      const summary = await search.fieldConfirmedSummary(s.listing.id);
      expect(summary).not.toBeNull();
      expect(summary!.conditionRating).toBe('good');
      expect(summary!.matchesListing).toBe(true);
      expect(summary!.isAvailable).toBe(true);
    });

    test('a listing with no field report yet returns null, not a fabricated summary', async () => {
      const s = await makeListing({ confirmedDaysAgo: 1 });
      expect(await search.fieldConfirmedSummary(s.listing.id)).toBeNull();
    });
  });
});
