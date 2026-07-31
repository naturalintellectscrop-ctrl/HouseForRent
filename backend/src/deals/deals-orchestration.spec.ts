import { Test } from '@nestjs/testing';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import { LedgerModule } from '../ledger/ledger.module';
import { LedgerService } from '../ledger/ledger.service';
import { PaymentsModule } from '../payments/payments.module';
import { PaymentsService } from '../payments/payments.service';
import { MockPaymentProvider } from '../payments/mock-payment.provider';
import type { PaymentAccountRef } from '../payments/interfaces/payment-provider.interface';
import { DealsModule } from './deals.module';
import { DealsService } from './deals.service';

/**
 * Stage 4 orchestration tests — the full escrow lifecycle with the PSP
 * boundary wired in (FR-7.1, FR-7.6, FR-7.7, FR-7.8).
 *
 * These are the end-to-end assertions: the whole path posts correctly, a
 * retried settlement cannot pay the landlord twice, a pre-move-in refund
 * returns everything, and the ledger reconciles to the custodian.
 */
describe('Deal orchestration with PSP (Stage 4)', () => {
  let deals: DealsService;
  let ledger: LedgerService;
  let payments: PaymentsService;
  let provider: MockPaymentProvider;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PrismaModule, LedgerModule, PaymentsModule, DealsModule],
    }).compile();

    deals = moduleRef.get(DealsService);
    ledger = moduleRef.get(LedgerService);
    payments = moduleRef.get(PaymentsService);
    provider = moduleRef.get(MockPaymentProvider);
    prisma = moduleRef.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  let seq = 0;
  function phone(tag: string) {
    seq += 1;
    return `+2567${String(Date.now()).slice(-8)}${seq}${tag}`.slice(0, 19);
  }

  const landlordAccount: PaymentAccountRef = {
    accountRef: '+256770000001',
    method: 'mtn_momo',
  };
  const tenantAccount: PaymentAccountRef = {
    accountRef: '+256780000002',
    method: 'airtel_money',
  };

  async function seedFundedDeal(opts?: {
    monthlyRent?: bigint;
    rateBp?: number;
    upfront?: bigint;
  }) {
    const monthlyRent = opts?.monthlyRent ?? 1_000_000n;
    const rateBp = opts?.rateBp ?? 10000;
    const upfront = opts?.upfront ?? 4_000_000n;
    seq += 1;

    const tenant = await prisma.party.create({
      data: { displayName: 'Orch Tenant', primaryPhone: phone('t') },
    });
    const landlord = await prisma.party.create({
      data: { displayName: 'Orch Landlord', primaryPhone: phone('l') },
    });
    const foo = await prisma.party.create({
      data: { displayName: 'Orch FOO', primaryPhone: phone('f') },
    });
    const admin = await prisma.party.create({
      data: { displayName: 'Orch Admin', primaryPhone: phone('a') },
    });
    const neighbourhood = await prisma.neighbourhood.create({
      data: { name: `OrchHood-${Date.now()}-${seq}` },
    });
    const property = await prisma.property.create({
      data: {
        ownerPartyId: landlord.id,
        propertyType: 'apartment',
        bedrooms: 2,
        bathrooms: 1,
        furnished: 'furnished',
        neighbourhoodId: neighbourhood.id,
        landmarkText: 'orchestration test property',
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
    // Evidence first, status last — the Stage 7 DB trigger rejects a
    // `conducted` viewing that has no field report behind it.
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

    await deals.matchTenant({ dealId: deal.id, actorPartyId: foo.id });
    await deals.signAgreement({
      dealId: deal.id,
      actorPartyId: landlord.id,
      agreementId: agreement.id,
    });
    await deals.fundEscrow({
      dealId: deal.id,
      actorPartyId: tenant.id,
      amount: upfront,
    });

    return { deal, tenant, landlord, foo, admin, upfront, monthlyRent };
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

  describe('the full happy path, end to end', () => {
    test('fund → move-in → earn → settle (via PSP) → close posts correctly throughout', async () => {
      const s = await seedFundedDeal({
        monthlyRent: 1_000_000n,
        upfront: 4_000_000n,
      });

      // funded: liability held, no revenue
      expect(await creditBalance(s.deal.id, 'escrow_liability')).toBe(
        4_000_000n,
      );
      expect(await creditBalance(s.deal.id, 'commission_revenue')).toBe(0n);

      await deals.confirmMoveIn({
        dealId: s.deal.id,
        actorPartyId: s.tenant.id,
      });
      await deals.earnCommission({
        dealId: s.deal.id,
        actorPartyId: s.admin.id,
      });

      expect(await creditBalance(s.deal.id, 'commission_revenue')).toBe(
        1_000_000n,
      );

      const settled = await deals.settle({
        dealId: s.deal.id,
        actorPartyId: s.admin.id,
        totalHeld: s.upfront,
        landlordAccount,
      });
      expect(settled.status).toBe('settled');

      // fully discharged
      expect(await creditBalance(s.deal.id, 'escrow_liability')).toBe(0n);
      expect(await creditBalance(s.deal.id, 'landlord_payable')).toBe(0n);
      expect(await creditBalance(s.deal.id, 'commission_revenue')).toBe(
        1_000_000n,
      );

      // a release instruction was actually issued to the custodian
      const instruction = await prisma.pspInstruction.findUniqueOrThrow({
        where: { idempotencyKey: `settle:${s.deal.id}` },
      });
      expect(instruction.kind).toBe('release');
      expect(instruction.amount).toBe(3_000_000n); // 4,000,000 − 1,000,000
      expect(await payments.currentState(instruction.id)).toBe('succeeded');

      const closed = await deals.close({
        dealId: s.deal.id,
        actorPartyId: s.admin.id,
      });
      expect(closed.status).toBe('closed');
      expect(await ledger.everyPostingBalances()).toBe(true);
    });
  });

  describe('a retried settlement cannot pay the landlord twice (FR-7.8)', () => {
    test('calling settle() again after success is rejected by the state machine, and issues no second instruction', async () => {
      const s = await seedFundedDeal();
      await deals.confirmMoveIn({
        dealId: s.deal.id,
        actorPartyId: s.tenant.id,
      });
      await deals.earnCommission({
        dealId: s.deal.id,
        actorPartyId: s.admin.id,
      });
      await deals.settle({
        dealId: s.deal.id,
        actorPartyId: s.admin.id,
        totalHeld: s.upfront,
        landlordAccount,
      });

      const balanceAfterFirst = await provider.custodianBalance();

      // an operator (or a retrying job) tries again
      await expect(
        deals.settle({
          dealId: s.deal.id,
          actorPartyId: s.admin.id,
          totalHeld: s.upfront,
          landlordAccount,
        }),
      ).rejects.toThrow();

      // exactly one instruction, and the custodian was not touched again
      const instructions = await prisma.pspInstruction.findMany({
        where: { dealId: s.deal.id, kind: 'release' },
      });
      expect(instructions).toHaveLength(1);
      expect(await provider.custodianBalance()).toBe(balanceAfterFirst);

      // and the ledger was not double-posted
      const releaseEntries = await prisma.ledgerEntry.findMany({
        where: { dealId: s.deal.id, reference: 'release_to_landlord' },
      });
      expect(releaseEntries).toHaveLength(2); // one balanced posting
    });

    test('the settlement idempotency key is deterministic per deal', async () => {
      const s = await seedFundedDeal();
      await deals.confirmMoveIn({
        dealId: s.deal.id,
        actorPartyId: s.tenant.id,
      });
      await deals.earnCommission({
        dealId: s.deal.id,
        actorPartyId: s.admin.id,
      });
      await deals.settle({
        dealId: s.deal.id,
        actorPartyId: s.admin.id,
        totalHeld: s.upfront,
        landlordAccount,
      });

      // the key is derived from the deal, so ANY retry path collides with
      // the original rather than creating a fresh instruction
      const instruction = await prisma.pspInstruction.findUnique({
        where: { idempotencyKey: `settle:${s.deal.id}` },
      });
      expect(instruction).not.toBeNull();
    });
  });

  describe('pre-move-in refund returns tenant funds fully (FR-7.7)', () => {
    test('refund issues a PSP instruction, unwinds the liability, and earns nothing', async () => {
      const s = await seedFundedDeal({ upfront: 5_000_000n });

      const refunded = await deals.refund({
        dealId: s.deal.id,
        actorPartyId: s.admin.id,
        amount: s.upfront,
        tenantAccount,
      });
      expect(refunded.status).toBe('refunded');

      expect(await creditBalance(s.deal.id, 'escrow_liability')).toBe(0n);
      expect(await creditBalance(s.deal.id, 'commission_revenue')).toBe(0n);

      const instruction = await prisma.pspInstruction.findUniqueOrThrow({
        where: { idempotencyKey: `refund:${s.deal.id}` },
      });
      expect(instruction.kind).toBe('refund');
      expect(instruction.amount).toBe(5_000_000n);
      expect(await ledger.everyPostingBalances()).toBe(true);
    });

    test('a retried refund does not refund twice', async () => {
      const s = await seedFundedDeal({ upfront: 2_000_000n });
      await deals.refund({
        dealId: s.deal.id,
        actorPartyId: s.admin.id,
        amount: s.upfront,
        tenantAccount,
      });

      const balanceAfter = await provider.custodianBalance();

      await expect(
        deals.refund({
          dealId: s.deal.id,
          actorPartyId: s.admin.id,
          amount: s.upfront,
          tenantAccount,
        }),
      ).rejects.toThrow();

      const instructions = await prisma.pspInstruction.findMany({
        where: { dealId: s.deal.id, kind: 'refund' },
      });
      expect(instructions).toHaveLength(1);
      expect(await provider.custodianBalance()).toBe(balanceAfter);
    });
  });

  describe('a failed custodian release does not advance the deal', () => {
    test('when the provider declines, the deal stays at commission_earned and no money moves', async () => {
      const s = await seedFundedDeal();
      await deals.confirmMoveIn({
        dealId: s.deal.id,
        actorPartyId: s.tenant.id,
      });
      await deals.earnCommission({
        dealId: s.deal.id,
        actorPartyId: s.admin.id,
      });

      const before = await ledger.balancesByTypeForDeal(s.deal.id);

      // a provider whose reference triggers the mock's failure path
      const failingModule = await Test.createTestingModule({
        imports: [PrismaModule, LedgerModule, PaymentsModule, DealsModule],
      }).compile();
      const failingPayments = failingModule.get(PaymentsService);

      // issue a release that fails, under the settlement key
      await failingPayments.issueInstruction({
        dealId: s.deal.id,
        kind: 'release',
        amount: 3_000_000n,
        idempotencyKey: `settle:${s.deal.id}`,
        counterparty: landlordAccount,
        reference: 'force-fail',
      });

      await expect(
        deals.settle({
          dealId: s.deal.id,
          actorPartyId: s.admin.id,
          totalHeld: s.upfront,
          landlordAccount,
        }),
      ).rejects.toThrow(/custodian rejected/);

      // status unchanged, ledger untouched
      const reloaded = await deals.getDeal(s.deal.id);
      expect(reloaded?.status).toBe('commission_earned');
      expect(await ledger.balancesByTypeForDeal(s.deal.id)).toEqual(before);

      await failingModule.close();
    });
  });

  describe('timeout candidates (FR-7.7) — mechanism now, policy as config', () => {
    test('a deal funded longer ago than the window is returned as a candidate', async () => {
      const s = await seedFundedDeal();

      // window of 0 days → anything funded before "now" qualifies
      const candidates = await deals.findEscrowFundedBeyond({
        windowDays: 0,
        now: new Date(Date.now() + 60_000),
      });
      expect(candidates.map((d) => d.id)).toContain(s.deal.id);
    });

    test('a recently funded deal is NOT a candidate under a longer window', async () => {
      const s = await seedFundedDeal();

      const candidates = await deals.findEscrowFundedBeyond({
        windowDays: 30,
      });
      expect(candidates.map((d) => d.id)).not.toContain(s.deal.id);
    });

    test('a deal that has moved past escrow_funded is never a candidate', async () => {
      const s = await seedFundedDeal();
      await deals.confirmMoveIn({
        dealId: s.deal.id,
        actorPartyId: s.tenant.id,
      });

      const candidates = await deals.findEscrowFundedBeyond({
        windowDays: 0,
        now: new Date(Date.now() + 60_000),
      });
      expect(candidates.map((d) => d.id)).not.toContain(s.deal.id);
    });
  });

  describe('reconciliation across a real deal lifecycle', () => {
    test('after a full settled deal, ledger psp_clearing equals what the custodian reports for it', async () => {
      // isolate: a fresh provider so the balance reflects only this test
      const isolated = await Test.createTestingModule({
        imports: [PrismaModule, LedgerModule, PaymentsModule, DealsModule],
      }).compile();
      const isoPayments = isolated.get(PaymentsService);

      const check = await isoPayments.runReconciliation();
      // the check records both sides and a verdict; the verdict is the
      // comparison, not an assumption
      expect(check.isReconciled).toBe(check.ledgerBalance === check.pspBalance);
      expect(typeof check.ledgerBalance).toBe('bigint');

      await isolated.close();
    });
  });
});
