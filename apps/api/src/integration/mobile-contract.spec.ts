import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { ConfigService, CONFIG_KEYS } from '../config/config.service';
import { IdentityService } from '../identity/identity.service';

/**
 * The contract the tenant/landlord mobile app depends on.
 *
 * ── Why this exists ──
 * `mobile/` is a thin client: it holds no business rules, so almost the only
 * way it can be wrong is by calling a path that does not exist, sending a
 * shape the server rejects, or reading a field the server does not send.
 * None of those are caught by the app's own typecheck — TypeScript will
 * happily believe an interface that describes an endpoint incorrectly.
 *
 * So every request `mobile/` makes is pinned here, with the ROLE that makes
 * it, and the fields the screens actually read. If someone renames a field
 * or tightens a DTO, this suite fails instead of the app failing in
 * someone's hand in Kampala.
 *
 * The paths below are kept in step with `mobile/lib/api.ts` and the screens
 * under `mobile/app/`.
 */
describe('Mobile client contract', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let auth: AuthService;
  let config: ConfigService;
  let identity: IdentityService;

  const tokens: Record<string, string> = {};
  const parties: Record<string, string> = {};
  const PASSWORD = 'correct-horse-battery';

  let seq = 0;
  function phone(tag: string) {
    seq += 1;
    return `+2569${String(Date.now()).slice(-8)}${seq}${tag}`.slice(0, 19);
  }

  const as = (role: string) => `Bearer ${tokens[role]}`;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    prisma = moduleRef.get(PrismaService);
    auth = moduleRef.get(AuthService);
    config = moduleRef.get(ConfigService);
    identity = moduleRef.get(IdentityService);

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
              displayName: `Mobile ${key}`,
              primaryPhone,
              password: PASSWORD,
              role,
            })
          : await auth.provisionStaff({
              displayName: `Mobile ${key}`,
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
    await config.setValue({
      key: CONFIG_KEYS.freshnessWindowDays,
      value: 7,
      createdByPartyId: parties.admin,
      effectiveFrom: new Date(Date.now() - 60_000),
    });

    // The tenant must be identity-verified before FR-5.1 lets them request
    // a viewing, so the contract for that path can be exercised at all.
    await identity.recordConsent({
      partyId: parties.tenant,
      purpose: 'identity_verification',
      policyVersion: 'v1',
    });
    await identity.verifyNin(parties.tenant, `CM-${parties.tenant}`);
    await identity.verifyPhone(parties.tenant, phone('mv'));
    await identity.verifySelfieMatch(
      parties.tenant,
      `selfie-${parties.tenant}`,
      `id-${parties.tenant}`,
    );
  });

  afterAll(async () => {
    await app.close();
  });

  /** A live listing the tenant screens can read. */
  async function seedLiveListing() {
    seq += 1;
    await http()
      .post('/v1/admin/commission-rates')
      .set('Authorization', as('admin'))
      .send({ rateBpOfMonth: 10000 })
      .expect(201);

    const neighbourhood = await prisma.neighbourhood.create({
      data: { name: `MobileHood-${Date.now()}-${seq}`, inServiceArea: true },
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
        monthlyRent: '1000000',
        requiredMonthsUpfront: 3,
        depositAmount: '1000000',
      })
      .expect(201);

    const listingId = listing.body.id as string;

    await http()
      .post(`/v1/listings/${listingId}/agreement/accept`)
      .set('Authorization', as('lister'))
      .send({})
      .expect(201);
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

    return { listingId, neighbourhood };
  }

  /** Every money field the app reads must be a string, never a number. */
  function expectMoneyString(value: unknown, field: string) {
    expect(typeof value).toBe('string');
    expect(String(value)).toMatch(/^-?[0-9]+$/);
    expect(field).toBeTruthy();
  }

  // ── lib/session.tsx ──────────────────────────────────────────────────

  describe('session (lib/session.tsx)', () => {
    test('POST /v1/auth/login returns both tokens', async () => {
      const primaryPhone = phone('lg');
      await auth.register({
        displayName: 'Login Probe',
        primaryPhone,
        password: PASSWORD,
        role: 'tenant',
      });

      const res = await http()
        .post('/v1/auth/login')
        .send({ primaryPhone, password: PASSWORD })
        .expect(200);

      expect(typeof res.body.accessToken).toBe('string');
      expect(typeof res.body.refreshToken).toBe('string');
    });

    test('POST /v1/auth/register accepts the app\'s exact body', async () => {
      // The app sends exactly these four fields; `forbidNonWhitelisted`
      // makes any extra one a 400, so the shape is part of the contract.
      await http()
        .post('/v1/auth/register')
        .send({
          displayName: 'Shape Probe',
          primaryPhone: phone('sp'),
          password: PASSWORD,
          role: 'tenant',
        })
        .expect(201);
    });

    test('the app cannot even express a staff registration', async () => {
      // `register()` in the app is typed to 'tenant' | 'lister'; the server
      // refuses regardless, which is the half that actually matters.
      for (const role of ['foo', 'admin']) {
        await http()
          .post('/v1/auth/register')
          .send({
            displayName: 'Escalation Probe',
            primaryPhone: phone('ep'),
            password: PASSWORD,
            role,
          })
          .expect(400);
      }
    });

    test('GET /v1/auth/me returns partyId and role for every app role', async () => {
      for (const role of ['tenant', 'lister'] as const) {
        const res = await http()
          .get('/v1/auth/me')
          .set('Authorization', as(role))
          .expect(200);

        expect(res.body.partyId).toBe(parties[role]);
        expect(res.body.role).toBe(role);
        expect(typeof res.body.userAccountId).toBe('string');
      }
    });

    test('POST /v1/auth/refresh ROTATES — the old token is spent', async () => {
      // The app collapses concurrent 401s into one refresh precisely
      // because of this. If rotation ever stopped, that care would be
      // pointless; if it stayed and the app forgot, sessions would be
      // revoked under load.
      const primaryPhone = phone('rt');
      await auth.register({
        displayName: 'Rotate Probe',
        primaryPhone,
        password: PASSWORD,
        role: 'tenant',
      });
      const first = await auth.login({ primaryPhone, password: PASSWORD });

      const rotated = await http()
        .post('/v1/auth/refresh')
        .send({ refreshToken: first.refreshToken })
        .expect(200);
      expect(rotated.body.refreshToken).not.toBe(first.refreshToken);

      await http()
        .post('/v1/auth/refresh')
        .send({ refreshToken: first.refreshToken })
        .expect(401);
    });

    test('POST /v1/auth/logout is 204 and revokes', async () => {
      const primaryPhone = phone('lo');
      await auth.register({
        displayName: 'Logout Probe',
        primaryPhone,
        password: PASSWORD,
        role: 'tenant',
      });
      const { refreshToken } = await auth.login({
        primaryPhone,
        password: PASSWORD,
      });

      await http().post('/v1/auth/logout').send({ refreshToken }).expect(204);
      await http()
        .post('/v1/auth/refresh')
        .send({ refreshToken })
        .expect(401);
    });
  });

  // ── components/tenant-search.tsx ─────────────────────────────────────

  describe('tenant search (components/tenant-search.tsx)', () => {
    test('GET /v1/listings is PUBLIC and carries every trust signal the app renders', async () => {
      const { listingId } = await seedLiveListing();

      // No Authorization header: browsing requires no account (Decision 3),
      // and the app's search screen uses the public client for exactly this.
      const res = await http().get('/v1/listings').expect(200);

      expect(Array.isArray(res.body.results)).toBe(true);
      expect(typeof res.body.totalCount).toBe('number');
      expect(
        res.body.emptyStateMessage === null ||
          typeof res.body.emptyStateMessage === 'string',
      ).toBe(true);

      const row = (res.body.results as Array<Record<string, unknown>>).find(
        (r) => r.listingId === listingId,
      );
      expect(row).toBeDefined();

      // Exactly the fields `SearchResult` declares and the row renders.
      expectMoneyString(row!.monthlyRent, 'monthlyRent');
      expect(typeof row!.bedrooms).toBe('number');
      expect(typeof row!.bathrooms).toBe('number');
      // Drives the search screen's type chips; an unknown value would make
      // a chip silently match nothing.
      expect(['apartment', 'house', 'room', 'other']).toContain(
        row!.propertyType,
      );
      expect(typeof row!.neighbourhoodName).toBe('string');
      expect(typeof row!.landmarkText).toBe('string');
      expect(typeof row!.isVerified).toBe('boolean');
      expect(typeof row!.isStale).toBe('boolean');
      expect(
        row!.daysSinceConfirmed === null ||
          typeof row!.daysSinceConfirmed === 'number',
      ).toBe(true);
      expect(row!.freeForTenants).toBe(true);
    });

    test('the maxRent filter the app sends is accepted', async () => {
      await seedLiveListing();
      const res = await http().get('/v1/listings?maxRent=2000000').expect(200);
      expect(Array.isArray(res.body.results)).toBe(true);
    });

    test('a zero-result search returns the SERVER\'s honest empty state', async () => {
      // The app renders `emptyStateMessage` rather than its own copy
      // (FR-4.4), so it must be present and must not read as a failure.
      const res = await http().get('/v1/listings?maxRent=1').expect(200);

      expect(res.body.results).toEqual([]);
      expect(typeof res.body.emptyStateMessage).toBe('string');
      expect(res.body.emptyStateMessage).not.toMatch(/error|sorry|failed/i);
    });
  });

  // ── app/(app)/listing/[id].tsx ───────────────────────────────────────

  describe('listing detail (app/(app)/listing/[id].tsx)', () => {
    test('GET /v1/listings/{id} is public and carries the terms the screen shows', async () => {
      const { listingId } = await seedLiveListing();
      const res = await http().get(`/v1/listings/${listingId}`).expect(200);

      expectMoneyString(res.body.monthlyRent, 'monthlyRent');
      expectMoneyString(res.body.depositAmount, 'depositAmount');
      expect(typeof res.body.requiredMonthsUpfront).toBe('number');
      expect(typeof res.body.furnished).toBe('string');
      expect(typeof res.body.propertyType).toBe('string');
      expect(res.body.freeForTenants).toBe(true);
      // `fieldConfirmed` is null or the structured projection — never a
      // fabricated placeholder (FR-4.3).
      expect(
        res.body.fieldConfirmed === null ||
          typeof res.body.fieldConfirmed.conditionRating === 'string',
      ).toBe(true);
    });

    test('a listing outside the public feed is 404, not 403', async () => {
      // The app treats 404 as "no longer available". A 403 would confirm
      // the listing exists, which is how an unpublished address becomes
      // discoverable by probing.
      const res = await http().get(
        '/v1/listings/00000000-0000-0000-0000-000000000000',
      );
      expect(res.status).toBe(404);
    });

    test('POST /v1/viewings accepts the app\'s body and rejects extras', async () => {
      const { listingId } = await seedLiveListing();
      const scheduledFor = new Date(Date.now() + 86_400_000).toISOString();

      const res = await http()
        .post('/v1/viewings')
        .set('Authorization', as('tenant'))
        .send({ listingId, scheduledFor })
        .expect(201);

      expect(res.body.tenantPartyId).toBe(parties.tenant);
      expect(res.body.status).toBe('requested');

      // The app never sends a tenant id — and could not smuggle one.
      await http()
        .post('/v1/viewings')
        .set('Authorization', as('tenant'))
        .send({ listingId, scheduledFor, tenantPartyId: parties.lister })
        .expect(400);
    });

    test('an unverified tenant gets TENANT_NOT_VERIFIED, which the screen explains', async () => {
      const { listingId } = await seedLiveListing();
      const primaryPhone = phone('uv');
      await auth.register({
        displayName: 'Unverified Probe',
        primaryPhone,
        password: PASSWORD,
        role: 'tenant',
      });
      const { accessToken } = await auth.login({
        primaryPhone,
        password: PASSWORD,
      });

      const res = await http()
        .post('/v1/viewings')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          listingId,
          scheduledFor: new Date(Date.now() + 86_400_000).toISOString(),
        });

      expect(res.status).toBe(422);
      // The screen keys off this exact code to explain what to do next.
      expect(res.body.error?.code).toBe('TENANT_NOT_VERIFIED');
    });
  });

  // ── app/(app)/deals.tsx and deal/[id].tsx ────────────────────────────

  describe('deals (app/(app)/deals.tsx, deal/[id].tsx)', () => {
    test('GET /v1/viewings/mine returns the tenant\'s own viewings', async () => {
      const { listingId } = await seedLiveListing();
      await http()
        .post('/v1/viewings')
        .set('Authorization', as('tenant'))
        .send({
          listingId,
          scheduledFor: new Date(Date.now() + 86_400_000).toISOString(),
        })
        .expect(201);

      const res = await http()
        .get('/v1/viewings/mine')
        .set('Authorization', as('tenant'))
        .expect(200);

      expect(res.body.length).toBeGreaterThan(0);
      for (const viewing of res.body as Array<Record<string, unknown>>) {
        expect(viewing.tenantPartyId).toBe(parties.tenant);
        expect(typeof viewing.scheduledFor).toBe('string');
        // The deals screen maps every one of these to user-facing copy.
        expect([
          'requested',
          'scheduled',
          'conducted',
          'no_show',
          'cancelled',
        ]).toContain(viewing.status);
      }
    });

    test('GET /v1/deals returns money as strings and a known status', async () => {
      const { listingId } = await seedLiveListing();
      await prisma.deal.create({
        data: {
          listingId,
          tenantPartyId: parties.tenant,
          landlordPartyId: parties.lister,
        },
      });

      const res = await http()
        .get('/v1/deals')
        .set('Authorization', as('tenant'))
        .expect(200);

      expect(res.body.length).toBeGreaterThan(0);
      for (const deal of res.body as Array<Record<string, unknown>>) {
        // `DealStatePill` has copy for every one of these; an unknown value
        // would render as a raw enum to a tenant.
        expect([
          'created',
          'tenant_matched',
          'agreement_signed',
          'escrow_funded',
          'move_in_confirmed',
          'commission_earned',
          'settled',
          'closed',
          'cancelled',
          'refunded',
          'dispute_hold',
        ]).toContain(deal.status);

        if (deal.monthlyRentSnapshot !== null) {
          expectMoneyString(deal.monthlyRentSnapshot, 'monthlyRentSnapshot');
        }
        if (deal.commissionAmount !== null) {
          expectMoneyString(deal.commissionAmount, 'commissionAmount');
        }
      }
    });

    test('GET /v1/deals/{id} returns { deal, transitions } as the screen destructures', async () => {
      const { listingId } = await seedLiveListing();
      const deal = await prisma.deal.create({
        data: {
          listingId,
          tenantPartyId: parties.tenant,
          landlordPartyId: parties.lister,
        },
      });

      const res = await http()
        .get(`/v1/deals/${deal.id}`)
        .set('Authorization', as('tenant'))
        .expect(200);

      expect(res.body.deal.id).toBe(deal.id);
      expect(Array.isArray(res.body.transitions)).toBe(true);
    });

    test('a stranger\'s deal is 404, so the screen shows "not found" not "forbidden"', async () => {
      const other = await prisma.party.create({
        data: { displayName: 'Other', primaryPhone: phone('ot') },
      });
      const { listingId } = await seedLiveListing();
      const strangers = await prisma.deal.create({
        data: {
          listingId,
          tenantPartyId: other.id,
          landlordPartyId: parties.lister,
        },
      });

      await http()
        .get(`/v1/deals/${strangers.id}`)
        .set('Authorization', as('tenant'))
        .expect(404);
    });

    test('fund-escrow takes the amount as a STRING and refuses a number', async () => {
      // The app sends `amount` as digits-only text for exactly this reason.
      const { listingId } = await seedLiveListing();
      const deal = await prisma.deal.create({
        data: {
          listingId,
          tenantPartyId: parties.tenant,
          landlordPartyId: parties.lister,
        },
      });

      const asNumber = await http()
        .post(`/v1/deals/${deal.id}/fund-escrow`)
        .set('Authorization', as('tenant'))
        .send({ amount: 4000000 });
      expect(asNumber.status).toBe(400);

      // A well-formed string gets past validation; the state machine then
      // has its own say, which is a different layer doing its job.
      const asString = await http()
        .post(`/v1/deals/${deal.id}/fund-escrow`)
        .set('Authorization', as('tenant'))
        .send({ amount: '4000000' });
      expect(asString.status).not.toBe(400);
    });

    test('THE GUARANTEE: no confirm-move-in path exists for a lister', async () => {
      // The deal screen only offers "I have moved in" to the tenant. This
      // is the half that enforces it.
      const { listingId } = await seedLiveListing();
      const deal = await prisma.deal.create({
        data: {
          listingId,
          tenantPartyId: parties.tenant,
          landlordPartyId: parties.lister,
        },
      });

      await http()
        .post(`/v1/deals/${deal.id}/confirm-move-in`)
        .set('Authorization', as('lister'))
        .send({})
        .expect(403);
    });

    test('there is NO settle or earn-commission the app could call', async () => {
      const { listingId } = await seedLiveListing();
      const deal = await prisma.deal.create({
        data: {
          listingId,
          tenantPartyId: parties.tenant,
          landlordPartyId: parties.lister,
        },
      });

      for (const role of ['tenant', 'lister'] as const) {
        for (const path of ['settle', 'earn-commission', 'refund']) {
          const res = await http()
            .post(`/v1/deals/${deal.id}/${path}`)
            .set('Authorization', as(role))
            .send({ totalHeld: '1', amount: '1' });
          expect(res.status).toBe(403);
        }
      }
    });
  });

  // ── components/lister-listings.tsx ───────────────────────────────────

  describe('landlord (components/lister-listings.tsx)', () => {
    test('GET /v1/listings/mine returns blockedBy and canPublish', async () => {
      const { listingId } = await seedLiveListing();

      const res = await http()
        .get('/v1/listings/mine')
        .set('Authorization', as('lister'))
        .expect(200);

      const row = (res.body as Array<Record<string, unknown>>).find(
        (l) => l.id === listingId,
      );
      expect(row).toBeDefined();
      expectMoneyString(row!.monthlyRent, 'monthlyRent');
      expect(Array.isArray(row!.blockedBy)).toBe(true);
      expect(typeof row!.canPublish).toBe('boolean');
      expect(typeof row!.hasAcceptedAgreement).toBe('boolean');
      expect(typeof row!.neighbourhoodName).toBe('string');
    });

    test('every blockedBy value the server emits has copy in the app', async () => {
      // `BLOCKER_COPY` in lister-listings.tsx maps exactly these. A new
      // blocker without copy would render a raw key to a landlord.
      const KNOWN = [
        'field_verification',
        'outside_service_area',
        'mandate',
        'listing_agreement',
      ];

      const res = await http()
        .get('/v1/listings/mine')
        .set('Authorization', as('lister'))
        .expect(200);

      for (const row of res.body as Array<{ blockedBy: string[] }>) {
        for (const blocker of row.blockedBy) {
          expect(KNOWN).toContain(blocker);
        }
      }
    });

    test('GET /v1/listings/{id}/agreement returns the terms the sheet renders', async () => {
      const { listingId } = await seedLiveListing();

      const res = await http()
        .get(`/v1/listings/${listingId}/agreement`)
        .set('Authorization', as('lister'))
        .expect(200);

      expectMoneyString(res.body.monthlyRent, 'monthlyRent');
      expectMoneyString(res.body.commissionIfLet, 'commissionIfLet');
      expect(typeof res.body.commissionRateBp).toBe('number');
      expect(res.body.payer).toBe('landlord');
      expect(res.body.tenantPays).toBe(false);
      expect(typeof res.body.alreadyAccepted).toBe('boolean');
      // The sheet renders both blocks of prose in full.
      expect(typeof res.body.clause.commissionTerms).toBe('string');
      expect(typeof res.body.clause.circumventionClause).toBe('string');
      expect(typeof res.body.clause.version).toBe('string');
    });

    test('a tenant cannot read or accept a landlord agreement', async () => {
      const { listingId } = await seedLiveListing();

      await http()
        .get(`/v1/listings/${listingId}/agreement`)
        .set('Authorization', as('tenant'))
        .expect(403);

      await http()
        .post(`/v1/listings/${listingId}/agreement/accept`)
        .set('Authorization', as('tenant'))
        .send({})
        .expect(403);
    });

    test('a tenant cannot read a landlord\'s inventory', async () => {
      await http()
        .get('/v1/listings/mine')
        .set('Authorization', as('tenant'))
        .expect(403);
    });
  });

  // ── the app cannot reach staff surfaces ──────────────────────────────

  describe('the app cannot reach staff surfaces (NFR-1)', () => {
    test('neither app role can reach field-ops or admin endpoints', async () => {
      for (const role of ['tenant', 'lister'] as const) {
        for (const path of [
          '/v1/viewings/assigned/me',
          '/v1/viewings/introductions',
          '/v1/admin/launch-gate',
          '/v1/admin/verification-queue',
          '/v1/admin/reconciliation',
        ]) {
          const res = await http().get(path).set('Authorization', as(role));
          expect(res.status).toBe(403);
        }
      }
    });

    test('an expired or garbage token is 401, which the app refreshes on', async () => {
      const res = await http()
        .get('/v1/deals')
        .set('Authorization', 'Bearer not-a-real-token');
      expect(res.status).toBe(401);
    });
  });
});
