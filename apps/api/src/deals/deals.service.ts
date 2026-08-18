import { Injectable } from '@nestjs/common';
import { AuthRole, Deal, DealStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EscrowService } from '../ledger/escrow.service';
import { LedgerService } from '../ledger/ledger.service';
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

export class ListingTermsChangedError extends Error {
  constructor(dealId: string) {
    super(
      `deal ${dealId} cannot be funded: the listing's monthly rent no longer ` +
        'matches the rent snapshotted onto this deal at signing. The upfront ' +
        'total is derived from that listing, so terms that have ' +
        'moved since signing would silently re-price what the tenant owes ' +
        '(FR-7.4).',
    );
    this.name = 'ListingTermsChangedError';
  }
}

export class AmountNotAuthoritativeError extends Error {
  constructor(
    readonly supplied: bigint,
    readonly derived: bigint,
  ) {
    super(
      `the amount supplied (${supplied}) is not the amount this deal's own ` +
        `terms require (${derived}). The server derives every posted figure; ` +
        'a request may ask for an operation but may not name its amount.',
    );
    this.name = 'AmountNotAuthoritativeError';
  }
}

export class NothingHeldError extends Error {
  constructor(dealId: string) {
    super(
      `deal ${dealId} holds no escrow balance, so there is nothing to release ` +
        'or return. A zero-value posting would record a money movement that ' +
        'did not happen.',
    );
    this.name = 'NothingHeldError';
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

export class IntroductionRecordNotFoundError extends Error {
  constructor(introductionRecordId: string) {
    super(`introduction record ${introductionRecordId} not found`);
    this.name = 'IntroductionRecordNotFoundError';
  }
}

export class NotTheIntroducingOfficerError extends Error {
  constructor(introductionRecordId: string) {
    super(
      `introduction record ${introductionRecordId} was produced by a different ` +
        'field officer. An officer opens deals off the introductions they ' +
        'themselves made — the same constraint the assigned-FOO guard places ' +
        'on the viewing that produced it (FR-5.6).',
    );
    this.name = 'NotTheIntroducingOfficerError';
  }
}

export class ViewingNotConductedError extends Error {
  constructor(viewingId: string) {
    super(
      `viewing ${viewingId} is not conducted, so no deal may be opened from ` +
        'its introduction record',
    );
    this.name = 'ViewingNotConductedError';
  }
}

export class DealAlreadyExistsError extends Error {
  constructor(
    introductionRecordId: string,
    readonly existingDealId: string,
  ) {
    super(
      `introduction record ${introductionRecordId} already has an active deal ` +
        `(${existingDealId}). One introduction is one tenant meeting one ` +
        'property once; a second concurrent deal off the same meeting would ' +
        'let the same escrow be funded twice.',
    );
    this.name = 'DealAlreadyExistsError';
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
    /** Read-only here: the authority on what a deal still holds (F-012). */
    private readonly ledger: LedgerService,
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
   * THE way a deal comes into existence (FR-8.3).
   *
   * ── Why the caller supplies only an introduction record id ──
   * `introduction_record` already names the tenant, the listing, the
   * landlord and the officer, all written server-side by `conduct()` from
   * the viewing and the property. So every party on the deal is DERIVED from
   * that row, and the request body has no field that could name a person.
   *
   * That is not defence-in-depth, it is the absence of an attack surface: a
   * body carrying `tenantPartyId` could be tampered with, and would need a
   * check to catch it. A body that cannot express a party needs no such
   * check, and a future edit cannot forget one that does not exist.
   *
   * The introduction record is also the only artefact that proves the
   * meeting happened. Requiring it here means a deal cannot exist without
   * the evidence that makes the circumvention clause enforceable — the same
   * guard `matchTenant()` applies one transition later, moved to the moment
   * of creation so the deal is never in a state that lacks it.
   *
   * ── What this deliberately does NOT check ──
   * The listing's publication state. A landlord who has agreed to let to
   * this tenant may reasonably withdraw the listing first; refusing the deal
   * then would strand a real let over a display flag. The introduction
   * record is the authority for "this tenant saw this property with our
   * officer", and that fact does not expire when the advert comes down.
   *
   * No audit row is written here. `AuditEventType` covers money,
   * verification, consent and configuration events (NFR-2); a deal at
   * `created` has moved no money. Its first transition writes an immutable
   * `deal_transition` row, and the introduction record it points at is
   * itself immutable — the trail exists without widening the audit
   * vocabulary for a non-event.
   */
  async createFromIntroduction(params: {
    introductionRecordId: string;
    actorPartyId: string;
    actorRole: AuthRole;
  }): Promise<Deal> {
    return this.prisma.$transaction(async (tx) => {
      const introduction = await tx.introductionRecord.findUnique({
        where: { id: params.introductionRecordId },
        include: { viewing: true },
      });
      if (!introduction) {
        throw new IntroductionRecordNotFoundError(params.introductionRecordId);
      }

      // An officer acts on their own introductions; an admin acts on any.
      if (
        params.actorRole === 'foo' &&
        introduction.fooPartyId !== params.actorPartyId
      ) {
        throw new NotTheIntroducingOfficerError(params.introductionRecordId);
      }

      // Belt to `conduct()`'s braces: the record can only be minted in the
      // same transaction that sets `conducted`, so this cannot currently
      // fail — which is exactly why it is cheap to assert, and why a future
      // second path to creating introductions would be caught here.
      if (introduction.viewing.status !== 'conducted') {
        throw new ViewingNotConductedError(introduction.viewingId);
      }

      /*
       * One live deal per introduction.
       *
       * Terminal deals do not block: a deal that was cancelled before
       * funding, or refunded, must not permanently bar the same tenant and
       * landlord from trying again off the meeting that already happened.
       * Anything non-terminal does block — two open deals on one
       * introduction could each be funded, putting the tenant's money into
       * two escrows for one room.
       */
      const active = await tx.deal.findFirst({
        where: {
          introductionRecordId: introduction.id,
          status: { notIn: [...TERMINAL_STATUSES] },
        },
      });
      if (active) {
        throw new DealAlreadyExistsError(introduction.id, active.id);
      }

      return tx.deal.create({
        data: {
          // every one of these comes from the record, none from the client
          listingId: introduction.listingId,
          tenantPartyId: introduction.tenantPartyId,
          landlordPartyId: introduction.landlordPartyId,
          introductionRecordId: introduction.id,
        },
      });
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
   * ── The amount is DERIVED, never accepted (F-012) ──
   * The upfront total is `monthlyRentSnapshot × requiredMonthsUpfront +
   * depositAmount`. Every term in that comes from server state: the rent
   * frozen onto this deal at signing, and the listing's own upfront terms.
   *
   * The rent is deliberately taken from the DEAL's snapshot rather than the
   * listing, so an in-flight deal is priced by what was agreed. The months
   * and deposit are not snapshotted anywhere — no schema carries them — so
   * they are read from the listing, and `monthlyRentSnapshot !==
   * listing.monthlyRent` is used as a TRIPWIRE: if the rent has moved, the
   * terms have been edited since signing and the other two cannot be trusted
   * either. No code path currently edits any of the three, which is what
   * makes reading them safe; the tripwire is what keeps that true if one
   * ever does.
   *
   * `expectedAmount` is a TRANSITIONAL compatibility field. The mobile app
   * still asks the tenant to type a figure; until that field is replaced
   * with the server-stated total (F-013), a supplied amount is checked
   * against the derived one and REJECTED on mismatch rather than ignored —
   * silently booking a different number from the one the tenant was shown is
   * exactly the class of error this change exists to end. It is never the
   * source of truth, and it will be removed.
   *
   * Note what this is NOT: it is not the commission base. That is
   * monthlyRentSnapshot (Decision 5, FR-7.3), and it is unchanged.
   */
  async fundEscrow(params: {
    dealId: string;
    actorPartyId: string;
    /** @deprecated transitional — see above. Checked, never trusted. */
    expectedAmount?: bigint;
    reason?: string;
  }): Promise<Deal> {
    return this.prisma.$transaction(async (tx) => {
      const deal = await this.loadForUpdate(params.dealId, tx);
      assertTransitionAllowed(deal.status, 'escrow_funded');

      const listing = await tx.listing.findUniqueOrThrow({
        where: { id: deal.listingId },
      });

      // Guaranteed non-null: escrow_funded is reachable only from
      // agreement_signed, and signAgreement is what writes the snapshot.
      if (
        deal.monthlyRentSnapshot === null ||
        deal.monthlyRentSnapshot !== listing.monthlyRent
      ) {
        throw new ListingTermsChangedError(params.dealId);
      }

      const amount =
        deal.monthlyRentSnapshot * BigInt(listing.requiredMonthsUpfront) +
        listing.depositAmount;

      if (
        params.expectedAmount !== undefined &&
        params.expectedAmount !== amount
      ) {
        throw new AmountNotAuthoritativeError(params.expectedAmount, amount);
      }

      await this.escrow.fundEscrow({ dealId: deal.id, amount }, tx);

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
   * commission_earned -> settled. Releases what is still held to the landlord
   * (FR-7.6).
   *
   * Reachable only from commission_earned, which is reachable only from
   * move_in_confirmed - so settlement structurally cannot precede move-in.
   *
   * -- The amount is the OUTSTANDING LIABILITY (F-012) --
   * This used to take a `totalHeld` from the caller and subtract the
   * commission from it. Both halves of that were wrong: the total was
   * whatever the request said, and the subtraction recomputed a figure the
   * ledger already held.
   *
   * `recogniseCommission` has already debited the earned commission out of
   * `escrow_liability`, so what remains in that account IS the net owed to
   * the landlord. FR-7.6's "net of earned commission" is therefore satisfied
   * by construction rather than by arithmetic on a number someone typed.
   *
   * The balance is read INSIDE the settling transaction. Read outside, two
   * operators settling concurrently would each see the full liability and
   * each release it, paying the landlord twice out of one escrow.
   *
   * -- Ordering, and why it is this way round --
   * The external PSP call happens BEFORE the transaction, not inside it.
   * Holding a DB transaction open across a network call would hold locks for
   * the duration and, worse, allow the transaction to roll back after real
   * money had already moved at the custodian - leaving our books denying a
   * payout the landlord actually received. Instead:
   *   1. issue the release instruction (idempotent, recorded immutably);
   *   2. only if the custodian accepted it, atomically post the ledger
   *      effect and flip the status.
   * If step 2 fails, the instruction remains on record and the deal stays at
   * commission_earned, so a retry re-issues under the SAME idempotency key
   * and the custodian will not pay twice.
   *
   * The pre-flight balance read is therefore necessarily outside the
   * transaction, because the instruction amount must be known before the
   * custodian is called. The AUTHORITATIVE read is the one INSIDE, and the
   * posting uses that one - so a balance that moved in between cannot cause
   * a double release.
   */
  async settle(params: {
    dealId: string;
    actorPartyId: string;
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

    const provisional = await this.ledger.outstandingEscrowLiability(
      preflight.id,
    );
    if (provisional <= 0n) {
      throw new NothingHeldError(preflight.id);
    }

    if (params.landlordAccount) {
      const { instruction } = await this.payments.issueInstruction({
        dealId: preflight.id,
        kind: 'release',
        amount: provisional,
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

      // Re-read under the transaction. THIS is the figure that gets posted.
      const netToLandlord = await this.ledger.outstandingEscrowLiability(
        deal.id,
        tx,
      );
      if (netToLandlord <= 0n) {
        throw new NothingHeldError(deal.id);
      }

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
   * escrow_funded -> refunded. Everything still held goes back to the tenant
   * (FR-7.7) and no commission is earned. This is the "money back" exit
   * that, together with move_in_confirmed, forms the only two ways out of
   * escrow_funded - the Move-In Guarantee.
   *
   * -- The amount is the OUTSTANDING LIABILITY (F-012) --
   * "Full refund of tenant funds" is not a number a request can assert; it
   * is what the ledger says we still hold. Deriving it means a refund can
   * neither exceed what was funded nor quietly return less than the tenant
   * is owed, and the liability lands exactly on zero.
   *
   * Read inside the transaction, for the same reason settlement is: two
   * concurrent refunds reading a stale balance would each return the full
   * amount.
   *
   * Refund is also reachable from `dispute_hold`, where a commission may
   * already have been recognised. The outstanding balance is still the right
   * answer there - it is what remains ours to give back.
   */
  async refund(params: {
    dealId: string;
    actorPartyId: string;
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

    const provisional = await this.ledger.outstandingEscrowLiability(
      preflight.id,
    );
    if (provisional <= 0n) {
      throw new NothingHeldError(preflight.id);
    }

    // Same ordering rationale as settle(): instruct the custodian before
    // opening the transaction, under a deterministic idempotency key.
    if (params.tenantAccount) {
      await this.payments.issueInstruction({
        dealId: preflight.id,
        kind: 'refund',
        amount: provisional,
        idempotencyKey: `refund:${preflight.id}`,
        counterparty: params.tenantAccount,
        originalProviderRef: params.originalProviderRef,
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const deal = await this.loadForUpdate(params.dealId, tx);
      assertTransitionAllowed(deal.status, 'refunded');

      const amount = await this.ledger.outstandingEscrowLiability(deal.id, tx);
      if (amount <= 0n) {
        throw new NothingHeldError(deal.id);
      }

      await this.escrow.refund({ dealId: deal.id, amount }, tx);

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

  /**
   * Everything an operator needs to understand this deal, computed HERE.
   *
   * ── Why the figures are server-side ──
   * An operations console that computed "amount still held" by subtracting
   * two numbers it had been given would be doing accounting in a React
   * component. Every figure below is read from the ledger — the same rows
   * reconciliation reads — so the console and the books cannot disagree.
   * Nothing here re-derives a commission or a rate; those come from the
   * deal's own frozen snapshots.
   *
   * All money leaves as STRINGS of integer shillings (API Spec §2). A
   * bigint rendered as a JSON number is exactly the precision loss the money
   * core exists to prevent.
   *
   * `expectedUpfront` is the LISTING's own asking terms, carried alongside
   * `held` rather than compared to it. The comparison is the operator's to
   * make: nothing in the system currently enforces that a tenant funded what
   * the listing asked (F-012), and quietly rendering them as "correct" or
   * "short" here would imply a check that does not exist.
   */
  async financialSummary(dealId: string) {
    const deal = await this.prisma.deal.findUnique({
      where: { id: dealId },
      include: { listing: true },
    });
    if (!deal) {
      throw new DealNotFoundError(dealId);
    }

    const entries = await this.prisma.ledgerEntry.findMany({
      where: { dealId },
      select: {
        direction: true,
        amount: true,
        reference: true,
        occurredAt: true,
        account: { select: { accountType: true } },
      },
      orderBy: { occurredAt: 'asc' },
    });

    /** Credit-balance accounts read negative in the ledger's convention. */
    const balance = (type: string) =>
      entries
        .filter((e) => e.account.accountType === type)
        .reduce(
          (sum, e) => (e.direction === 'debit' ? sum + e.amount : sum - e.amount),
          0n,
        );

    /** The gross of one posting kind, by its reference. */
    const byReference = (reference: string) =>
      entries
        .filter((e) => e.reference === reference && e.direction === 'credit')
        .reduce((sum, e) => sum + e.amount, 0n);

    const expectedUpfront =
      deal.listing.monthlyRent * BigInt(deal.listing.requiredMonthsUpfront) +
      deal.listing.depositAmount;

    return {
      /** What the listing asks for. NOT compared to `held` — see F-012. */
      expectedUpfront: expectedUpfront.toString(),
      /** Frozen at agreement_signed, immutable thereafter (FR-7.4). */
      monthlyRentSnapshot: deal.monthlyRentSnapshot?.toString() ?? null,
      commissionRateBpSnapshot: deal.commissionRateBpSnapshot,
      /** Computed at commission_earned from the snapshots, then stored. */
      commissionAmount: deal.commissionAmount?.toString() ?? null,

      /** Still owed back to the tenant or onward to the landlord. */
      heldInEscrow: (-balance('escrow_liability')).toString(),
      /** Authorised to the landlord but not yet moved by the custodian. */
      owedToLandlord: (-balance('landlord_payable')).toString(),
      /** Revenue recognised. Only ever at commission_earned (FR-7.5). */
      commissionRecognised: (-balance('commission_revenue')).toString(),

      funded: byReference('fund_escrow').toString(),
      releasedToLandlord: byReference('release_to_landlord').toString(),
      refunded: byReference('refund').toString(),

      /**
       * True when the liability has fully unwound. Reported rather than
       * asserted: a non-zero balance on a terminal deal is a real condition
       * an operator must be able to see, not something to hide behind a
       * green tick.
       */
      escrowDischarged: balance('escrow_liability') === 0n,
    };
  }

  /**
   * The property and the two parties, at the minimum an operator needs to
   * know WHICH rental this is.
   *
   * Deliberately no phone numbers (NFR-3, data minimisation). An operator
   * who must call a party has a real need, but a deal page that lists both
   * counterparties' numbers is a contact-details export with a deal attached,
   * and widening it is a decision for whoever owns the DPA position rather
   * than a convenience to add in passing.
   *
   * There is also no landlord identity beyond a display name: the tenant
   * reads this endpoint too (scoped by DealPartyGuard), and the landlord's
   * details are not the tenant's to receive.
   */
  async dealContext(dealId: string) {
    const deal = await this.prisma.deal.findUnique({
      where: { id: dealId },
      include: {
        listing: {
          include: { property: { include: { neighbourhood: true } } },
        },
        tenantParty: { select: { displayName: true } },
        landlordParty: { select: { displayName: true } },
      },
    });
    if (!deal) {
      throw new DealNotFoundError(dealId);
    }

    const property = deal.listing.property;
    return {
      listing: {
        id: deal.listing.id,
        monthlyRent: deal.listing.monthlyRent.toString(),
        requiredMonthsUpfront: deal.listing.requiredMonthsUpfront,
        depositAmount: deal.listing.depositAmount.toString(),
        publicationState: deal.listing.publicationState,
        availabilityStatus: deal.listing.availabilityStatus,
        verificationState: deal.listing.verificationState,
      },
      property: {
        id: property.id,
        propertyType: property.propertyType,
        bedrooms: property.bedrooms,
        bathrooms: property.bathrooms,
        furnished: property.furnished,
        landmarkText: property.landmarkText,
        neighbourhood: property.neighbourhood.name,
        inServiceArea: property.neighbourhood.inServiceArea,
      },
      parties: {
        tenant: {
          partyId: deal.tenantPartyId,
          displayName: deal.tenantParty.displayName,
        },
        landlord: {
          partyId: deal.landlordPartyId,
          displayName: deal.landlordParty.displayName,
        },
      },
    };
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

  /**
   * Loads the deal AND TAKES A ROW LOCK on it, for the duration of `tx`.
   *
   * ── Why the raw SELECT ... FOR UPDATE ──
   * This method was named `loadForUpdate` from Stage 3 and, until F-012, did
   * not lock anything: it was a plain `findUnique`. Under READ COMMITTED
   * that is enough to read a consistent row and nothing else, so two
   * concurrent operators could each read `commission_earned`, each pass
   * `assertTransitionAllowed`, each read the FULL outstanding liability, and
   * each post a release. Prisma's `update` does not re-check the status it
   * read, so the second commit succeeded too — the landlord was paid twice
   * out of one escrow.
   *
   * That was not hypothetical. Two settlements fired together both returned
   * 201 against real Postgres, and so did two refunds. Reading the balance
   * inside the transaction — which F-012 already did — is necessary and NOT
   * sufficient; without the lock, "inside the transaction" only means both
   * readers see the same stale number.
   *
   * With the lock, the second transaction blocks until the first commits,
   * then re-reads a deal whose status has moved. `settled` has no outgoing
   * `settled` edge and `refunded` has no outgoing edges at all, so the
   * second attempt is refused by the state machine it already passed once —
   * this time against the truth.
   *
   * Prisma has no first-class row lock, hence the raw statement. It selects
   * only `id`: the lock is the point, and the row itself is then read
   * through the typed client so callers keep a real `Deal`.
   */
  private async loadForUpdate(dealId: string, tx: Tx): Promise<Deal> {
    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "deal" WHERE id = ${dealId} FOR UPDATE
    `;
    if (locked.length === 0) {
      throw new DealNotFoundError(dealId);
    }

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
            commissionRateBpSnapshot: updated.commissionRateBpSnapshot ?? null,
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
