import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { IdentityService } from '../identity/identity.service';
import { LedgerService } from '../ledger/ledger.service';

/**
 * PHASE 7 — do the AMOUNTS on the money path hold?
 *
 * The sequencing guarantees are structural and proven: there is no
 * `escrow_funded → settled` edge, so funds cannot be released before move-in
 * (FR-8.2), and every posting is double-entry and immutable at the database
 * level.
 *
 * None of that constrains the FIGURES. Three amounts are supplied by a
 * caller rather than derived:
 *   - `fund-escrow.amount`   — by the tenant
 *   - `settle.totalHeld`     — by an admin
 *   - `refund.amount`        — by an admin
 *
 * And the ledger's own integrity check cannot catch an error in any of them:
 * `everyPostingBalances()` asserts each posting nets to zero, which a WRONG
 * amount does just as perfectly as a right one. This suite exists to find
 * out whether anything else does.
 *
 * These tests are written to DOCUMENT ACTUAL BEHAVIOUR, not to assert the
 * behaviour we would prefer. Where the system accepts something it should
 * not, the test says so plainly and the finding is recorded in the ledger —
 * a test rewritten to pass would hide exactly what it was written to find.
 */
describe('Escrow amount integrity (Phase 7 probe)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let auth: AuthService;
  let identity: IdentityService;
  let ledger: LedgerService;

  let seq = 0;
  function phone(tag: string) {
    seq += 1;
    return `+2569${String(Date.now()).slice(-8)}${seq}${tag}`.slice(0, 19);
  }

  const PASSWORD = 'correct-horse-battery';
  const MONTHLY_RENT = 1_000_000n;
  /** 3 months + one month's deposit — what the listing actually asks for. */
  const REQUIRED_UPFRONT = 4_000_000n;

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
    ledger = moduleRef.get(LedgerService);
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
            displayName: `Escrow ${role}`,
            primaryPhone,
            password: PASSWORD,
            role,
          })
        : await auth.provisionStaff({
            displayName: `Escrow ${role}`,
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

  interface Funded {
    tenant: Actor;
    lister: Actor;
    foo: Actor;
    admin: Actor;
    dealId: string;
    listingId: string;
  }

  /** A deal carried to `escrow_funded` over HTTP, funded with `amount`. */
  async function fundedDeal(amount: bigint): Promise<Funded> {
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
      data: { name: `EscrowHood-${Date.now()}-${seq}`, inServiceArea: true },
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
        landmarkText: 'by the borehole',
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
      .send({
        conditionRating: 'good',
        matchesListing: true,
        isAvailable: true,
      })
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
    const dealId = deal.body.id as string;

    const agreement = await prisma.listingAgreement.findFirstOrThrow({
      where: { listingId, accepted: true },
    });

    await http()
      .post(`/v1/deals/${dealId}/match-tenant`)
      .set('Authorization', as(foo))
      .send({})
      .expect(201);
    await http()
      .post(`/v1/deals/${dealId}/sign-agreement`)
      .set('Authorization', as(lister))
      .send({ agreementId: agreement.id })
      .expect(201);
    await http()
      .post(`/v1/deals/${dealId}/fund-escrow`)
      .set('Authorization', as(tenant))
      .send({ amount: amount.toString() })
      .expect(201);

    return { tenant, lister, foo, admin, dealId, listingId };
  }

  // ──────────────────────────────────────────────────────────────────────
  // What DOES hold
  // ──────────────────────────────────────────────────────────────────────

  describe('the guarantees that are structural', () => {
    test('a funded deal cannot be settled — the edge does not exist', async () => {
      const f = await fundedDeal(REQUIRED_UPFRONT);
      const res = await http()
        .post(`/v1/deals/${f.dealId}/settle`)
        .set('Authorization', as(f.admin))
        .send({ totalHeld: REQUIRED_UPFRONT.toString() });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('ILLEGAL_TRANSITION');
    });

    test('a funded deal cannot be cancelled — Amendment A1', async () => {
      const f = await fundedDeal(REQUIRED_UPFRONT);
      const res = await http()
        .post(`/v1/deals/${f.dealId}/cancel`)
        .set('Authorization', as(f.admin))
        .send({});
      expect(res.status).toBe(409);
    });

    test('commission is computed from the SNAPSHOT, not from what was funded', async () => {
      // Under-funding must not shrink the commission: it is one month's rent
      // as snapshotted at signing, and nothing about the escrow total enters
      // the calculation.
      const f = await fundedDeal(1_000n);
      await http()
        .post(`/v1/deals/${f.dealId}/confirm-move-in`)
        .set('Authorization', as(f.tenant))
        .send({})
        .expect(201);
      await http()
        .post(`/v1/deals/${f.dealId}/earn-commission`)
        .set('Authorization', as(f.admin))
        .send({})
        .expect(201);

      const deal = await prisma.deal.findUniqueOrThrow({
        where: { id: f.dealId },
      });
      expect(deal.commissionAmount).toBe(MONTHLY_RENT);
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // F-012 — the amounts nobody reconciles
  // ──────────────────────────────────────────────────────────────────────

  describe('caller-supplied amounts (F-012)', () => {
    test('a tenant may fund LESS than the listing requires, and the deal proceeds', async () => {
      // Documents current behaviour. `fund-escrow` does not compare the
      // amount against the listing's own terms
      // (monthlyRent × requiredMonthsUpfront + depositAmount), so a deal can
      // reach escrow_funded — and therefore move_in_confirmed — on a
      // fraction of what the tenant actually owes.
      const f = await fundedDeal(1n);

      const deal = await prisma.deal.findUniqueOrThrow({
        where: { id: f.dealId },
      });
      expect(deal.status).toBe('escrow_funded');

      const balances = await ledger.balancesByTypeForDeal(f.dealId);
      // Liability is a credit balance, so it reads negative here.
      expect(balances.get('escrow_liability')).toBe(-1n);

      const listing = await prisma.listing.findUniqueOrThrow({
        where: { id: f.listingId },
      });
      const owed =
        listing.monthlyRent * BigInt(listing.requiredMonthsUpfront) +
        listing.depositAmount;
      expect(owed).toBe(REQUIRED_UPFRONT);
      // …and nothing anywhere compared the two.
      expect(owed).not.toBe(1n);
    });

    test('an admin may settle a total that was NEVER held, driving the liability negative', async () => {
      const f = await fundedDeal(REQUIRED_UPFRONT);

      await http()
        .post(`/v1/deals/${f.dealId}/confirm-move-in`)
        .set('Authorization', as(f.tenant))
        .send({})
        .expect(201);
      await http()
        .post(`/v1/deals/${f.dealId}/earn-commission`)
        .set('Authorization', as(f.admin))
        .send({})
        .expect(201);

      // Ten times what the tenant ever paid in. A fat finger, not an attack.
      const inflated = REQUIRED_UPFRONT * 10n;
      await http()
        .post(`/v1/deals/${f.dealId}/settle`)
        .set('Authorization', as(f.admin))
        .send({ totalHeld: inflated.toString() })
        .expect(201);

      const balances = await ledger.balancesByTypeForDeal(f.dealId);
      // The liability should discharge to exactly zero on a correct
      // settlement. It does not — the deal now claims we held far more than
      // we did, and the landlord was instructed for the difference.
      expect(balances.get('escrow_liability')).not.toBe(0n);

      // And the ledger's own integrity check is BLIND to it: every posting
      // still nets to zero, because a wrong amount balances as perfectly as
      // a right one. This is the assertion that matters — it is why the
      // green suite could not have caught this.
      expect(await ledger.everyPostingBalances()).toBe(true);
    });

    test('an admin may refund MORE than was ever funded', async () => {
      const f = await fundedDeal(REQUIRED_UPFRONT);

      await http()
        .post(`/v1/deals/${f.dealId}/refund`)
        .set('Authorization', as(f.admin))
        .send({ amount: (REQUIRED_UPFRONT * 3n).toString() })
        .expect(201);

      const balances = await ledger.balancesByTypeForDeal(f.dealId);
      expect(balances.get('escrow_liability')).not.toBe(0n);
      expect(await ledger.everyPostingBalances()).toBe(true);
    });
  });
});
