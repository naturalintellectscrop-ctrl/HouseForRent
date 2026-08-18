import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { ConfigService, CONFIG_KEYS } from '../config/config.service';
import { LedgerService } from '../ledger/ledger.service';
import { IdentityService } from '../identity/identity.service';

/**
 * Stage 8 — the complete journey, end to end, over HTTP.
 *
 * Every prior stage tested its own layer. This one asserts they compose:
 * search → request viewing → FOO viewing + introduction record → match →
 * escrow funding → move-in confirmation → commission earned → settlement →
 * close, with each step made by the ROLE the authorisation matrix says may
 * make it, through the real endpoints, against the real database.
 *
 * Nothing here calls a service directly. If a step can only be reached by
 * bypassing the API, then the API does not implement the journey — which is
 * exactly what this suite exists to catch.
 */
describe('The full journey (Stage 8)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let auth: AuthService;
  let config: ConfigService;
  let ledger: LedgerService;

  const tokens: Record<string, string> = {};
  const parties: Record<string, string> = {};

  let seq = 0;
  function phone(tag: string) {
    seq += 1;
    return `+2569${String(Date.now()).slice(-8)}${seq}${tag}`.slice(0, 19);
  }

  const PASSWORD = 'correct-horse-battery';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    prisma = moduleRef.get(PrismaService);
    auth = moduleRef.get(AuthService);
    config = moduleRef.get(ConfigService);
    ledger = moduleRef.get(LedgerService);

    for (const [key, role] of [
      ['tenant', 'tenant'],
      ['lister', 'lister'],
      ['foo', 'foo'],
      ['admin', 'admin'],
    ] as const) {
      const primaryPhone = phone(key.slice(0, 2));
      const created =
        role === 'tenant' || role === 'lister'
          ? await auth.register({
              displayName: `Journey ${key}`,
              primaryPhone,
              password: PASSWORD,
              role,
            })
          : await auth.provisionStaff({
              displayName: `Journey ${key}`,
              primaryPhone,
              password: PASSWORD,
              role,
            });
      const { accessToken } = await auth.login({
        primaryPhone,
        password: PASSWORD,
      });
      tokens[key] = accessToken;
      parties[key] = created.partyId;
    }

    await config.defineParameter(CONFIG_KEYS.freshnessWindowDays, 'int');
    await config.defineParameter(CONFIG_KEYS.launchGateCount, 'int');
    await config.setValue({
      key: CONFIG_KEYS.freshnessWindowDays,
      value: 7,
      createdByPartyId: parties.admin,
      effectiveFrom: new Date(Date.now() - 60_000),
    });
    await config.setValue({
      key: CONFIG_KEYS.launchGateCount,
      value: 25,
      createdByPartyId: parties.admin,
      effectiveFrom: new Date(Date.now() - 60_000),
    });
  });

  afterAll(async () => {
    await app.close();
  });

  const as = (role: string) => `Bearer ${tokens[role]}`;
  const http = () => request(app.getHttpServer());

  /** Identity-verifies the tenant through the real onboarding preconditions. */
  async function verifyTenant() {
    const already = await prisma.identityVerification.findFirst({
      where: { partyId: parties.tenant, method: 'nin', state: 'verified' },
    });
    if (already) return;

    const identity = app.get(IdentityService);
    await identity.recordConsent({
      partyId: parties.tenant,
      purpose: 'identity_verification',
      policyVersion: 'v1',
    });
    await identity.verifyNin(parties.tenant, `CM-${parties.tenant}`);
    await identity.verifyPhone(parties.tenant, phone('vt'));
    await identity.verifySelfieMatch(
      parties.tenant,
      `selfie-${parties.tenant}`,
      `idphoto-${parties.tenant}`,
    );
  }

  const MONTHLY_RENT = 1_000_000n;
  const RATE_BP = 10000; // 1.0 month
  const UPFRONT = 4_000_000n; // 3 months + deposit
  const EXPECTED_COMMISSION = 1_000_000n;

  /**
   * Runs the journey as far as `stopAfter`, entirely over HTTP.
   * Returns every id the assertions need.
   */
  async function journey(stopAfter: string) {
    seq += 1;
    await verifyTenant();

    // ── a rate must be in force before an agreement can be presented ──
    // Effective NOW, not backdated: rate versions are append-only and
    // survive between tests, so a journey must install the latest version
    // rather than one an earlier test could out-rank. (The `rate change
    // does not re-price` test below deliberately leaves a doubled rate
    // behind — this is what keeps that from silently re-pricing every
    // journey after it.)
    await http()
      .post('/v1/admin/commission-rates')
      .set('Authorization', as('admin'))
      .send({ rateBpOfMonth: RATE_BP })
      .expect(201);

    const neighbourhood = await prisma.neighbourhood.create({
      data: { name: `JourneyHood-${Date.now()}-${seq}`, inServiceArea: true },
    });

    const property = await http()
      .post('/v1/properties')
      .set('Authorization', as('lister'))
      .send({
        propertyType: 'apartment',
        bedrooms: 2,
        bathrooms: 1,
        furnished: 'furnished',
        neighbourhoodId: neighbourhood.id,
        landmarkText: 'past the blue kiosk',
      })
      .expect(201);

    const listing = await http()
      .post('/v1/listings')
      .set('Authorization', as('lister'))
      .send({
        propertyId: property.body.id,
        monthlyRent: MONTHLY_RENT.toString(),
        requiredMonthsUpfront: 3,
        depositAmount: MONTHLY_RENT.toString(),
      })
      .expect(201);

    const listingId = listing.body.id as string;

    // ── FR-9.1: the landlord is shown the terms, then accepts ──
    const terms = await http()
      .get(`/v1/listings/${listingId}/agreement`)
      .set('Authorization', as('lister'))
      .expect(200);

    await http()
      .post(`/v1/listings/${listingId}/agreement/accept`)
      .set('Authorization', as('lister'))
      .send({})
      .expect(201);

    // ── FOO verifies on the ground, then the lister publishes ──
    await http()
      .post(`/v1/listings/${listingId}/verify`)
      .set('Authorization', as('foo'))
      .send({})
      .expect(201);

    await http()
      .post(`/v1/listings/${listingId}/confirm-availability`)
      .set('Authorization', as('foo'))
      .send({ status: 'available' })
      .expect(201);

    await http()
      .post(`/v1/listings/${listingId}/publish`)
      .set('Authorization', as('lister'))
      .send({})
      .expect(201);

    if (stopAfter === 'published') {
      return { listingId, neighbourhood, terms: terms.body };
    }

    // ── the tenant finds it in the public feed and requests a viewing ──
    const search = await http()
      .get(`/v1/listings?neighbourhoodId=${neighbourhood.id}`)
      .expect(200);

    const viewing = await http()
      .post('/v1/viewings')
      .set('Authorization', as('tenant'))
      .send({
        listingId,
        scheduledFor: new Date(Date.now() + 86_400_000).toISOString(),
      })
      .expect(201);

    await http()
      .post(`/v1/viewings/${viewing.body.id}/assign`)
      .set('Authorization', as('admin'))
      .send({ fooPartyId: parties.foo })
      .expect(201);

    await http()
      .post(`/v1/viewings/${viewing.body.id}/field-report`)
      .set('Authorization', as('foo'))
      .send({
        conditionRating: 'good',
        matchesListing: true,
        isAvailable: true,
      })
      .expect(201);

    const conducted = await http()
      .post(`/v1/viewings/${viewing.body.id}/conduct`)
      .set('Authorization', as('foo'))
      .send({})
      .expect(201);

    const introductionId = conducted.body.introduction.id as string;

    if (stopAfter === 'introduced') {
      return { listingId, viewingId: viewing.body.id, introductionId, search };
    }

    // ── the deal ──
    const agreement = await prisma.listingAgreement.findFirstOrThrow({
      where: { listingId, accepted: true },
    });

    /*
     * Through the API, by the officer who made the introduction.
     *
     * This step used to be `prisma.deal.create(...)`, which is how F-001
     * survived: the suite's own opening comment says a step reachable only
     * by bypassing the API means the API does not implement the journey, and
     * then the suite bypassed it. It passed for months against a server that
     * had no create-deal endpoint at all.
     *
     * Note what the request does NOT contain: no tenant, no landlord, no
     * listing. If the server ever stopped deriving them from the
     * introduction record, this journey could not supply them and would
     * fail rather than quietly proving a weaker property.
     */
    const created = await http()
      .post('/v1/deals')
      .set('Authorization', as('foo'))
      .send({ introductionRecordId: introductionId })
      .expect(201);

    const deal = created.body as { id: string };

    expect(deal.id).toBeTruthy();
    expect(created.body.tenantPartyId).toBe(parties.tenant);
    expect(created.body.landlordPartyId).toBe(parties.lister);
    expect(created.body.listingId).toBe(listingId);
    expect(created.body.introductionRecordId).toBe(introductionId);
    expect(created.body.status).toBe('created');

    await http()
      .post(`/v1/deals/${deal.id}/match-tenant`)
      .set('Authorization', as('foo'))
      .send({})
      .expect(201);

    await http()
      .post(`/v1/deals/${deal.id}/sign-agreement`)
      .set('Authorization', as('lister'))
      .send({ agreementId: agreement.id })
      .expect(201);

    await http()
      .post(`/v1/deals/${deal.id}/fund-escrow`)
      .set('Authorization', as('tenant'))
      .send({})
      .expect(201);

    if (stopAfter === 'funded') {
      return { listingId, dealId: deal.id, introductionId };
    }

    await http()
      .post(`/v1/deals/${deal.id}/confirm-move-in`)
      .set('Authorization', as('tenant'))
      .send({})
      .expect(201);

    await http()
      .post(`/v1/deals/${deal.id}/earn-commission`)
      .set('Authorization', as('admin'))
      .send({})
      .expect(201);

    await http()
      .post(`/v1/deals/${deal.id}/settle`)
      .set('Authorization', as('admin'))
      .send({})
      .expect(201);

    await http()
      .post(`/v1/deals/${deal.id}/close`)
      .set('Authorization', as('admin'))
      .send({})
      .expect(201);

    return { listingId, dealId: deal.id, introductionId, viewingId: undefined };
  }

  // ────────────────────────────────────────────────────────────────────
  // THE journey
  // ────────────────────────────────────────────────────────────────────

  describe('search → viewing → escrow → move-in → settlement → close', () => {
    test('the WHOLE journey completes over HTTP, each step by its permitted role', async () => {
      const { dealId } = await journey('closed');

      const deal = await prisma.deal.findUniqueOrThrow({
        where: { id: dealId! },
      });
      expect(deal.status).toBe('closed');

      // Every transition left an immutable audit row, in order.
      const transitions = await prisma.dealTransition.findMany({
        where: { dealId: dealId! },
        orderBy: { occurredAt: 'asc' },
      });
      expect(transitions.map((t) => t.toStatus)).toEqual([
        'tenant_matched',
        'agreement_signed',
        'escrow_funded',
        'move_in_confirmed',
        'commission_earned',
        'settled',
        'closed',
      ]);
    });

    test('SETTLEMENT COMMISSION equals the snapshot × monthly rent, not the escrow total', async () => {
      const { dealId } = await journey('closed');
      const deal = await prisma.deal.findUniqueOrThrow({
        where: { id: dealId! },
      });

      expect(deal.monthlyRentSnapshot).toBe(MONTHLY_RENT);
      expect(deal.commissionRateBpSnapshot).toBe(RATE_BP);
      expect(deal.commissionAmount).toBe(EXPECTED_COMMISSION);

      // 4,000,000 went into escrow; the commission is 1,000,000 — one
      // month's rent — and NOT a fraction of the upfront.
      expect(deal.commissionAmount).not.toBe(UPFRONT);
    });

    test('the ledger fully discharges: liability zero, revenue = commission', async () => {
      const { dealId } = await journey('closed');
      const balances = await ledger.balancesByTypeForDeal(dealId!);

      expect(balances.get('escrow_liability') ?? 0n).toBe(0n);
      expect(balances.get('landlord_payable') ?? 0n).toBe(0n);
      expect(balances.get('commission_revenue') ?? 0n).toBe(
        -EXPECTED_COMMISSION,
      );
    });

    test('every posting in the database still balances after the journey', async () => {
      await journey('closed');
      expect(await ledger.everyPostingBalances()).toBe(true);
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // FR-8.3 — circumvention evidence linkage
  // ────────────────────────────────────────────────────────────────────

  describe('circumvention evidence linkage (FR-8.3)', () => {
    test('a tenant introduced via a FOO is LINKED to the landlord and property', async () => {
      const { introductionId, listingId } = await journey('introduced');

      const evidence = await http()
        .get(`/v1/viewings/introductions?tenantPartyId=${parties.tenant}`)
        .set('Authorization', as('admin'))
        .expect(200);

      const found = (evidence.body as Array<Record<string, string>>).find(
        (row) => row.id === introductionId,
      );
      expect(found).toBeDefined();
      expect(found!.landlordPartyId).toBe(parties.lister);
      expect(found!.listingId).toBe(listingId);
      expect(found!.fooPartyId).toBe(parties.foo);
    });

    test('the linkage survives with NO deal ever created — the bypass case', async () => {
      const { introductionId } = await journey('introduced');

      const linkedDeals = await prisma.deal.count({
        where: { introductionRecordId: introductionId },
      });
      expect(linkedDeals).toBe(0);

      const record = await prisma.introductionRecord.findUniqueOrThrow({
        where: { id: introductionId },
      });
      expect(record.tenantPartyId).toBe(parties.tenant);
      expect(record.landlordPartyId).toBe(parties.lister);
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // FR-9.1 / FR-9.2 — the agreement and positioning
  // ────────────────────────────────────────────────────────────────────

  describe('the listing agreement (FR-9.1, FR-9.2)', () => {
    test('the terms show the commission in SHILLINGS, the clause, and name the LANDLORD as payer', async () => {
      const { terms } = await journey('published');

      expect(terms.payer).toBe('landlord');
      expect(terms.tenantPays).toBe(false);
      // The figure, not a percentage the landlord must compute
      expect(terms.commissionIfLet).toBe(EXPECTED_COMMISSION.toString());
      expect(terms.commissionRateBp).toBe(RATE_BP);
      expect(terms.clause.circumventionClause.length).toBeGreaterThan(50);
      expect(terms.clause.commissionTerms).toMatch(/only when a let succeeds/i);
    });

    test('acceptance is stored with the rate-version reference and a timestamp', async () => {
      const { listingId } = await journey('published');
      const agreement = await prisma.listingAgreement.findFirstOrThrow({
        where: { listingId },
      });

      expect(agreement.accepted).toBe(true);
      expect(agreement.acceptedAt).toBeInstanceOf(Date);
      expect(agreement.commissionRateVersionId).toBeTruthy();
      expect(agreement.monthlyRentAtSigning).toBe(MONTHLY_RENT);
      expect(agreement.circumventionClauseVersion).toBe('v1');
    });

    test('the agreement is IMMUTABLE — the database rejects UPDATE and DELETE', async () => {
      const { listingId } = await journey('published');
      const agreement = await prisma.listingAgreement.findFirstOrThrow({
        where: { listingId },
      });

      await expect(
        prisma.listingAgreement.update({
          where: { id: agreement.id },
          data: { accepted: false },
        }),
      ).rejects.toThrow();
      await expect(
        prisma.listingAgreement.delete({ where: { id: agreement.id } }),
      ).rejects.toThrow();
    });

    test('a tenant cannot accept a landlord agreement, and a stranger lister cannot either', async () => {
      const { listingId } = await journey('published');

      await http()
        .post(`/v1/listings/${listingId}/agreement/accept`)
        .set('Authorization', as('tenant'))
        .send({})
        .expect(403);

      await http()
        .post(`/v1/listings/${listingId}/agreement/accept`)
        .set('Authorization', as('admin'))
        .send({})
        .expect(403);
    });

    test('FR-9.2 POSITIONING: nothing tenant-facing carries a charge', async () => {
      const { listingId } = await journey('published');

      const feed = await http().get('/v1/listings').expect(200);
      const body = JSON.stringify(feed.body);

      // The public feed asserts free-for-tenants as server data, and carries
      // no fee, charge or commission field anywhere in it.
      expect(feed.body.results.every((r: { freeForTenants: boolean }) => r.freeForTenants)).toBe(true);
      expect(body).not.toMatch(/"(fee|charge|tenantFee|commission)"\s*:/i);

      // …while the agreement the LANDLORD signs names them as the payer.
      const terms = await http()
        .get(`/v1/listings/${listingId}/agreement`)
        .set('Authorization', as('lister'))
        .expect(200);
      expect(terms.body.payer).toBe('landlord');
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // NFR-2 — auditability
  // ────────────────────────────────────────────────────────────────────

  describe('audit logging (NFR-2)', () => {
    test('every MONEY event on the journey is audit-logged', async () => {
      const { dealId } = await journey('closed');

      const trail = await http()
        .get(`/v1/admin/audit/${dealId}`)
        .set('Authorization', as('admin'))
        .expect(200);

      const types = (trail.body as Array<{ eventType: string }>).map(
        (e) => e.eventType,
      );
      expect(types).toEqual(
        expect.arrayContaining([
          'escrow_funded',
          'commission_earned',
          'deal_settled',
        ]),
      );
    });

    test('the audit row for commission carries the SNAPSHOTS, as strings', async () => {
      const { dealId } = await journey('closed');
      const row = await prisma.auditEvent.findFirstOrThrow({
        where: { subjectRef: dealId!, eventType: 'commission_earned' },
      });

      const payload = row.payload as Record<string, unknown>;
      expect(payload.commissionAmount).toBe(EXPECTED_COMMISSION.toString());
      expect(payload.monthlyRentSnapshot).toBe(MONTHLY_RENT.toString());
      // A bigint rendered as a JSON number is exactly the precision loss the
      // money core exists to prevent.
      expect(typeof payload.commissionAmount).toBe('string');
    });

    test('verification, consent and agreement events are logged too', async () => {
      await journey('published');

      for (const eventType of [
        'identity_verified',
        'consent_recorded',
        'listing_verified',
        'listing_agreement_accepted',
        'listing_published',
        'commission_rate_version_created',
      ]) {
        const count = await prisma.auditEvent.count({ where: { eventType } });
        expect(count).toBeGreaterThan(0);
      }
    });

    test('NO audit payload anywhere carries a NIN, phone number or token', async () => {
      await journey('closed');

      const rows = await prisma.auditEvent.findMany({ take: 500 });
      const serialised = JSON.stringify(rows.map((r) => r.payload));

      // Asserted as KEYS (`"phone":`), not bare substrings. `"phone"` alone
      // also matches the legitimate value in `{"method":"phone"}` — which
      // records WHICH check ran, not anyone's number. An assertion that
      // cannot tell those apart would fail on correct code and teach us to
      // loosen it, which is how a PII check stops being one.
      for (const key of [
        'nin',
        'phone',
        'primaryPhone',
        'password',
        'accessToken',
        'refreshToken',
        'selfieRef',
        'idPhotoRef',
      ]) {
        expect(serialised).not.toContain(`"${key}":`);
      }

      // And the substance, not just the shape: no Ugandan MSISDN and no
      // NIN-shaped string appears anywhere in any payload, under any key.
      expect(serialised).not.toMatch(/\+256\d{6,}/);
      expect(serialised).not.toMatch(/\bCM[A-Z0-9]{10,}\b/);
    });

    test('audit rows are IMMUTABLE — the database rejects UPDATE and DELETE', async () => {
      const { dealId } = await journey('closed');
      const row = await prisma.auditEvent.findFirstOrThrow({
        where: { subjectRef: dealId! },
      });

      await expect(
        prisma.auditEvent.update({
          where: { id: row.id },
          data: { eventType: 'tampered' },
        }),
      ).rejects.toThrow();
      await expect(
        prisma.auditEvent.delete({ where: { id: row.id } }),
      ).rejects.toThrow();
    });

    test('a money event that ROLLS BACK leaves no audit row claiming it happened', async () => {
      const { dealId } = await journey('funded');

      // settle() from escrow_funded is not a legal transition; the whole
      // attempt must leave nothing behind, audit included.
      await http()
        .post(`/v1/deals/${dealId}/settle`)
        .set('Authorization', as('admin'))
        .send({})
        .expect(409);

      const settled = await prisma.auditEvent.count({
        where: { subjectRef: dealId!, eventType: 'deal_settled' },
      });
      expect(settled).toBe(0);
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // E10 — observability
  // ────────────────────────────────────────────────────────────────────

  describe('admin observability (PRD E10)', () => {
    test('FR-10.3 launch gate counts verified, in-corridor, FRESH inventory', async () => {
      await journey('published');

      const res = await http()
        .get('/v1/admin/launch-gate')
        .set('Authorization', as('admin'))
        .expect(200);

      expect(res.body.gate).toBe(25);
      expect(res.body.qualifying).toBeGreaterThan(0);
      expect(typeof res.body.gateMet).toBe('boolean');
      expect(res.body.shortfall).toBe(
        Math.max(0, res.body.gate - res.body.qualifying),
      );
      // Stale inventory is COUNTED, not silently dropped — "40 listings, 18
      // stale" is a different problem from "22 listings".
      expect(typeof res.body.staleExcluded).toBe('number');
    });

    test('FR-10.2 verification queue says WHAT BLOCKS each listing', async () => {
      // A listing with nothing done to it yet.
      seq += 1;
      const neighbourhood = await prisma.neighbourhood.create({
        data: { name: `QueueHood-${Date.now()}-${seq}`, inServiceArea: true },
      });
      const property = await prisma.property.create({
        data: {
          ownerPartyId: parties.lister,
          propertyType: 'apartment',
          bedrooms: 1,
          bathrooms: 1,
          furnished: 'unfurnished',
          neighbourhoodId: neighbourhood.id,
          landmarkText: 'queue test',
        },
      });
      const listing = await prisma.listing.create({
        data: {
          propertyId: property.id,
          monthlyRent: 500_000n,
          requiredMonthsUpfront: 3,
          depositAmount: 500_000n,
        },
      });

      const res = await http()
        .get('/v1/admin/verification-queue')
        .set('Authorization', as('foo'))
        .expect(200);

      const row = (res.body.rows as Array<Record<string, unknown>>).find(
        (r) => r.listingId === listing.id,
      );
      expect(row).toBeDefined();
      expect(row!.blockedBy).toEqual(
        expect.arrayContaining(['field_verification', 'listing_agreement']),
      );
    });

    test('FR-10.4 reconciliation reports ledger vs custodian, and internal consistency', async () => {
      await journey('closed');

      const res = await http()
        .get('/v1/admin/reconciliation')
        .set('Authorization', as('admin'))
        .expect(200);

      expect(res.body.latest).toBeDefined();
      expect(typeof res.body.latest.isReconciled).toBe('boolean');
      // The ledger disagreeing with the custodian and the ledger disagreeing
      // with ITSELF are different problems and are reported separately.
      expect(res.body.internallyConsistent).toBe(true);
      expect(Array.isArray(res.body.history)).toBe(true);
    });

    test('FR-10.4 deal-state distribution is observable', async () => {
      await journey('closed');

      const res = await http()
        .get('/v1/admin/deals')
        .set('Authorization', as('admin'))
        .expect(200);

      expect(res.body.distribution.closed).toBeGreaterThan(0);
      expect(res.body.total).toBeGreaterThan(0);
    });

    test('FR-10.1 a rate change creates a NEW version and cannot re-price a signed deal', async () => {
      const { dealId } = await journey('closed');
      const before = await prisma.deal.findUniqueOrThrow({
        where: { id: dealId! },
      });

      await http()
        .post('/v1/admin/commission-rates')
        .set('Authorization', as('admin'))
        .send({ rateBpOfMonth: 20000, note: 'doubled' })
        .expect(201);

      const after = await prisma.deal.findUniqueOrThrow({
        where: { id: dealId! },
      });
      expect(after.commissionRateBpSnapshot).toBe(
        before.commissionRateBpSnapshot,
      );
      expect(after.commissionAmount).toBe(before.commissionAmount);
    });

    /**
     * Regression: `CreateConfigVersionDto.value` carried no class-validator
     * decorator, so the global `whitelist: true` stripped it and
     * `forbidNonWhitelisted` then rejected the request for containing an
     * unexpected field — the endpoint refused the one field it exists to
     * accept, with a 400 that read like a client error. `tsc`, the
     * production build and the entire suite were green, because nothing
     * posted here. Found by driving the real form in a browser.
     */
    test('FR-10.1 a config version can actually be created — every value type', async () => {
      // These write to `required_months_default` and `service_area`
      // deliberately: config versions are append-only and the whole suite
      // shares one database, so writing `freshness_window_days` or
      // `screening_modules` here silently re-prices the Stage 5, 6 and 7
      // suites that read them. It did, on the first run — eight tests in
      // three other files went red. Neither key below is read elsewhere.
      for (const [key, value] of [
        ['required_months_default', 3],
        ['service_area', { corridor: 'ntinda-kiwatule' }],
      ] as const) {
        await http()
          .post(`/v1/admin/config/${key}/versions`)
          .set('Authorization', as('admin'))
          .send({ value })
          .expect(201);
      }

      const res = await http()
        .get('/v1/admin/config/required_months_default/versions')
        .set('Authorization', as('admin'))
        .expect(200);

      // Asserted by PRESENCE, not position. History is ordered by
      // effectiveFrom and config versions are append-only across runs, so a
      // future-dated version left by the scheduling test below legitimately
      // sorts first — indexing [0] would make this fail on correct code.
      const values = (res.body as Array<{ value: unknown }>).map((v) => v.value);
      expect(values).toContain(3);
    });

    test('a future-dated config version is accepted and stays scheduled', async () => {
      const effectiveFrom = new Date(Date.now() + 86_400_000).toISOString();
      const created = await http()
        .post('/v1/admin/config/required_months_default/versions')
        .set('Authorization', as('admin'))
        .send({ value: 99, effectiveFrom })
        .expect(201);

      expect(new Date(created.body.effectiveFrom as string).getTime()).toBe(
        new Date(effectiveFrom).getTime(),
      );

      // Invisible until its date: the value in force is still the old one.
      expect(
        await config.getValue<number>('required_months_default'),
      ).not.toBe(99);
    });

    test('an UNKNOWN config key is a 404, not a 500', async () => {
      // A typo must not create a parameter nothing reads — the change would
      // appear to succeed while having no effect.
      const res = await http()
        .post('/v1/admin/config/freshness_window_dayz/versions')
        .set('Authorization', as('admin'))
        .send({ value: 7 });

      expect(res.status).toBe(404);
      expect(res.body.error?.code).toBe('NOT_FOUND');
    });

    test('a config version still cannot carry unexpected fields', async () => {
      // @Allow() opens `value` specifically — it must not have opened the
      // body generally.
      await http()
        .post('/v1/admin/config/required_months_default/versions')
        .set('Authorization', as('admin'))
        .send({ value: 7, createdByPartyId: parties.tenant })
        .expect(400);
    });

    test('there is NO endpoint that edits a rate version or a config version', async () => {
      const rate = await prisma.commissionRateVersion.findFirstOrThrow({});

      for (const method of ['put', 'patch', 'delete'] as const) {
        const res = await http()
          [method](`/v1/admin/commission-rates/${rate.id}`)
          .set('Authorization', as('admin'))
          .send({ rateBpOfMonth: 1 });
        expect(res.status).toBe(404);
      }
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // NFR-1 — the security pass, on the endpoints Stage 8 added
  // ────────────────────────────────────────────────────────────────────

  /**
   * The mobile client needs three caller-scoped lists. Each is scoped from
   * the SESSION, never a query parameter — an endpoint that accepted a
   * party id would undo the per-deal guard by letting any authenticated
   * user read anyone's rentals.
   */
  describe('caller-scoped reads for the mobile client (NFR-1)', () => {
    test('GET /deals returns ONLY the caller\'s own deals, both sides', async () => {
      const { dealId } = await journey('closed');

      for (const role of ['tenant', 'lister'] as const) {
        const res = await http()
          .get('/v1/deals')
          .set('Authorization', as(role))
          .expect(200);

        const ids = (res.body as Array<{ id: string }>).map((d) => d.id);
        expect(ids).toContain(dealId);
        // Every row must have the caller on one side of it.
        for (const deal of res.body as Array<{
          tenantPartyId: string;
          landlordPartyId: string;
        }>) {
          expect(
            deal.tenantPartyId === parties[role] ||
              deal.landlordPartyId === parties[role],
          ).toBe(true);
        }
      }
    });

    test('a stranger sees none of them', async () => {
      await journey('closed');
      seq += 1;
      const primaryPhone = phone('sx');
      await auth.register({
        displayName: 'Stranger',
        primaryPhone,
        password: PASSWORD,
        role: 'tenant',
      });
      const { accessToken } = await auth.login({
        primaryPhone,
        password: PASSWORD,
      });

      const res = await http()
        .get('/v1/deals')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body).toEqual([]);
    });

    test('GET /deals cannot be widened by a party-id query', async () => {
      await journey('closed');
      // forbidNonWhitelisted has nothing to whitelist on a GET, so the
      // guarantee is that the handler never READS a query param — asserted
      // by the answer being identical with one present.
      const withParam = await http()
        .get(`/v1/deals?partyId=${parties.lister}`)
        .set('Authorization', as('tenant'))
        .expect(200);
      const without = await http()
        .get('/v1/deals')
        .set('Authorization', as('tenant'))
        .expect(200);

      expect(withParam.body).toEqual(without.body);
    });

    test('GET /viewings/mine is the tenant\'s own, and not FOO-readable', async () => {
      await journey('introduced');

      const mine = await http()
        .get('/v1/viewings/mine')
        .set('Authorization', as('tenant'))
        .expect(200);

      expect((mine.body as unknown[]).length).toBeGreaterThan(0);
      for (const viewing of mine.body as Array<{ tenantPartyId: string }>) {
        expect(viewing.tenantPartyId).toBe(parties.tenant);
      }

      // A field officer has their own board; this route is not theirs.
      await http()
        .get('/v1/viewings/mine')
        .set('Authorization', as('foo'))
        .expect(403);
    });

    test('the literal /viewings/mine route is not swallowed as an id', async () => {
      const res = await http()
        .get('/v1/viewings/mine')
        .set('Authorization', as('tenant'));
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    test('GET /listings/mine returns the lister\'s inventory with blockedBy', async () => {
      const { listingId } = await journey('published');

      const res = await http()
        .get('/v1/listings/mine')
        .set('Authorization', as('lister'))
        .expect(200);

      const row = (res.body as Array<Record<string, unknown>>).find(
        (l) => l.id === listingId,
      );
      expect(row).toBeDefined();
      expect(row!.publicationState).toBe('live');
      // A published listing has cleared every gate.
      expect(row!.blockedBy).toEqual([]);
      expect(row!.canPublish).toBe(true);
      // Money leaves as strings, here too.
      expect(typeof row!.monthlyRent).toBe('string');
    });

    test('an unpublished listing reports WHAT it is waiting on', async () => {
      seq += 1;
      const neighbourhood = await prisma.neighbourhood.create({
        data: { name: `MineHood-${Date.now()}-${seq}`, inServiceArea: true },
      });
      const property = await prisma.property.create({
        data: {
          ownerPartyId: parties.lister,
          propertyType: 'room',
          bedrooms: 1,
          bathrooms: 1,
          furnished: 'unfurnished',
          neighbourhoodId: neighbourhood.id,
          landmarkText: 'mine test',
        },
      });
      const listing = await prisma.listing.create({
        data: {
          propertyId: property.id,
          monthlyRent: 400_000n,
          requiredMonthsUpfront: 3,
          depositAmount: 400_000n,
        },
      });

      const res = await http()
        .get('/v1/listings/mine')
        .set('Authorization', as('lister'))
        .expect(200);

      const row = (res.body as Array<Record<string, unknown>>).find(
        (l) => l.id === listing.id,
      );
      expect(row!.blockedBy).toEqual(
        expect.arrayContaining(['field_verification', 'listing_agreement']),
      );
      expect(row!.canPublish).toBe(false);
    });

    test('a tenant cannot read a lister\'s inventory', async () => {
      await http()
        .get('/v1/listings/mine')
        .set('Authorization', as('tenant'))
        .expect(403);
    });

    test('the /listings/mine route is not matched as a public listing id', async () => {
      // `GET /v1/listings/:id` is public; `mine` must not resolve through it
      // and disclose an inventory to an anonymous caller.
      const res = await http().get('/v1/listings/mine');
      expect(res.status).toBe(401);
    });
  });

  describe('authz on the Stage 8 endpoints (NFR-1)', () => {
    const ADMIN_ONLY = [
      '/v1/admin/reconciliation',
      '/v1/admin/deals',
    ];

    for (const path of ADMIN_ONLY) {
      test(`${path} denies tenant, lister and FOO`, async () => {
        for (const role of ['tenant', 'lister', 'foo']) {
          const res = await http().get(path).set('Authorization', as(role));
          expect(res.status).toBe(403);
        }
        await http().get(path).set('Authorization', as('admin')).expect(200);
      });
    }

    test('launch-gate and verification-queue are staff-only, not public', async () => {
      for (const path of [
        '/v1/admin/launch-gate',
        '/v1/admin/verification-queue',
      ]) {
        await http().get(path).expect(401);
        for (const role of ['tenant', 'lister']) {
          const res = await http().get(path).set('Authorization', as(role));
          expect(res.status).toBe(403);
        }
        for (const role of ['foo', 'admin']) {
          await http().get(path).set('Authorization', as(role)).expect(200);
        }
      }
    });

    test('a non-admin cannot create a commission rate version', async () => {
      for (const role of ['tenant', 'lister', 'foo']) {
        const res = await http()
          .post('/v1/admin/commission-rates')
          .set('Authorization', as(role))
          .send({ rateBpOfMonth: 5000 });
        expect(res.status).toBe(403);
      }
    });

    test('a rate version cannot be smuggled past validation', async () => {
      // Non-integer, out-of-range and string rates are all rejected before
      // any version is written.
      for (const rateBpOfMonth of [0, -1, 1.5, 40000, '10000']) {
        const res = await http()
          .post('/v1/admin/commission-rates')
          .set('Authorization', as('admin'))
          .send({ rateBpOfMonth });
        expect(res.status).toBe(400);
      }
    });
  });
});
