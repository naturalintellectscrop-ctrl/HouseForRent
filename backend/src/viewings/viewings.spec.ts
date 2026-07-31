import { Test } from '@nestjs/testing';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigModule } from '../config/config.module';
import { ConfigService, CONFIG_KEYS } from '../config/config.service';
import { IdentityModule } from '../identity/identity.module';
import { IdentityService } from '../identity/identity.service';
import { ListingsModule } from '../listings/listings.module';
import { ListingsService } from '../listings/listings.service';
import { MediaModule } from '../media/media.module';
import { MediaService } from '../media/media.service';
import { MockMediaStorageProvider } from '../media/mock-media-storage.provider';
import { ViewingsModule } from './viewings.module';
import {
  FieldReportAlreadyFiledError,
  FieldReportRequiredError,
  ListingNotViewableError,
  NotAFieldOfficerError,
  OutsideServiceCorridorError,
  TenantNotVerifiedError,
  ViewingsService,
} from './viewings.service';
import {
  ALLOWED_VIEWING_TRANSITIONS,
  IllegalViewingTransitionError,
  isViewingTransitionAllowed,
} from './viewing-state-machine';

/**
 * Stage 7 — the FOO field workflow.
 *
 * The assertions that matter most here:
 *   - a viewing CANNOT reach `conducted` without both a field report and an
 *     introduction record (Data_Model.md §5.1 invariant, FR-5.3, FR-5.4);
 *   - the field report writes back to availability freshness (FR-5.4 AC);
 *   - introduction records are queryable as circumvention evidence and
 *     survive independently of any deal (FR-8.3);
 *   - dispatch is corridor-bounded and FOO-only (FR-5.2, FR-5.6);
 *   - the media ladder's byte ceilings are enforced, not merely declared.
 */
