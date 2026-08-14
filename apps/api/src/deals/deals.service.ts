import { Injectable } from '@nestjs/common';
import { Deal, DealStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EscrowService } from '../ledger/escrow.service';
import { PaymentsService } from '../payments/payments.service';
import type { PaymentAccountRef } from '../payments/interfaces/payment-provider.interface';
import {
  assertTransitionAllowed,
  TERMINAL_STATUSES,
} from './deal-state-machine';
import { computeCommission } from './commission';
import { AuditService, type AuditEventType } from '../audit/audit.service';

/**
 * Deal statuses whose arrival is a MONEY EVENT in the NFR-2 sense, and the
 * audit type each maps to.
 *
 * Mapping here — rather than calling the audit service from each transition
 * method — means the audit write happens on the single path every
 * transition already takes. A transition added later is audited by
 * construction; one that had to remember would eventually forget.
 */
const AUDITED_STATUSES: Partial<Record<DealStatus, AuditEventType>> = {
  escrow_funded: 'escrow_funded',
  commission_earned: 'commission_earned',
  settled: 'deal_settled',
  refunded: 'deal_refunded',
};

type Tx = Prisma.TransactionClient;

export class DealNotFoundError extends Error {
  constructor(dealId: string) {
    super(`deal ${dealId} not found`);
    this.name = 'DealNotFoundError';
  }
}

export class SnapshotImmutableError extends Error {
  constructor(dealId: string) {
    super(
      `deal ${dealId} already carries commission snapshots; they are immutable ` +
        'once taken at agreement_signed (FR-7.4)',
    );
    this.name = 'SnapshotImmutableError';
  }
}

export class SettlementReleaseFailedError extends Error {
  constructor(dealId: string) {
    super(
      `deal ${dealId}: the custodian rejected the release instruction, so the ` +
        'deal remains at commission_earned. Retrying reuses the same ' +
        'idempotency key, so the landlord cannot be paid twice (FR-7.8)',
    );
    this.name = 'SettlementReleaseFailedError';
  }
}

export class MissingIntroductionRecordError extends Error {
  constructor(dealId: string) {
    super(
      `deal ${dealId} cannot reach tenant_matched without an introduction_record ` +
        '(Data_Model.md §7.3, FR-8.3)',
    );
    this.name = 'MissingIntroductionRecordError';
  }
}

/**
 * The deal lifecycle (Data_Model.md §7) — the spine that composes Identity,
 * Agreements and Payments into the core business flow.
 *
 * Every transition:
 *   - is checked against ALLOWED_TRANSITIONS before anything is written;
 *   - writes the new status AND an immutable deal_transition row AND any
 *     ledger effect inside ONE database transaction, so money state and
 *     deal state can never diverge (Technical Architecture §8);
 *   - is expressed as a named business operation, not a generic
 *     `setStatus()`. There is deliberately no public method that takes an
 *     arbitrary target status, because that would let a caller route around
 *     the guards that make each transition safe.
 */
