import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { IdentityService } from '../identity/identity.service';

/**
 * Dispatch — F-002, and the FOO journey it unblocks.
 *
 * The audit found `POST /v1/viewings/:id/assign` with no caller and no route
 * that could list the viewings waiting to be assigned. `requested` was
 * therefore a terminal state in the real product: a tenant could ask to see
 * a property and nothing downstream could ever happen.
 *
 * This suite asserts the whole operator chain over HTTP —
 *   request → queue → assign → officer's board → report → conduct →
 *   introduction → deal
 * — because each of those links existed and passed its own tests while the
 * chain as a whole was severed in two places.
 */
describe('Dispatch (F-002)', () => {
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

  interface Actor {
    partyId: string;
    token: string;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    prisma = moduleRef.get(PrismaService);
    auth = moduleRef.get(AuthService);
    identity = moduleRef.get(IdentityService);
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());
  const as = (a: Actor) => `Bearer ${a.token}`;

  async function actor(
    role: 'tenant' | 'lister' | 'foo' | 'admin',
    opts?: { verifyIdentity?: boolean; displayName?: string },
  ): Promise<Actor> {
    const primaryPhone = phone(role.slice(0, 2));
    const created =
      role === 'tenant' || role === 'lister'
        ? await auth.register({
            displayName: opts?.displayName ?? `Dispatch ${role}`,
            primaryPhone,
            password: PASSWORD,
            role,
          })
        : await auth.provisionStaff({
            displayName: opts?.displayName ?? `Dispatch ${role}`,
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

  interface Scene {
    tenant: Actor;
    lister: Actor;
    foo: Actor;
    admin: Actor;
    listingId: string;
    viewingId: string;
  }

  /** A published listing with one REQUESTED viewing against it, over HTTP. */
  async function scene(opts?: { inServiceArea?: boolean }): Promise<Scene> {
    seq += 1;
    const tenant = await actor('tenant', { verifyIdentity: true });
    const lister = await actor('lister');
    const foo = await actor('foo');
    const admin = await actor('admin');

    const neighbourhood = await prisma.neighbourhood.create({
      data: {
        name: `DispatchHood-${Date.now()}-${seq}`,
        inServiceArea: opts?.inServiceArea ?? true,
      },
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
        landmarkText: 'next to the maize mill',
      })
      .expect(201);

    const listing = await http()
      .post('/v1/listings')
      .set('Authorization', as(lister))
      .send({
        propertyId: property.body.id,
        monthlyRent: '800000',
        requiredMonthsUpfront: 3,
        depositAmount: '800000',
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

    return {
      tenant,
      lister,
      foo,
      admin,
      listingId,
      viewingId: viewing.body.id as string,
    };
  }

  interface QueueBody {
    total: number;
    rows: Array<{
      viewing: { id: string; status: string; tenantPartyId: string };
      listingId: string;
      neighbourhood: string;
      inServiceArea: boolean;
      blockedBy: string[];
    }>;
    officers: Array<{
      partyId: string;
      displayName: string;
      assignedCount: number;
    }>;
  }

  const queueAs = async (a: Actor) =>
    (
      await http()
        .get('/v1/viewings/dispatch-queue')
        .set('Authorization', as(a))
        .expect(200)
    ).body as QueueBody;

  // ──────────────────────────────────────────────────────────────────────
  // The queue exists — the F-002 regression
  // ──────────────────────────────────────────────────────────────────────

  describe('a requested viewing is visible to a dispatcher', () => {
    test('it appears in the queue, with the officers who could take it', async () => {
      const s = await scene();
      const queue = await queueAs(s.admin);

      const row = queue.rows.find((r) => r.viewing.id === s.viewingId);
      expect(row).toBeDefined();
      expect(row!.viewing.status).toBe('requested');
      expect(row!.listingId).toBe(s.listingId);
      expect(row!.blockedBy).toEqual([]);

      // A queue without a roster is not actionable — the dispatcher would
      // have a viewing and no legal value for fooPartyId.
      expect(queue.officers.some((o) => o.partyId === s.foo.partyId)).toBe(
        true,
      );
    });

    test("assigning REMOVES it from the queue and puts it on that officer's board", async () => {
      const s = await scene();

      await http()
        .post(`/v1/viewings/${s.viewingId}/assign`)
        .set('Authorization', as(s.admin))
        .send({ fooPartyId: s.foo.partyId })
        .expect(201);

      const queue = await queueAs(s.admin);
      expect(queue.rows.some((r) => r.viewing.id === s.viewingId)).toBe(false);

      const board = await http()
        .get('/v1/viewings/assigned/me')
        .set('Authorization', as(s.foo))
        .expect(200);
      expect(
        (board.body as Array<{ id: string }>).some((v) => v.id === s.viewingId),
      ).toBe(true);
    });

    test('the tenant sees the status change without being told by anyone', async () => {
      const s = await scene();

      const before = await http()
        .get('/v1/viewings/mine')
        .set('Authorization', as(s.tenant))
        .expect(200);
      expect(
        (before.body as Array<{ id: string; status: string }>).find(
          (v) => v.id === s.viewingId,
        )!.status,
      ).toBe('requested');

      await http()
        .post(`/v1/viewings/${s.viewingId}/assign`)
        .set('Authorization', as(s.admin))
        .send({ fooPartyId: s.foo.partyId })
        .expect(201);

      const after = await http()
        .get('/v1/viewings/mine')
        .set('Authorization', as(s.tenant))
        .expect(200);
      expect(
        (after.body as Array<{ id: string; status: string }>).find(
          (v) => v.id === s.viewingId,
        )!.status,
      ).toBe('scheduled');
    });

    test("the officer's workload is reported, so dispatch is not blind to load", async () => {
      const s = await scene();
      const before = (await queueAs(s.admin)).officers.find(
        (o) => o.partyId === s.foo.partyId,
      )!.assignedCount;

      await http()
        .post(`/v1/viewings/${s.viewingId}/assign`)
        .set('Authorization', as(s.admin))
        .send({ fooPartyId: s.foo.partyId })
        .expect(201);

      const after = (await queueAs(s.admin)).officers.find(
        (o) => o.partyId === s.foo.partyId,
      )!.assignedCount;
      expect(after).toBe(before + 1);
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // The corridor is SHOWN, not silently filtered
  // ──────────────────────────────────────────────────────────────────────

  describe('rows the dispatcher cannot act on are still shown', () => {
    test('a request that fell OUT of the corridor is listed with the reason, and assignment is refused', async () => {
      /*
       * The corridor shrinking is the only way this state can arise, and
       * discovering that is why this test is written the way it is.
       *
       * It was first written to publish an out-of-corridor listing directly.
       * That failed with 422 OUTSIDE_SERVICE_AREA — correctly: `publish`
       * refuses a listing outside the corridor, and a viewing can only be
       * requested against a live listing. So an out-of-corridor REQUEST
       * cannot be created that way at all.
       *
       * It can arise the way it would in production: the corridor is
       * configurable (FR-2.5), a neighbourhood is dropped from it, and the
       * viewings already requested there are stranded. That is precisely the
       * case a dispatcher must be able to see.
       */
      const s = await scene({ inServiceArea: true });

      const listing = await prisma.listing.findUniqueOrThrow({
        where: { id: s.listingId },
        include: { property: true },
      });
      await prisma.neighbourhood.update({
        where: { id: listing.property.neighbourhoodId },
        data: { inServiceArea: false },
      });

      const queue = await queueAs(s.admin);

      const row = queue.rows.find((r) => r.viewing.id === s.viewingId);
      // Visible on purpose: a tenant waiting on something we cannot serve is
      // a supply signal, not noise to be hidden from ops.
      expect(row).toBeDefined();
      expect(row!.inServiceArea).toBe(false);
      expect(row!.blockedBy).toContain('outside_service_area');

      // And the server, not the console, is what refuses.
      const refused = await http()
        .post(`/v1/viewings/${s.viewingId}/assign`)
        .set('Authorization', as(s.admin))
        .send({ fooPartyId: s.foo.partyId });
      expect(refused.status).toBe(422);
      expect(refused.body.error.code).toBe('OUTSIDE_SERVICE_AREA');
    });

    test('a listing withdrawn after the request is flagged, not dropped', async () => {
      const s = await scene();
      await http()
        .post(`/v1/listings/${s.listingId}/withdraw`)
        .set('Authorization', as(s.lister))
        .send({})
        .expect(201);

      const row = (await queueAs(s.admin)).rows.find(
        (r) => r.viewing.id === s.viewingId,
      );
      expect(row).toBeDefined();
      expect(row!.blockedBy).toContain('listing_not_live');
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // Authorisation
  // ──────────────────────────────────────────────────────────────────────

  describe('authorisation (API Spec §4.3)', () => {
    test('unauthenticated is 401', async () => {
      await http().get('/v1/viewings/dispatch-queue').expect(401);
    });

    test('a FIELD OFFICER cannot read the dispatch queue', async () => {
      // Seeing the queue and acting on it are the same job. A queue readable
      // by an officer is a roster of every tenant's pending visit across the
      // whole corridor, which no single officer needs.
      const s = await scene();
      await http()
        .get('/v1/viewings/dispatch-queue')
        .set('Authorization', as(s.foo))
        .expect(403);
    });

    test('a tenant and a lister are both refused', async () => {
      const s = await scene();
      for (const a of [s.tenant, s.lister]) {
        await http()
          .get('/v1/viewings/dispatch-queue')
          .set('Authorization', as(a))
          .expect(403);
      }
    });

    test('the literal route is not swallowed as a viewing id', async () => {
      // `GET :viewingId` sits behind AssignedFooGuard and is FOO/admin only.
      // If `dispatch-queue` were matched as an id, an admin would get a 404
      // for a viewing that does not exist rather than the queue.
      const s = await scene();
      const res = await http()
        .get('/v1/viewings/dispatch-queue')
        .set('Authorization', as(s.admin));
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.rows)).toBe(true);
    });

    test('a non-admin cannot assign, even knowing the viewing id', async () => {
      const s = await scene();
      for (const a of [s.tenant, s.lister, s.foo]) {
        await http()
          .post(`/v1/viewings/${s.viewingId}/assign`)
          .set('Authorization', as(a))
          .send({ fooPartyId: s.foo.partyId })
          .expect(403);
      }
      // and it is genuinely still unassigned
      const v = await prisma.viewing.findUniqueOrThrow({
        where: { id: s.viewingId },
      });
      expect(v.status).toBe('requested');
      expect(v.conductedByPartyId).toBeNull();
    });

    test('a NON-OFFICER cannot be assigned work, however the request names them', async () => {
      const s = await scene();
      const res = await http()
        .post(`/v1/viewings/${s.viewingId}/assign`)
        .set('Authorization', as(s.admin))
        .send({ fooPartyId: s.tenant.partyId });
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('NOT_A_FIELD_OFFICER');
    });

    test('the roster contains only field officers — no tenants, listers or admins', async () => {
      const s = await scene();
      const queue = await queueAs(s.admin);
      const ids = queue.officers.map((o) => o.partyId);

      expect(ids).toContain(s.foo.partyId);
      expect(ids).not.toContain(s.tenant.partyId);
      expect(ids).not.toContain(s.lister.partyId);
      expect(ids).not.toContain(s.admin.partyId);
    });

    test('the roster carries NO phone numbers (NFR-3)', async () => {
      const s = await scene();
      const queue = await queueAs(s.admin);
      const serialised = JSON.stringify(queue.officers);

      expect(serialised).not.toMatch(/\+256\d{6,}/);
      expect(serialised).not.toContain('"primaryPhone"');
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // PHASE 4 — the whole operator chain, over HTTP
  // ──────────────────────────────────────────────────────────────────────

  describe('the complete field workflow, end to end', () => {
    test('request → queue → assign → board → report → conduct → introduction → deal', async () => {
      const s = await scene();

      // 1. it is waiting, and the dispatcher can see it
      expect(
        (await queueAs(s.admin)).rows.some((r) => r.viewing.id === s.viewingId),
      ).toBe(true);

      // 2. an officer is sent
      await http()
        .post(`/v1/viewings/${s.viewingId}/assign`)
        .set('Authorization', as(s.admin))
        .send({ fooPartyId: s.foo.partyId })
        .expect(201);

      // 3. the officer reads their own dispatch, and the server tells them
      //    what is still missing rather than the client guessing
      const detail = await http()
        .get(`/v1/viewings/${s.viewingId}`)
        .set('Authorization', as(s.foo))
        .expect(200);
      expect(detail.body.canConduct).toBe(false);
      expect(detail.body.whatIsMissing).toEqual(['field_report']);

      // 4. conducting without evidence is refused — the §5.1 invariant
      const premature = await http()
        .post(`/v1/viewings/${s.viewingId}/conduct`)
        .set('Authorization', as(s.foo))
        .send({});
      expect(premature.status).toBe(422);
      expect(premature.body.error.code).toBe('FIELD_REPORT_REQUIRED');

      // 5. the structured report, which also refreshes the listing
      await http()
        .post(`/v1/viewings/${s.viewingId}/field-report`)
        .set('Authorization', as(s.foo))
        .send({
          conditionRating: 'good',
          matchesListing: true,
          isAvailable: true,
        })
        .expect(201);

      const listing = await prisma.listing.findUniqueOrThrow({
        where: { id: s.listingId },
      });
      expect(listing.verificationState).toBe('verified');
      expect(listing.availabilityStatus).toBe('available');

      // 6. now it closes, and mints the introduction
      const conducted = await http()
        .post(`/v1/viewings/${s.viewingId}/conduct`)
        .set('Authorization', as(s.foo))
        .send({})
        .expect(201);
      const introductionId = conducted.body.introduction.id as string;

      // 7. and the deal that was unreachable before F-001 now follows
      const deal = await http()
        .post('/v1/deals')
        .set('Authorization', as(s.foo))
        .send({ introductionRecordId: introductionId })
        .expect(201);

      expect(deal.body.tenantPartyId).toBe(s.tenant.partyId);
      expect(deal.body.landlordPartyId).toBe(s.lister.partyId);

      // 8. the tenant, who started this, can see their own deal
      const mine = await http()
        .get('/v1/deals')
        .set('Authorization', as(s.tenant))
        .expect(200);
      expect(
        (mine.body as Array<{ id: string }>).some((d) => d.id === deal.body.id),
      ).toBe(true);
    });

    test('an officer cannot act on a visit they were not sent to', async () => {
      const s = await scene();
      const otherFoo = await actor('foo');

      await http()
        .post(`/v1/viewings/${s.viewingId}/assign`)
        .set('Authorization', as(s.admin))
        .send({ fooPartyId: s.foo.partyId })
        .expect(201);

      await http()
        .get(`/v1/viewings/${s.viewingId}`)
        .set('Authorization', as(otherFoo))
        .expect(403);
      await http()
        .post(`/v1/viewings/${s.viewingId}/field-report`)
        .set('Authorization', as(otherFoo))
        .send({
          conditionRating: 'good',
          matchesListing: true,
          isAvailable: true,
        })
        .expect(403);
    });
  });
});
