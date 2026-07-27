import { Inject, Injectable } from '@nestjs/common';
import { PspInstructionKind, PspInstructionState } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LedgerService } from '../ledger/ledger.service';
import {
  PAYMENT_PROVIDER,
  PaymentAccountRef,
} from './interfaces/payment-provider.interface';
import type { PaymentProvider } from './interfaces/payment-provider.interface';

/**
 * The idempotent boundary between the deal flow and the external custodian
 * (Data_Model.md §8.3, FR-7.1, FR-7.8).
 *
 * Responsibilities, and equally what it deliberately does NOT do:
 *   - it RECORDS every instruction issued to the provider, immutably, keyed
 *     by idempotency key, so a duplicate call or a replayed webhook cannot
 *     produce a second instruction;
 *   - it records each state change as an append-only event, because
 *     psp_instruction itself is immutable (the instruction as issued —
 *     its amount, kind and key — must never be editable after the fact);
 *   - it does NOT post to the ledger. Ledger effects belong to the deal
 *     transition that authorised them (Stage 3), inside that transition's
 *     transaction. Posting here as well would double-count.
 */
@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
  ) {}

  /**
   * Issues an instruction to the custodian, exactly once per idempotency
   * key. A repeat call with the same key returns the already-recorded
   * instruction WITHOUT contacting the provider again and without creating
   * a second row — the dedupe happens on our side of the boundary as well
   * as the provider's, so we are safe even against a provider that handles
   * keys badly.
   */
  async issueInstruction(params: {
    dealId: string;
    kind: PspInstructionKind;
    amount: bigint;
    idempotencyKey: string;
    counterparty: PaymentAccountRef;
    currency?: string;
    reference?: string;
    originalProviderRef?: string;
  }) {
    const existing = await this.prisma.pspInstruction.findUnique({
      where: { idempotencyKey: params.idempotencyKey },
      include: { events: { orderBy: { occurredAt: 'desc' } } },
    });
    if (existing) {
      return { instruction: existing, deduplicated: true as const };
    }

    const instruction = await this.prisma.pspInstruction.create({
      data: {
        dealId: params.dealId,
        kind: params.kind,
        amount: params.amount,
        idempotencyKey: params.idempotencyKey,
      },
    });

    const currency = params.currency ?? 'UGX';
    const reference =
      params.reference ?? `deal:${params.dealId}:${params.kind}`;
    const base = {
      idempotencyKey: params.idempotencyKey,
      amount: params.amount,
      currency,
      reference,
    };

    const result =
      params.kind === 'collect'
        ? await this.provider.collectToEscrow({
            ...base,
            from: params.counterparty,
          })
        : params.kind === 'release'
          ? await this.provider.releaseTo({ ...base, to: params.counterparty })
          : await this.provider.refund({
              ...base,
              to: params.counterparty,
              originalProviderRef: params.originalProviderRef ?? '',
            });

    await this.recordOutcome({
      instructionId: instruction.id,
      toState: result.outcome === 'pending' ? 'pending' : result.outcome,
      providerRef: result.providerRef,
      detail: result.failureReason,
    });

    const withEvents = await this.prisma.pspInstruction.findUniqueOrThrow({
      where: { id: instruction.id },
      include: { events: { orderBy: { occurredAt: 'desc' } } },
    });

    return { instruction: withEvents, deduplicated: false as const };
  }

  /**
   * Records a state change for an instruction. Safe to call repeatedly with
   * the same target state — the unique (instruction, toState) constraint
   * makes a replayed provider webhook a no-op rather than a second event
   * (FR-7.8).
   */
  async recordOutcome(params: {
    instructionId: string;
    toState: PspInstructionState;
    providerRef?: string;
    detail?: string;
  }) {
    const existing = await this.prisma.pspInstructionEvent.findUnique({
      where: {
        instructionId_toState: {
          instructionId: params.instructionId,
          toState: params.toState,
        },
      },
    });
    if (existing) {
      return { event: existing, deduplicated: true as const };
    }

    const event = await this.prisma.pspInstructionEvent.create({
      data: {
        instructionId: params.instructionId,
        toState: params.toState,
        providerRef: params.providerRef,
        detail: params.detail,
        occurredAt: new Date(),
      },
    });
    return { event, deduplicated: false as const };
  }

  /**
   * The instruction's current state, DERIVED from its latest event (the row
   * itself is immutable and always records how it was created).
   */
  async currentState(instructionId: string): Promise<PspInstructionState> {
    const latest = await this.prisma.pspInstructionEvent.findFirst({
      where: { instructionId },
      orderBy: { occurredAt: 'desc' },
    });
    return latest?.toState ?? 'pending';
  }

  /**
   * Compares our ledger's view of custodian-held value against what the
   * custodian itself reports (FR-7.8, FR-10.4).
   *
   * The ledger is authoritative for business logic; this check exists to
   * SURFACE divergence, not to correct it automatically. A discrepancy is
   * an operational alert for a human, because silently trusting either side
   * is how money goes missing without anyone noticing.
   */
  async runReconciliation() {
    const ledgerBalance = await this.pspClearingBalance();
    const pspBalance = await this.provider.custodianBalance();
    const isReconciled = ledgerBalance === pspBalance;

    return this.prisma.reconciliationCheck.create({
      data: {
        runAt: new Date(),
        ledgerBalance,
        pspBalance,
        isReconciled,
        discrepancyNote: isReconciled
          ? null
          : `ledger psp_clearing ${ledgerBalance} != custodian ${pspBalance} ` +
            `(difference ${ledgerBalance - pspBalance})`,
      },
    });
  }

  /**
   * Net value the ledger believes sits with the custodian: the debit-minus-
   * credit balance of every psp_clearing account.
   */
  async pspClearingBalance(): Promise<bigint> {
    const rows = await this.prisma.ledgerEntry.findMany({
      where: { account: { accountType: 'psp_clearing' } },
      select: { direction: true, amount: true },
    });
    return rows.reduce(
      (acc, row) =>
        row.direction === 'debit' ? acc + row.amount : acc - row.amount,
      0n,
    );
  }

  /** Exposes the provider's own view, for admin/reconciliation surfaces only. */
  async custodianBalance(): Promise<bigint> {
    return this.provider.custodianBalance();
  }
}