@Injectable()
export class DealsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly escrow: EscrowService,
    private readonly payments: PaymentsService,
    private readonly audit: AuditService,
  ) {}

  async createDeal(params: {
    listingId: string;
    tenantPartyId: string;
    landlordPartyId: string;
    introductionRecordId?: string;
  }): Promise<Deal> {
    return this.prisma.deal.create({
      data: {
        listingId: params.listingId,
        tenantPartyId: params.tenantPartyId,
        landlordPartyId: params.landlordPartyId,
        introductionRecordId: params.introductionRecordId,
      },
    });
  }

  /**
   * created → tenant_matched.
   * Guard (§7.3): requires an introduction_record — the FOO viewing that
   * produced the introduction is what makes the circumvention clause
   * enforceable later (FR-8.3), so a deal cannot skip it.
   */
  async matchTenant(params: {
    dealId: string;
    actorPartyId: string;
    introductionRecordId?: string;
    reason?: string;
  }): Promise<Deal> {
    return this.prisma.$transaction(async (tx) => {
      const deal = await this.loadForUpdate(params.dealId, tx);
      assertTransitionAllowed(deal.status, 'tenant_matched');

      const introductionRecordId =
        params.introductionRecordId ?? deal.introductionRecordId;
      if (!introductionRecordId) {
        throw new MissingIntroductionRecordError(params.dealId);
      }

      return this.applyTransition(
        {
          deal,
          to: 'tenant_matched',
          actorPartyId: params.actorPartyId,
          reason: params.reason,
          data: {
            introductionRecord: { connect: { id: introductionRecordId } },
          },
        },
        tx,
      );
    });
  }

  /**
   * tenant_matched → agreement_signed. THE SNAPSHOT POINT (FR-7.4).
   *
   * The listing's current monthly rent and the commission rate version in
   * force are COPIED onto the deal here and never updated again. Everything
   * downstream reads those copies, which is what makes an in-flight deal
   * structurally immune to a later rate change or a listing edit — immunity
   * by construction, not by discipline.
   */
  async signAgreement(params: {
    dealId: string;
    actorPartyId: string;
    agreementId: string;
    reason?: string;
  }): Promise<Deal> {
    return this.prisma.$transaction(async (tx) => {
      const deal = await this.loadForUpdate(params.dealId, tx);
      assertTransitionAllowed(deal.status, 'agreement_signed');

      if (
        deal.monthlyRentSnapshot !== null ||
        deal.commissionRateBpSnapshot !== null
      ) {
        throw new SnapshotImmutableError(params.dealId);
      }

      const agreement = await tx.listingAgreement.findUniqueOrThrow({
        where: { id: params.agreementId },
        include: { commissionRateVersion: true },
      });

      return this.applyTransition(
        {
          deal,
          to: 'agreement_signed',
          actorPartyId: params.actorPartyId,
          reason: params.reason,
          data: {
            agreement: { connect: { id: agreement.id } },
            // frozen here, forever:
            monthlyRentSnapshot: agreement.monthlyRentAtSigning,
            commissionRateBpSnapshot:
              agreement.commissionRateVersion.rateBpOfMonth,
            commissionRateVersion: {
              connect: { id: agreement.commissionRateVersionId },
            },
          },
        },
        tx,
      );
    });
  }

  /**
   * agreement_signed → escrow_funded. Posts fundEscrow in the SAME
   * transaction as the status change: liability up, no revenue.
   *
   * `amount` is the total upfront transferred (rent months + deposit). It is
   * deliberately NOT the commission base — that is monthlyRentSnapshot
   * (Decision 5, FR-7.3).
   */
  async fundEscrow(params: {
    dealId: string;
    actorPartyId: string;
    amount: bigint;
    reason?: string;
  }): Promise<Deal> {
    return this.prisma.$transaction(async (tx) => {
      const deal = await this.loadForUpdate(params.dealId, tx);
      assertTransitionAllowed(deal.status, 'escrow_funded');

      await this.escrow.fundEscrow(
        { dealId: deal.id, amount: params.amount },
        tx,
      );

      return this.applyTransition(
        {
          deal,
          to: 'escrow_funded',
          actorPartyId: params.actorPartyId,
          reason: params.reason,
        },
        tx,
      );
    });
  }

  /**
   * escrow_funded → move_in_confirmed. No ledger effect — this transition
   * is what UNLOCKS the earn step; it does not itself move value.
   */
  async confirmMoveIn(params: {
    dealId: string;
    actorPartyId: string;
    reason?: string;
  }): Promise<Deal> {
    return this.prisma.$transaction(async (tx) => {
      const deal = await this.loadForUpdate(params.dealId, tx);
      assertTransitionAllowed(deal.status, 'move_in_confirmed');

      return this.applyTransition(
        {
          deal,
          to: 'move_in_confirmed',
          actorPartyId: params.actorPartyId,
          reason: params.reason,
        },
        tx,
      );
    });
  }

  /**
   * move_in_confirmed → commission_earned. COMMISSION IS EARNED HERE
   * (FR-7.5) — not at funding, not at settlement.
   *
   * The amount is computed from the deal's own snapshots by the pure
   * commission engine, stored on the deal, and recognised in the ledger,
   * all inside one transaction.
   */
  async earnCommission(params: {
    dealId: string;
    actorPartyId: string;
    reason?: string;
  }): Promise<Deal> {
    return this.prisma.$transaction(async (tx) => {
      const deal = await this.loadForUpdate(params.dealId, tx);
      assertTransitionAllowed(deal.status, 'commission_earned');

      // from the SNAPSHOTS — never a live rate, never the escrow total
      const commissionAmount = computeCommission({
        monthlyRentSnapshot: deal.monthlyRentSnapshot,
        commissionRateBpSnapshot: deal.commissionRateBpSnapshot,
      });

      await this.escrow.recogniseCommission(
        { dealId: deal.id, amount: commissionAmount },
        tx,
      );

      return this.applyTransition(
        {
          deal,
          to: 'commission_earned',
          actorPartyId: params.actorPartyId,
          reason: params.reason,
          data: { commissionAmount },
        },
        tx,
      );
    });
  }

  /**
   * commission_earned → settled. Releases to the landlord NET of the earned
   * commission (FR-7.6).
   *
   * Reachable only from commission_earned, which is reachable only from
   * move_in_confirmed — so settlement structurally cannot precede move-in.
   *
   * ── Ordering, and why it is this way round ──
   * The external PSP call happens BEFORE the transaction, not inside it.
   * Holding a DB transaction open across a network call would hold locks
   * for the duration and, worse, allow the transaction to roll back after
   * real money had already moved at the custodian — leaving our books
   * denying a payout the landlord actually received. Instead:
   *   1. issue the release instruction (idempotent, recorded immutably);
   *   2. only if the custodian accepted it, atomically post the ledger
   *      effect and flip the status.
   * If step 2 fails, the instruction remains on record and the deal stays
   * at commission_earned, so a retry re-issues under the SAME idempotency
   * key and the custodian will not pay twice — the discrepancy is visible
   * to reconciliation in the meantime rather than silently lost.
   */
  async settle(params: {
    dealId: string;
    actorPartyId: string;
    totalHeld: bigint;
    landlordAccount?: PaymentAccountRef;
    reason?: string;
  }): Promise<Deal> {
    const preflight = await this.prisma.deal.findUnique({
      where: { id: params.dealId },
    });
    if (!preflight) {
      throw new DealNotFoundError(params.dealId);
    }
    // fail fast before touching the custodian
    assertTransitionAllowed(preflight.status, 'settled');

    const commissionAmount = preflight.commissionAmount ?? 0n;
    const netToLandlord = params.totalHeld - commissionAmount;

    if (params.landlordAccount) {
      const { instruction } = await this.payments.issueInstruction({
        dealId: preflight.id,
        kind: 'release',
        amount: netToLandlord,
        // deterministic key: a retry of THIS settlement reuses it
        idempotencyKey: `settle:${preflight.id}`,
        counterparty: params.landlordAccount,
      });
      const state = await this.payments.currentState(instruction.id);
      if (state === 'failed') {
        throw new SettlementReleaseFailedError(preflight.id);
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const deal = await this.loadForUpdate(params.dealId, tx);
      assertTransitionAllowed(deal.status, 'settled');

      await this.escrow.settle({ dealId: deal.id, amount: netToLandlord }, tx);
      await this.escrow.releaseToLandlord(
        { dealId: deal.id, amount: netToLandlord },
        tx,
      );

      return this.applyTransition(
        {
          deal,
          to: 'settled',
          actorPartyId: params.actorPartyId,
          reason: params.reason,
        },
        tx,
      );
    });
  }

  /** settled → closed (terminal). */
  async close(params: {
    dealId: string;
    actorPartyId: string;
    reason?: string;
  }): Promise<Deal> {
    return this.prisma.$transaction(async (tx) => {
      const deal = await this.loadForUpdate(params.dealId, tx);
      assertTransitionAllowed(deal.status, 'closed');
      return this.applyTransition(
        {
          deal,
          to: 'closed',
          actorPartyId: params.actorPartyId,
          reason: params.reason,
        },
        tx,
      );
    });
  }

  /**
   * escrow_funded → refunded. The full held amount goes back to the tenant
   * (FR-7.7) and no commission is earned. This is the "money back" exit
   * that, together with move_in_confirmed, forms the only two ways out of
   * escrow_funded — the Move-In Guarantee.
   */
  async refund(params: {
    dealId: string;
    actorPartyId: string;
    amount: bigint;
    tenantAccount?: PaymentAccountRef;
    originalProviderRef?: string;
    reason?: string;
  }): Promise<Deal> {
    const preflight = await this.prisma.deal.findUnique({
      where: { id: params.dealId },
    });
    if (!preflight) {
      throw new DealNotFoundError(params.dealId);
    }
    assertTransitionAllowed(preflight.status, 'refunded');

    // Same ordering rationale as settle(): instruct the custodian before
    // opening the transaction, under a deterministic idempotency key.
    if (params.tenantAccount) {
      await this.payments.issueInstruction({
        dealId: preflight.id,
        kind: 'refund',
        amount: params.amount,
        idempotencyKey: `refund:${preflight.id}`,
        counterparty: params.tenantAccount,
        originalProviderRef: params.originalProviderRef,
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const deal = await this.loadForUpdate(params.dealId, tx);
      assertTransitionAllowed(deal.status, 'refunded');

      await this.escrow.refund({ dealId: deal.id, amount: params.amount }, tx);

      return this.applyTransition(
        {
          deal,
          to: 'refunded',
          actorPartyId: params.actorPartyId,
          reason: params.reason,
        },
        tx,
      );
    });
  }

  /** Pre-funding cancel. Not reachable once escrow is funded — see the
   * flagged ambiguity in deal-state-machine.ts. */
  async cancel(params: {
    dealId: string;
    actorPartyId: string;
    reason?: string;
  }): Promise<Deal> {
    return this.prisma.$transaction(async (tx) => {
      const deal = await this.loadForUpdate(params.dealId, tx);
      assertTransitionAllowed(deal.status, 'cancelled');
      return this.applyTransition(
        {
          deal,
          to: 'cancelled',
          actorPartyId: params.actorPartyId,
          reason: params.reason,
        },
        tx,
      );
    });
  }

  /**
   * Finds deals that have sat at `escrow_funded` longer than the configured
   * window without a move-in confirmation (FR-7.7, "timeout auto-release
   * rules").
   *
   * ── Why this returns candidates rather than acting ──
   * The timeout WINDOW and what should happen at its expiry are explicitly
   * unresolved: PRD §7 lists "refund/timeout timing specifics" among the
   * open items, describing them as "configuration or an ops-policy value,
   * not a design choice". Inventing a number here, or auto-refunding money
   * on a schedule nobody has agreed, would be exactly the silent
   * business-rule invention this build is meant to avoid.
   *
   * So the MECHANISM exists and is testable now, and the policy plugs in as
   * configuration: callers supply the window, receive the candidates, and
   * decide (today: ops review; later: an automated rule once the policy is
   * set). Every actual money movement still goes through refund(), which
   * keeps the ledger and the guarantee intact.
   */
  async findEscrowFundedBeyond(params: {
    windowDays: number;
    now?: Date;
  }): Promise<Deal[]> {
    const now = params.now ?? new Date();
    const cutoff = new Date(
      now.getTime() - params.windowDays * 24 * 60 * 60 * 1000,
    );

    const funded = await this.prisma.deal.findMany({
      where: { status: 'escrow_funded' },
    });

    // "since it was funded", taken from the authoritative transition history
    // rather than the mutable updatedAt column
    const candidates: Deal[] = [];
    for (const deal of funded) {
      const fundedAt = await this.prisma.dealTransition.findFirst({
        where: { dealId: deal.id, toStatus: 'escrow_funded' },
        orderBy: { occurredAt: 'desc' },
      });
      if (fundedAt && fundedAt.occurredAt < cutoff) {
        candidates.push(deal);
      }
    }
    return candidates;
  }

  /** any active → dispute_hold (ops action). Blocks settlement (FR-10.5). */
  async placeOnDisputeHold(params: {
    dealId: string;
    actorPartyId: string;
    reason?: string;
  }): Promise<Deal> {
    return this.prisma.$transaction(async (tx) => {
      const deal = await this.loadForUpdate(params.dealId, tx);
      assertTransitionAllowed(deal.status, 'dispute_hold');
      return this.applyTransition(
        {
          deal,
          to: 'dispute_hold',
          actorPartyId: params.actorPartyId,
          reason: params.reason,
        },
        tx,
      );
    });
  }

  /**
   * dispute_hold → the status held before the hold (§7.3 "prior"), restored
   * from the transition history rather than guessed. Terminal resolutions
   * (refunded / settled) go through their own methods so their ledger
   * effects still run.
   */
  async resolveDisputeToPriorStatus(params: {
    dealId: string;
    actorPartyId: string;
    reason?: string;
  }): Promise<Deal> {
    return this.prisma.$transaction(async (tx) => {
      const deal = await this.loadForUpdate(params.dealId, tx);
      if (deal.status !== 'dispute_hold') {
        throw new Error(
          `deal ${params.dealId} is not on dispute_hold (status: ${deal.status})`,
        );
      }

      const entering = await tx.dealTransition.findFirst({
        where: { dealId: deal.id, toStatus: 'dispute_hold' },
        orderBy: { occurredAt: 'desc' },
      });
      if (!entering) {
        throw new Error(
          `deal ${params.dealId} has no recorded transition into dispute_hold`,
        );
      }

      const prior = entering.fromStatus as DealStatus;
      return this.applyTransition(
        {
          deal,
          to: prior,
          actorPartyId: params.actorPartyId,
          reason: params.reason ?? 'dispute resolved: restored prior status',
          skipTransitionCheck: true, // §7.3 permits returning to the prior status
        },
        tx,
      );
    });
  }

  async getDeal(dealId: string): Promise<Deal | null> {
    return this.prisma.deal.findUnique({ where: { id: dealId } });
  }

  async getTransitionHistory(dealId: string) {
    return this.prisma.dealTransition.findMany({
      where: { dealId },
      orderBy: { occurredAt: 'asc' },
    });
  }

  /**
   * Every deal the party is on either side of.
   *
   * One query covering both sides rather than a `role` argument: a party
   * can legitimately be a tenant on one deal and a landlord on another, and
   * asking the caller which they "are" would be asking a question the data
   * does not have a single answer to.
   */
  async findForParty(partyId: string): Promise<Deal[]> {
    return this.prisma.deal.findMany({
      where: {
        OR: [{ tenantPartyId: partyId }, { landlordPartyId: partyId }],
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async loadForUpdate(dealId: string, tx: Tx): Promise<Deal> {
    const deal = await tx.deal.findUnique({ where: { id: dealId } });
    if (!deal) {
      throw new DealNotFoundError(dealId);
    }
    return deal;
  }

  /**
   * Writes the status change and its immutable audit row together. Callers
   * are already inside a transaction that also holds any ledger effect, so
   * all three commit or roll back as one.
   */
  private async applyTransition(
    params: {
      deal: Deal;
      to: DealStatus;
      actorPartyId: string;
      reason?: string;
      data?: Prisma.DealUpdateInput;
      skipTransitionCheck?: boolean;
    },
    tx: Tx,
  ): Promise<Deal> {
    if (!params.skipTransitionCheck) {
      assertTransitionAllowed(params.deal.status, params.to);
    }

    const occurredAt = new Date();

    await tx.dealTransition.create({
      data: {
        dealId: params.deal.id,
        fromStatus: params.deal.status,
        toStatus: params.to,
        actorPartyId: params.actorPartyId,
        reason: params.reason,
        occurredAt,
      },
    });

    const updated = await tx.deal.update({
      where: { id: params.deal.id },
      data: { ...params.data, status: params.to },
    });

    // NFR-2: money events are audit-logged, inside the SAME transaction, so
    // the log cannot claim a payment that rolled back or miss one that
    // committed. Amounts go in as strings — the payload is JSON, and a
    // bigint rendered as a JS number is exactly the precision loss the whole
    // money core exists to prevent.
    const auditType = AUDITED_STATUSES[params.to];
    if (auditType) {
      await this.audit.record(
        {
          eventType: auditType,
          actorPartyId: params.actorPartyId,
          subjectRef: updated.id,
          payload: {
            fromStatus: params.deal.status,
            toStatus: params.to,
            commissionAmount: updated.commissionAmount?.toString() ?? null,
            monthlyRentSnapshot:
              updated.monthlyRentSnapshot?.toString() ?? null,
            commissionRateBpSnapshot:
              updated.commissionRateBpSnapshot ?? null,
          },
          occurredAt,
        },
        tx,
      );
    }

    return updated;
  }
}

export { TERMINAL_STATUSES };
