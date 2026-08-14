import { Test } from '@nestjs/testing';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import { LedgerModule } from '../ledger/ledger.module';
import { LedgerService } from '../ledger/ledger.service';
import { DealsModule } from './deals.module';
import { DealsService, SnapshotImmutableError } from './deals.service';
import { IllegalTransitionError } from './deal-state-machine';

/**
 * Stage 3 integration tests — the state machine and commission engine
 * wired to the real database and the Stage 2 ledger.
 *
 * The assertions that matter most here:
 *   - the snapshot taken at agreement_signed is immune to a later rate change;
 *   - commission uses the monthly-rent snapshot, NOT the escrow total;
 *   - commission is recognised exactly at move-in, not before, not after;
 *   - there is no code path that releases funds before move-in;
 *   - illegal transitions are rejected and leave no trace.
 */
describe('Deals service (Stage 3)', () => {
  let deals: DealsService;
  let ledger: LedgerService;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PrismaModule, LedgerModule, DealsModule],
    }).compile();

    deals = moduleRef.get(DealsService);
    ledger = moduleRef.get(LedgerService);
    prisma = moduleRef.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  let seq = 0;
  function uniquePhone(tag: string) {
    seq += 1;
    return `+2569${Date.now()}${seq}${tag}`.slice(0, 20);
  }

  /**
   * Builds a deal sitting at `created`, with a real listing, a real
   * introduction record, and a commission rate version in force.
   */
  async function seedDeal(params?: { monthlyRent?: bigint; rateBp?: number }) {
    const monthlyRent = params?.monthlyRent ?? 1_000_000n;
    const rateBp = params?.rateBp ?? 10000;

    const tenant = await prisma.party.create({
      data: { displayName: 'Deal Tenant', primaryPhone: uniquePhone('t') },
    });
    const landlord = await prisma.party.create({
      data: { displayName: 'Deal Landlord', primaryPhone: uniquePhone('l') },
    });
    const foo = await prisma.party.create({
      data: { displayName: 'Deal FOO', primaryPhone: uniquePhone('f') },
    });
    const admin = await prisma.party.create({
      data: { displayName: 'Deal Admin', primaryPhone: uniquePhone('a') },
    });
    const neighbourhood = await prisma.neighbourhood.create({
      data: { name: `DealHood-${Date.now()}-${seq}` },
    });
    const property = await prisma.property.create({
      data: {
        ownerPartyId: landlord.id,
        propertyType: 'apartment',
        bedrooms: 2,
        bathrooms: 1,
        furnished: 'furnished',
        neighbourhoodId: neighbourhood.id,
        landmarkText: 'deal test property',
      },
    });
    const listing = await prisma.listing.create({
      data: {
        propertyId: property.id,
        monthlyRent,
        requiredMonthsUpfront: 3,
        depositAmount: monthlyRent,
      },
    });
    // Built in the order the Stage 7 DB trigger requires: evidence first,
    // status last. A `conducted` viewing with no field report is rejected by
    // the database now, not merely by ViewingsService.
    const viewing = await prisma.viewing.create({
      data: {
        listingId: listing.id,
        tenantPartyId: tenant.id,
        conductedByPartyId: foo.id,
        scheduledFor: new Date(),
        status: 'scheduled',
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
    const introduction = await prisma.introductionRecord.create({
      data: {
        viewingId: viewing.id,
        tenantPartyId: tenant.id,
        listingId: listing.id,
        landlordPartyId: landlord.id,
        fooPartyId: foo.id,
        introducedAt: new Date(),
      },
    });
    await prisma.viewing.update({
      where: { id: viewing.id },
      data: { status: 'conducted' },
    });
    const rateVersion = await prisma.commissionRateVersion.create({
      data: {
        rateBpOfMonth: rateBp,
        effectiveFrom: new Date(),
        createdByPartyId: admin.id,
      },
    });
    const agreement = await prisma.listingAgreement.create({
      data: {
        listingId: listing.id,
        listerPartyId: landlord.id,
        commissionRateVersionId: rateVersion.id,
        monthlyRentAtSigning: monthlyRent,
        circumventionClauseVersion: 'v1',
        accepted: true,
        acceptedAt: new Date(),
      },
    });
    const deal = await deals.createDeal({
      listingId: listing.id,
      tenantPartyId: tenant.id,
      landlordPartyId: landlord.id,
      introductionRecordId: introduction.id,
    });

    return {
      deal,
      listing,
      agreement,
      rateVersion,
      tenant,
      landlord,
      foo,
      admin,
      monthlyRent,
    };
  }

  /** Advances a freshly seeded deal to escrow_funded. */
  async function fundedDeal(opts?: {
    monthlyRent?: bigint;
    rateBp?: number;
    upfront?: bigint;
  }) {
    const seeded = await seedDeal(opts);
    const upfront = opts?.upfront ?? seeded.monthlyRent * 3n;

    await deals.matchTenant({
      dealId: seeded.deal.id,
      actorPartyId: seeded.foo.id,
    });
    await deals.signAgreement({
      dealId: seeded.deal.id,
      actorPartyId: seeded.landlord.id,
      agreementId: seeded.agreement.id,
    });
    await deals.fundEscrow({
      dealId: seeded.deal.id,
      actorPartyId: seeded.tenant.id,
      amount: upfront,
    });

    return { ...seeded, upfront };
  }

  async function creditBalance(
    dealId: string,
    accountType:
      | 'escrow_liability'
      | 'commission_revenue'
      | 'landlord_payable'
      | 'psp_clearing',
  ) {
    const balances = await ledger.balancesByTypeForDeal(dealId);
    return -(balances.get(accountType) ?? 0n);
  }

  describe('THE RATE SNAPSHOT IS IMMUNE TO LATER RATE CHANGES (FR-7.4)', () => {
    test('a new commission_rate_version created AFTER signing does not re-price the deal', async () => {
      const seeded = await seedDeal({ monthlyRent: 1_000_000n, rateBp: 10000 });

      await deals.matchTenant({
        dealId: seeded.deal.id,
        actorPartyId: seeded.foo.id,
      });
      const signed = await deals.signAgreement({
        dealId: seeded.deal.id,
        actorPartyId: seeded.landlord.id,
        agreementId: seeded.agreement.id,
      });

      // frozen at signing
      expect(signed.commissionRateBpSnapshot).toBe(10000);
      expect(signed.monthlyRentSnapshot).toBe(1_000_000n);

      // the company now DOUBLES its standard rate
      await prisma.commissionRateVersion.create({
        data: {
          rateBpOfMonth: 20000,
          effectiveFrom: new Date(),
          createdByPartyId: seeded.admin.id,
          note: 'standard rate doubled after this deal was signed',
        },
      });

      // ...and the tenant moves in and commission is earned
      await deals.fundEscrow({
        dealId: seeded.deal.id,
        actorPartyId: seeded.tenant.id,
        amount: 3_000_000n,
      });
      await deals.confirmMoveIn({
        dealId: seeded.deal.id,
        actorPartyId: seeded.tenant.id,
      });
      const earned = await deals.earnCommission({
        dealId: seeded.deal.id,
        actorPartyId: seeded.admin.id,
      });

      // the deal is priced at the OLD rate — 1,000,000, not 2,000,000
      expect(earned.commissionRateBpSnapshot).toBe(10000);
      expect(earned.commissionAmount).toBe(1_000_000n);
      expect(await creditBalance(seeded.deal.id, 'commission_revenue')).toBe(
        1_000_000n,
      );
    });

    test('editing the LISTING rent after signing does not re-price the deal either', async () => {
      const seeded = await seedDeal({ monthlyRent: 1_000_000n, rateBp: 10000 });

      await deals.matchTenant({
        dealId: seeded.deal.id,
        actorPartyId: seeded.foo.id,
      });
      await deals.signAgreement({
        dealId: seeded.deal.id,
        actorPartyId: seeded.landlord.id,
        agreementId: seeded.agreement.id,
      });

      // landlord triples the asking rent on the listing afterwards
      await prisma.listing.update({
        where: { id: seeded.listing.id },
        data: { monthlyRent: 3_000_000n },
      });

      await deals.fundEscrow({
        dealId: seeded.deal.id,
        actorPartyId: seeded.tenant.id,
        amount: 3_000_000n,
      });
      await deals.confirmMoveIn({
        dealId: seeded.deal.id,
        actorPartyId: seeded.tenant.id,
      });
      const earned = await deals.earnCommission({
        dealId: seeded.deal.id,
        actorPartyId: seeded.admin.id,
      });

      // still priced off the SNAPSHOT
      expect(earned.monthlyRentSnapshot).toBe(1_000_000n);
      expect(earned.commissionAmount).toBe(1_000_000n);
    });

    test('snapshots cannot be re-taken — signing twice is rejected', async () => {
      const seeded = await seedDeal();
      await deals.matchTenant({
        dealId: seeded.deal.id,
        actorPartyId: seeded.foo.id,
      });
      await deals.signAgreement({
        dealId: seeded.deal.id,
        actorPartyId: seeded.landlord.id,
        agreementId: seeded.agreement.id,
      });

      // a second signAgreement is both an illegal transition AND would
      // overwrite the snapshot; it must fail
      await expect(
        deals.signAgreement({
          dealId: seeded.deal.id,
          actorPartyId: seeded.landlord.id,
          agreementId: seeded.agreement.id,
        }),
      ).rejects.toThrow();
    });
  });

  describe('COMMISSION USES MONTHLY RENT, NOT THE ESCROW TOTAL (FR-7.3, Decision 5)', () => {
    test('a 12-month upfront payment yields the SAME commission as a 3-month one', async () => {
      const monthlyRent = 1_000_000n;

      // tenant A pays 3 months + deposit = 4,000,000 into escrow
      const dealA = await fundedDeal({
        monthlyRent,
        rateBp: 10000,
        upfront: 4_000_000n,
      });
      await deals.confirmMoveIn({
        dealId: dealA.deal.id,
        actorPartyId: dealA.tenant.id,
      });
      const earnedA = await deals.earnCommission({
        dealId: dealA.deal.id,
        actorPartyId: dealA.admin.id,
      });

      // tenant B pays 12 months + deposit = 13,000,000 into escrow
      const dealB = await fundedDeal({
        monthlyRent,
        rateBp: 10000,
        upfront: 13_000_000n,
      });
      await deals.confirmMoveIn({
        dealId: dealB.deal.id,
        actorPartyId: dealB.tenant.id,
      });
      const earnedB = await deals.earnCommission({
        dealId: dealB.deal.id,
        actorPartyId: dealB.admin.id,
      });

      // identical commission despite a 3.25x difference in escrow inflow
      expect(earnedA.commissionAmount).toBe(1_000_000n);
      expect(earnedB.commissionAmount).toBe(1_000_000n);
      expect(earnedB.commissionAmount).toBe(earnedA.commissionAmount);

      // and the ledger agrees
      expect(await creditBalance(dealB.deal.id, 'commission_revenue')).toBe(
        1_000_000n,
      );
      // the escrow held 13x the commission, proving the base was not the total
      expect(dealB.upfront).toBe(13_000_000n);
    });
  });

  describe('COMMISSION IS EARNED EXACTLY AT MOVE-IN (FR-7.5)', () => {
    test('no revenue exists at any point before the commission_earned transition', async () => {
      const seeded = await seedDeal();

      // created
      expect(await creditBalance(seeded.deal.id, 'commission_revenue')).toBe(
        0n,
      );

      await deals.matchTenant({
        dealId: seeded.deal.id,
        actorPartyId: seeded.foo.id,
      });
      expect(await creditBalance(seeded.deal.id, 'commission_revenue')).toBe(
        0n,
      );

      await deals.signAgreement({
        dealId: seeded.deal.id,
        actorPartyId: seeded.landlord.id,
        agreementId: seeded.agreement.id,
      });
      expect(await creditBalance(seeded.deal.id, 'commission_revenue')).toBe(
        0n,
      );

      await deals.fundEscrow({
        dealId: seeded.deal.id,
        actorPartyId: seeded.tenant.id,
        amount: 3_000_000n,
      });
      // funded — money is held, but STILL no revenue
      expect(await creditBalance(seeded.deal.id, 'commission_revenue')).toBe(
        0n,
      );
      expect(await creditBalance(seeded.deal.id, 'escrow_liability')).toBe(
        3_000_000n,
      );

      await deals.confirmMoveIn({
        dealId: seeded.deal.id,
        actorPartyId: seeded.tenant.id,
      });
      // moved in, but the earn transition has not fired yet
      expect(await creditBalance(seeded.deal.id, 'commission_revenue')).toBe(
        0n,
      );

      await deals.earnCommission({
        dealId: seeded.deal.id,
        actorPartyId: seeded.admin.id,
      });
      // NOW revenue exists
      expect(await creditBalance(seeded.deal.id, 'commission_revenue')).toBe(
        1_000_000n,
      );
    });

    test('the earn transition posts exactly one recognise_commission entry', async () => {
      const funded = await fundedDeal();
      await deals.confirmMoveIn({
        dealId: funded.deal.id,
        actorPartyId: funded.tenant.id,
      });
      await deals.earnCommission({
        dealId: funded.deal.id,
        actorPartyId: funded.admin.id,
      });

      const revenueEntries = await prisma.ledgerEntry.findMany({
        where: {
          dealId: funded.deal.id,
          account: { accountType: 'commission_revenue' },
        },
      });
      expect(revenueEntries).toHaveLength(1);
      expect(revenueEntries[0].reference).toBe('recognise_commission');
    });
  });

  describe('FUNDS CANNOT BE RELEASED BEFORE MOVE-IN — the guarantee at runtime (FR-8.2)', () => {
    test('settle() on a funded (not moved-in) deal is REJECTED and moves no money', async () => {
      const funded = await fundedDeal();

      const before = await ledger.balancesByTypeForDeal(funded.deal.id);

      await expect(
        deals.settle({
          dealId: funded.deal.id,
          actorPartyId: funded.admin.id,
          totalHeld: funded.upfront,
        }),
      ).rejects.toThrow(IllegalTransitionError);

      // nothing moved: no landlord_payable, no release
      const after = await ledger.balancesByTypeForDeal(funded.deal.id);
      expect(after).toEqual(before);
      expect(await creditBalance(funded.deal.id, 'landlord_payable')).toBe(0n);
      expect(funded.deal.id).toBeDefined();

      // the deal is still sitting at escrow_funded
      const reloaded = await deals.getDeal(funded.deal.id);
      expect(reloaded?.status).toBe('escrow_funded');
    });

    test('earnCommission() before move-in is REJECTED and creates no revenue', async () => {
      const funded = await fundedDeal();

      await expect(
        deals.earnCommission({
          dealId: funded.deal.id,
          actorPartyId: funded.admin.id,
        }),
      ).rejects.toThrow(IllegalTransitionError);

      expect(await creditBalance(funded.deal.id, 'commission_revenue')).toBe(
        0n,
      );
    });

    test('a funded deal CANNOT be cancelled — money must route via refund', async () => {
      const funded = await fundedDeal();

      await expect(
        deals.cancel({
          dealId: funded.deal.id,
          actorPartyId: funded.admin.id,
          reason: 'attempting to strand held funds',
        }),
      ).rejects.toThrow(IllegalTransitionError);

      // the money is still held, not stranded in a terminal state
      expect(await creditBalance(funded.deal.id, 'escrow_liability')).toBe(
        funded.upfront,
      );
      const reloaded = await deals.getDeal(funded.deal.id);
      expect(reloaded?.status).toBe('escrow_funded');
    });

    test('refund from escrow_funded returns the full amount and earns nothing', async () => {
      const funded = await fundedDeal();

      await deals.refund({
        dealId: funded.deal.id,
        actorPartyId: funded.admin.id,
        amount: funded.upfront,
      });

      expect(await creditBalance(funded.deal.id, 'escrow_liability')).toBe(0n);
      expect(await creditBalance(funded.deal.id, 'commission_revenue')).toBe(
        0n,
      );

      const reloaded = await deals.getDeal(funded.deal.id);
      expect(reloaded?.status).toBe('refunded');
    });
  });

  describe('the full happy path settles net of commission (FR-7.6)', () => {
    test('landlord receives upfront − commission; ledger fully discharged', async () => {
      const funded = await fundedDeal({
        monthlyRent: 1_000_000n,
        rateBp: 10000,
        upfront: 4_000_000n,
      });

      await deals.confirmMoveIn({
        dealId: funded.deal.id,
        actorPartyId: funded.tenant.id,
      });
      await deals.earnCommission({
        dealId: funded.deal.id,
        actorPartyId: funded.admin.id,
      });
      const settled = await deals.settle({
        dealId: funded.deal.id,
        actorPartyId: funded.admin.id,
        totalHeld: funded.upfront,
      });
      expect(settled.status).toBe('settled');

      // commission was 1,000,000 → landlord got 3,000,000
      expect(settled.commissionAmount).toBe(1_000_000n);
      expect(await creditBalance(funded.deal.id, 'escrow_liability')).toBe(0n);
      expect(await creditBalance(funded.deal.id, 'landlord_payable')).toBe(0n);
      expect(await creditBalance(funded.deal.id, 'commission_revenue')).toBe(
        1_000_000n,
      );

      const closed = await deals.close({
        dealId: funded.deal.id,
        actorPartyId: funded.admin.id,
      });
      expect(closed.status).toBe('closed');
      expect(await ledger.everyPostingBalances()).toBe(true);
    });
  });

  describe('illegal transitions are rejected and leave no trace (FR-8.1)', () => {
    test('a rejected transition writes no deal_transition row and does not change status', async () => {
      const seeded = await seedDeal();

      const historyBefore = await deals.getTransitionHistory(seeded.deal.id);

      await expect(
        deals.confirmMoveIn({
          dealId: seeded.deal.id,
          actorPartyId: seeded.tenant.id,
        }),
      ).rejects.toThrow(IllegalTransitionError);

      const historyAfter = await deals.getTransitionHistory(seeded.deal.id);
      expect(historyAfter).toHaveLength(historyBefore.length);

      const reloaded = await deals.getDeal(seeded.deal.id);
      expect(reloaded?.status).toBe('created');
    });

    test('every legal transition writes exactly one immutable audit row', async () => {
      const funded = await fundedDeal();
      await deals.confirmMoveIn({
        dealId: funded.deal.id,
        actorPartyId: funded.tenant.id,
      });

      const history = await deals.getTransitionHistory(funded.deal.id);
      expect(history.map((h) => [h.fromStatus, h.toStatus])).toEqual([
        ['created', 'tenant_matched'],
        ['tenant_matched', 'agreement_signed'],
        ['agreement_signed', 'escrow_funded'],
        ['escrow_funded', 'move_in_confirmed'],
      ]);

      // and the rows are immutable
      await expect(
        prisma.$executeRawUnsafe(
          `UPDATE "deal_transition" SET to_status = 'settled' WHERE id = $1`,
          history[0].id,
        ),
      ).rejects.toThrow();
    });
  });

  describe('state change and ledger effect are atomic (Technical Architecture §8)', () => {
    test('a deal cannot reach escrow_funded without its ledger posting', async () => {
      const funded = await fundedDeal();

      const reloaded = await deals.getDeal(funded.deal.id);
      expect(reloaded?.status).toBe('escrow_funded');

      // the posting exists and matches
      const entries = await prisma.ledgerEntry.findMany({
        where: { dealId: funded.deal.id, reference: 'fund_escrow' },
      });
      expect(entries).toHaveLength(2);
      expect(await creditBalance(funded.deal.id, 'escrow_liability')).toBe(
        funded.upfront,
      );
    });
  });
});
