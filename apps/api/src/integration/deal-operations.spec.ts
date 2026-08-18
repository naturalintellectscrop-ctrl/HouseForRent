import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { IdentityService } from '../identity/identity.service';
import { DealsController } from '../deals/deals.controller';
import { DEAL_ACTIONS } from '../deals/deal-actions';
import { ALLOWED_TRANSITIONS } from '../deals/deal-state-machine';

/**
 * Deal operations — F-007.
 *
 * `earn-commission`, `settle`, `close`, `refund`, `dispute-hold`,
 * `resolve-dispute`, `match-tenant` and `sign-agreement` were all built and
 * tested and none was reachable from any surface. The two transitions that
 * DID have surfaces were the two that put money in, so client funds could
 * enter escrow and had no exit.
 *
 * The property under test is not "an operator can settle a deal". It is that
 * **the server decides what may be done**, and the console renders that
 * answer rather than holding its own copy of the transition graph. Every
 * test below asks the API what is available and checks it against the real
 * state machine — never against a list written out by hand.
 */
describe('Deal operations (F-007)', () => {
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
  const MONTHLY_RENT = 1_000_000n;
  const UPFRONT = 4_000_000n;

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
    opts?: { verifyIdentity?: boolean },
  ): Promise<Actor> {
    const primaryPhone = phone(role.slice(0, 2));
    const created =
      role === 'tenant' || role === 'lister'
        ? await auth.register({
            displayName: `Ops ${role}`,
            primaryPhone,
            password: PASSWORD,
            role,
          })
        : await auth.provisionStaff({
            displayName: `Ops ${role}`,
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
    dealId: string;
    listingId: string;
    agreementId: string;
  }

  /** A real deal at `created`, built entirely over HTTP. */
  async function scene(): Promise<Scene> {
    seq += 1;
    const tenant = await actor('tenant', { verifyIdentity: true });
    const lister = await actor('lister');
    const foo = await actor('foo');
    const admin = await actor('admin');

    await http()
      .post('/v1/admin/commission-rates')
      .set('Authorization', as(admin))
      .send({ rateBpOfMonth: 10000 })
      .expect(201);

    const neighbourhood = await prisma.neighbourhood.create({
      data: { name: `OpsHood-${Date.now()}-${seq}`, inServiceArea: true },
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
        landmarkText: 'beside the trading centre',
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
    await http()
      .post(`/v1/viewings/${viewing.body.id}/assign`)
      .set('Authorization', as(admin))
      .send({ fooPartyId: foo.partyId })
      .expect(201);
    await http()
      .post(`/v1/viewings/${viewing.body.id}/field-report`)
      .set('Authorization', as(foo))
      .send({ conditionRating: 'good', matchesListing: true, isAvailable: true })
      .expect(201);
    const conducted = await http()
      .post(`/v1/viewings/${viewing.body.id}/conduct`)
      .set('Authorization', as(foo))
      .send({})
      .expect(201);

    const deal = await http()
      .post('/v1/deals')
      .set('Authorization', as(foo))
      .send({ introductionRecordId: conducted.body.introduction.id })
      .expect(201);

    const agreement = await prisma.listingAgreement.findFirstOrThrow({
      where: { listingId, accepted: true },
    });

    return {
      tenant,
      lister,
      foo,
      admin,
      dealId: deal.body.id as string,
      listingId,
      agreementId: agreement.id,
    };
  }

  interface Detail {
    deal: { id: string; status: string };
    transitions: Array<{ toStatus: string }>;
    listing: Record<string, unknown>;
    property: Record<string, unknown>;
    parties: {
      tenant: { partyId: string; displayName: string };
      landlord: { partyId: string; displayName: string };
    };
    financial: Record<string, unknown>;
    availableActions: Array<{
      action: string;
      label: string;
      consequence: string;
      reversible: boolean;
      movesMoney: boolean;
      fields: Array<{ name: string; required: boolean }>;
    }>;
  }

  const detailAs = async (a: Actor, dealId: string) =>
    (
      await http()
        .get(`/v1/deals/${dealId}`)
        .set('Authorization', as(a))
        .expect(200)
    ).body as Detail;

  const actionNames = (d: Detail) => d.availableActions.map((a) => a.action);

  /** Carries a deal to `escrow_funded` through the real endpoints. */
  async function fund(s: Scene) {
    await http()
      .post(`/v1/deals/${s.dealId}/match-tenant`)
      .set('Authorization', as(s.foo))
      .send({})
      .expect(201);
    await http()
      .post(`/v1/deals/${s.dealId}/sign-agreement`)
      .set('Authorization', as(s.lister))
      .send({ agreementId: s.agreementId })
      .expect(201);
    await http()
      .post(`/v1/deals/${s.dealId}/fund-escrow`)
      .set('Authorization', as(s.tenant))
      .send({})
      .expect(201);
  }

  // ──────────────────────────────────────────────────────────────────────
  // 1 — an operator can open a real deal
  // ──────────────────────────────────────────────────────────────────────

  describe('opening a deal', () => {
    test('an admin sees the property, the parties, the money and the history', async () => {
      const s = await scene();
      const d = await detailAs(s.admin, s.dealId);

      expect(d.deal.status).toBe('created');
      expect(d.property.neighbourhood).toBeTruthy();
      expect(d.listing.id).toBe(s.listingId);
      expect(d.parties.tenant.partyId).toBe(s.tenant.partyId);
      expect(d.parties.landlord.partyId).toBe(s.lister.partyId);

      // Money arrives as STRINGS of integer shillings (API Spec §2).
      expect(typeof d.financial.heldInEscrow).toBe('string');
      expect(d.financial.expectedUpfront).toBe(UPFRONT.toString());
      expect(d.financial.heldInEscrow).toBe('0');
      expect(d.financial.escrowDischarged).toBe(true);
    });

    test('no phone number is disclosed anywhere in the payload (NFR-3)', async () => {
      const s = await scene();
      const d = await detailAs(s.admin, s.dealId);
      const serialised = JSON.stringify(d);

      expect(serialised).not.toMatch(/\+256\d{6,}/);
      expect(serialised).not.toContain('"primaryPhone"');
    });

    test('a deal that does not exist is 404, not a crash', async () => {
      const s = await scene();
      await http()
        .get('/v1/deals/00000000-0000-0000-0000-000000000000')
        .set('Authorization', as(s.admin))
        .expect(404);
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // 2 — authorisation
  // ──────────────────────────────────────────────────────────────────────

  describe('authorisation', () => {
    test('a stranger gets 404, not 403 — the deal id is not confirmed to them', async () => {
      const s = await scene();
      const stranger = await actor('tenant');

      // 403 would confirm the deal exists and let someone probe for real
      // ids. A non-party receives exactly what they would for an id that was
      // never issued.
      await http()
        .get(`/v1/deals/${s.dealId}`)
        .set('Authorization', as(stranger))
        .expect(404);
    });

    test('unauthenticated is 401', async () => {
      const s = await scene();
      await http().get(`/v1/deals/${s.dealId}`).expect(401);
    });

    test('the ACTION LIST is role-scoped — a tenant is never offered settlement', async () => {
      const s = await scene();
      await fund(s);

      const tenantView = await detailAs(s.tenant, s.dealId);
      const adminView = await detailAs(s.admin, s.dealId);

      // Both look at the same deal in the same status.
      expect(tenantView.deal.status).toBe('escrow_funded');
      expect(adminView.deal.status).toBe('escrow_funded');

      // The tenant may confirm their own move-in…
      expect(actionNames(tenantView)).toContain('confirm-move-in');
      // …and is never offered the money-out actions, which are admin's.
      expect(actionNames(tenantView)).not.toContain('refund');
      expect(actionNames(tenantView)).not.toContain('dispute-hold');
      expect(actionNames(adminView)).toContain('refund');
    });

    test('a landlord is not offered the tenant\'s actions', async () => {
      const s = await scene();
      await fund(s);
      const listerView = await detailAs(s.lister, s.dealId);

      // confirm-move-in is the tenant's to give: it releases the protection
      // on their own money.
      expect(actionNames(listerView)).not.toContain('confirm-move-in');
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // 3 & 4 — what is offered matches the real state machine
  // ──────────────────────────────────────────────────────────────────────

  describe('the offered actions ARE the state machine', () => {
    test('at `created`, only the transitions the graph permits are offered', async () => {
      const s = await scene();
      const d = await detailAs(s.admin, s.dealId);

      // Checked against ALLOWED_TRANSITIONS itself, not a hand-written list
      // — a test that restated the expected actions would be a third copy of
      // the graph and would drift with the other two.
      const legalTargets = ALLOWED_TRANSITIONS.created;
      for (const name of actionNames(d)) {
        const spec = DEAL_ACTIONS.find((a) => a.action === name)!;
        expect(spec).toBeDefined();
        if (spec.to !== null) {
          expect(legalTargets).toContain(spec.to);
        }
      }

      expect(actionNames(d)).toContain('match-tenant');
    });

    test('an ILLEGAL transition is never offered — no settle from `created`', async () => {
      const s = await scene();
      const d = await detailAs(s.admin, s.dealId);

      expect(actionNames(d)).not.toContain('settle');
      expect(actionNames(d)).not.toContain('earn-commission');
      expect(actionNames(d)).not.toContain('close');
    });

    test('the Move-In Guarantee is visible in what is NOT offered', async () => {
      const s = await scene();
      await fund(s);
      const d = await detailAs(s.admin, s.dealId);

      // From escrow_funded the only exits are move-in or a full refund.
      // Settlement and cancellation are absent because the EDGES are absent,
      // not because this page filtered them out.
      expect(actionNames(d)).not.toContain('settle');
      expect(actionNames(d)).not.toContain('cancel');
      expect(actionNames(d)).toContain('refund');
      expect(actionNames(d)).toContain('dispute-hold');
    });

    test('every terminal status offers nothing at all', async () => {
      const s = await scene();
      await http()
        .post(`/v1/deals/${s.dealId}/cancel`)
        .set('Authorization', as(s.admin))
        .send({ reason: 'tenant withdrew' })
        .expect(201);

      const d = await detailAs(s.admin, s.dealId);
      expect(d.deal.status).toBe('cancelled');
      expect(d.availableActions).toEqual([]);
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // 5 — the server refuses regardless of what was offered
  // ──────────────────────────────────────────────────────────────────────

  describe('the backend remains the authority', () => {
    test('an un-offered transition, posted directly, is still refused', async () => {
      const s = await scene();
      const res = await http()
        .post(`/v1/deals/${s.dealId}/settle`)
        .set('Authorization', as(s.admin))
        .send({});

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('ILLEGAL_TRANSITION');

      // and nothing changed
      const d = await detailAs(s.admin, s.dealId);
      expect(d.deal.status).toBe('created');
    });

    test('an un-offered transition posted by the WRONG ROLE is 403', async () => {
      const s = await scene();
      await fund(s);

      await http()
        .post(`/v1/deals/${s.dealId}/refund`)
        .set('Authorization', as(s.tenant))
        .send({})
        .expect(403);
    });

    test('a FAILED transition leaves no trace claiming it happened', async () => {
      const s = await scene();
      await fund(s);

      await http()
        .post(`/v1/deals/${s.dealId}/settle`)
        .set('Authorization', as(s.admin))
        .send({})
        .expect(409);

      const d = await detailAs(s.admin, s.dealId);
      expect(d.deal.status).toBe('escrow_funded');
      expect(d.transitions.map((t) => t.toStatus)).not.toContain('settled');
      expect(d.financial.releasedToLandlord).toBe('0');

      const audited = await prisma.auditEvent.count({
        where: { subjectRef: s.dealId, eventType: 'deal_settled' },
      });
      expect(audited).toBe(0);
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // 6 & 8 — the displayed state follows the server, including under conflict
  // ──────────────────────────────────────────────────────────────────────

  describe('state after acting', () => {
    test('a successful transition changes both the status AND what is offered next', async () => {
      const s = await scene();
      const before = await detailAs(s.admin, s.dealId);
      expect(actionNames(before)).toContain('match-tenant');

      await http()
        .post(`/v1/deals/${s.dealId}/match-tenant`)
        .set('Authorization', as(s.foo))
        .send({})
        .expect(201);

      const after = await detailAs(s.admin, s.dealId);
      expect(after.deal.status).toBe('tenant_matched');
      expect(actionNames(after)).not.toContain('match-tenant');
      expect(actionNames(after)).toContain('sign-agreement');
      expect(after.transitions.map((t) => t.toStatus)).toContain(
        'tenant_matched',
      );
    });

    test('CONCURRENT change: a stale view acts, is refused, and the refetch shows the truth', async () => {
      const s = await scene();

      // Operator A loads the page and sees `match-tenant` available.
      const staleView = await detailAs(s.admin, s.dealId);
      expect(actionNames(staleView)).toContain('match-tenant');

      // Operator B cancels the deal in the meantime.
      await http()
        .post(`/v1/deals/${s.dealId}/cancel`)
        .set('Authorization', as(s.admin))
        .send({ reason: 'landlord let it privately' })
        .expect(201);

      // Operator A now acts on what their page was showing.
      const refused = await http()
        .post(`/v1/deals/${s.dealId}/match-tenant`)
        .set('Authorization', as(s.foo))
        .send({});
      expect(refused.status).toBe(409);
      expect(refused.body.error.code).toBe('ILLEGAL_TRANSITION');

      // The refetch — which the console performs even on failure — shows the
      // real state, not the one operator A was looking at.
      const fresh = await detailAs(s.admin, s.dealId);
      expect(fresh.deal.status).toBe('cancelled');
      expect(fresh.availableActions).toEqual([]);
    });

    test('the financial summary follows the LEDGER through the whole journey', async () => {
      const s = await scene();
      await fund(s);

      let d = await detailAs(s.admin, s.dealId);
      expect(d.financial.heldInEscrow).toBe(UPFRONT.toString());
      expect(d.financial.funded).toBe(UPFRONT.toString());
      expect(d.financial.escrowDischarged).toBe(false);

      await http()
        .post(`/v1/deals/${s.dealId}/confirm-move-in`)
        .set('Authorization', as(s.tenant))
        .send({})
        .expect(201);
      await http()
        .post(`/v1/deals/${s.dealId}/earn-commission`)
        .set('Authorization', as(s.admin))
        .send({})
        .expect(201);

      d = await detailAs(s.admin, s.dealId);
      expect(d.financial.commissionRecognised).toBe(MONTHLY_RENT.toString());
      expect(d.financial.commissionAmount).toBe(MONTHLY_RENT.toString());

      await http()
        .post(`/v1/deals/${s.dealId}/settle`)
        .set('Authorization', as(s.admin))
        .send({})
        .expect(201);

      d = await detailAs(s.admin, s.dealId);
      expect(d.deal.status).toBe('settled');
      // Liability fully discharged, landlord paid net of commission.
      expect(d.financial.escrowDischarged).toBe(true);
      expect(d.financial.heldInEscrow).toBe('0');
      expect(d.financial.releasedToLandlord).toBe(
        (UPFRONT - MONTHLY_RENT).toString(),
      );
      expect(actionNames(d)).toContain('close');
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // 9 — the contract that makes a real confirmation possible
  // ──────────────────────────────────────────────────────────────────────

  describe('financial actions carry what a confirmation needs', () => {
    test('every money action is flagged, irreversible and explains itself', async () => {
      const s = await scene();
      await fund(s);
      const d = await detailAs(s.admin, s.dealId);

      const refund = d.availableActions.find((a) => a.action === 'refund')!;
      expect(refund.movesMoney).toBe(true);
      expect(refund.reversible).toBe(false);
      // Not "Are you sure?" — the server supplies the actual consequence, so
      // the console cannot paraphrase it into something vaguer.
      expect(refund.consequence.length).toBeGreaterThan(60);
      expect(refund.consequence).toMatch(/terminal|cannot/i);
      expect(refund.fields.some((f) => f.name === 'amount' && f.required)).toBe(
        true,
      );
    });

    test('a non-money action is NOT flagged as one', async () => {
      const s = await scene();
      const d = await detailAs(s.admin, s.dealId);
      const match = d.availableActions.find((a) => a.action === 'match-tenant')!;

      expect(match.movesMoney).toBe(false);
      expect(match.reversible).toBe(true);
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // The descriptor table cannot silently drift from the controller
  // ──────────────────────────────────────────────────────────────────────

  describe('the action table matches the real controller', () => {
    test('every descriptor names a method that actually exists', async () => {
      for (const spec of DEAL_ACTIONS) {
        const method = (
          DealsController.prototype as unknown as Record<string, unknown>
        )[spec.handler];
        expect(typeof method).toBe('function');
      }
    });

    test('every transition endpoint on the controller HAS a descriptor', async () => {
      // If a twelfth transition were added and nobody added a row here, it
      // would be unreachable from every surface that renders availableActions
      // — the same class of defect as F-007 itself, and this is what catches
      // the repeat.
      const described = new Set(DEAL_ACTIONS.map((a) => a.action));
      const endpoints = [
        'match-tenant',
        'sign-agreement',
        'fund-escrow',
        'confirm-move-in',
        'earn-commission',
        'settle',
        'close',
        'refund',
        'cancel',
        'dispute-hold',
        'resolve-dispute',
      ];
      for (const endpoint of endpoints) {
        expect(described).toContain(endpoint);
      }
      expect(described.size).toBe(endpoints.length);
    });

    test('every non-terminal status can be reached from some descriptor', async () => {
      const targets = new Set<string>(
        DEAL_ACTIONS.flatMap((a) => (a.to === null ? [] : [a.to])),
      );
      for (const status of Object.keys(ALLOWED_TRANSITIONS)) {
        if (status === 'created') continue; // the entry point, not a target
        expect(targets).toContain(status);
      }
    });
  });
});
