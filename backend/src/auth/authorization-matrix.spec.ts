import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuthRole } from '@prisma/client';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';
import { DealsService } from '../deals/deals.service';

/**
 * NFR-1 / API Spec §4 — the authorisation matrix, asserted cell by cell.
 *
 * For every money and state-transition endpoint this checks BOTH halves:
 * the permitted roles are not blocked by authz, and every other role gets
 * 403. Testing only the happy path would let a wide-open endpoint pass.
 *
 * Denied calls are asserted to return 403 (or 404 for non-party access),
 * never 200 and never 500 — a 500 would mean the request reached the
 * domain layer, which for a money endpoint is already a failure.
 */
describe('Authorisation matrix (NFR-1, API Spec §4)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let auth: AuthService;
  let deals: DealsService;

  /** One logged-in account per role, reused across cases. */
  const tokens: Record<AuthRole, string> = {} as Record<AuthRole, string>;
  const partyIds: Record<AuthRole, string> = {} as Record<AuthRole, string>;

  let seq = 0;
  function phone(tag: string) {
    seq += 1;
    return `+2569${String(Date.now()).slice(-8)}${seq}${tag}`.slice(0, 19);
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    prisma = moduleRef.get(PrismaService);
    auth = moduleRef.get(AuthService);
    deals = moduleRef.get(DealsService);

    for (const role of ['tenant', 'lister', 'foo', 'admin'] as AuthRole[]) {
      const primaryPhone = phone(role.slice(0, 2));
      const created =
        role === 'tenant' || role === 'lister'
          ? await auth.register({
              displayName: `Matrix ${role}`,
              primaryPhone,
              password: 'correct-horse-battery',
              role,
            })
          : await auth.provisionStaff({
              displayName: `Matrix ${role}`,
              primaryPhone,
              password: 'correct-horse-battery',
              role,
            });

      const { accessToken } = await auth.login({
        primaryPhone,
        password: 'correct-horse-battery',
      });
      tokens[role] = accessToken;
      partyIds[role] = created.partyId;
    }
  });

  afterAll(async () => {
    await app.close();
  });

  /**
   * A deal whose tenant and landlord are the matrix accounts, so
   * party-membership passes and the ROLE check is what is being measured.
   */
  async function seedDeal() {
    seq += 1;
    const neighbourhood = await prisma.neighbourhood.create({
      data: { name: `MatrixHood-${Date.now()}-${seq}` },
    });
    const property = await prisma.property.create({
      data: {
        ownerPartyId: partyIds.lister,
        propertyType: 'apartment',
        bedrooms: 2,
        bathrooms: 1,
        furnished: 'furnished',
        neighbourhoodId: neighbourhood.id,
        landmarkText: 'matrix test',
      },
    });
    const listing = await prisma.listing.create({
      data: {
        propertyId: property.id,
        monthlyRent: 1_000_000n,
        requiredMonthsUpfront: 3,
        depositAmount: 1_000_000n,
      },
    });
    return deals.createDeal({
      listingId: listing.id,
      tenantPartyId: partyIds.tenant,
      landlordPartyId: partyIds.lister,
    });
  }

  const ALL_ROLES: AuthRole[] = ['tenant', 'lister', 'foo', 'admin'];

  /**
   * Asserts the matrix row for one endpoint: permitted roles pass authz,
   * every other role is refused with 403.
   */
  function matrixRow(
    label: string,
    path: (dealId: string) => string,
    permitted: AuthRole[],
    body: Record<string, unknown> = {},
  ) {
    describe(label, () => {
      for (const role of ALL_ROLES) {
        const allowed = permitted.includes(role);

        test(`${role} is ${allowed ? 'PERMITTED' : 'DENIED'}`, async () => {
          const deal = await seedDeal();
          const res = await request(app.getHttpServer())
            .post(path(deal.id))
            .set('Authorization', `Bearer ${tokens[role]}`)
            .send(body);

          if (allowed) {
            // Authorisation must not be what stops it. The domain may still
            // reject on state (409) — that is a different layer doing its job.
            expect(res.status).not.toBe(403);
            expect(res.status).not.toBe(401);
          } else {
            expect(res.status).toBe(403);
            expect(res.body.error?.code).toBe('FORBIDDEN_ROLE');
          }
        });
      }
    });
  }

  describe('deal transitions (API Spec §4.1)', () => {
    matrixRow(
      'POST /deals/{id}/match-tenant',
      (id) => `/v1/deals/${id}/match-tenant`,
      ['foo', 'admin'],
    );

    matrixRow(
      'POST /deals/{id}/sign-agreement',
      (id) => `/v1/deals/${id}/sign-agreement`,
      ['lister', 'admin'],
      { agreementId: '00000000-0000-0000-0000-000000000000' },
    );

    matrixRow(
      'POST /deals/{id}/fund-escrow',
      (id) => `/v1/deals/${id}/fund-escrow`,
      ['tenant', 'admin'],
      { amount: '4000000' },
    );

    matrixRow(
      'POST /deals/{id}/confirm-move-in',
      (id) => `/v1/deals/${id}/confirm-move-in`,
      ['tenant', 'admin'],
    );

    matrixRow(
      'POST /deals/{id}/earn-commission',
      (id) => `/v1/deals/${id}/earn-commission`,
      ['admin'],
    );

    matrixRow(
      'POST /deals/{id}/settle',
      (id) => `/v1/deals/${id}/settle`,
      ['admin'],
      { totalHeld: '4000000' },
    );

    matrixRow(
      'POST /deals/{id}/refund',
      (id) => `/v1/deals/${id}/refund`,
      ['admin'],
      { amount: '4000000' },
    );

    matrixRow('POST /deals/{id}/close', (id) => `/v1/deals/${id}/close`, [
      'admin',
    ]);

    matrixRow('POST /deals/{id}/cancel', (id) => `/v1/deals/${id}/cancel`, [
      'lister',
      'admin',
    ]);

    matrixRow(
      'POST /deals/{id}/dispute-hold',
      (id) => `/v1/deals/${id}/dispute-hold`,
      ['admin'],
    );
  });

  describe('THE MONEY ENDPOINTS specifically (NFR-1)', () => {
    test('a tenant CANNOT settle — the beneficiary cannot trigger a payout', async () => {
      const deal = await seedDeal();
      const res = await request(app.getHttpServer())
        .post(`/v1/deals/${deal.id}/settle`)
        .set('Authorization', `Bearer ${tokens.tenant}`)
        .send({ totalHeld: '4000000' });

      expect(res.status).toBe(403);
    });

    test('a LISTER cannot settle their own deal — same reason', async () => {
      const deal = await seedDeal();
      const res = await request(app.getHttpServer())
        .post(`/v1/deals/${deal.id}/settle`)
        .set('Authorization', `Bearer ${tokens.lister}`)
        .send({ totalHeld: '4000000' });

      expect(res.status).toBe(403);
    });

    test('a lister cannot earn commission on their own deal', async () => {
      const deal = await seedDeal();
      const res = await request(app.getHttpServer())
        .post(`/v1/deals/${deal.id}/earn-commission`)
        .set('Authorization', `Bearer ${tokens.lister}`)
        .send({});

      expect(res.status).toBe(403);
    });

    test('a FOO — who is staff — still cannot move money', async () => {
      const deal = await seedDeal();
      for (const path of ['settle', 'refund', 'earn-commission']) {
        const res = await request(app.getHttpServer())
          .post(`/v1/deals/${deal.id}/${path}`)
          .set('Authorization', `Bearer ${tokens.foo}`)
          .send({ totalHeld: '1', amount: '1' });
        expect(res.status).toBe(403);
      }
    });
  });

  describe('authentication is required at all (NFR-1)', () => {
    test('an unauthenticated request to a money endpoint is 401', async () => {
      const deal = await seedDeal();
      const res = await request(app.getHttpServer())
        .post(`/v1/deals/${deal.id}/fund-escrow`)
        .send({ amount: '4000000' });

      expect(res.status).toBe(401);
    });

    test('a garbage bearer token is 401, not a crash', async () => {
      const deal = await seedDeal();
      const res = await request(app.getHttpServer())
        .post(`/v1/deals/${deal.id}/fund-escrow`)
        .set('Authorization', 'Bearer not-a-real-token')
        .send({ amount: '4000000' });

      expect(res.status).toBe(401);
    });
  });

  describe('PARTY MEMBERSHIP — role alone is not enough (API Spec §7.4)', () => {
    test("a tenant CANNOT fund a stranger's deal, and gets 404 not 403", async () => {
      // a deal between two other parties entirely
      seq += 1;
      const otherTenant = await prisma.party.create({
        data: { displayName: 'Other Tenant', primaryPhone: phone('ot') },
      });
      const otherLandlord = await prisma.party.create({
        data: { displayName: 'Other Landlord', primaryPhone: phone('ol') },
      });
      const neighbourhood = await prisma.neighbourhood.create({
        data: { name: `StrangerHood-${Date.now()}-${seq}` },
      });
      const property = await prisma.property.create({
        data: {
          ownerPartyId: otherLandlord.id,
          propertyType: 'apartment',
          bedrooms: 1,
          bathrooms: 1,
          furnished: 'furnished',
          neighbourhoodId: neighbourhood.id,
          landmarkText: 'stranger',
        },
      });
      const listing = await prisma.listing.create({
        data: {
          propertyId: property.id,
          monthlyRent: 1_000_000n,
          requiredMonthsUpfront: 3,
          depositAmount: 1_000_000n,
        },
      });
      const strangersDeal = await deals.createDeal({
        listingId: listing.id,
        tenantPartyId: otherTenant.id,
        landlordPartyId: otherLandlord.id,
      });

      const res = await request(app.getHttpServer())
        .post(`/v1/deals/${strangersDeal.id}/fund-escrow`)
        .set('Authorization', `Bearer ${tokens.tenant}`)
        .send({ amount: '4000000' });

      // 404, not 403: a 403 would confirm the deal exists and let an
      // attacker enumerate real deal IDs
      expect(res.status).toBe(404);
    });

    test('a non-existent deal returns the SAME 404 as a stranger deal', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/deals/00000000-0000-0000-0000-000000000000/fund-escrow')
        .set('Authorization', `Bearer ${tokens.tenant}`)
        .send({ amount: '4000000' });

      expect(res.status).toBe(404);
    });
  });

  describe('the client cannot smuggle privileged fields (API Spec §7)', () => {
    test('a body carrying `status` is REJECTED, not silently ignored', async () => {
      const deal = await seedDeal();
      const res = await request(app.getHttpServer())
        .post(`/v1/deals/${deal.id}/fund-escrow`)
        .set('Authorization', `Bearer ${tokens.tenant}`)
        .send({ amount: '4000000', status: 'settled' });

      expect(res.status).toBe(400);
    });

    test('a body carrying `commissionAmount` is REJECTED', async () => {
      const deal = await seedDeal();
      const res = await request(app.getHttpServer())
        .post(`/v1/deals/${deal.id}/fund-escrow`)
        .set('Authorization', `Bearer ${tokens.tenant}`)
        .send({ amount: '4000000', commissionAmount: '0' });

      expect(res.status).toBe(400);
    });

    test('a body carrying `actorPartyId` is REJECTED — identity comes from the session', async () => {
      const deal = await seedDeal();
      const res = await request(app.getHttpServer())
        .post(`/v1/deals/${deal.id}/fund-escrow`)
        .set('Authorization', `Bearer ${tokens.tenant}`)
        .send({ amount: '4000000', actorPartyId: partyIds.admin });

      expect(res.status).toBe(400);
    });

    test('money as a JSON NUMBER is rejected — it must be a string', async () => {
      const deal = await seedDeal();
      const res = await request(app.getHttpServer())
        .post(`/v1/deals/${deal.id}/fund-escrow`)
        .set('Authorization', `Bearer ${tokens.tenant}`)
        .send({ amount: 4000000 });

      expect(res.status).toBe(400);
    });

    test('a non-numeric amount string is rejected', async () => {
      const deal = await seedDeal();
      const res = await request(app.getHttpServer())
        .post(`/v1/deals/${deal.id}/fund-escrow`)
        .set('Authorization', `Bearer ${tokens.tenant}`)
        .send({ amount: '4000000; DROP TABLE ledger_entry' });

      expect(res.status).toBe(400);
    });
  });

  describe('THE ENDPOINTS THAT MUST NOT EXIST (API Spec §5.3)', () => {
    test('there is NO generic status-patching endpoint', async () => {
      const deal = await seedDeal();
      const res = await request(app.getHttpServer())
        .patch(`/v1/deals/${deal.id}`)
        .set('Authorization', `Bearer ${tokens.admin}`)
        .send({ status: 'settled' });

      expect(res.status).toBe(404);
    });

    test('there is NO settle-from-funded shortcut endpoint (the guarantee)', async () => {
      const deal = await seedDeal();
      for (const path of ['release', 'payout', 'force-settle']) {
        const res = await request(app.getHttpServer())
          .post(`/v1/deals/${deal.id}/${path}`)
          .set('Authorization', `Bearer ${tokens.admin}`)
          .send({});
        expect(res.status).toBe(404);
      }
    });

    test('there is NO ledger-write endpoint at any role, including admin', async () => {
      for (const path of ['/v1/ledger/entries', '/v1/ledger/postings']) {
        const res = await request(app.getHttpServer())
          .post(path)
          .set('Authorization', `Bearer ${tokens.admin}`)
          .send({ amount: '1000000' });
        expect(res.status).toBe(404);
      }
    });
  });

  describe('staff provisioning cannot be self-served (API Spec §3)', () => {
    test('registering with role "admin" is rejected by validation', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/auth/register')
        .send({
          displayName: 'Sneaky',
          primaryPhone: phone('sn'),
          password: 'correct-horse-battery',
          role: 'admin',
        });

      expect(res.status).toBe(400);
    });

    test('registering with role "foo" is rejected too', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/auth/register')
        .send({
          displayName: 'Sneaky FOO',
          primaryPhone: phone('sf'),
          password: 'correct-horse-battery',
          role: 'foo',
        });

      expect(res.status).toBe(400);
    });

    test('a tenant cannot provision staff', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/auth/staff')
        .set('Authorization', `Bearer ${tokens.tenant}`)
        .send({
          displayName: 'Escalated',
          primaryPhone: phone('es'),
          password: 'correct-horse-battery',
          role: 'admin',
        });

      expect(res.status).toBe(403);
    });
  });

  describe('listings & verification (API Spec §4.2)', () => {
    async function seedListing() {
      seq += 1;
      const neighbourhood = await prisma.neighbourhood.create({
        data: { name: `AuthzHood-${Date.now()}-${seq}`, inServiceArea: true },
      });
      const property = await prisma.property.create({
        data: {
          ownerPartyId: partyIds.lister,
          propertyType: 'apartment',
          bedrooms: 2,
          bathrooms: 1,
          furnished: 'furnished',
          neighbourhoodId: neighbourhood.id,
          landmarkText: 'authz listing',
        },
      });
      return prisma.listing.create({
        data: {
          propertyId: property.id,
          monthlyRent: 1_000_000n,
          requiredMonthsUpfront: 3,
          depositAmount: 1_000_000n,
        },
      });
    }

    test('THE KEY ONE: a lister CANNOT verify their own listing', async () => {
      const listing = await seedListing();
      const res = await request(app.getHttpServer())
        .post(`/v1/listings/${listing.id}/verify`)
        .set('Authorization', `Bearer ${tokens.lister}`)
        .send({});

      // a lister self-verifying would dissolve the trust proposition
      expect(res.status).toBe(403);
    });

    test('a tenant cannot verify a listing either', async () => {
      const listing = await seedListing();
      const res = await request(app.getHttpServer())
        .post(`/v1/listings/${listing.id}/verify`)
        .set('Authorization', `Bearer ${tokens.tenant}`)
        .send({});
      expect(res.status).toBe(403);
    });

    test('a FOO CAN verify a listing', async () => {
      const listing = await seedListing();
      const res = await request(app.getHttpServer())
        .post(`/v1/listings/${listing.id}/verify`)
        .set('Authorization', `Bearer ${tokens.foo}`)
        .send({});
      expect(res.status).not.toBe(403);
    });

    test('a tenant cannot confirm availability — that is field-observed', async () => {
      const listing = await seedListing();
      const res = await request(app.getHttpServer())
        .post(`/v1/listings/${listing.id}/confirm-availability`)
        .set('Authorization', `Bearer ${tokens.tenant}`)
        .send({ status: 'available' });
      expect(res.status).toBe(403);
    });

    test('a tenant cannot create a property', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/properties')
        .set('Authorization', `Bearer ${tokens.tenant}`)
        .send({
          propertyType: 'apartment',
          bedrooms: 2,
          bathrooms: 1,
          furnished: 'furnished',
          neighbourhoodId: '00000000-0000-0000-0000-000000000000',
          landmarkText: 'x',
        });
      expect(res.status).toBe(403);
    });

    test('a lister publishing an UNVERIFIED listing gets 422, not 200 — the gate holds behind authz', async () => {
      const listing = await seedListing();
      const res = await request(app.getHttpServer())
        .post(`/v1/listings/${listing.id}/publish`)
        .set('Authorization', `Bearer ${tokens.lister}`)
        .send({});

      expect(res.status).toBe(422);
      expect(res.body.error?.code).toBe('LISTING_UNVERIFIED');
    });
  });

  describe('public search requires no account (Decision 3)', () => {
    test('an anonymous caller can search', async () => {
      const res = await request(app.getHttpServer()).get('/v1/listings');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.results)).toBe(true);
    });

    test('search results carry freeForTenants as server-asserted data', async () => {
      const res = await request(app.getHttpServer()).get('/v1/listings');
      for (const result of res.body.results) {
        expect(result.freeForTenants).toBe(true);
      }
    });
  });

  describe('money is serialised as strings (API Spec §2)', () => {
    test('a deal read returns monthlyRentSnapshot as a string, never a number', async () => {
      const deal = await seedDeal();
      const res = await request(app.getHttpServer())
        .get(`/v1/deals/${deal.id}`)
        .set('Authorization', `Bearer ${tokens.admin}`);

      expect(res.status).toBe(200);
      // null before signing; once set it must be a string
      const snapshot = res.body.deal?.monthlyRentSnapshot;
      expect(snapshot === null || typeof snapshot === 'string').toBe(true);
    });
  });
});
