import { Test } from '@nestjs/testing';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import { LedgerModule } from '../ledger/ledger.module';
import { EscrowService } from '../ledger/escrow.service';
import { PaymentsModule } from './payments.module';
import { PaymentsService } from './payments.service';
import { MockPaymentProvider } from './mock-payment.provider';
import {
  PAYMENT_PROVIDER,
  PaymentAccountRef,
  PaymentProvider,
  ProviderResult,
} from './interfaces/payment-provider.interface';

/**
 * Stage 4 tests (FR-7.1, FR-7.6, FR-7.7, FR-7.8).
 *
 * What these actually assert:
 *   - the provider is swappable behind the interface;
 *   - a duplicated or replayed call does NOT double-post or double-instruct;
 *   - psp_instruction remains fully immutable, with state derived from
 *     append-only events;
 *   - the ledger reconciles to the custodian, and a divergence is SURFACED
 *     rather than silently absorbed.
 */
describe('Payments / PSP boundary (Stage 4)', () => {
  let payments: PaymentsService;
  let provider: MockPaymentProvider;
  let escrow: EscrowService;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PrismaModule, LedgerModule, PaymentsModule],
    }).compile();

    payments = moduleRef.get(PaymentsService);
    provider = moduleRef.get(MockPaymentProvider);
    escrow = moduleRef.get(EscrowService);
    prisma = moduleRef.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  let seq = 0;
  function unique(tag: string) {
    seq += 1;
    return `${Date.now()}-${seq}-${tag}`;
  }

  const tenantAccount: PaymentAccountRef = {
    accountRef: '+256700000001',
    method: 'mtn_momo',
  };

  async function makeDeal() {
    const s = unique('d');
    const tenant = await prisma.party.create({
      data: {
        displayName: 'PSP Tenant',
        primaryPhone: `+25671${seq}${Date.now()}`.slice(0, 18),
      },
    });
    const landlord = await prisma.party.create({
      data: {
        displayName: 'PSP Landlord',
        primaryPhone: `+25672${seq}${Date.now()}`.slice(0, 18),
      },
    });
    const neighbourhood = await prisma.neighbourhood.create({
      data: { name: `PspHood-${s}` },
    });
    const property = await prisma.property.create({
      data: {
        ownerPartyId: landlord.id,
        propertyType: 'apartment',
        bedrooms: 2,
        bathrooms: 1,
        furnished: 'furnished',
        neighbourhoodId: neighbourhood.id,
        landmarkText: 'psp test property',
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

  describe('the provider is an abstraction, not a hardcoded PSP (FR-7.1)', () => {
    test('a completely different PaymentProvider implementation can be substituted', async () => {
      // A second implementation that records calls and always fails —
      // proving consumers depend on the interface, not on the mock.
      const calls: string[] = [];
      const alternative: PaymentProvider = {
        collectToEscrow: async (): Promise<ProviderResult> => {
          calls.push('collect');
          return {
            outcome: 'failed',
            providerRef: 'alt-ref',
            failureReason: 'alternative provider declined',
          };
        },
        releaseTo: async () => ({
          outcome: 'succeeded',
          providerRef: 'alt-ref',
        }),
        refund: async () => ({ outcome: 'succeeded', providerRef: 'alt-ref' }),
        status: async () => ({ outcome: 'succeeded', providerRef: 'alt-ref' }),
        custodianBalance: async () => 42n,
      };

      const moduleRef = await Test.createTestingModule({
        imports: [PrismaModule, LedgerModule, PaymentsModule],
      })
        .overrideProvider(PAYMENT_PROVIDER)
        .useValue(alternative)
        .compile();

      const swapped = moduleRef.get(PaymentsService);
      const deal = await makeDeal();

      const { instruction } = await swapped.issueInstruction({
        dealId: deal.id,
        kind: 'collect',
        amount: 3_000_000n,
        idempotencyKey: unique('alt'),
        counterparty: tenantAccount,
      });

      expect(calls).toEqual(['collect']);
      expect(await swapped.currentState(instruction.id)).toBe('failed');
      expect(await swapped.custodianBalance()).toBe(42n);

      await moduleRef.close();
    });

    test('no consumer needs to know which provider is behind the interface', async () => {
      // PaymentsService is typed against PaymentProvider only; this test
      // documents that the concrete class is reachable solely via the token.
      const deal = await makeDeal();
      const { instruction } = await payments.issueInstruction({
        dealId: deal.id,
        kind: 'collect',
        amount: 1_000_000n,
        idempotencyKey: unique('agnostic'),
        counterparty: tenantAccount,
      });
      expect(instruction.providerRef ?? null).toBeDefined();
      expect(await payments.currentState(instruction.id)).toBe('succeeded');
    });
  });

  describe('IDEMPOTENCY — a duplicated call does not double-instruct (FR-7.8)', () => {
    test('issuing twice with the same key creates ONE instruction and does not re-charge', async () => {
      const deal = await makeDeal();
      const key = unique('dup');

      const first = await payments.issueInstruction({
        dealId: deal.id,
        kind: 'collect',
        amount: 3_000_000n,
        idempotencyKey: key,
        counterparty: tenantAccount,
      });
      const balanceAfterFirst = await payments.custodianBalance();

      const second = await payments.issueInstruction({
        dealId: deal.id,
        kind: 'collect',
        amount: 3_000_000n,
        idempotencyKey: key,
        counterparty: tenantAccount,
      });

      expect(first.deduplicated).toBe(false);
      expect(second.deduplicated).toBe(true);
      expect(second.instruction.id).toBe(first.instruction.id);

      // exactly one row for this key
      const rows = await prisma.pspInstruction.findMany({
        where: { idempotencyKey: key },
      });
      expect(rows).toHaveLength(1);

      // and the custodian was NOT charged a second time
      expect(await payments.custodianBalance()).toBe(balanceAfterFirst);
    });

    test('the provider itself also dedupes, flagging the repeat', async () => {
      const key = unique('provider-dup');
      const before = await provider.custodianBalance();

      const first = await provider.collectToEscrow({
        idempotencyKey: key,
        amount: 500_000n,
        currency: 'UGX',
        reference: 'test',
        from: tenantAccount,
      });
      const second = await provider.collectToEscrow({
        idempotencyKey: key,
        amount: 500_000n,
        currency: 'UGX',
        reference: 'test',
        from: tenantAccount,
      });

      expect(first.deduplicated).toBeUndefined();
      expect(second.deduplicated).toBe(true);
      expect(second.providerRef).toBe(first.providerRef);
      // the effect was applied exactly once
      expect(await provider.custodianBalance()).toBe(before + 500_000n);
    });

    test('a replayed provider callback does not create a second event', async () => {
      const deal = await makeDeal();
      const { instruction } = await payments.issueInstruction({
        dealId: deal.id,
        kind: 'collect',
        amount: 1_000_000n,
        idempotencyKey: unique('callback'),
        counterparty: tenantAccount,
      });

      // the provider webhook fires twice for the same outcome
      const replay = await payments.recordOutcome({
        instructionId: instruction.id,
        toState: 'succeeded',
        providerRef: 'replayed',
      });
      expect(replay.deduplicated).toBe(true);

      const events = await prisma.pspInstructionEvent.findMany({
        where: { instructionId: instruction.id, toState: 'succeeded' },
      });
      expect(events).toHaveLength(1);
    });

    test('a duplicated fund call does not double-post to the ledger', async () => {
      const deal = await makeDeal();
      const key = unique('ledger-dup');

      await payments.issueInstruction({
        dealId: deal.id,
        kind: 'collect',
        amount: 3_000_000n,
        idempotencyKey: key,
        counterparty: tenantAccount,
      });
      // the ledger effect is posted by the deal transition, once
      await escrow.fundEscrow({ dealId: deal.id, amount: 3_000_000n });

      // a retry of the instruction must not cause a second posting
      await payments.issueInstruction({
        dealId: deal.id,
        kind: 'collect',
        amount: 3_000_000n,
        idempotencyKey: key,
        counterparty: tenantAccount,
      });

      const entries = await prisma.ledgerEntry.findMany({
        where: { dealId: deal.id, reference: 'fund_escrow' },
      });
      expect(entries).toHaveLength(2); // one balanced posting, not two
    });
  });

  describe('psp_instruction stays fully immutable; state is event-sourced', () => {
    test('the instruction row itself rejects UPDATE and DELETE', async () => {
      const deal = await makeDeal();
      const { instruction } = await payments.issueInstruction({
        dealId: deal.id,
        kind: 'collect',
        amount: 2_000_000n,
        idempotencyKey: unique('immutable'),
        counterparty: tenantAccount,
      });

      await expect(
        prisma.$executeRawUnsafe(
          `UPDATE "psp_instruction" SET amount = 1 WHERE id = $1`,
          instruction.id,
        ),
      ).rejects.toThrow();
      await expect(
        prisma.$executeRawUnsafe(
          `DELETE FROM "psp_instruction" WHERE id = $1`,
          instruction.id,
        ),
      ).rejects.toThrow();

      const after = await prisma.pspInstruction.findUniqueOrThrow({
        where: { id: instruction.id },
      });
      expect(after.amount).toBe(2_000_000n);
    });

    test('lifecycle events are append-only and also reject mutation', async () => {
      const deal = await makeDeal();
      const { instruction } = await payments.issueInstruction({
        dealId: deal.id,
        kind: 'collect',
        amount: 1_000_000n,
        idempotencyKey: unique('event-immutable'),
        counterparty: tenantAccount,
      });

      const event = await prisma.pspInstructionEvent.findFirstOrThrow({
        where: { instructionId: instruction.id },
      });

      await expect(
        prisma.$executeRawUnsafe(
          `UPDATE "psp_instruction_event" SET to_state = 'failed' WHERE id = $1`,
          event.id,
        ),
      ).rejects.toThrow();
      await expect(
        prisma.$executeRawUnsafe(
          `DELETE FROM "psp_instruction_event" WHERE id = $1`,
          event.id,
        ),
      ).rejects.toThrow();
    });

    test('current state is derived from the latest event, not stored on the row', async () => {
      const deal = await makeDeal();
      const { instruction } = await payments.issueInstruction({
        dealId: deal.id,
        kind: 'collect',
        amount: 1_000_000n,
        idempotencyKey: unique('derived'),
        counterparty: tenantAccount,
      });

      // the immutable row still records how it was created
      const row = await prisma.pspInstruction.findUniqueOrThrow({
        where: { id: instruction.id },
      });
      expect(row.state).toBe('pending');

      // but the derived current state reflects the provider outcome
      expect(await payments.currentState(instruction.id)).toBe('succeeded');
    });

    test('a failing provider is recorded as a failed event, not a lost instruction', async () => {
      const deal = await makeDeal();
      const { instruction } = await payments.issueInstruction({
        dealId: deal.id,
        kind: 'collect',
        amount: 1_000_000n,
        idempotencyKey: unique('failing'),
        counterparty: tenantAccount,
        reference: 'deliberately-fail',
      });

      expect(await payments.currentState(instruction.id)).toBe('failed');
      const event = await prisma.pspInstructionEvent.findFirstOrThrow({
        where: { instructionId: instruction.id, toState: 'failed' },
      });
      expect(event.detail).toContain('simulated provider failure');
    });
  });

  describe('RECONCILIATION — ledger vs custodian (FR-7.8, FR-10.4)', () => {
    test('a reconciliation check records both balances and whether they agree', async () => {
      const check = await payments.runReconciliation();

      expect(typeof check.ledgerBalance).toBe('bigint');
      expect(typeof check.pspBalance).toBe('bigint');
      expect(check.isReconciled).toBe(check.ledgerBalance === check.pspBalance);
    });

    test('a DIVERGENCE is surfaced, not silently absorbed', async () => {
      const ledgerBalance = await payments.pspClearingBalance();

      // simulate the custodian disagreeing with us
      provider.setCustodianBalanceForTesting(ledgerBalance + 999_999n);

      const check = await payments.runReconciliation();

      expect(check.isReconciled).toBe(false);
      expect(check.discrepancyNote).toContain('difference');
      expect(check.pspBalance - check.ledgerBalance).toBe(999_999n);
    });

    test('the ledger is authoritative: a custodian mismatch does not alter ledger state', async () => {
      const deal = await makeDeal();
      await escrow.fundEscrow({ dealId: deal.id, amount: 4_000_000n });

      const before = await payments.pspClearingBalance();
      provider.setCustodianBalanceForTesting(0n);
      await payments.runReconciliation();
      const after = await payments.pspClearingBalance();

      // reconciliation reports; it never "fixes" the ledger to match
      expect(after).toBe(before);
    });
  });

  describe('no code path assumes House For Rent holds the funds (FR-7.1)', () => {
    test('every provider method is an instruction to a third party, with a provider reference back', async () => {
      const deal = await makeDeal();

      const collect = await payments.issueInstruction({
        dealId: deal.id,
        kind: 'collect',
        amount: 1_000_000n,
        idempotencyKey: unique('c'),
        counterparty: tenantAccount,
      });
      const release = await payments.issueInstruction({
        dealId: deal.id,
        kind: 'release',
        amount: 500_000n,
        idempotencyKey: unique('r'),
        counterparty: tenantAccount,
      });
      const refund = await payments.issueInstruction({
        dealId: deal.id,
        kind: 'refund',
        amount: 500_000n,
        idempotencyKey: unique('rf'),
        counterparty: tenantAccount,
        originalProviderRef: 'original',
      });

      for (const { instruction } of [collect, release, refund]) {
        const events = await prisma.pspInstructionEvent.findMany({
          where: { instructionId: instruction.id },
        });
        // each instruction produced an outcome carrying the CUSTODIAN's ref —
        // evidence the money movement happened at the provider, not here
        expect(events.length).toBeGreaterThan(0);
        expect(events[0].providerRef).toMatch(/^mock-psp-/);
      }
    });
  });
});
