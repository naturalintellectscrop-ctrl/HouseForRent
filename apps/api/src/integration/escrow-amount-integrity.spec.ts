import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { IdentityService } from '../identity/identity.service';
import { LedgerService } from '../ledger/ledger.service';

/**
 * F-012 — the AMOUNTS on the money path.
 *
 * ── What this suite used to be ──
 * A probe. Three amounts were supplied by a caller rather than derived
 * (`fund-escrow.amount`, `settle.totalHeld`, `refund.amount`), and the
 * ledger's own integrity check could not catch an error in any of them:
 * `everyPostingBalances()` asserts each posting nets to zero, which a WRONG
 * amount does just as perfectly as a right one. The probe documented actual
 * behaviour rather than preferred behaviour, so its PASSING was the
 * confirmation of the defect: a 1-shilling funding, a 10x settlement and a
 * 3x refund were all accepted.
 *
 * ── What it is now ──
 * The same scenarios, INVERTED. Every one is still exercised end to end over
 * real HTTP; each now asserts refusal, or asserts that the derived figure is
 * posted regardless of what the request said. Nothing was deleted or
 * weakened — the cases that found the defect are the cases that now guard
 * the fix, which is the only way to know the fix addresses what was found.
 *
 * The invariant under test:
 *
 *   NO MONEY ENDPOINT ACCEPTS AN AMOUNT.
 *   Funding is derived from the deal's signed terms; settlement and refund
 *   are derived from the outstanding escrow liability, read inside the
 *   transaction that posts against it.
 */
