import { Test } from '@nestjs/testing';
import { LedgerAccountType } from '@prisma/client';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import { LedgerModule } from './ledger.module';
import { LedgerService } from './ledger.service';
import { EscrowService } from './escrow.service';
import {
  EmptyPostingError,
  InvalidAmountError,
  UnbalancedPostingError,
} from './ledger.types';

/**
 * Stage 2 acceptance tests (FR-7.2, Data_Model.md §8, §12 rules 1-3).
 *
 * These assert the actual money invariants, not "it runs":
 *   - escrow inflow creates a LIABILITY and NO revenue;
 *   - commission revenue appears only at the recognise step;
 *   - every posting balances (including a randomised property test);
 *   - a refund fully unwinds the held escrow;
 *   - posted entries cannot be mutated;
 *   - unbalanced / non-positive / single-leg postings are rejected BEFORE
 *     any row is written.
 */
describe('Double-entry ledger (Stage 2)', () => {
  let ledger: LedgerService;
  let escrow: EscrowService;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PrismaModule, LedgerModule],
    }).compile();

    ledger = moduleRef.get(LedgerService);
    escrow = moduleRef.get(EscrowService);
    prisma = moduleRef.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  /** Creates a real deal row so postings can be deal-scoped like production. */
  async function makeDeal() {
    const suffix = `${Date.now()}${Math.floor(Math.random() * 100000)}`;
    const tenant = await prisma.party.create({
      data: { displayName: 'Ledger Tenant', primaryPhone: `+2568${suffix}a` },
    });
    const landlord = await prisma.party.create({
      data: { displayName: 'Ledger Landlord', primaryPhone: `+2568${suffix}b` },
    });
    const neighbourhood = await prisma.neighbourhood.create({
      data: { name: `LedgerHood-${suffix}` },
    });
    const property = await prisma.property.create({
      data: {
        ownerPartyId: landlord.id,
        propertyType: 'apartment',
        bedrooms: 2,
        bathrooms: 1,
        furnished: 'furnished',
        neighbourhoodId: neighbourhood.id,
        landmarkText: 'ledger test property',
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
    return prisma.deal.create({
      data: {
        listingId: listing.id,
        tenantPartyId: tenant.id,
        landlordPartyId: landlord.id,
      },
    });
  }

  /** Natural-side magnitude of a credit-natural account (credits − debits). */
  async function creditBalance(dealId: string, accountType: LedgerAccountType) {
    const balances = await ledger.balancesByTypeForDeal(dealId);
    // balancesByTypeForDeal returns debits − credits; negate for credit-natural accounts
    return -(balances.get(accountType) ?? 0n);
  }

  describe('the balance invariant is enforced before any row is written', () => {
    test('an unbalanced posting is REJECTED and writes nothing', async () => {
      const deal = await makeDeal();
      const a = await ledger.createAccount({
        accountType: 'psp_clearing',
        dealId: deal.id,
      });
      const b = await ledger.createAccount({
        accountType: 'escrow_liability',
        dealId: deal.id,
      });

      await expect(
        ledger.post({
          legs: [
            { accountId: a.id, direction: 'debit', amount: 1_000_000n },
            { accountId: b.id, direction: 'credit', amount: 999_999n }, // off by one shilling
          ],
          reference: 'deliberately_unbalanced',
          dealId: deal.id,
        }),
      ).rejects.toThrow(UnbalancedPostingError);

      // nothing was written
      const entries = await prisma.ledgerEntry.findMany({
        where: { dealId: deal.id },
      });
      expect(entries).toHaveLength(0);
    });

    test('a zero or negative leg amount is REJECTED (direction carries the sign)', async () => {
      const deal = await makeDeal();
      const a = await ledger.createAccount({
        accountType: 'psp_clearing',
        dealId: deal.id,
      });
      const b = await ledger.createAccount({
        accountType: 'escrow_liability',
        dealId: deal.id,
      });

      await expect(
        ledger.post({
          legs: [
            { accountId: a.id, direction: 'debit', amount: 0n },
            { accountId: b.id, direction: 'credit', amount: 0n },
          ],
          reference: 'zero_amount',
          dealId: deal.id,
        }),
      ).rejects.toThrow(InvalidAmountError);

      await expect(
        ledger.post({
          legs: [
            { accountId: a.id, direction: 'debit', amount: -500n },
            { accountId: b.id, direction: 'credit', amount: -500n },
          ],
          reference: 'negative_amount',
          dealId: deal.id,
        }),
      ).rejects.toThrow(InvalidAmountError);

      const entries = await prisma.ledgerEntry.findMany({
        where: { dealId: deal.id },
      });
      expect(entries).toHaveLength(0);
    });

    test('a single-leg posting is REJECTED (double-entry requires at least two legs)', async () => {
      const deal = await makeDeal();
      const a = await ledger.createAccount({
        accountType: 'psp_clearing',
        dealId: deal.id,
      });

      await expect(
        ledger.post({
          legs: [{ accountId: a.id, direction: 'debit', amount: 1_000n }],
          reference: 'single_leg',
          dealId: deal.id,
        }),
      ).rejects.toThrow(EmptyPostingError);
    });

    /**
     * Generates a guaranteed-balanced multi-leg posting: one debit for the
     * total, and 1-4 credits that sum to exactly that total. Splitting is
     * done in bigint throughout so no float rounding can make it "nearly"
     * balance.
     */
    function randomBalancedLegs(
      debitAccountId: string,
      creditAccountId: string,
    ) {
      const total = BigInt(Math.floor(Math.random() * 5_000_000) + 4);
      const creditLegCount = Math.floor(Math.random() * 4) + 1;

      const credits: bigint[] = [];
      let remaining = total;
      for (let i = 0; i < creditLegCount - 1; i++) {
        // leave at least 1 shilling for each remaining leg
        const maxThisLeg = remaining - BigInt(creditLegCount - 1 - i);
        const portion =
          maxThisLeg > 1n
            ? (BigInt(Math.floor(Math.random() * 1000)) * maxThisLeg) / 1000n ||
              1n
            : 1n;
        credits.push(portion);
        remaining -= portion;
      }
      credits.push(remaining); // last leg absorbs the exact remainder

      return {
        total,
        legs: [
          {
            accountId: debitAccountId,
            direction: 'debit' as const,
            amount: total,
          },
          ...credits.map((amount) => ({
            accountId: creditAccountId,
            direction: 'credit' as const,
            amount,
          })),
        ],
      };
    }

    test('property test (2000 cases): the balance guard accepts every balanced posting and rejects every one-shilling perturbation', () => {
      // Tests `validate()` directly — the exact guard `post()` runs first —
      // so the invariant is exercised across thousands of randomised shapes
      // without a DB round-trip per case.
      let accepted = 0;
      let rejected = 0;

      for (let i = 0; i < 2000; i++) {
        const { legs } = randomBalancedLegs('acct-debit', 'acct-credit');

        // the generator really is balanced, verified in bigint
        const net = legs.reduce(
          (acc, l) =>
            l.direction === 'debit' ? acc + l.amount : acc - l.amount,
          0n,
        );
        expect(net).toBe(0n);

        // balanced → accepted
        expect(() =>
          ledger.validate({ legs, reference: 'prop_balanced' }),
        ).not.toThrow();
        accepted++;

        // perturbed by exactly one shilling → rejected as unbalanced
        const perturbed = legs.map((l, idx) =>
          idx === 0 ? { ...l, amount: l.amount + 1n } : l,
        );
        expect(() =>
          ledger.validate({ legs: perturbed, reference: 'prop_unbalanced' }),
        ).toThrow(UnbalancedPostingError);
        rejected++;
      }

      expect(accepted).toBe(2000);
      expect(rejected).toBe(2000);
    });

    test('property test (persisted, 25 cases): randomised balanced postings all commit and the whole ledger still balances', async () => {
      const deal = await makeDeal();
      const a = await ledger.createAccount({
        accountType: 'psp_clearing',
        dealId: deal.id,
      });
      const b = await ledger.createAccount({
        accountType: 'escrow_liability',
        dealId: deal.id,
      });

      let expectedDebitTotal = 0n;
      for (let i = 0; i < 25; i++) {
        const { total, legs } = randomBalancedLegs(a.id, b.id);
        await ledger.post({
          legs,
          reference: `prop_persisted_${i}`,
          dealId: deal.id,
        });
        expectedDebitTotal += total;
      }

      // every posting committed (no silent skips)
      const postings = await prisma.ledgerEntry.findMany({
        where: { dealId: deal.id },
        select: { postingId: true },
        distinct: ['postingId'],
      });
      expect(postings).toHaveLength(25);

      // the accounts net to exactly the sum of what we posted
      const balances = await ledger.balancesByTypeForDeal(deal.id);
      expect(balances.get('psp_clearing')).toBe(expectedDebitTotal);
      expect(balances.get('escrow_liability')).toBe(-expectedDebitTotal);

      expect(await ledger.everyPostingBalances()).toBe(true);
    });
  });

  describe('escrow inflow is a LIABILITY, never revenue (FR-7.2, SSOT Decision 7)', () => {
    test('fundEscrow credits escrow_liability and touches NO revenue account', async () => {
      const deal = await makeDeal();
      const upfront = 3_000_000n; // 3 months at 1,000,000

      await escrow.fundEscrow({ dealId: deal.id, amount: upfront });

      const balances = await ledger.balancesByTypeForDeal(deal.id);

      // liability is credit-natural: debits − credits === −upfront
      expect(balances.get('escrow_liability')).toBe(-upfront);
      // psp_clearing is debit-natural: value is held at the custodian
      expect(balances.get('psp_clearing')).toBe(upfront);

      // THE critical assertion: no revenue exists at fund time
      expect(balances.get('commission_revenue')).toBeUndefined();

      const revenueEntries = await prisma.ledgerEntry.findMany({
        where: {
          dealId: deal.id,
          account: { accountType: 'commission_revenue' },
        },
      });
      expect(revenueEntries).toHaveLength(0);
    });

    test('funding a large multi-month upfront still creates zero revenue', async () => {
      const deal = await makeDeal();
      const twelveMonthsPlusDeposit = 13_000_000n;

      await escrow.fundEscrow({
        dealId: deal.id,
        amount: twelveMonthsPlusDeposit,
      });

      const revenueEntries = await prisma.ledgerEntry.findMany({
        where: {
          dealId: deal.id,
          account: { accountType: 'commission_revenue' },
        },
      });
      expect(revenueEntries).toHaveLength(0);
      expect(await creditBalance(deal.id, 'escrow_liability')).toBe(
        twelveMonthsPlusDeposit,
      );
    });
  });

  describe('commission revenue is recognised ONLY at the recognise step (FR-7.5)', () => {
    test('revenue is zero after funding, and exactly the commission after recognising', async () => {
      const deal = await makeDeal();
      const upfront = 3_000_000n;
      const commission = 1_000_000n; // one month's rent, computed by Deals (Stage 3)

      await escrow.fundEscrow({ dealId: deal.id, amount: upfront });
      expect(await creditBalance(deal.id, 'commission_revenue')).toBe(0n);

      await escrow.recogniseCommission({ dealId: deal.id, amount: commission });

      expect(await creditBalance(deal.id, 'commission_revenue')).toBe(
        commission,
      );
      // liability reduced by exactly the commission; the rest is still owed onward
      expect(await creditBalance(deal.id, 'escrow_liability')).toBe(
        upfront - commission,
      );
    });

    test('the recognise posting is the only one that credits revenue', async () => {
      const deal = await makeDeal();
      await escrow.fundEscrow({ dealId: deal.id, amount: 3_000_000n });
      await escrow.recogniseCommission({ dealId: deal.id, amount: 1_000_000n });
      await escrow.settle({ dealId: deal.id, amount: 2_000_000n });
      await escrow.releaseToLandlord({ dealId: deal.id, amount: 2_000_000n });

      const revenueEntries = await prisma.ledgerEntry.findMany({
        where: {
          dealId: deal.id,
          account: { accountType: 'commission_revenue' },
        },
      });

      expect(revenueEntries).toHaveLength(1);
      expect(revenueEntries[0].reference).toBe('recognise_commission');
      expect(revenueEntries[0].direction).toBe('credit');
    });
  });

  describe('the full settlement path nets out correctly', () => {
    test('fund → recognise → settle → release leaves liability zero, revenue = commission, psp net = landlord payout', async () => {
      const deal = await makeDeal();
      const upfront = 3_000_000n;
      const commission = 1_000_000n;
      const toLandlord = upfront - commission; // 2,000,000

      await escrow.fundEscrow({ dealId: deal.id, amount: upfront });
      await escrow.recogniseCommission({ dealId: deal.id, amount: commission });
      await escrow.settle({ dealId: deal.id, amount: toLandlord });
      await escrow.releaseToLandlord({ dealId: deal.id, amount: toLandlord });

      // tenant's money is fully discharged: nothing left owed as escrow
      expect(await creditBalance(deal.id, 'escrow_liability')).toBe(0n);
      // landlord has been paid out: payable cleared
      expect(await creditBalance(deal.id, 'landlord_payable')).toBe(0n);
      // we earned exactly the commission
      expect(await creditBalance(deal.id, 'commission_revenue')).toBe(
        commission,
      );
      // custodian still holds the commission portion (ours), having released the rest
      const balances = await ledger.balancesByTypeForDeal(deal.id);
      expect(balances.get('psp_clearing')).toBe(upfront - toLandlord); // = commission

      expect(await ledger.everyPostingBalances()).toBe(true);
    });
  });

  describe('refund fully unwinds a held escrow (FR-7.7)', () => {
    test('a pre-move-in refund returns the full held amount and leaves zero liability and zero revenue', async () => {
      const deal = await makeDeal();
      const upfront = 4_500_000n;

      await escrow.fundEscrow({ dealId: deal.id, amount: upfront });
      expect(await creditBalance(deal.id, 'escrow_liability')).toBe(upfront);

      await escrow.refund({ dealId: deal.id, amount: upfront });

      // liability fully unwound
      expect(await creditBalance(deal.id, 'escrow_liability')).toBe(0n);
      // money left the custodian back to the tenant: psp_clearing nets to zero
      const balances = await ledger.balancesByTypeForDeal(deal.id);
      expect(balances.get('psp_clearing')).toBe(0n);
      // and crucially: a refunded deal earned NOTHING
      expect(await creditBalance(deal.id, 'commission_revenue')).toBe(0n);

      expect(await ledger.everyPostingBalances()).toBe(true);
    });
  });

  describe('posted entries are immutable; corrections are reversing postings', () => {
    test('no ledger operation mutates a posted entry — the DB rejects UPDATE and DELETE', async () => {
      const deal = await makeDeal();
      await escrow.fundEscrow({ dealId: deal.id, amount: 1_000_000n });

      const entry = await prisma.ledgerEntry.findFirstOrThrow({
        where: { dealId: deal.id },
      });

      await expect(
        prisma.$executeRawUnsafe(
          `UPDATE "ledger_entry" SET amount = 1 WHERE id = $1`,
          entry.id,
        ),
      ).rejects.toThrow();

      await expect(
        prisma.$executeRawUnsafe(
          `DELETE FROM "ledger_entry" WHERE id = $1`,
          entry.id,
        ),
      ).rejects.toThrow();

      // the row is untouched
      const after = await prisma.ledgerEntry.findUniqueOrThrow({
        where: { id: entry.id },
      });
      expect(after.amount).toBe(entry.amount);
    });

    test('reverse() writes an opposite-direction posting and nets the accounts back to zero', async () => {
      const deal = await makeDeal();
      const postingId = await escrow.fundEscrow({
        dealId: deal.id,
        amount: 2_000_000n,
      });

      expect(await creditBalance(deal.id, 'escrow_liability')).toBe(2_000_000n);

      await ledger.reverse(postingId, 'posted_in_error');

      expect(await creditBalance(deal.id, 'escrow_liability')).toBe(0n);
      const balances = await ledger.balancesByTypeForDeal(deal.id);
      expect(balances.get('psp_clearing')).toBe(0n);

      // the original entries still exist — the correction added rows, it did not erase any
      const entries = await prisma.ledgerEntry.findMany({
        where: { dealId: deal.id },
      });
      expect(entries).toHaveLength(4); // 2 original legs + 2 reversal legs
      expect(await ledger.everyPostingBalances()).toBe(true);
    });
  });

  describe('money is integer shillings throughout', () => {
    test('amounts round-trip as bigint with no float precision loss at large values', async () => {
      const deal = await makeDeal();
      // deliberately beyond IEEE-754 safe integer range (2^53 − 1) to prove
      // no float ever touches the value on the way to or from the DB
      const huge = 9_007_199_254_740_993n; // 2^53 + 1

      await escrow.fundEscrow({ dealId: deal.id, amount: huge });

      const entry = await prisma.ledgerEntry.findFirstOrThrow({
        where: {
          dealId: deal.id,
          reference: 'fund_escrow',
          direction: 'credit',
        },
      });

      expect(typeof entry.amount).toBe('bigint');
      expect(entry.amount).toBe(huge);
      expect(await creditBalance(deal.id, 'escrow_liability')).toBe(huge);
    });
  });

  describe('postings are atomic with the caller transaction (Technical Architecture §8)', () => {
    test('a posting made inside a caller transaction ROLLS BACK with it — no orphaned ledger rows', async () => {
      const deal = await makeDeal();

      await expect(
        prisma.$transaction(async (tx) => {
          await escrow.fundEscrow({ dealId: deal.id, amount: 5_000_000n }, tx);

          // the posting is visible inside the transaction
          const inside = await tx.ledgerEntry.findMany({
            where: { dealId: deal.id },
          });
          expect(inside).toHaveLength(2);

          // something downstream fails — e.g. a deal-state guard rejecting
          throw new Error('simulated downstream failure');
        }),
      ).rejects.toThrow('simulated downstream failure');

      // the ledger effect was rolled back with the caller's transaction:
      // money state and deal state can never diverge
      const after = await prisma.ledgerEntry.findMany({
        where: { dealId: deal.id },
      });
      expect(after).toHaveLength(0);
    });

    test('a posting made inside a caller transaction that COMMITS is persisted', async () => {
      const deal = await makeDeal();

      await prisma.$transaction(async (tx) => {
        await escrow.fundEscrow({ dealId: deal.id, amount: 5_000_000n }, tx);
      });

      const after = await prisma.ledgerEntry.findMany({
        where: { dealId: deal.id },
      });
      expect(after).toHaveLength(2);
      expect(await creditBalance(deal.id, 'escrow_liability')).toBe(5_000_000n);
    });
  });
});
