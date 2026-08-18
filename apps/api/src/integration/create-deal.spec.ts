import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { IdentityService } from '../identity/identity.service';

/**
 * `POST /v1/deals` — F-001.
 *
 * The audit found `DealsService.createDeal()` reachable only from tests: the
 * API had no route to it, so no deal could be created in the real product and
 * the entire money path below it was unreachable. This suite is the one that
 * would have caught that, and its job now is to keep the endpoint honest.
 *
 * The property under test is not "a deal can be created". It is that EVERY
 * party on the deal is derived from the introduction record server-side, and
 * that no request a client can construct names a different one.
 */
describe('POST /v1/deals (F-001)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let auth: AuthService;
  let identity: IdentityService;

  let seq = 0;
  function phone(tag: string) {
    seq += 1;
    return `+2569${String(Date.now()).slice(-8)}${seq}${tag}`.slice(0, 19);
  }

  const PASSWORD = 'correct-horse-battery';
  const MONTHLY_RENT = 900_000n;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    prisma = moduleRef.get(PrismaService);
    auth = moduleRef.get(AuthService);
    identity = moduleRef.get(IdentityService);

    await request(app.getHttpServer())
      .post('/v1/admin/commission-rates')
      .set('Authorization', `Bearer ${(await actor('admin')).token}`)
      .send({ rateBpOfMonth: 10000 })
      .expect(201);
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  interface Actor {
    partyId: string;
    token: string;
  }

  /** A registered, signed-in party of the given role. */
  async function actor(
    role: 'tenant' | 'lister' | 'foo' | 'admin',
    opts?: { verifyIdentity?: boolean },
  ): Promise<Actor> {
    const primaryPhone = phone(role.slice(0, 2));
    const created =
      role === 'tenant' || role === 'lister'
        ? await auth.register({
            displayName: `Deal ${role}`,
            primaryPhone,
            password: PASSWORD,
            role,
          })
        : await auth.provisionStaff({
            displayName: `Deal ${role}`,
            primaryPhone,
            password: PASSWORD,
            role,
          });

    if (opts?.verifyIdentity) {
      await identity.recordConsent({
        partyId: created.partyId,
        purpose: 'identity_verification',
        policyVersion: 'v1',
      });
      await identity.verifyNin(created.partyId, `CM-${created.partyId}`);
      await identity.verifyPhone(created.partyId, phone('vi'));
      await identity.verifySelfieMatch(
        created.partyId,
        `selfie-${created.partyId}`,
        `idphoto-${created.partyId}`,
      );
    }

    const { accessToken } = await auth.login({
      primaryPhone,
      password: PASSWORD,
    });
    return { partyId: created.partyId, token: accessToken };
  }

  const as = (a: Actor) => `Bearer ${a.token}`;

  interface Scene {
    tenant: Actor;
    lister: Actor;
    foo: Actor;
    admin: Actor;
    listingId: string;
    viewingId: string;
    introductionId: string;
  }

  /**
   * Everything up to and including the introduction, entirely over HTTP —
   * because a fixture built with `prisma.*.create` would prove the database
   * accepts these rows, not that the product produces them.
   */
  async function scene(): Promise<Scene> {
    seq += 1;
    const tenant = await actor('tenant', { verifyIdentity: true });
    const lister = await actor('lister');
    const foo = await actor('foo');
    const admin = await actor('admin');

    const neighbourhood = await prisma.neighbourhood.create({
      data: { name: `DealHood-${Date.now()}-${seq}`, inServiceArea: true },
    });

    const property = await http()
      .post('/v1/properties')
      .set('Authorization', as(lister))
      .send({
        propertyType: 'apartment',
        bedrooms: 2,
        bathrooms: 1,
        furnished: 'furnished',
        neighbourhoodId: neighbourhood.id,
        landmarkText: 'opposite the water tank',
      })
      .expect(201);

    const listing = await http()
      .post('/v1/listings')
      .set('Authorization', as(lister))
      .send({
        propertyId: property.body.id,
        monthlyRent: MONTHLY_RENT.toString(),
        requiredMonthsUpfront: 3,
        depositAmount: MONTHLY_RENT.toString(),
      })
      .expect(201);

    const listingId = listing.body.id as string;

    await http()
      .post(`/v1/listings/${listingId}/agreement/accept`)
      .set('Authorization', as(lister))
      .send({})
      .expect(201);
    await http()
      .post(`/v1/listings/${listingId}/verify`)
      .set('Authorization', as(foo))
      .send({})
      .expect(201);
    await http()
      .post(`/v1/listings/${listingId}/confirm-availability`)
      .set('Authorization', as(foo))
      .send({ status: 'available' })
      .expect(201);
    await http()
      .post(`/v1/listings/${listingId}/publish`)
      .set('Authorization', as(lister))
      .send({})
      .expect(201);

    const viewing = await http()
      .post('/v1/viewings')
      .set('Authorization', as(tenant))
      .send({
        listingId,
        scheduledFor: new Date(Date.now() + 86_400_000).toISOString(),
      })
      .expect(201);

    const viewingId = viewing.body.id as string;

    await http()
      .post(`/v1/viewings/${viewingId}/assign`)
      .set('Authorization', as(admin))
      .send({ fooPartyId: foo.partyId })
      .expect(201);
    await http()
      .post(`/v1/viewings/${viewingId}/field-report`)
      .set('Authorization', as(foo))
      .send({
        conditionRating: 'good',
        matchesListing: true,
        isAvailable: true,
      })
      .expect(201);

    const conducted = await http()
      .post(`/v1/viewings/${viewingId}/conduct`)
      .set('Authorization', as(foo))
      .send({})
      .expect(201);

    return {
      tenant,
      lister,
      foo,
      admin,
      listingId,
      viewingId,
      introductionId: conducted.body.introduction.id as string,
    };
  }

  // ──────────────────────────────────────────────────────────────────────
  // The route exists at all — the F-001 regression
  // ──────────────────────────────────────────────────────────────────────

  describe('the route exists and the journey no longer needs the database', () => {
    test('a deal can be created THROUGH THE API by the introducing officer', async () => {
      const s = await scene();

      const res = await http()
        .post('/v1/deals')
        .set('Authorization', as(s.foo))
        .send({ introductionRecordId: s.introductionId })
        .expect(201);

      expect(res.body.id).toBeTruthy();
      expect(res.body.status).toBe('created');

      // and it is genuinely in the database, not merely echoed back
      const stored = await prisma.deal.findUniqueOrThrow({
        where: { id: res.body.id },
      });
      expect(stored.introductionRecordId).toBe(s.introductionId);
    });

    test('the deal is IMMEDIATELY usable — match-tenant succeeds with no further input', async () => {
      // The introduction requirement that `matchTenant` enforces is already
      // satisfied at creation, so the very next step in the journey works
      // without anyone having to remember to attach the record.
      const s = await scene();
      const deal = await http()
        .post('/v1/deals')
        .set('Authorization', as(s.foo))
        .send({ introductionRecordId: s.introductionId })
        .expect(201);

      await http()
        .post(`/v1/deals/${deal.body.id}/match-tenant`)
        .set('Authorization', as(s.foo))
        .send({})
        .expect(201);
    });

    test("an admin may create off any officer's introduction", async () => {
      const s = await scene();
      await http()
        .post('/v1/deals')
        .set('Authorization', as(s.admin))
        .send({ introductionRecordId: s.introductionId })
        .expect(201);
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // Every party is DERIVED, never supplied
  // ──────────────────────────────────────────────────────────────────────

  describe('the parties come from the introduction record, not the request', () => {
    test('tenant, landlord and listing all match the record', async () => {
      const s = await scene();
      const record = await prisma.introductionRecord.findUniqueOrThrow({
        where: { id: s.introductionId },
      });

      const res = await http()
        .post('/v1/deals')
        .set('Authorization', as(s.foo))
        .send({ introductionRecordId: s.introductionId })
        .expect(201);

      expect(res.body.tenantPartyId).toBe(record.tenantPartyId);
      expect(res.body.landlordPartyId).toBe(record.landlordPartyId);
      expect(res.body.listingId).toBe(record.listingId);

      // and those are the real people, not whoever asked
      expect(res.body.tenantPartyId).toBe(s.tenant.partyId);
      expect(res.body.landlordPartyId).toBe(s.lister.partyId);
      expect(res.body.tenantPartyId).not.toBe(s.foo.partyId);
    });

    test('a TAMPERED body naming a different tenant is rejected outright', async () => {
      const s = await scene();
      const attacker = await actor('tenant');

      // Not "ignored" — rejected. `forbidNonWhitelisted` makes an attempt to
      // name a party a 400, so an attacker gets no signal that the field was
      // considered and discarded.
      for (const extra of [
        { tenantPartyId: attacker.partyId },
        { landlordPartyId: attacker.partyId },
        { listingId: s.listingId },
        { status: 'settled' },
        { commissionAmount: '1' },
      ]) {
        await http()
          .post('/v1/deals')
          .set('Authorization', as(s.foo))
          .send({ introductionRecordId: s.introductionId, ...extra })
          .expect(400);
      }

      // nothing was created by any of those attempts
      expect(
        await prisma.deal.count({
          where: { introductionRecordId: s.introductionId },
        }),
      ).toBe(0);
    });

    test('a missing introductionRecordId is a 400, not a deal with null parties', async () => {
      const s = await scene();
      await http()
        .post('/v1/deals')
        .set('Authorization', as(s.foo))
        .send({})
        .expect(400);
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // Authorisation
  // ──────────────────────────────────────────────────────────────────────

  describe('authorisation (API Spec §4)', () => {
    test('an unauthenticated request is 401', async () => {
      const s = await scene();
      await http()
        .post('/v1/deals')
        .send({ introductionRecordId: s.introductionId })
        .expect(401);
    });

    test('a TENANT cannot open their own deal', async () => {
      // Creating a deal asserts that our officer made an introduction. If a
      // party to the transaction could assert it, the record would stop
      // being evidence of our involvement.
      const s = await scene();
      await http()
        .post('/v1/deals')
        .set('Authorization', as(s.tenant))
        .send({ introductionRecordId: s.introductionId })
        .expect(403);
    });

    test('a LANDLORD cannot open a deal either', async () => {
      const s = await scene();
      await http()
        .post('/v1/deals')
        .set('Authorization', as(s.lister))
        .send({ introductionRecordId: s.introductionId })
        .expect(403);
    });

    test("a DIFFERENT officer cannot open a deal off another officer's introduction", async () => {
      const s = await scene();
      const otherFoo = await actor('foo');

      await http()
        .post('/v1/deals')
        .set('Authorization', as(otherFoo))
        .send({ introductionRecordId: s.introductionId })
        .expect(403);

      expect(
        await prisma.deal.count({
          where: { introductionRecordId: s.introductionId },
        }),
      ).toBe(0);
    });

    test('an unknown introduction record is 404', async () => {
      const s = await scene();
      await http()
        .post('/v1/deals')
        .set('Authorization', as(s.foo))
        .send({ introductionRecordId: '00000000-0000-0000-0000-000000000000' })
        .expect(404);
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // One live deal per introduction
  // ──────────────────────────────────────────────────────────────────────

  describe('duplicate deals', () => {
    test('a second deal off the same introduction is 409', async () => {
      const s = await scene();

      await http()
        .post('/v1/deals')
        .set('Authorization', as(s.foo))
        .send({ introductionRecordId: s.introductionId })
        .expect(201);

      const second = await http()
        .post('/v1/deals')
        .set('Authorization', as(s.foo))
        .send({ introductionRecordId: s.introductionId })
        .expect(409);

      expect(second.body.error.code).toBe('DEAL_ALREADY_EXISTS');
      expect(
        await prisma.deal.count({
          where: { introductionRecordId: s.introductionId },
        }),
      ).toBe(1);
    });

    test('a CANCELLED deal does not permanently block the same introduction', async () => {
      // A deal cancelled before funding must not bar the same tenant and
      // landlord from trying again off the meeting that already happened.
      const s = await scene();

      const first = await http()
        .post('/v1/deals')
        .set('Authorization', as(s.foo))
        .send({ introductionRecordId: s.introductionId })
        .expect(201);

      await http()
        .post(`/v1/deals/${first.body.id}/cancel`)
        .set('Authorization', as(s.admin))
        .send({ reason: 'tenant changed their mind' })
        .expect(201);

      await http()
        .post('/v1/deals')
        .set('Authorization', as(s.foo))
        .send({ introductionRecordId: s.introductionId })
        .expect(201);
    });

    test('a FUNDED deal still blocks — money cannot land in two escrows for one room', async () => {
      const s = await scene();

      const deal = await http()
        .post('/v1/deals')
        .set('Authorization', as(s.foo))
        .send({ introductionRecordId: s.introductionId })
        .expect(201);

      const agreement = await prisma.listingAgreement.findFirstOrThrow({
        where: { listingId: s.listingId, accepted: true },
      });

      await http()
        .post(`/v1/deals/${deal.body.id}/match-tenant`)
        .set('Authorization', as(s.foo))
        .send({})
        .expect(201);
      await http()
        .post(`/v1/deals/${deal.body.id}/sign-agreement`)
        .set('Authorization', as(s.lister))
        .send({ agreementId: agreement.id })
        .expect(201);
      await http()
        .post(`/v1/deals/${deal.body.id}/fund-escrow`)
        .set('Authorization', as(s.tenant))
        .send({})
        .expect(201);

      await http()
        .post('/v1/deals')
        .set('Authorization', as(s.foo))
        .send({ introductionRecordId: s.introductionId })
        .expect(409);
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // Ineligible introductions
  // ──────────────────────────────────────────────────────────────────────

  describe('the introduction must be real', () => {
    test('there is still NO endpoint that creates an introduction record', async () => {
      // The record is a consequence of conducting a viewing, written in the
      // same transaction. If it were separately creatable, a deal could be
      // opened on a meeting that never happened — and this endpoint would be
      // the way in.
      const s = await scene();
      for (const path of ['/v1/viewings/introductions', '/v1/introductions']) {
        const res = await http()
          .post(path)
          .set('Authorization', as(s.admin))
          .send({ tenantPartyId: s.tenant.partyId, listingId: s.listingId });
        expect(res.status).toBe(404);
      }
    });

    test('a NO-SHOW viewing produces no introduction, so no deal can follow', async () => {
      seq += 1;
      const tenant = await actor('tenant', { verifyIdentity: true });
      const lister = await actor('lister');
      const foo = await actor('foo');
      const admin = await actor('admin');

      const neighbourhood = await prisma.neighbourhood.create({
        data: { name: `NoShowHood-${Date.now()}-${seq}`, inServiceArea: true },
      });
      const property = await http()
        .post('/v1/properties')
        .set('Authorization', as(lister))
        .send({
          propertyType: 'room',
          bedrooms: 1,
          bathrooms: 1,
          furnished: 'unfurnished',
          neighbourhoodId: neighbourhood.id,
          landmarkText: 'behind the church',
        })
        .expect(201);
      const listing = await http()
        .post('/v1/listings')
        .set('Authorization', as(lister))
        .send({
          propertyId: property.body.id,
          monthlyRent: '400000',
          requiredMonthsUpfront: 3,
          depositAmount: '400000',
        })
        .expect(201);

      await http()
        .post(`/v1/listings/${listing.body.id}/agreement/accept`)
        .set('Authorization', as(lister))
        .send({})
        .expect(201);
      await http()
        .post(`/v1/listings/${listing.body.id}/verify`)
        .set('Authorization', as(foo))
        .send({})
        .expect(201);
      await http()
        .post(`/v1/listings/${listing.body.id}/confirm-availability`)
        .set('Authorization', as(foo))
        .send({ status: 'available' })
        .expect(201);
      await http()
        .post(`/v1/listings/${listing.body.id}/publish`)
        .set('Authorization', as(lister))
        .send({})
        .expect(201);

      const viewing = await http()
        .post('/v1/viewings')
        .set('Authorization', as(tenant))
        .send({
          listingId: listing.body.id,
          scheduledFor: new Date(Date.now() + 86_400_000).toISOString(),
        })
        .expect(201);
      await http()
        .post(`/v1/viewings/${viewing.body.id}/assign`)
        .set('Authorization', as(admin))
        .send({ fooPartyId: foo.partyId })
        .expect(201);
      await http()
        .post(`/v1/viewings/${viewing.body.id}/no-show`)
        .set('Authorization', as(foo))
        .send({})
        .expect(201);

      expect(
        await prisma.introductionRecord.findUnique({
          where: { viewingId: viewing.body.id },
        }),
      ).toBeNull();
    });
  });
});