describe('Viewings & field ops (Stage 7)', () => {
  let viewings: ViewingsService;
  let listings: ListingsService;
  let identity: IdentityService;
  let media: MediaService;
  let storage: MockMediaStorageProvider;
  let config: ConfigService;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        PrismaModule,
        ConfigModule,
        IdentityModule,
        ListingsModule,
        MediaModule,
        ViewingsModule,
      ],
    }).compile();

    viewings = moduleRef.get(ViewingsService);
    listings = moduleRef.get(ListingsService);
    identity = moduleRef.get(IdentityService);
    media = moduleRef.get(MediaService);
    storage = moduleRef.get(MockMediaStorageProvider);
    config = moduleRef.get(ConfigService);
    prisma = moduleRef.get(PrismaService);

    await config.defineParameter(CONFIG_KEYS.freshnessWindowDays, 'int');
    const seeder = await prisma.party.create({
      data: { displayName: 'Viewing Config Seeder', primaryPhone: phone('cs') },
    });
    await config.setValue({
      key: CONFIG_KEYS.freshnessWindowDays,
      value: 7,
      createdByPartyId: seeder.id,
      effectiveFrom: new Date(Date.now() - 60_000),
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  let seq = 0;
  function phone(tag: string) {
    seq += 1;
    return `+2569${String(Date.now()).slice(-8)}${seq}${tag}`.slice(0, 19);
  }

  /** A party with all three identity factors verified. */
  async function verifiedParty(name: string) {
    const party = await prisma.party.create({
      data: { displayName: name, primaryPhone: phone('v') },
    });
    await identity.recordConsent({
      partyId: party.id,
      purpose: 'identity_verification',
      policyVersion: 'v1',
    });
    await identity.verifyNin(party.id, `CM${party.id}`);
    await identity.verifyPhone(party.id, phone('p'));
    await identity.verifySelfieMatch(
      party.id,
      `selfie-${party.id}`,
      `idphoto-${party.id}`,
    );
    return party;
  }

  /** A party holding a real `foo` account, as dispatch requires. */
  async function fieldOfficer() {
    const party = await prisma.party.create({
      data: { displayName: 'Field Officer', primaryPhone: phone('f') },
    });
    await prisma.userAccount.create({
      data: { partyId: party.id, authRole: 'foo' },
    });
    return party;
  }

  /**
   * A live, verified, in-corridor listing with a verified tenant — the
   * baseline from which a viewing can legitimately be requested.
   */
  async function seedScene(opts?: { inServiceArea?: boolean }) {
    seq += 1;
    const tenant = await verifiedParty('Viewing Tenant');
    const landlord = await prisma.party.create({
      data: { displayName: 'Viewing Landlord', primaryPhone: phone('l') },
    });
    const foo = await fieldOfficer();
    const neighbourhood = await prisma.neighbourhood.create({
      data: {
        name: `ViewHood-${Date.now()}-${seq}`,
        inServiceArea: opts?.inServiceArea ?? true,
      },
    });
    const property = await prisma.property.create({
      data: {
        ownerPartyId: landlord.id,
        propertyType: 'apartment',
        bedrooms: 2,
        bathrooms: 1,
        furnished: 'furnished',
        neighbourhoodId: neighbourhood.id,
        landmarkText: 'viewing test property',
      },
    });
    const listing = await listings.createListing({
      propertyId: property.id,
      monthlyRent: 1_000_000n,
      requiredMonthsUpfront: 3,
      depositAmount: 1_000_000n,
    });
    // publish() requires an accepted listing agreement (FR-9.1).
    const rate = await prisma.commissionRateVersion.create({
      data: {
        rateBpOfMonth: 10000,
        effectiveFrom: new Date(Date.now() - 60_000),
        createdByPartyId: landlord.id,
      },
    });
    await prisma.listingAgreement.create({
      data: {
        listingId: listing.id,
        listerPartyId: landlord.id,
        commissionRateVersionId: rate.id,
        monthlyRentAtSigning: listing.monthlyRent,
        circumventionClauseVersion: 'v1',
        accepted: true,
        acceptedAt: new Date(),
      },
    });

    await listings.markVerified(listing.id, foo.id);
    await listings.publish(listing.id);

    return { tenant, landlord, foo, listing, property, neighbourhood };
  }

  /** Requests and assigns, leaving the viewing at `scheduled`. */
  async function scheduledViewing(opts?: { inServiceArea?: boolean }) {
    const scene = await seedScene(opts);
    const requested = await viewings.requestViewing({
      listingId: scene.listing.id,
      tenantPartyId: scene.tenant.id,
      scheduledFor: new Date(Date.now() + 86_400_000),
    });
    const assigned = await viewings.assign({
      viewingId: requested.id,
      fooPartyId: scene.foo.id,
    });
    return { ...scene, viewing: assigned };
  }

  const GOOD_REPORT = {
    conditionRating: 'good' as const,
    matchesListing: true,
    isAvailable: true,
  };

  // ────────────────────────────────────────────────────────────────────
  // FR-5.1 — requesting a viewing
  // ────────────────────────────────────────────────────────────────────

  describe('requesting a viewing (FR-5.1)', () => {
    test('a verified tenant requests a viewing tied to tenant, listing and time', async () => {
      const scene = await seedScene();
      const at = new Date(Date.now() + 86_400_000);

      const viewing = await viewings.requestViewing({
        listingId: scene.listing.id,
        tenantPartyId: scene.tenant.id,
        scheduledFor: at,
      });

      expect(viewing.tenantPartyId).toBe(scene.tenant.id);
      expect(viewing.listingId).toBe(scene.listing.id);
      expect(viewing.scheduledFor.getTime()).toBe(at.getTime());
      // No officer dispatched yet — that is what assign() is for.
      expect(viewing.status).toBe('requested');
      expect(viewing.conductedByPartyId).toBeNull();
    });

    test('an UNVERIFIED tenant cannot request a viewing', async () => {
      const scene = await seedScene();
      const stranger = await prisma.party.create({
        data: { displayName: 'Unverified', primaryPhone: phone('u') },
      });

      await expect(
        viewings.requestViewing({
          listingId: scene.listing.id,
          tenantPartyId: stranger.id,
          scheduledFor: new Date(Date.now() + 86_400_000),
        }),
      ).rejects.toThrow(TenantNotVerifiedError);
    });

    test('a viewing cannot be requested against a listing that is not live', async () => {
      const scene = await seedScene();
      await listings.withdraw(scene.listing.id);

      await expect(
        viewings.requestViewing({
          listingId: scene.listing.id,
          tenantPartyId: scene.tenant.id,
          scheduledFor: new Date(Date.now() + 86_400_000),
        }),
      ).rejects.toThrow(ListingNotViewableError);
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // FR-5.2 — dispatch
  // ────────────────────────────────────────────────────────────────────

  describe('scheduling and dispatch (FR-5.2)', () => {
    test('assigning an officer moves the viewing to scheduled', async () => {
      const { viewing, foo } = await scheduledViewing();
      expect(viewing.status).toBe('scheduled');
      expect(viewing.conductedByPartyId).toBe(foo.id);
      expect(viewing.conductedByRole).toBe('foo');
    });

    test('a party who is NOT a field officer cannot be assigned', async () => {
      const scene = await seedScene();
      const requested = await viewings.requestViewing({
        listingId: scene.listing.id,
        tenantPartyId: scene.tenant.id,
        scheduledFor: new Date(Date.now() + 86_400_000),
      });

      await expect(
        viewings.assign({
          viewingId: requested.id,
          // the landlord is a real party, but holds no `foo` account
          fooPartyId: scene.landlord.id,
        }),
      ).rejects.toThrow(NotAFieldOfficerError);
    });

    test('dispatch is CORRIDOR-BOUNDED: an out-of-corridor viewing cannot be assigned', async () => {
      // Publish inside the corridor (publish itself refuses otherwise), then
      // move the neighbourhood out — isolating the dispatch check from the
      // publish gate so it is proven to hold independently.
      const scene = await seedScene();
      const requested = await viewings.requestViewing({
        listingId: scene.listing.id,
        tenantPartyId: scene.tenant.id,
        scheduledFor: new Date(Date.now() + 86_400_000),
      });
      await prisma.neighbourhood.update({
        where: { id: scene.neighbourhood.id },
        data: { inServiceArea: false },
      });

      await expect(
        viewings.assign({ viewingId: requested.id, fooPartyId: scene.foo.id }),
      ).rejects.toThrow(OutsideServiceCorridorError);
    });

    test('a viewing can be RE-assigned to another officer before the visit', async () => {
      const { viewing } = await scheduledViewing();
      const replacement = await fieldOfficer();

      const reassigned = await viewings.assign({
        viewingId: viewing.id,
        fooPartyId: replacement.id,
      });

      expect(reassigned.status).toBe('scheduled');
      expect(reassigned.conductedByPartyId).toBe(replacement.id);
    });

    test('a NO-SHOW is tracked as a status, not deleted', async () => {
      const { viewing } = await scheduledViewing();

      const after = await viewings.markNoShow({ viewingId: viewing.id });

      expect(after.status).toBe('no_show');
      // The row survives: no-show rate is analysable precisely because
      // failed visits leave evidence too.
      expect(
        await prisma.viewing.findUnique({ where: { id: viewing.id } }),
      ).not.toBeNull();
    });

    test('an officer sees only their own scheduled viewings on the dispatch board', async () => {
      const mine = await scheduledViewing();
      await scheduledViewing(); // someone else's

      const board = await viewings.findAssignedTo(mine.foo.id);

      expect(board).toHaveLength(1);
      expect(board[0].id).toBe(mine.viewing.id);
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // THE stage invariant — Data_Model.md §5.1, FR-5.3, FR-5.4
  // ────────────────────────────────────────────────────────────────────

  describe('THE invariant: no viewing closes without report + introduction', () => {
    test('conduct() WITHOUT a field report is REJECTED', async () => {
      const { viewing, foo } = await scheduledViewing();

      await expect(
        viewings.conduct({ viewingId: viewing.id, fooPartyId: foo.id }),
      ).rejects.toThrow(FieldReportRequiredError);
    });

    test('a rejected conduct leaves NO trace: still scheduled, no introduction record', async () => {
      const { viewing, foo } = await scheduledViewing();

      await expect(
        viewings.conduct({ viewingId: viewing.id, fooPartyId: foo.id }),
      ).rejects.toThrow(FieldReportRequiredError);

      const after = await prisma.viewing.findUniqueOrThrow({
        where: { id: viewing.id },
      });
      expect(after.status).toBe('scheduled');
      expect(
        await prisma.introductionRecord.findUnique({
          where: { viewingId: viewing.id },
        }),
      ).toBeNull();
    });

    test('with a report filed, conduct() succeeds and mints the introduction record', async () => {
      const { viewing, foo, tenant, landlord, listing } =
        await scheduledViewing();
      await viewings.submitFieldReport({
        viewingId: viewing.id,
        fooPartyId: foo.id,
        ...GOOD_REPORT,
      });

      const { viewing: conducted, introduction } = await viewings.conduct({
        viewingId: viewing.id,
        fooPartyId: foo.id,
      });

      expect(conducted.status).toBe('conducted');
      // FR-5.3 — the full tenant <-> property <-> landlord <-> FOO <-> time link
      expect(introduction.tenantPartyId).toBe(tenant.id);
      expect(introduction.listingId).toBe(listing.id);
      expect(introduction.landlordPartyId).toBe(landlord.id);
      expect(introduction.fooPartyId).toBe(foo.id);
      expect(introduction.introducedAt).toBeInstanceOf(Date);
    });

    test('BOTH artefacts exist the instant the status is conducted', async () => {
      const { viewing, foo } = await scheduledViewing();
      await viewings.submitFieldReport({
        viewingId: viewing.id,
        fooPartyId: foo.id,
        ...GOOD_REPORT,
      });
      await viewings.conduct({ viewingId: viewing.id, fooPartyId: foo.id });

      const row = await prisma.viewing.findUniqueOrThrow({
        where: { id: viewing.id },
        include: { fieldReport: true, introductionRecord: true },
      });

      expect(row.status).toBe('conducted');
      expect(row.fieldReport).not.toBeNull();
      expect(row.introductionRecord).not.toBeNull();
    });

    test('no conducted viewing anywhere in the database lacks either artefact', async () => {
      // A whole-table invariant, not just a check on the row this test made.
      const orphans = await prisma.viewing.findMany({
        where: {
          status: 'conducted',
          OR: [{ fieldReport: { is: null } }, { introductionRecord: { is: null } }],
        },
      });
      expect(orphans).toEqual([]);
    });

    test('THE DATABASE refuses a conducted viewing with no evidence, even bypassing the service', async () => {
      // Service-layer discipline is not enough for evidence. A manual fix,
      // an ad-hoc script or a future bug writing straight to the table must
      // still be rejected, or "every conducted viewing produced an
      // introduction record" is a fact about one code path rather than
      // about the data.
      const { viewing, foo, tenant, landlord, listing } =
        await scheduledViewing();

      await expect(
        prisma.viewing.update({
          where: { id: viewing.id },
          data: { status: 'conducted' },
        }),
      ).rejects.toThrow(/no introduction_record exists/);

      // Half the evidence is still not enough: with an introduction record
      // but no field report, the database refuses it on the other branch.
      await prisma.introductionRecord.create({
        data: {
          viewingId: viewing.id,
          tenantPartyId: tenant.id,
          listingId: listing.id,
          landlordPartyId: landlord.id,
          fooPartyId: foo.id,
          introducedAt: new Date(),
        },
      });
      await expect(
        prisma.viewing.update({
          where: { id: viewing.id },
          data: { status: 'conducted' },
        }),
      ).rejects.toThrow(/no field_report exists/);

      expect(
        (await prisma.viewing.findUniqueOrThrow({ where: { id: viewing.id } }))
          .status,
      ).toBe('scheduled');
    });

    test('a conducted viewing is TERMINAL — it cannot be reopened as no_show', async () => {
      const { viewing, foo } = await scheduledViewing();
      await viewings.submitFieldReport({
        viewingId: viewing.id,
        fooPartyId: foo.id,
        ...GOOD_REPORT,
      });
      await viewings.conduct({ viewingId: viewing.id, fooPartyId: foo.id });

      // Retroactively denying an introduction that demonstrably happened is
      // exactly what the evidence exists to prevent.
      await expect(
        viewings.markNoShow({ viewingId: viewing.id }),
      ).rejects.toThrow(IllegalViewingTransitionError);
    });

    test('conduct() cannot be replayed to mint a second introduction record', async () => {
      const { viewing, foo } = await scheduledViewing();
      await viewings.submitFieldReport({
        viewingId: viewing.id,
        fooPartyId: foo.id,
        ...GOOD_REPORT,
      });
      await viewings.conduct({ viewingId: viewing.id, fooPartyId: foo.id });

      await expect(
        viewings.conduct({ viewingId: viewing.id, fooPartyId: foo.id }),
      ).rejects.toThrow(IllegalViewingTransitionError);

      expect(
        await prisma.introductionRecord.count({
          where: { viewingId: viewing.id },
        }),
      ).toBe(1);
    });

    test('a viewing still at `requested` cannot be conducted — nobody was dispatched', async () => {
      const scene = await seedScene();
      const requested = await viewings.requestViewing({
        listingId: scene.listing.id,
        tenantPartyId: scene.tenant.id,
        scheduledFor: new Date(Date.now() + 86_400_000),
      });

      await expect(
        viewings.conduct({ viewingId: requested.id, fooPartyId: scene.foo.id }),
      ).rejects.toThrow(IllegalViewingTransitionError);
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // FR-5.4 — the structured field report
  // ────────────────────────────────────────────────────────────────────

  describe('the structured field report (FR-5.4)', () => {
    test('the report captures condition, accuracy, availability, issues and timing as STRUCTURED fields', async () => {
      const { viewing, foo } = await scheduledViewing();

      const report = await viewings.submitFieldReport({
        viewingId: viewing.id,
        fooPartyId: foo.id,
        conditionRating: 'fair',
        matchesListing: false,
        isAvailable: true,
        issuesText: 'tap leaking in the second bathroom',
        timingNote: 'landlord arrived 20 minutes late',
      });

      // The three that matter are typed, not prose — you cannot certify a
      // partner against a standard you only recorded as free text.
      expect(report.conditionRating).toBe('fair');
      expect(typeof report.matchesListing).toBe('boolean');
      expect(typeof report.isAvailable).toBe('boolean');
      expect(report.issuesText).toContain('tap leaking');
      expect(report.timingNote).toContain('20 minutes late');
    });

    test('the report UPDATES AVAILABILITY FRESHNESS (FR-5.4 AC → FR-2.3)', async () => {
      const { viewing, foo, listing } = await scheduledViewing();

      // A freshly created listing has never been confirmed, so it is stale.
      const before = await listings.withFreshness(
        await prisma.listing.findUniqueOrThrow({ where: { id: listing.id } }),
      );
      expect(before.listing.availabilityConfirmedAt).toBeNull();
      expect(before.isStale).toBe(true);

      await viewings.submitFieldReport({
        viewingId: viewing.id,
        fooPartyId: foo.id,
        ...GOOD_REPORT,
      });

      const after = await listings.withFreshness(
        await prisma.listing.findUniqueOrThrow({ where: { id: listing.id } }),
      );
      expect(after.listing.availabilityConfirmedAt).not.toBeNull();
      expect(after.listing.availabilityStatus).toBe('available');
      expect(after.isStale).toBe(false);
      expect(after.daysSinceConfirmed).toBe(0);
    });

    test('a report of NOT available also refreshes the clock, and marks it unavailable', async () => {
      const { viewing, foo, listing } = await scheduledViewing();

      await viewings.submitFieldReport({
        viewingId: viewing.id,
        fooPartyId: foo.id,
        conditionRating: 'good',
        matchesListing: true,
        isAvailable: false,
      });

      const after = await prisma.listing.findUniqueOrThrow({
        where: { id: listing.id },
      });
      // A visit is a visit: the clock is refreshed either way. What changed
      // is the answer, not our confidence in its age.
      expect(after.availabilityConfirmedAt).not.toBeNull();
      expect(after.availabilityStatus).toBe('unavailable');
    });

    test('FR-5.5: a report matching the listing VERIFIES it — verification originates from the field visit', async () => {
      const { viewing, foo, listing } = await scheduledViewing();
      await prisma.listing.update({
        where: { id: listing.id },
        data: { verificationState: 'unverified' },
      });

      await viewings.submitFieldReport({
        viewingId: viewing.id,
        fooPartyId: foo.id,
        ...GOOD_REPORT,
      });

      const after = await prisma.listing.findUniqueOrThrow({
        where: { id: listing.id },
      });
      expect(after.verificationState).toBe('verified');
    });

    test('a report finding the listing INACCURATE removes its verified standing', async () => {
      const { viewing, foo, listing } = await scheduledViewing();

      await viewings.submitFieldReport({
        viewingId: viewing.id,
        fooPartyId: foo.id,
        conditionRating: 'poor',
        matchesListing: false,
        isAvailable: true,
      });

      const after = await prisma.listing.findUniqueOrThrow({
        where: { id: listing.id },
      });
      expect(after.verificationState).toBe('unverified');

      // And it can no longer be (re)published on the strength of a check
      // that has since been contradicted.
      await listings.withdraw(listing.id);
      await expect(listings.publish(listing.id)).rejects.toThrow(
        /field verification/,
      );
    });

    test('a report cannot be re-filed — an observation is not a document under revision', async () => {
      const { viewing, foo } = await scheduledViewing();
      await viewings.submitFieldReport({
        viewingId: viewing.id,
        fooPartyId: foo.id,
        ...GOOD_REPORT,
      });

      await expect(
        viewings.submitFieldReport({
          viewingId: viewing.id,
          fooPartyId: foo.id,
          conditionRating: 'excellent',
          matchesListing: true,
          isAvailable: true,
        }),
      ).rejects.toThrow(FieldReportAlreadyFiledError);
    });

    test('a report cannot be filed against a viewing that already closed', async () => {
      const { viewing } = await scheduledViewing();
      await viewings.markNoShow({ viewingId: viewing.id });

      await expect(
        viewings.submitFieldReport({
          viewingId: viewing.id,
          fooPartyId: (await fieldOfficer()).id,
          ...GOOD_REPORT,
        }),
      ).rejects.toThrow(IllegalViewingTransitionError);
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // FR-5.3 / FR-8.3 — introduction records as evidence
  // ────────────────────────────────────────────────────────────────────

  describe('introduction records as circumvention evidence (FR-8.3)', () => {
    async function conductedScene() {
      const scene = await scheduledViewing();
      await viewings.submitFieldReport({
        viewingId: scene.viewing.id,
        fooPartyId: scene.foo.id,
        ...GOOD_REPORT,
      });
      const { introduction } = await viewings.conduct({
        viewingId: scene.viewing.id,
        fooPartyId: scene.foo.id,
      });
      return { ...scene, introduction };
    }

    test('the record is QUERYABLE by tenant, by landlord and by listing', async () => {
      const scene = await conductedScene();

      const byTenant = await viewings.findIntroductions({
        tenantPartyId: scene.tenant.id,
      });
      const byLandlord = await viewings.findIntroductions({
        landlordPartyId: scene.landlord.id,
      });
      const byListing = await viewings.findIntroductions({
        listingId: scene.listing.id,
      });

      for (const found of [byTenant, byLandlord, byListing]) {
        expect(found.map((r) => r.id)).toContain(scene.introduction.id);
      }
    });

    test('THE circumvention case: the evidence persists with NO deal ever created', async () => {
      const scene = await conductedScene();

      // Nobody created a deal — the parties transacted around the platform.
      expect(
        await prisma.deal.count({
          where: {
            tenantPartyId: scene.tenant.id,
            landlordPartyId: scene.landlord.id,
          },
        }),
      ).toBe(0);

      // The linkage survives anyway. That is the entire point of storing it
      // on `introduction_record` rather than hanging it off `deal`.
      const evidence = await viewings.findIntroductions({
        tenantPartyId: scene.tenant.id,
        landlordPartyId: scene.landlord.id,
      });
      expect(evidence).toHaveLength(1);
      expect(evidence[0].introducedAt).toBeInstanceOf(Date);
    });

    test('the record is IMMUTABLE — the database rejects UPDATE and DELETE', async () => {
      const scene = await conductedScene();
      const original = await prisma.introductionRecord.findUniqueOrThrow({
        where: { id: scene.introduction.id },
      });

      await expect(
        prisma.introductionRecord.update({
          where: { id: scene.introduction.id },
          data: { introducedAt: new Date(0) },
        }),
      ).rejects.toThrow();
      await expect(
        prisma.introductionRecord.delete({
          where: { id: scene.introduction.id },
        }),
      ).rejects.toThrow();

      const after = await prisma.introductionRecord.findUniqueOrThrow({
        where: { id: scene.introduction.id },
      });
      expect(after).toEqual(original);
    });

    test('the landlord on the record is DERIVED from the property, not supplied', async () => {
      const scene = await conductedScene();
      const property = await prisma.property.findUniqueOrThrow({
        where: { id: scene.property.id },
      });
      // No caller chose this value — which is what makes it evidence.
      expect(scene.introduction.landlordPartyId).toBe(property.ownerPartyId);
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // FR-5.5 / NFR-5 — media capture and the low-bandwidth ladder
  // ────────────────────────────────────────────────────────────────────

  describe('field media capture (FR-5.5, NFR-5)', () => {
    test('a captured photo produces the full ladder and one media_asset row', async () => {
      const { viewing, foo } = await scheduledViewing();

      const { asset, variants } = await viewings.captureMedia({
        viewingId: viewing.id,
        fooPartyId: foo.id,
        kind: 'image',
        mimeType: 'image/jpeg',
        sourceByteSize: 4_000_000,
        sourceRef: `capture-${viewing.id}`,
      });

      expect(asset.kind).toBe('image');
      expect(asset.uploadedByPartyId).toBe(foo.id);
      expect(variants.map((v) => v.name)).toEqual(['thumb', 'low', 'standard']);
    });

    test('EVERY rung honours its byte ceiling — the ladder is checked, not declared', async () => {
      const { viewing, foo } = await scheduledViewing();

      const { variants } = await viewings.captureMedia({
        viewingId: viewing.id,
        fooPartyId: foo.id,
        kind: 'image',
        mimeType: 'image/jpeg',
        sourceByteSize: 8_000_000,
        sourceRef: `capture-${viewing.id}`,
      });

      for (const spec of media.ladderFor('image')) {
        const produced = variants.find((v) => v.name === spec.name);
        expect(produced!.byteSize).toBeLessThanOrEqual(spec.maxBytes);
      }
    });

    test('a provider that BREAKS the ceiling is rejected, and no asset row is written', async () => {
      // Proving the post-condition is load-bearing rather than decorative:
      // with the mock forced to misbehave, capture must fail.
      const { viewing, foo } = await scheduledViewing();
      const before = await prisma.mediaAsset.count();

      storage.breakCompression(true);
      try {
        await expect(
          viewings.captureMedia({
            viewingId: viewing.id,
            fooPartyId: foo.id,
            kind: 'image',
            mimeType: 'image/jpeg',
            sourceByteSize: 4_000_000,
            sourceRef: `capture-broken-${viewing.id}`,
          }),
        ).rejects.toThrow(/ceiling/);
      } finally {
        storage.breakCompression(false);
      }

      expect(await prisma.mediaAsset.count()).toBe(before);
    });

    test('an unacceptable MIME type is refused BEFORE any storage call', async () => {
      const { viewing, foo } = await scheduledViewing();
      const before = await prisma.mediaAsset.count();

      await expect(
        viewings.captureMedia({
          viewingId: viewing.id,
          fooPartyId: foo.id,
          kind: 'image',
          mimeType: 'image/tiff',
          sourceByteSize: 1_000,
          sourceRef: `capture-tiff-${viewing.id}`,
        }),
      ).rejects.toThrow(/not an accepted/);

      expect(await prisma.mediaAsset.count()).toBe(before);
    });

    test('an oversized source is refused at the boundary, not after the upload', async () => {
      const { viewing, foo } = await scheduledViewing();

      await expect(
        viewings.captureMedia({
          viewingId: viewing.id,
          fooPartyId: foo.id,
          kind: 'image',
          mimeType: 'image/jpeg',
          sourceByteSize: 500_000_000,
          sourceRef: `capture-huge-${viewing.id}`,
        }),
      ).rejects.toThrow(/capture ceiling/);
    });

    test('GRACEFUL DEGRADATION: a tiny byte budget still yields an image, not a failure', async () => {
      const { viewing, foo } = await scheduledViewing();
      const { asset } = await viewings.captureMedia({
        viewingId: viewing.id,
        fooPartyId: foo.id,
        kind: 'image',
        mimeType: 'image/jpeg',
        sourceByteSize: 4_000_000,
        sourceRef: `capture-${viewing.id}`,
      });

      const onGoodLine = await media.forBandwidth(asset.id, 10_000_000);
      const onPoorLine = await media.forBandwidth(asset.id, 30_000);
      const onAwfulLine = await media.forBandwidth(asset.id, 100);

      expect(onGoodLine!.name).toBe('standard');
      expect(onPoorLine!.name).toBe('thumb');
      // Nothing fits — a thumbnail still beats a broken image.
      expect(onAwfulLine).not.toBeNull();
      expect(onAwfulLine!.name).toBe('thumb');
    });

    test('the storage backend is genuinely swappable behind the interface', async () => {
      // The provider is bound by DI token and named nowhere in the domain;
      // MediaService holds only the interface.
      expect(storage.constructor.name).toBe('MockMediaStorageProvider');
      const { asset } = await media.capture({
        capturedByPartyId: (await fieldOfficer()).id,
        kind: 'video',
        mimeType: 'video/mp4',
        sourceByteSize: 50_000_000,
        sourceRef: 'swap-check',
      });
      expect(asset.storageRef.startsWith('mock://media/')).toBe(true);
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // FR-5.6 — the partner-viewing seam
  // ────────────────────────────────────────────────────────────────────

  describe('the partner-viewing seam (FR-5.6)', () => {
    test('"conducted by" is a role-typed reference, and V1 permits only foo', async () => {
      const { viewing } = await scheduledViewing();
      expect(viewing.conductedByRole).toBe('foo');

      // The seam is the enum: today it has exactly one value, so activating
      // certified partners later is ALTER TYPE ... ADD VALUE, not a redesign.
      const enumValues = await prisma.$queryRawUnsafe<{ v: string }[]>(
        `SELECT unnest(enum_range(NULL::"ConductedByRole"))::text AS v`,
      );
      expect(enumValues.map((r) => r.v)).toEqual(['foo']);
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // The transition graph itself
  // ────────────────────────────────────────────────────────────────────

  describe('the viewing transition graph', () => {
    test('there is NO requested → conducted edge', () => {
      expect(isViewingTransitionAllowed('requested', 'conducted')).toBe(false);
    });

    test('conducted, no_show and cancelled are all terminal', () => {
      for (const terminal of ['conducted', 'no_show', 'cancelled'] as const) {
        expect(ALLOWED_VIEWING_TRANSITIONS[terminal]).toHaveLength(0);
      }
    });

    test('the graph is frozen at runtime', () => {
      expect(Object.isFrozen(ALLOWED_VIEWING_TRANSITIONS)).toBe(true);
      expect(() => {
        (
          ALLOWED_VIEWING_TRANSITIONS as unknown as Record<string, unknown>
        ).conducted = ['scheduled'];
      }).toThrow();
      expect(ALLOWED_VIEWING_TRANSITIONS.conducted).toHaveLength(0);
    });
  });
});