describe('Escrow amount integrity (F-012)', () => {
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

  /**
   * A deal carried to `agreement_signed` over HTTP, on a listing asking
   * 3 months at 1,000,000 plus a 1,000,000 deposit — so the amount the
   * server will derive at funding is 4,000,000.
   */
  async function sceneToSigned(): Promise<Funded> {
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
    return { tenant, lister, foo, admin, dealId, listingId };
  }

  /** …and on to `escrow_funded`, naming no amount. */
  async function scene(): Promise<Funded> {
    const s = await sceneToSigned();
    await http()
      .post(`/v1/deals/${s.dealId}/fund-escrow`)
      .set('Authorization', as(s.tenant))
      .send({})
      .expect(201);
    return s;
  }

  /** Carries a funded deal to `commission_earned`. */
  async function moveInAndEarn(s: Funded) {
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
  }

  /** What the deal still owes back, straight from the ledger. */
  const heldFor = (dealId: string) =>
    ledger.outstandingEscrowLiability(dealId);

  // ──────────────────────────────────────────────────────────────────────
  // What DOES hold
  // ──────────────────────────────────────────────────────────────────────

  describe('the guarantees that are structural', () => {
    test('a funded deal cannot be settled — the edge does not exist', async () => {
      const f = await scene();
      const res = await http()
        .post(`/v1/deals/${f.dealId}/settle`)
        .set('Authorization', as(f.admin))
        // No amount — the point here is the TRANSITION rule. Sending a
        // field the DTO no longer has would be answered by validation
        // (400) before the state machine was ever consulted.
        .send({});
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('ILLEGAL_TRANSITION');
    });

    test('a funded deal cannot be cancelled — Amendment A1', async () => {
      const f = await scene();
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
      const f = await scene();
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

  describe('the server is the financial authority (F-012)', () => {
    test('funding posts the DERIVED total when the request names no amount', async () => {
      const s = await scene();

      // 3 months at 1,000,000 plus a 1,000,000 deposit.
      expect(await heldFor(s.dealId)).toBe(4_000_000n);
      expect(await ledger.everyPostingBalances()).toBe(true);
    });

    test('a tenant CANNOT fund less than the listing requires', async () => {
      const s = await sceneToSigned();

      const res = await http()
        .post(`/v1/deals/${s.dealId}/fund-escrow`)
        .set('Authorization', as(s.tenant))
        .send({ amount: '1' });

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('AMOUNT_NOT_AUTHORITATIVE');
      // and nothing was posted
      expect(await heldFor(s.dealId)).toBe(0n);
    });

    test('a tenant CANNOT fund more than the listing requires either', async () => {
      const s = await sceneToSigned();

      const res = await http()
        .post(`/v1/deals/${s.dealId}/fund-escrow`)
        .set('Authorization', as(s.tenant))
        .send({ amount: '99000000' });

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('AMOUNT_NOT_AUTHORITATIVE');
      expect(await heldFor(s.dealId)).toBe(0n);
    });

    test('a CORRECT supplied amount is accepted — and is not what was trusted', async () => {
      const s = await sceneToSigned();

      await http()
        .post(`/v1/deals/${s.dealId}/fund-escrow`)
        .set('Authorization', as(s.tenant))
        .send({ amount: '4000000' })
        .expect(201);

      // The posted figure is the derived one. That it happens to equal what
      // was sent is the point: the request agreed with the server, it did
      // not instruct it.
      expect(await heldFor(s.dealId)).toBe(4_000_000n);
    });

    test('funding is REFUSED when the listing terms moved after signing', async () => {
      const s = await sceneToSigned();

      await prisma.listing.update({
        where: { id: s.listingId },
        data: { monthlyRent: 5_000_000n },
      });

      const res = await http()
        .post(`/v1/deals/${s.dealId}/fund-escrow`)
        .set('Authorization', as(s.tenant))
        .send({});

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('LISTING_TERMS_CHANGED');
      expect(await heldFor(s.dealId)).toBe(0n);
    });

    test('settlement releases the OUTSTANDING liability, and no request can inflate it', async () => {
      const s = await scene();
      await moveInAndEarn(s);

      // commission (1,000,000) has already been debited out of escrow
      expect(await heldFor(s.dealId)).toBe(3_000_000n);

      // A body naming a total is refused outright — the field no longer
      // exists, so `forbidNonWhitelisted` rejects it before any handler runs.
      const smuggled = await http()
        .post(`/v1/deals/${s.dealId}/settle`)
        .set('Authorization', as(s.admin))
        .send({ totalHeld: '40000000' });
      expect(smuggled.status).toBe(400);
      expect(await heldFor(s.dealId)).toBe(3_000_000n);

      await http()
        .post(`/v1/deals/${s.dealId}/settle`)
        .set('Authorization', as(s.admin))
        .send({})
        .expect(201);

      // Liability lands exactly on zero, landlord got rent-minus-commission.
      expect(await heldFor(s.dealId)).toBe(0n);
      const balances = await ledger.balancesByTypeForDeal(s.dealId);
      expect(-(balances.get('commission_revenue') ?? 0n)).toBe(1_000_000n);
      expect(balances.get('landlord_payable') ?? 0n).toBe(0n);
      expect(await ledger.everyPostingBalances()).toBe(true);
    });

    test('a refund returns exactly what is held — no more, no less', async () => {
      const s = await scene();
      expect(await heldFor(s.dealId)).toBe(4_000_000n);

      const smuggled = await http()
        .post(`/v1/deals/${s.dealId}/refund`)
        .set('Authorization', as(s.admin))
        .send({ amount: '12000000' });
      expect(smuggled.status).toBe(400);
      expect(await heldFor(s.dealId)).toBe(4_000_000n);

      await http()
        .post(`/v1/deals/${s.dealId}/refund`)
        .set('Authorization', as(s.admin))
        .send({})
        .expect(201);

      expect(await heldFor(s.dealId)).toBe(0n);
      const balances = await ledger.balancesByTypeForDeal(s.dealId);
      expect(balances.get('commission_revenue') ?? 0n).toBe(0n);
      expect(await ledger.everyPostingBalances()).toBe(true);
    });

    test('the liability NEVER goes negative, on any path', async () => {
      const settled = await scene();
      await moveInAndEarn(settled);
      await http()
        .post(`/v1/deals/${settled.dealId}/settle`)
        .set('Authorization', as(settled.admin))
        .send({})
        .expect(201);

      const refunded = await scene();
      await http()
        .post(`/v1/deals/${refunded.dealId}/refund`)
        .set('Authorization', as(refunded.admin))
        .send({})
        .expect(201);

      for (const id of [settled.dealId, refunded.dealId]) {
        const held = await heldFor(id);
        expect(held).toBe(0n);
        expect(held >= 0n).toBe(true);
      }
    });

    test('a SECOND settlement finds nothing left and is refused', async () => {
      // The zero-liability case, and the shape a double-release would take.
      const s = await scene();
      await moveInAndEarn(s);
      await http()
        .post(`/v1/deals/${s.dealId}/settle`)
        .set('Authorization', as(s.admin))
        .send({})
        .expect(201);

      // `settled` has no outgoing settle edge, so the state machine refuses
      // first — the liability guard sits behind it as the second line.
      const again = await http()
        .post(`/v1/deals/${s.dealId}/settle`)
        .set('Authorization', as(s.admin))
        .send({});
      expect(again.status).toBe(409);
      expect(await heldFor(s.dealId)).toBe(0n);
    });

    test('CONCURRENT settlements cannot both release the same escrow', async () => {
      const s = await scene();
      await moveInAndEarn(s);
      const held = await heldFor(s.dealId);

      // Fired together. The balance is read INSIDE the settling transaction,
      // so the second sees the first's effect (or the state change) rather
      // than a stale full liability.
      const [a, b] = await Promise.all([
        http()
          .post(`/v1/deals/${s.dealId}/settle`)
          .set('Authorization', as(s.admin))
          .send({}),
        http()
          .post(`/v1/deals/${s.dealId}/settle`)
          .set('Authorization', as(s.admin))
          .send({}),
      ]);

      const statuses = [a.status, b.status].sort();
      // Exactly one succeeds.
      expect(statuses[0]).toBe(201);
      expect(statuses[1]).toBeGreaterThanOrEqual(400);

      // And the landlord was paid once, for what was actually held.
      const balances = await ledger.balancesByTypeForDeal(s.dealId);
      expect(await heldFor(s.dealId)).toBe(0n);
      expect(balances.get('landlord_payable') ?? 0n).toBe(0n);
      expect(await ledger.everyPostingBalances()).toBe(true);

      const released = await prisma.ledgerEntry.findMany({
        where: { dealId: s.dealId, reference: 'release_to_landlord' },
      });
      const total = released
        .filter((e) => e.direction === 'credit')
        .reduce((sum, e) => sum + e.amount, 0n);
      expect(total).toBe(held);
    });

    test('CONCURRENT refunds cannot both return the same escrow', async () => {
      const s = await scene();
      const held = await heldFor(s.dealId);

      const [a, b] = await Promise.all([
        http()
          .post(`/v1/deals/${s.dealId}/refund`)
          .set('Authorization', as(s.admin))
          .send({}),
        http()
          .post(`/v1/deals/${s.dealId}/refund`)
          .set('Authorization', as(s.admin))
          .send({}),
      ]);

      const statuses = [a.status, b.status].sort();
      expect(statuses[0]).toBe(201);
      expect(statuses[1]).toBeGreaterThanOrEqual(400);

      expect(await heldFor(s.dealId)).toBe(0n);
      const refunded = await prisma.ledgerEntry.findMany({
        where: { dealId: s.dealId, reference: 'refund' },
      });
      const total = refunded
        .filter((e) => e.direction === 'credit')
        .reduce((sum, e) => sum + e.amount, 0n);
      expect(total).toBe(held);
    });

    test('authorisation is UNCHANGED by any of this', async () => {
      const s = await scene();

      // still tenant-only to fund, admin-only to refund
      await http()
        .post(`/v1/deals/${s.dealId}/refund`)
        .set('Authorization', as(s.tenant))
        .send({})
        .expect(403);
      await http()
        .post(`/v1/deals/${s.dealId}/refund`)
        .set('Authorization', as(s.lister))
        .send({})
        .expect(403);
      await http().post(`/v1/deals/${s.dealId}/refund`).send({}).expect(401);

      expect(await heldFor(s.dealId)).toBe(4_000_000n);
    });
  });
});
