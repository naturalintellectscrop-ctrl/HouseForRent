/**
 * The deal lifecycle (Data_Model.md §7) - the spine that composes Identity,
 * Agreements and Ledger into the core business flow.
 *
 * Ported from apps/api/src/deals/deals.service.ts. Every transition:
 *   - is checked against ALLOWED_TRANSITIONS before anything is written;
 *   - writes the new status AND an immutable deal_transition row AND any
 *     ledger effect inside ONE transaction, so money state and deal state
 *     can never diverge;
 *   - is expressed as a named business operation - there is deliberately no
 *     public method that takes an arbitrary target status.
 *
 * Concurrency note (sandbox): SQLite has no SELECT … FOR UPDATE. The
 * outstanding-liability read runs INSIDE the same transaction as the
 * posting, and SQLite serialises writers, which preserves the
 * no-double-release property that the Postgres row lock provides. The
 * FOR UPDATE statement returns when the real API is restored.
 */
import { randomUUID } from 'node:crypto';
import { db } from '@/lib/db';
import {
  assertTransitionAllowed,
  computeCommission,
  availableDealActions,
  TERMINAL_STATUSES,
  type AuthRole,
  type DealStatus,
} from './domain';
import * as ledger from './ledger';
import { ApiError } from './http';
import { nylonPayLive, nylonPayMode } from './nylonpay';
import { depositCustodyConfirmed, policySnapshotValue } from './finance/policy';

type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0];

/**
 * Every money-bearing transition runs inside an interactive transaction.
 * The budget is raised above Prisma's 5s default so a cold JIT pass or a
 * loaded SQLite checkpoint cannot abort a legitimate posting mid-flight -
 * a partially-timed-out money path is far worse than a slower one.
 */
export async function transactional<T>(
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  return db.$transaction(fn, { maxWait: 10_000, timeout: 30_000 });
}

// ── errors (same taxonomy as the API; mapped to HTTP codes at the edge) ──

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
        'matches the rent snapshotted onto this deal at signing.',
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
        `terms require (${derived}). The server derives every posted figure.`,
    );
    this.name = 'AmountNotAuthoritativeError';
  }
}
export class NothingHeldError extends Error {
  constructor(dealId: string) {
    super(`deal ${dealId} holds no escrow balance, so there is nothing to release or return.`);
    this.name = 'NothingHeldError';
  }
}
export class CommissionNotEarnedError extends Error {
  constructor(dealId: string) {
    super(
      `deal ${dealId} has not earned its commission yet. Recognise the commission before settling ` +
        'so the landlord receives the net rent, never the gross.',
    );
    this.name = 'CommissionNotEarnedError';
  }
}
export class CommissionAlreadyRecognisedError extends Error {
  constructor(dealId: string) {
    super(
      `deal ${dealId} already carries recognised commission. Commission is charged once on the ` +
        'initial rental transaction; corrections go through an approved reversal, not a second posting.',
    );
    this.name = 'CommissionAlreadyRecognisedError';
  }
}
export class MissingListingAgreementError extends Error {
  constructor(listingId: string) {
    super(
      `listing ${listingId} has no accepted listing agreement. The landlord must ` +
        'accept the agreement before this step.',
    );
    this.name = 'MissingListingAgreementError';
  }
}
export class MissingIntroductionRecordError extends Error {
  constructor(dealId: string) {
    super(
      `deal ${dealId} cannot reach tenant_matched without an introduction_record.`,
    );
    this.name = 'MissingIntroductionRecordError';
  }
}
export class IntroductionRecordNotFoundError extends Error {
  constructor(id: string) {
    super(`introduction record ${id} not found`);
    this.name = 'IntroductionRecordNotFoundError';
  }
}
export class NotTheIntroducingOfficerError extends Error {
  constructor(id: string) {
    super(
      `introduction record ${id} was produced by a different field officer. ` +
        'An officer opens deals off the introductions they themselves made.',
    );
    this.name = 'NotTheIntroducingOfficerError';
  }
}
export class ViewingNotConductedError extends Error {
  constructor(viewingId: string) {
    super(`viewing ${viewingId} is not conducted, so no deal may be opened from its introduction record`);
    this.name = 'ViewingNotConductedError';
  }
}
/**
 * The status-write compare-and-swap failed: between reading the deal and
 * writing its new status, a concurrent transaction changed the status. The
 * whole transaction (including any ledger posting) rolls back - two
 * concurrent settlements, refunds or fundings can book at most one of
 * themselves. This is the Postgres counterpart of the SQLite
 * writers-serialise guarantee the module header describes.
 */
export class ConcurrentDealUpdateError extends Error {
  constructor(dealId: string) {
    super(
      `deal ${dealId} changed status concurrently - the action raced another ` +
        'confirmed money effect and was rolled back; retry to see the current state.',
    );
    this.name = 'ConcurrentDealUpdateError';
  }
}

/**
 * Live-mode funding refuses to collect a DEPOSIT while the provider's
 * custody capability is unverified (deposit_custody_provider_confirmed,
 * default false). The sandbox mock is unaffected - it is a labelled
 * rehearsal, not real money. Fail-closed: no real deposit custody claim
 * exists until the business verifies the capability (docs §8).
 */
export class DepositCustodyUnconfirmedError extends Error {
  constructor(dealId: string) {
    super(
      `deal ${dealId} cannot be funded with a deposit in live payment mode: the ` +
        "provider's custody and release capability is not verified " +
        '(deposit_custody_provider_confirmed is unset/false). Rent-only funding ' +
        'or sandbox rehearsal remains available; no real deposit custody claim is permitted.',
    );
    this.name = 'DepositCustodyUnconfirmedError';
  }
}

export class DealAlreadyExistsError extends Error {
  constructor(
    introductionRecordId: string,
    readonly existingDealId: string,
  ) {
    super(
      `introduction record ${introductionRecordId} already has an active deal ` +
        `(${existingDealId}). One introduction is one tenant meeting one property once.`,
    );
    this.name = 'DealAlreadyExistsError';
  }
}

/**
 * Deal statuses whose arrival is a MONEY EVENT or an ops-visible anomaly, and
 * the audit action each maps to. Mapping here means the audit write happens
 * on the single path every transition already takes.
 */
const AUDITED_STATUSES: Partial<Record<DealStatus, string>> = {
  escrow_funded: 'escrow_funded',
  commission_earned: 'commission_earned',
  settled: 'deal_settled',
  refunded: 'deal_refunded',
  partially_refunded: 'deal_partially_refunded',
  reversed: 'deal_reversed',
  financial_review_required: 'financial_review_required',
};

// ── creation ─────────────────────────────────────────────────────────────

/**
 * THE way a deal comes into existence (FR-8.3): the caller supplies only an
 * introduction record id, and every party on the deal is DERIVED from that
 * row. A body that cannot express a party has no party-tampering surface.
 */
export async function createFromIntroduction(params: {
  introductionRecordId: string;
  actorPartyId: string;
  actorRole: AuthRole;
}) {
  return transactional(async (tx) => {
    const introduction = await tx.introductionRecord.findUnique({
      where: { id: params.introductionRecordId },
      include: { viewing: true },
    });
    if (!introduction) throw new IntroductionRecordNotFoundError(params.introductionRecordId);

    // An officer acts on their own introductions; an admin acts on any.
    if (params.actorRole === 'foo' && introduction.fooPartyId !== params.actorPartyId) {
      throw new NotTheIntroducingOfficerError(params.introductionRecordId);
    }
    if (introduction.viewing.status !== 'conducted') {
      throw new ViewingNotConductedError(introduction.viewingId);
    }

    // One live deal per introduction. Terminal deals do not block: a deal
    // cancelled before funding must not bar the same tenant and landlord
    // from trying again off the meeting that already happened.
    const active = await tx.deal.findFirst({
      where: {
        introductionRecordId: introduction.id,
        status: { notIn: [...TERMINAL_STATUSES] },
      },
    });
    if (active) throw new DealAlreadyExistsError(introduction.id, active.id);

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

// ── transitions ──────────────────────────────────────────────────────────

/** created → tenant_matched. Requires an introduction_record (§7.3). */
export async function matchTenant(params: {
  dealId: string;
  actorPartyId: string;
  reason?: string;
}) {
  return transactional(async (tx) => {
    const deal = await requireDeal(params.dealId, tx);
    assertTransitionAllowed(deal.status as DealStatus, 'tenant_matched');
    if (!deal.introductionRecordId) throw new MissingIntroductionRecordError(params.dealId);
    return applyTransition(
      {
        deal,
        to: 'tenant_matched',
        actorPartyId: params.actorPartyId,
        reason: params.reason,
      },
      tx,
    );
  });
}

/**
 * tenant_matched → agreement_signed. THE SNAPSHOT POINT (FR-7.4): rent, rate
 * AND THE FULL ACCEPTED FINANCIAL TERMS are COPIED onto the deal here and
 * never updated again. From this moment the deal is priced by its OWN
 * columns: advance months, total advance rent, deposit, commission payer,
 * the >3-months mutual-agreement reference and the policy tokens in force -
 * a later listing edit cannot re-price any of it (docs/FINANCIAL_ARCHITECTURE.md G-1).
 */
export async function signAgreement(params: {
  dealId: string;
  actorPartyId: string;
  agreementId?: string;
  reason?: string;
}) {
  return transactional(async (tx) => {
    const deal = await requireDeal(params.dealId, tx);
    assertTransitionAllowed(deal.status as DealStatus, 'agreement_signed');
    if (deal.monthlyRentSnapshot !== null || deal.commissionRateBpSnapshot !== null) {
      throw new SnapshotImmutableError(params.dealId);
    }

    // Scoped to THIS DEAL'S LISTING in both branches - a supplied id that
    // belongs to another listing is refused, not honoured (F-014).
    const agreement = await tx.listingAgreement.findFirst({
      where: {
        listingId: deal.listingId,
        accepted: true,
        ...(params.agreementId ? { id: params.agreementId } : {}),
      },
      orderBy: { acceptedAt: 'desc' },
      include: { commissionRateVersion: true },
    });
    if (!agreement) throw new MissingListingAgreementError(deal.listingId);

    const listing = await tx.listing.findUniqueOrThrow({ where: { id: deal.listingId } });
    const advanceMonths = listing.requiredMonthsUpfront;
    const advanceRent = agreement.monthlyRentAtSigning * BigInt(advanceMonths);

    return applyTransition(
      {
        deal,
        to: 'agreement_signed',
        actorPartyId: params.actorPartyId,
        reason: params.reason,
        data: {
          agreementId: agreement.id,
          // frozen here, forever:
          monthlyRentSnapshot: agreement.monthlyRentAtSigning,
          commissionRateBpSnapshot: agreement.commissionRateVersion.rateBpOfMonth,
          commissionRateVersionId: agreement.commissionRateVersionId,
          // the full accepted financial terms (immutable from here):
          advanceMonthsSnapshot: advanceMonths,
          advanceRentSnapshot: advanceRent,
          depositAmountSnapshot: listing.depositAmount,
          commissionPayerSnapshot: 'landlord',
          mutualAgreementRefSnapshot: listing.advanceMutualAgreementRef,
          policySnapshot: policySnapshotValue(),
        },
      },
      tx,
    );
  });
}

/**
 * agreement_signed → escrow_funded (or, live-PSP, agreement_signed →
 * payment_pending until the webhook confirms). Posts the funding in the SAME
 * transaction as the status change: liability up, no revenue.
 *
 * The amount is DERIVED, never accepted (F-012) - and since the 2026-10-30
 * extension it derives from the DEAL'S OWN SNAPSHOT COLUMNS (advance rent +
 * deposit, frozen at signing), so a later listing edit can no longer re-price
 * months or deposit. Legacy deals (snapshots absent) keep the pre-extension
 * derivation from the live listing, unchanged.
 */
export async function fundEscrow(params: {
  dealId: string;
  actorPartyId: string;
  /** Transitional, checked and never trusted (see the real API's F-012 note). */
  expectedAmount?: bigint;
  reason?: string;
}) {
  // The custodian instruction is issued BEFORE the transaction opens - same
  // ordering rationale as settle(): a network call (here, the PSP seam)
  // must never run while a database transaction holds its locks. The
  // instruction is idempotent per deal, so a retry reuses it.
  const preflight = await db.deal.findUnique({ where: { id: params.dealId } });
  if (!preflight) throw new DealNotFoundError(params.dealId);
  assertTransitionAllowed(preflight.status as DealStatus, 'escrow_funded');

  const derived = await deriveFundingAmount(preflight);
  if (params.expectedAmount !== undefined && params.expectedAmount !== derived.amount) {
    throw new AmountNotAuthoritativeError(params.expectedAmount, derived.amount);
  }
  // Custody gate (docs §8): a LIVE collection that includes the deposit is a
  // real deposit-custody claim - refused while the provider's custody
  // capability is unverified. The sandbox mock is a labelled rehearsal and
  // stays open. Deposit-free funding (depositAmount 0) is unaffected.
  if (
    derived.depositAmount > 0n &&
    nylonPayMode() === 'live' &&
    !(await depositCustodyConfirmed())
  ) {
    throw new DepositCustodyUnconfirmedError(preflight.id);
  }
  const instruction = await ledger.issuePspInstruction({
    dealId: preflight.id,
    kind: 'collect',
    amount: derived.amount,
    idempotencyKey: `fund:${preflight.id}`,
  });

  // LIVE PSP: the collection is in flight on the tenant's phone. The deal
  // becomes payment_pending so the wait is VISIBLE, and custody is booked by
  // the verified webhook when the provider confirms the money - never on
  // faith. The page reloads and shows the deal still unfunded, which is the
  // truth until the webhook.
  const pspState = ledger.derivedPspState(instruction);
  if (pspState === 'pending') {
    return transactional(async (tx) => {
      const deal = await requireDeal(params.dealId, tx);
      if (deal.status === 'agreement_signed') {
        return applyTransition(
          {
            deal,
            to: 'payment_pending',
            actorPartyId: params.actorPartyId,
            reason:
              params.reason ??
              'Payment provider collection issued - awaiting the tenant’s approval of the payment prompt.',
          },
          tx,
        );
      }
      return deal; // already payment_pending from an earlier attempt - idempotent
    });
  }

  return applyEscrowFunding({
    dealId: params.dealId,
    actorPartyId: params.actorPartyId,
    expectedAmount: params.expectedAmount,
    reason: params.reason,
    instructionId: instruction.id,
  });
}

/**
 * Derives the authoritative funding figure. NEW-SHAPE deals (full terms
 * snapshotted at signing) derive EVERYTHING from the deal's own columns;
 * legacy deals keep the pre-extension derivation (snapshot rent × live
 * listing months + live listing deposit) exactly as before.
 */
async function deriveFundingAmount(deal: {
  id: string;
  listingId: string;
  monthlyRentSnapshot: bigint | null;
  advanceRentSnapshot: bigint | null;
  depositAmountSnapshot: bigint | null;
}): Promise<{ amount: bigint; rentAmount: bigint; depositAmount: bigint; newShape: boolean }> {
  if (deal.advanceRentSnapshot !== null && deal.depositAmountSnapshot !== null) {
    return {
      amount: deal.advanceRentSnapshot + deal.depositAmountSnapshot,
      rentAmount: deal.advanceRentSnapshot,
      depositAmount: deal.depositAmountSnapshot,
      newShape: true,
    };
  }
  const listing = await db.listing.findUniqueOrThrow({ where: { id: deal.listingId } });
  if (deal.monthlyRentSnapshot === null) throw new ListingTermsChangedError(deal.id);
  const rentAmount = deal.monthlyRentSnapshot * BigInt(listing.requiredMonthsUpfront);
  return {
    amount: rentAmount + listing.depositAmount,
    rentAmount,
    depositAmount: listing.depositAmount,
    newShape: false,
  };
}

/**
 * The funding transaction - the ONLY place escrow custody is ever booked.
 * The synchronous deal action calls it after the mock instruction settles;
 * the PSP webhook calls it after the provider confirms the money. It
 * re-derives the figure from the deal's own terms inside the transaction, so
 * no caller - human, route, or webhook - can post an amount the deal's
 * signed terms do not support.
 *
 * NEW-SHAPE deals split the custody posting into rent and deposit
 * liabilities, recognise COMMISSION IN THE SAME TRANSACTION (approved policy:
 * commission is earned at confirmed payment - and this only ever runs on
 * provider-confirmed money), and open the deposit lifecycle.
 */
export async function applyEscrowFunding(params: {
  dealId: string;
  actorPartyId?: string;
  actorRole?: string;
  expectedAmount?: bigint;
  reason?: string;
  instructionId?: string;
}) {
  return transactional(async (tx) => {
    const deal = await requireDeal(params.dealId, tx);
    // Custody books from agreement_signed (mock instant) or payment_pending
    // (webhook-confirmed live collection); anything else is refused by the
    // same machine check the action route would apply.
    if (deal.status !== 'agreement_signed' && deal.status !== 'payment_pending') {
      assertTransitionAllowed(deal.status as DealStatus, 'escrow_funded');
    }

    const derived = await deriveFundingAmount(deal);
    if (params.expectedAmount !== undefined && params.expectedAmount !== derived.amount) {
      throw new AmountNotAuthoritativeError(params.expectedAmount, derived.amount);
    }

    // Webhook-side custody gate: the booking path refuses a LIVE deposit
    // custody claim exactly like the action path, so no instruction issued
    // before this rule can ever land custody for an unverified capability.
    if (
      derived.depositAmount > 0n &&
      nylonPayMode() === 'live' &&
      !(await depositCustodyConfirmed())
    ) {
      throw new DepositCustodyUnconfirmedError(deal.id);
    }

    if (derived.newShape) {
      // Soft drift flag: funding no longer depends on the listing, but a
      // rent drift between signing and funding is still an ops-visible event.
      const listing = await tx.listing.findUniqueOrThrow({ where: { id: deal.listingId } });
      if (listing.monthlyRent !== deal.monthlyRentSnapshot) {
        await tx.auditEvent.create({
          data: {
            actorPartyId: await systemPartyId(tx),
            eventType: 'listing_terms_drift',
            subjectRef: deal.id,
            payload: {
              note: 'The listing rent no longer matches this deal’s signed snapshot. Funding used the deal’s own immutable terms.',
              listingRent: listing.monthlyRent.toString(),
              dealRentSnapshot: deal.monthlyRentSnapshot?.toString() ?? null,
            },
            occurredAt: new Date(),
          },
        });
      }

      await ledger.fundEscrowSplit(
        {
          dealId: deal.id,
          rentAmount: derived.rentAmount,
          depositAmount: derived.depositAmount,
          instructionId: params.instructionId,
        },
        tx,
      );

      // COMMISSION IS EARNED HERE - at confirmed payment, from the deal's
      // OWN snapshots (never a live rate, never the escrow total), inside the
      // same transaction as custody so the books cannot half-land.
      const commissionAmount = computeCommission({
        monthlyRentSnapshot: deal.monthlyRentSnapshot,
        commissionRateBpSnapshot: deal.commissionRateBpSnapshot,
      });
      if (commissionAmount > 0n) {
        await ledger.recogniseCommissionFromRent({ dealId: deal.id, amount: commissionAmount }, tx);
      }

      // The deposit lifecycle opens with custody: one case per deal.
      await tx.depositCase.create({
        data: { dealId: deal.id, custodyBasisRef: params.instructionId ?? null },
      });

      return applyTransition(
        {
          deal,
          to: 'escrow_funded',
          actorPartyId: params.actorPartyId,
          actorRole: params.actorRole,
          reason: params.reason,
          data: { commissionAmount },
        },
        tx,
      );
    }

    // ── legacy deal: pre-extension posting shape, unchanged ──
    await ledger.fundEscrow({ dealId: deal.id, amount: derived.amount }, tx);
    return applyTransition(
      {
        deal,
        to: 'escrow_funded',
        actorPartyId: params.actorPartyId,
        actorRole: params.actorRole,
        reason: params.reason,
      },
      tx,
    );
  });
}

/**
 * escrow_funded → move_in_awaiting_verification (or, when the tenant's
 * confirmation completes an open verification, straight through to
 * move_in_confirmed). The tenant's confirmation is the FIRST entry of the
 * verification record; the landlord confirms independently; an authorized
 * review decides anything else. No ledger effect - verification UNLOCKS
 * settlement, it never moves money.
 *
 * (Delegated to the move-in service; kept here under the same name the
 * action catalogue has always imported.)
 */
export async function confirmMoveIn(params: {
  dealId: string;
  actorPartyId: string;
  actorRole?: string;
  reason?: string;
  note?: string;
  evidenceRef?: string;
}) {
  const { confirmMoveIn: confirm } = await import('./finance/move-in');
  return confirm(params);
}

/**
 * move_in_confirmed → commission_earned. THE LEGACY EARN STEP - kept for
 * deals signed before commission moved to confirmed payment. New-shape deals
 * earn commission at funding; a second recognition is refused.
 */
export async function earnCommission(params: { dealId: string; actorPartyId: string; reason?: string }) {
  return transactional(async (tx) => {
    const deal = await requireDeal(params.dealId, tx);
    assertTransitionAllowed(deal.status as DealStatus, 'commission_earned');

    // Commission is charged ONCE on the initial rental transaction: a deal
    // whose books already carry commission revenue cannot earn it again.
    if ((await ledger.commissionRecognised(deal.id, tx)) > 0n) {
      throw new CommissionAlreadyRecognisedError(deal.id);
    }

    // from the SNAPSHOTS - never a live rate, never the escrow total
    const commissionAmount = computeCommission({
      monthlyRentSnapshot: deal.monthlyRentSnapshot,
      commissionRateBpSnapshot: deal.commissionRateBpSnapshot,
    });

    await ledger.recogniseCommission({ dealId: deal.id, amount: commissionAmount }, tx);

    return applyTransition(
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
 * move_in_confirmed → settled (mock PSP; live parks settlement_pending).
 * Releases what the deal still owes the LANDLORD (FR-7.6) - for split-custody
 * deals that is the RENT side only, the deposit keeps its own lifecycle. The
 * amount is the outstanding liability read inside the settling transaction -
 * never a caller-supplied total.
 */
export async function settle(params: { dealId: string; actorPartyId: string; reason?: string }) {
  const preflight = await db.deal.findUnique({ where: { id: params.dealId } });
  if (!preflight) throw new DealNotFoundError(params.dealId);
  assertTransitionAllowed(preflight.status as DealStatus, 'settled');

  const provisional = await settlementAmount(preflight);
  if (provisional <= 0n) throw new NothingHeldError(preflight.id);

  // Legacy guard: a pre-extension deal that never went through the earn step
  // must not settle gross - the old machine only reached settled from
  // commission_earned, and that invariant is preserved here.
  if (!(await ledger.hasSplitCustody(preflight.id))) {
    if (
      preflight.status === 'move_in_confirmed' &&
      (await ledger.commissionRecognised(preflight.id)) === 0n &&
      preflight.commissionRateBpSnapshot !== null
    ) {
      throw new CommissionNotEarnedError(preflight.id);
    }
  }

  const instruction = await ledger.issuePspInstruction({
    dealId: preflight.id,
    kind: 'release',
    amount: provisional,
    idempotencyKey: `settle:${preflight.id}`,
  });

  // LIVE PSP: the payout is not dispatched yet - the deal parks
  // settlement_pending rather than pretending the landlord was paid. The
  // verified webhook completes it. A FAILED instruction books nothing - the
  // provider refused the payout; the deal reverts through the webhook and a
  // retry issues a fresh instruction.
  const pspState = ledger.derivedPspState(instruction);
  if (pspState === 'failed') {
    throw new ApiError(502, 'PSP_INSTRUCTION_FAILED', 'the provider refused the payout instruction; nothing moved - retry the action');
  }
  if (pspState === 'pending') {
    return transactional(async (tx) => {
      const deal = await requireDeal(params.dealId, tx);
      if (deal.status === 'move_in_confirmed' || deal.status === 'commission_earned') {
        return applyTransition(
          {
            deal,
            to: 'settlement_pending',
            actorPartyId: params.actorPartyId,
            reason:
              params.reason ??
              'Landlord payout instructed - awaiting dispatch and confirmation by the payment provider.',
          },
          tx,
        );
      }
      return deal; // already settlement_pending - idempotent
    });
  }

  return applySettlement({
    dealId: params.dealId,
    actorPartyId: params.actorPartyId,
    reason: params.reason,
    instructionId: instruction.id,
  });
}

/** The outstanding LANDLORD-SETTLEMENT amount: rent side for split-custody deals, the whole liability for legacy ones. */
async function settlementAmount(deal: { id: string }, tx?: Tx): Promise<bigint> {
  if (await ledger.hasSplitCustody(deal.id, tx)) {
    return ledger.outstandingLiability(deal.id, 'rent_escrow_liability', tx);
  }
  return ledger.outstandingEscrowLiability(deal.id, tx);
}

/**
 * The settlement transaction - shared by the sync path (mock) and the PSP
 * webhook. Re-reads the outstanding liability INSIDE the transaction: that
 * figure, never a caller-supplied total, is what gets posted. Split-custody
 * deals settle the RENT side only; the deposit is never landlord proceeds.
 */
export async function applySettlement(params: {
  dealId: string;
  actorPartyId?: string;
  actorRole?: string;
  reason?: string;
  instructionId?: string;
}) {
  return transactional(async (tx) => {
    const deal = await requireDeal(params.dealId, tx);
    if (
      deal.status !== 'move_in_confirmed' &&
      deal.status !== 'commission_earned' &&
      deal.status !== 'settlement_pending'
    ) {
      assertTransitionAllowed(deal.status as DealStatus, 'settled');
    }

    // Re-read inside the transaction. THIS is the figure that gets posted.
    const netToLandlord = await settlementAmount(deal, tx);
    if (netToLandlord <= 0n) throw new NothingHeldError(deal.id);

    if (await ledger.hasSplitCustody(deal.id, tx)) {
      await ledger.settleRent({ dealId: deal.id, amount: netToLandlord, instructionId: params.instructionId }, tx);
      await ledger.releaseToLandlord(
        { dealId: deal.id, amount: netToLandlord, instructionId: params.instructionId },
        tx,
      );
    } else {
      await ledger.settle({ dealId: deal.id, amount: netToLandlord }, tx);
      await ledger.releaseToLandlord({ dealId: deal.id, amount: netToLandlord }, tx);
    }

    return applyTransition(
      { deal, to: 'settled', actorPartyId: params.actorPartyId, actorRole: params.actorRole, reason: params.reason },
      tx,
    );
  });
}

/** settled → closed (terminal). */
export async function close(params: { dealId: string; actorPartyId: string; reason?: string }) {
  return transactional(async (tx) => {
    const deal = await requireDeal(params.dealId, tx);
    assertTransitionAllowed(deal.status as DealStatus, 'closed');
    return applyTransition(
      { deal, to: 'closed', actorPartyId: params.actorPartyId, reason: params.reason },
      tx,
    );
  });
}

/**
 * escrow_funded → refunded (also from dispute_hold, the verification states,
 * partially_refunded, financial_review_required). Everything still held as
 * RENT goes back to the tenant (FR-7.7) and NO commission is earned. The
 * refund gets a RefundRecord (the audit trail behind the posting) whose id
 * IS the instruction idempotency key - retries reuse it, new refunds don't.
 * Live PSP: the deal parks refund_pending until the webhook confirms.
 */
export async function refund(params: { dealId: string; actorPartyId: string; reason?: string }) {
  const preflight = await db.deal.findUnique({ where: { id: params.dealId } });
  if (!preflight) throw new DealNotFoundError(params.dealId);
  assertTransitionAllowed(preflight.status as DealStatus, 'refunded');

  const provisional = await refundableRentAmount(preflight);
  if (provisional <= 0n) throw new NothingHeldError(preflight.id);

  const record = await db.refundRecord.create({
    data: {
      dealId: preflight.id,
      kind: 'full_pre_settlement',
      amount: provisional,
      reason: params.reason ?? 'Full refund of the rent held before settlement.',
      requestedByPartyId: params.actorPartyId,
    },
  });

  const instruction = await ledger.issuePspInstruction({
    dealId: preflight.id,
    kind: 'refund',
    amount: provisional,
    idempotencyKey: `refund:${record.id}`,
  });
  await db.refundRecord.update({ where: { id: record.id }, data: { instructionId: instruction.id } });

  // LIVE PSP: same honesty as settlement - the deal parks refund_pending
  // until the provider confirms the payout, and only then does the ledger
  // release the rent liability back to the tenant. A FAILED instruction
  // books nothing and throws.
  const pspState = ledger.derivedPspState(instruction);
  if (pspState === 'failed') {
    throw new ApiError(502, 'PSP_INSTRUCTION_FAILED', 'the provider refused the refund instruction; nothing moved and nothing is booked - retry the action');
  }
  if (pspState === 'pending') {
    return transactional(async (tx) => {
      const deal = await requireDeal(params.dealId, tx);
      if (deal.status !== 'refund_pending') {
        return applyTransition(
          {
            deal,
            to: 'refund_pending',
            actorPartyId: params.actorPartyId,
            reason:
              params.reason ??
              'Refund instructed - awaiting dispatch and confirmation by the payment provider.',
          },
          tx,
        );
      }
      return deal;
    });
  }

  return applyRefundCompletion({
    dealId: params.dealId,
    actorPartyId: params.actorPartyId,
    reason: params.reason,
    refundRecordId: record.id,
  });
}

/** The outstanding RENT-refund amount: rent side for split-custody deals, the whole liability for legacy ones. */
async function refundableRentAmount(deal: { id: string }, tx?: Tx): Promise<bigint> {
  if (await ledger.hasSplitCustody(deal.id, tx)) {
    return ledger.outstandingLiability(deal.id, 'rent_escrow_liability', tx);
  }
  return ledger.outstandingEscrowLiability(deal.id, tx);
}

/**
 * The refund transaction - shared by the sync path and the PSP webhook.
 * Posts the rent-side refund, marks the refund record, and lands the deal on
 * refunded (terminal) or partially_refunded (when rent liability remains).
 */
export async function applyRefundCompletion(params: {
  dealId: string;
  actorPartyId?: string;
  actorRole?: string;
  reason?: string;
  refundRecordId?: string;
  instructionId?: string;
  /** The refund record's authorized amount (full = outstanding; partial is bounded by it). */
  amountOverride?: bigint;
}) {
  return transactional(async (tx) => {
    const deal = await requireDeal(params.dealId, tx);
    assertTransitionAllowed(deal.status as DealStatus, 'refunded');

    const outstanding = await refundableRentAmount(deal, tx);
    if (outstanding <= 0n) throw new NothingHeldError(deal.id);
    const amount = params.amountOverride ?? outstanding;
    if (amount <= 0n || amount > outstanding) {
      throw new AmountNotAuthoritativeError(amount, outstanding);
    }

    if (await ledger.hasSplitCustody(deal.id, tx)) {
      await ledger.refundRent(
        { dealId: deal.id, amount, instructionId: params.instructionId ?? params.refundRecordId },
        tx,
      );
    } else {
      await ledger.refund({ dealId: deal.id, amount }, tx);
    }

    const remaining = await refundableRentAmount(deal, tx);
    const to: DealStatus = remaining > 0n ? 'partially_refunded' : 'refunded';

    if (params.refundRecordId) {
      await tx.refundRecord.update({
        where: { id: params.refundRecordId },
        data: { state: 'confirmed', confirmedAt: new Date() },
      });
    }

    return applyTransition(
      {
        deal,
        to,
        actorPartyId: params.actorPartyId,
        actorRole: params.actorRole,
        reason:
          params.reason ??
          (to === 'partially_refunded'
            ? 'Partial refund confirmed - the remaining rent stays held for this deal.'
            : undefined),
      },
      tx,
    );
  });
}

/** Pre-funding cancel. Not reachable once escrow is funded (Amendment A1). */
export async function cancel(params: { dealId: string; actorPartyId: string; reason?: string }) {
  return transactional(async (tx) => {
    const deal = await requireDeal(params.dealId, tx);
    assertTransitionAllowed(deal.status as DealStatus, 'cancelled');
    return applyTransition(
      { deal, to: 'cancelled', actorPartyId: params.actorPartyId, reason: params.reason },
      tx,
    );
  });
}

/** any active → dispute_hold (ops action). Blocks settlement (FR-10.5). */
export async function disputeHold(params: { dealId: string; actorPartyId: string; reason?: string }) {
  return transactional(async (tx) => {
    const deal = await requireDeal(params.dealId, tx);
    assertTransitionAllowed(deal.status as DealStatus, 'dispute_hold');
    return applyTransition(
      { deal, to: 'dispute_hold', actorPartyId: params.actorPartyId, reason: params.reason },
      tx,
    );
  });
}

/**
 * dispute_hold → the status held before the hold, restored from the
 * transition history rather than guessed.
 */
export async function resolveDispute(params: { dealId: string; actorPartyId: string; reason?: string }) {
  return transactional(async (tx) => {
    const deal = await requireDeal(params.dealId, tx);
    if (deal.status !== 'dispute_hold') {
      throw new Error(`deal ${params.dealId} is not on dispute_hold (status: ${deal.status})`);
    }
    const entering = await tx.dealTransition.findFirst({
      where: { dealId: deal.id, toStatus: 'dispute_hold' },
      orderBy: { createdAt: 'desc' },
    });
    if (!entering) {
      throw new Error(`deal ${params.dealId} has no recorded transition into dispute_hold`);
    }
    return applyTransition(
      {
        deal,
        to: entering.fromStatus as DealStatus,
        actorPartyId: params.actorPartyId,
        reason: params.reason ?? 'dispute resolved: restored prior status',
        skipTransitionCheck: true, // §7.3 permits returning to the prior status
      },
      tx,
    );
  });
}

// ── reads ────────────────────────────────────────────────────────────────

/** Balance of one account type across a deal's postings (debit-positive). */
function ledgerBalance(
  entries: Array<{
    direction: string;
    amount: bigint;
    account: { accountType: string };
  }>,
  type: string,
): bigint {
  return entries
    .filter((e) => e.account.accountType === type)
    .reduce((sum, e) => (e.direction === 'debit' ? sum + e.amount : sum - e.amount), 0n);
}

/** Credit total of one posting reference across a deal's ledger entries. */
function ledgerCreditsByReference(
  entries: Array<{ direction: string; amount: bigint; reference: string | null }>,
  reference: string,
): bigint {
  return entries
    .filter((e) => e.reference === reference && e.direction === 'credit')
    .reduce((sum, e) => sum + e.amount, 0n);
}

/** Credit total across a reference PREFIX (e.g. `fund_escrow:{instructionId}`). */
function ledgerCreditsByReferencePrefix(
  entries: Array<{ direction: string; amount: bigint; reference: string | null }>,
  prefix: string,
): bigint {
  return entries
    .filter((e) => (e.reference ?? '').startsWith(prefix) && e.direction === 'credit')
    .reduce((sum, e) => sum + e.amount, 0n);
}

async function ledgerEntriesFor(dealId: string) {
  return db.ledgerEntry.findMany({
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
}

/**
 * Everything an operator needs to understand this deal, computed HERE from
 * the ledger - the same rows reconciliation reads - so the console and the
 * books cannot disagree. Money leaves as STRINGS of integer shillings.
 *
 * Since the 2026-10-30 extension the classification is explicit: the rent
 * and deposit liabilities are reported separately (the deposit is never
 * part of a generic escrow figure), commission is recognised at confirmed
 * payment, provider fees appear as the HFR-borne expense they are, and the
 * accepted-terms snapshot is surfaced verbatim. Legacy deals (no split
 * postings) keep exactly the figures they always showed.
 */
export async function financialSummary(dealId: string) {
  const deal = await db.deal.findUnique({
    where: { id: dealId },
    include: { listing: true },
  });
  if (!deal) throw new DealNotFoundError(dealId);

  const entries = await ledgerEntriesFor(dealId);

  // The expected upfront: the deal's own accepted terms when present, the
  // listing's current terms otherwise (legacy deals, and pre-signing reads).
  const expectedUpfront =
    deal.advanceRentSnapshot !== null && deal.depositAmountSnapshot !== null
      ? deal.advanceRentSnapshot + deal.depositAmountSnapshot
      : deal.listing.monthlyRent * BigInt(deal.listing.requiredMonthsUpfront) + deal.listing.depositAmount;

  const rentHeld = (-ledgerBalance(entries, 'rent_escrow_liability')).toString();
  const depositHeld = (-ledgerBalance(entries, 'deposit_liability')).toString();
  const legacyHeld = (-ledgerBalance(entries, 'escrow_liability')).toString();

  return {
    expectedUpfront: expectedUpfront.toString(),
    monthlyRentSnapshot: deal.monthlyRentSnapshot?.toString() ?? null,
    commissionRateBpSnapshot: deal.commissionRateBpSnapshot,
    commissionAmount: deal.commissionAmount?.toString() ?? null,
    // ── accepted-terms snapshot (null on legacy/pre-signing deals) ──
    advanceMonthsSnapshot: deal.advanceMonthsSnapshot,
    advanceRentSnapshot: deal.advanceRentSnapshot?.toString() ?? null,
    depositAmountSnapshot: deal.depositAmountSnapshot?.toString() ?? null,
    commissionPayerSnapshot: deal.commissionPayerSnapshot,
    mutualAgreementRefSnapshot: deal.mutualAgreementRefSnapshot,
    policySnapshot: deal.policySnapshot ?? null,
    // ── classification-aware balances ──
    heldInEscrow: (BigInt(rentHeld) + BigInt(depositHeld) + BigInt(legacyHeld)).toString(),
    rentHeld,
    depositHeld,
    owedToLandlord: (-ledgerBalance(entries, 'landlord_payable')).toString(),
    commissionRecognised: (-ledgerBalance(entries, 'commission_revenue')).toString(),
    providerFeesRecorded: ledgerBalance(entries, 'psp_fee_expense').toString(),
    funded: ledgerCreditsByReferencePrefix(entries, 'fund_escrow').toString(),
    releasedToLandlord: ledgerCreditsByReference(entries, 'release_to_landlord').toString(),
    refunded: ledgerCreditsByReferencePrefix(entries, 'refund').toString(),
    depositReleased: ledgerCreditsByReferencePrefix(entries, 'deposit_refund').toString(),
    escrowDischarged:
      ledgerBalance(entries, 'escrow_liability') === 0n &&
      ledgerBalance(entries, 'rent_escrow_liability') === 0n &&
      ledgerBalance(entries, 'deposit_liability') === 0n,
  };
}

/**
 * A landlord's money position, aggregated from the same ledger rows the
 * operator console reads - never from the deal's status field.
 *
 * ── Why this is derived per deal, then summed ──
 * `heldInEscrow`/`owedToLandlord` are LIABILITY balances (credit-negative
 * in the debit-positive convention), while `releasedToLandlord` is a flow.
 * Summing flows and liabilities blindly would mix two different kinds of
 * number, so each deal is reduced to the three figures the page shows and
 * the totals sum THOSE: what has been paid out, what is waiting to be
 * paid, and what is still held. Commission is the amount booked against
 * the deal, which is also what the landlord was quoted in the agreement.
 */
export async function landlordFinancials(partyId: string) {
  const deals = await db.deal.findMany({
    where: { landlordPartyId: partyId },
    include: {
      listing: {
        include: { property: { include: { neighbourhood: true } } },
      },
    },
    orderBy: { updatedAt: 'desc' },
  });

  const rows = await Promise.all(
    deals.map(async (d) => {
      const entries = await ledgerEntriesFor(d.id);
      const held = -ledgerBalance(entries, 'escrow_liability');
      const owed = -ledgerBalance(entries, 'landlord_payable');
      const released = ledgerCreditsByReference(entries, 'release_to_landlord');
      return {
        dealId: d.id,
        status: d.status,
        updatedAt: d.updatedAt.toISOString(),
        bedrooms: d.listing.property.bedrooms,
        propertyType: d.listing.property.propertyType,
        neighbourhoodName: d.listing.property.neighbourhood.name,
        landmarkText: d.listing.property.landmarkText,
        monthlyRentSnapshot: d.monthlyRentSnapshot?.toString() ?? null,
        commissionAmount: d.commissionAmount?.toString() ?? null,
        heldInEscrow: held.toString(),
        owedToLandlord: owed.toString(),
        releasedToLandlord: released.toString(),
      };
    }),
  );

  const sum = (pick: (r: (typeof rows)[number]) => bigint) =>
    rows.reduce((acc, r) => acc + pick(r), 0n).toString();

  return {
    totals: {
      releasedToLandlord: sum((r) => BigInt(r.releasedToLandlord)),
      heldInEscrow: sum((r) => BigInt(r.heldInEscrow)),
      owedToLandlord: sum((r) => BigInt(r.owedToLandlord)),
      commissionCharged: sum((r) => BigInt(r.commissionAmount ?? '0')),
    },
    deals: rows,
  };
}

/** The property and the two parties - minimum to know WHICH rental this is. */
export async function dealContext(dealId: string) {
  const deal = await db.deal.findUnique({
    where: { id: dealId },
    include: {
      listing: { include: { property: { include: { neighbourhood: true } } } },
      tenantParty: { select: { displayName: true } },
      landlordParty: { select: { displayName: true } },
    },
  });
  if (!deal) throw new DealNotFoundError(dealId);

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
      tenant: { partyId: deal.tenantPartyId, displayName: deal.tenantParty.displayName },
      landlord: { partyId: deal.landlordPartyId, displayName: deal.landlordParty.displayName },
    },
  };
}

export async function getTransitionHistory(dealId: string) {
  return db.dealTransition.findMany({
    where: { dealId },
    orderBy: { createdAt: 'asc' },
  });
}

/**
 * Every deal the caller is a party to, WITH the property behind it.
 * `whichSide` is derived from the caller, not asserted by the client.
 */
export async function findForParty(partyId: string) {
  const deals = await db.deal.findMany({
    where: { OR: [{ tenantPartyId: partyId }, { landlordPartyId: partyId }] },
    orderBy: { createdAt: 'desc' },
    include: {
      listing: { include: { property: { include: { neighbourhood: true } } } },
      tenantParty: { select: { displayName: true } },
      landlordParty: { select: { displayName: true } },
    },
  });

  return deals.map((deal) => ({
    id: deal.id,
    status: deal.status,
    listingId: deal.listingId,
    createdAt: deal.createdAt,
    updatedAt: deal.updatedAt,
    whichSide: deal.tenantPartyId === partyId ? ('tenant' as const) : ('landlord' as const),
    counterpartyName:
      deal.tenantPartyId === partyId ? deal.landlordParty.displayName : deal.tenantParty.displayName,
    listing: {
      monthlyRent: deal.listing.monthlyRent.toString(),
      bedrooms: deal.listing.property.bedrooms,
      propertyType: deal.listing.property.propertyType,
      neighbourhoodName: deal.listing.property.neighbourhood.name,
      landmarkText: deal.listing.property.landmarkText,
    },
    // Null before signing; deliberately NOT filled in from the listing.
    monthlyRentSnapshot: deal.monthlyRentSnapshot?.toString() ?? null,
    commissionAmount: deal.commissionAmount?.toString() ?? null,
  }));
}

/**
 * The deal, its context, its figures and the caller's available actions -
 * the whole payload `GET /api/v1/deals/:id` returns.
 */
export async function getDealForCaller(dealId: string, callerPartyId: string, callerRole: AuthRole) {
  const deal = await db.deal.findUnique({ where: { id: dealId } });
  if (!deal) throw new DealNotFoundError(dealId);

  const isParty = deal.tenantPartyId === callerPartyId || deal.landlordPartyId === callerPartyId;
  const isStaff = callerRole === 'admin' || callerRole === 'foo';
  // 404, not 403, for non-parties: a 403 confirms the resource exists.
  if (!isParty && !isStaff) throw new DealNotFoundError(dealId);

  const [context, financials, transitions, moveIn, deposit, refunds, adjustments, postSettlement] =
    await Promise.all([
      dealContext(dealId),
      financialSummary(dealId),
      getTransitionHistory(dealId),
      db.moveInVerification.findUnique({ where: { dealId } }),
      db.depositCase.findUnique({
        where: { dealId },
        include: { deductions: { orderBy: { createdAt: 'asc' } } },
      }),
      db.refundRecord.findMany({ where: { dealId }, orderBy: { createdAt: 'asc' } }),
      db.financialAdjustment.findMany({ where: { dealId }, orderBy: { createdAt: 'asc' } }),
      db.postSettlementRefund.findMany({ where: { dealId }, orderBy: { createdAt: 'asc' } }),
    ]);

  return {
    id: deal.id,
    status: deal.status,
    createdAt: deal.createdAt,
    updatedAt: deal.updatedAt,
    ...context,
    financials,
    moveInVerification: moveIn,
    depositCase: deposit,
    refunds: refunds.map((r) => ({
      id: r.id,
      kind: r.kind,
      amount: r.amount.toString(),
      state: r.state,
      reason: r.reason,
      instructionId: r.instructionId,
      confirmedAt: r.confirmedAt,
      failureReason: r.failureReason,
      createdAt: r.createdAt,
    })),
    financialAdjustments: adjustments.map((a) => ({
      id: a.id,
      kind: a.kind,
      reasonCategory: a.reasonCategory,
      reason: a.reason,
      amount: a.amount.toString(),
      actorPartyId: a.actorPartyId,
      createdAt: a.createdAt,
    })),
    postSettlementRefunds: postSettlement.map((p) => ({
      id: p.id,
      amountClaimed: p.amountClaimed.toString(),
      reason: p.reason,
      state: p.state,
      requestedByPartyId: p.requestedByPartyId,
      resolutionNote: p.resolutionNote,
      resolvedAt: p.resolvedAt,
      createdAt: p.createdAt,
    })),
    availableActions: availableDealActions({
      deal: { status: deal.status, tenantPartyId: deal.tenantPartyId, landlordPartyId: deal.landlordPartyId },
      callerPartyId,
      callerRole,
      pspLive: nylonPayLive(),
    }),
    transitions: transitions.map((t) => ({
      id: t.id,
      fromStatus: t.fromStatus,
      toStatus: t.toStatus,
      actorPartyId: t.actorPartyId,
      reason: t.reason,
      createdAt: t.createdAt,
    })),
  };
}

/** The ops deal queue: every deal with enough context to triage. */
export async function listDealsForOps() {
  const deals = await db.deal.findMany({
    orderBy: { updatedAt: 'desc' },
    include: {
      listing: { include: { property: { include: { neighbourhood: true } } } },
      tenantParty: { select: { displayName: true } },
      landlordParty: { select: { displayName: true } },
    },
  });
  return deals.map((deal) => ({
    id: deal.id,
    status: deal.status,
    updatedAt: deal.updatedAt,
    tenantName: deal.tenantParty.displayName,
    landlordName: deal.landlordParty.displayName,
    neighbourhood: deal.listing.property.neighbourhood.name,
    landmarkText: deal.listing.property.landmarkText,
    bedrooms: deal.listing.property.bedrooms,
    monthlyRent: deal.listing.monthlyRent.toString(),
  }));
}

/** Deals the caller may act on, for the portal lists. */
export async function getDealRow(dealId: string) {
  return db.deal.findUnique({ where: { id: dealId } });
}

// ── internals ────────────────────────────────────────────────────────────

export async function requireDeal(dealId: string, tx: Tx) {
  const deal = await tx.deal.findUnique({ where: { id: dealId } });
  if (!deal) throw new DealNotFoundError(dealId);
  return deal;
}

/**
 * Webhook-sourced transitions still need an actor party - the production
 * deal_transition.actor_party_id is NOT NULL by design (the real API used
 * labelled PSP actor parties for exactly this). One stable, clearly-labelled
 * system party is provisioned on demand; never a fabricated human actor.
 */
export async function systemPartyId(client: Tx | typeof db = db): Promise<string> {
  const name = 'House For Rent System (PSP webhook)';
  const existing = await client.party.findFirst({ where: { displayName: name }, select: { id: true } });
  if (existing) return existing.id;
  const created = await client.party.create({
    // The placeholder phone is deliberately not a dialable number - it
    // labels the row as plumbing, not a person.
    data: { displayName: name, primaryPhone: 'PSP-WEBHOOK-SYSTEM' },
    select: { id: true },
  });
  return created.id;
}

/**
 * Writes the status change and its immutable transition row together.
 * Callers are already inside a transaction that also holds any ledger
 * effect, so all three commit or roll back as one. Money events are
 * audit-logged in the SAME transaction, with amounts as strings.
 */
export async function applyTransition(
  params: {
    deal: { id: string; status: string };
    to: DealStatus;
    /** Absent when the actor is not a person - e.g. a PSP webhook. */
    actorPartyId?: string;
    actorRole?: string;
    reason?: string;
    data?: Record<string, unknown>;
    skipTransitionCheck?: boolean;
  },
  tx: Tx,
) {
  if (!params.skipTransitionCheck) {
    assertTransitionAllowed(params.deal.status as DealStatus, params.to);
  }

  const occurredAt = new Date();
  // The production deal_transition table requires an actor party (the
  // actor's ROLE travels in the audit payload instead of a column).
  const actorPartyId = params.actorPartyId ?? (await systemPartyId(tx));

  await tx.dealTransition.create({
    data: {
      dealId: params.deal.id,
      fromStatus: params.deal.status,
      toStatus: params.to,
      actorPartyId,
      reason: params.reason ?? null,
      occurredAt,
    },
  });

  // COMPARE-AND-SWAP on the status this transition was validated against.
  // Under Postgres READ COMMITTED two concurrent transactions can both read
  // the same prior status; the conditional update re-checks the predicate on
  // the committed row after taking the row lock, so the loser matches ZERO
  // rows and its whole transaction - ledger posting included - rolls back.
  // (SQLite/PGlite serialise writers, so the predicate there is trivially
  // true; the guard is what makes the no-double-release claim true on the
  // production database.)
  const cas = await tx.deal.updateMany({
    where: { id: params.deal.id, status: params.deal.status as DealStatus },
    data: { ...(params.data as object), status: params.to },
  });
  if (cas.count !== 1) {
    throw new ConcurrentDealUpdateError(params.deal.id);
  }
  const updated = await tx.deal.findUniqueOrThrow({ where: { id: params.deal.id } });

  const auditType = AUDITED_STATUSES[params.to];
  if (auditType) {
    await tx.auditEvent.create({
      data: {
        actorPartyId,
        eventType: auditType,
        subjectRef: updated.id,
        payload: {
          fromStatus: params.deal.status,
          toStatus: params.to,
          actorRole: params.actorRole ?? null,
          commissionAmount: updated.commissionAmount?.toString() ?? null,
          monthlyRentSnapshot: updated.monthlyRentSnapshot?.toString() ?? null,
          commissionRateBpSnapshot: updated.commissionRateBpSnapshot ?? null,
        },
        occurredAt,
      },
    });
  }

  return updated;
}

/**
 * Restores the status a deal held before entering a pending/review state -
 * read from the transition history rather than guessed (the same discipline
 * resolveDispute established). Used by: the provider-failure webhook paths,
 * the stuck-pending restore action, and financial-review resolution.
 */
export async function revertToPrePendingStatus(
  dealId: string,
  reason: string,
  tx: Tx,
  actorPartyId?: string,
  actorRole?: string,
) {
  const deal = await requireDeal(dealId, tx);
  const entering = await tx.dealTransition.findFirst({
    where: { dealId: deal.id, toStatus: deal.status },
    orderBy: { createdAt: 'desc' },
  });
  if (!entering) {
    throw new Error(`deal ${deal.id} has no recorded transition into ${deal.status}`);
  }
  return applyTransition(
    {
      deal,
      to: entering.fromStatus as DealStatus,
      actorPartyId,
      actorRole,
      reason,
      skipTransitionCheck: true, // returning to the recorded prior status
    },
    tx,
  );
}

/** The public action behind `restore-from-pending` (admin). */
export async function restoreFromPending(params: { dealId: string; actorPartyId: string; reason: string }) {
  return transactional(async (tx) => {
    return revertToPrePendingStatus(params.dealId, params.reason, tx, params.actorPartyId, 'admin');
  });
}

/**
 * A verified Nylon Pay webhook arrived - apply its outcome to the instruction
 * and, for confirmed money, to the deal. The payload snapshot comes from the
 * route AFTER signature verification; nothing here trusts an unverified body.
 *
 * Money guard: custody/settlement is only ever booked against an amount and
 * currency that match the instruction as issued. A mismatch is recorded and
 * left for ops reconciliation - never auto-posted.
 */
export async function applyPspWebhookOutcome(payload: {
  event: string;
  transaction: {
    reference: string;
    amount: string | null;
    currency: string | null;
    status: string | null;
    failureReason?: string | null;
    operatorTid?: string | null;
  };
}) {
  const instruction = await ledger.pspInstructionByReference(payload.transaction.reference);
  if (!instruction) return { matched: false as const };

  const providerBits = [
    payload.transaction.failureReason ?? null,
    payload.transaction.operatorTid ? `operator ref ${payload.transaction.operatorTid}` : null,
  ]
    .filter(Boolean)
    .join(' - ');

  switch (payload.event) {
    case 'transaction.processing': {
      // The production PSP state model is three-state (pending/succeeded/
      // failed): provider "processing" progress is recorded in the
      // append-only audit log, never as an instruction state.
      await db.auditEvent.create({
        data: {
          actorPartyId: await systemPartyId(),
          eventType: 'psp_processing',
          subjectRef: instruction.id,
          payload: {
            detail: `Nylon Pay: the transaction is processing${providerBits ? ` (${providerBits})` : ''}.`,
          },
          occurredAt: new Date(),
        },
      });
      return { matched: true as const, action: 'recorded' as const };
    }

    case 'transaction.failed':
    case 'transaction.cancelled': {
      // The state model has no "cancelled": a provider cancellation is a
      // failure to complete - nothing is booked and a retry issues a fresh
      // instruction. The detail preserves which one the provider sent.
      const cancelled = payload.event === 'transaction.cancelled';
      await ledger.transitionPspInstruction({
        instructionId: instruction.id,
        toState: 'failed',
        detail: `Nylon Pay reported ${cancelled ? 'cancellation' : 'failure'}${providerBits ? `: ${providerBits}` : ''}. No ledger effect - retry the action to issue a fresh instruction.`,
      });

      // An instructed-but-unconfirmed money move must not leave the deal
      // parked forever: provider-confirmed failure reverts the pending state
      // (the recorded prior status), with the record marked failed.
      const deal = await db.deal.findUniqueOrThrow({ where: { id: instruction.dealId } });
      if (instruction.kind === 'collect' && deal.status === 'payment_pending') {
        await transactional(async (tx) => {
          await revertToPrePendingStatus(
            deal.id,
            `Provider reported ${cancelled ? 'cancellation' : 'failure'} of the collection${providerBits ? `: ${providerBits}` : ''}. The deal is back at its pre-payment status; a retry issues a fresh instruction.`,
            tx,
          );
        });
        return { matched: true as const, action: 'payment_reverted' as const };
      }
      if (instruction.kind === 'release' && deal.status === 'settlement_pending') {
        await transactional(async (tx) => {
          await revertToPrePendingStatus(
            deal.id,
            `Provider reported ${cancelled ? 'cancellation' : 'failure'} of the landlord payout${providerBits ? `: ${providerBits}` : ''}. The deal is back at its pre-settlement status; no money left custody.`,
            tx,
          );
        });
        return { matched: true as const, action: 'settlement_reverted' as const };
      }
      // A failed payout must fail its refund RECORD wherever one is linked -
      // a duplicate-payment refund does not park the deal in refund_pending,
      // and its record still has to fail honestly. Marked BEFORE the deal
      // reverts so both paths (parked and non-parked deals) get it.
      if (instruction.kind === 'refund') {
        await db.refundRecord.updateMany({
          where: { instructionId: instruction.id, state: 'pending' },
          data: { state: 'failed', failureReason: providerBits || 'provider reported failure' },
        });
      }
      if (instruction.kind === 'refund' && deal.status === 'refund_pending') {
        await transactional(async (tx) => {
          await revertToPrePendingStatus(
            deal.id,
            `Provider reported ${cancelled ? 'cancellation' : 'failure'} of the refund${providerBits ? `: ${providerBits}` : ''}. The deal is back at its pre-refund status; the money is still held.`,
            tx,
          );
        });
        return { matched: true as const, action: 'refund_reverted' as const };
      }
      return { matched: true as const, action: 'instruction_not_taken' as const };
    }

    case 'transaction.successful': {
      // ── the money guard ──
      const rawAmount = payload.transaction.amount;
      const confirmed = rawAmount !== null && /^\d+$/.test(rawAmount) ? BigInt(rawAmount) : null;
      if (payload.transaction.currency !== 'UGX' || confirmed === null || confirmed !== instruction.amount) {
        // NOT booked: the instruction stays pending and the anomaly lives in
        // the append-only audit log until ops reconciles it.
        await db.auditEvent.create({
          data: {
            actorPartyId: await systemPartyId(),
            eventType: 'psp_amount_mismatch',
            subjectRef: instruction.id,
            payload: {
              confirmed: payload.transaction.amount ?? null,
              currency: payload.transaction.currency ?? null,
              instructionAmount: instruction.amount.toString(),
              note: 'The provider confirmation does not match the instruction. NOT booked - ops must reconcile before any ledger effect.',
            },
            occurredAt: new Date(),
          },
        });
        return { matched: true as const, action: 'amount_mismatch' as const };
      }

      const accepted = await ledger.transitionPspInstruction({
        instructionId: instruction.id,
        toState: 'succeeded',
        detail: `Nylon Pay confirmed the ${instruction.kind}${providerBits ? ` (${providerBits})` : ''}.`,
      });

      // The transition can be REFUSED when this instruction is already
      // terminal in another state - a late "successful" after a "failed"
      // (real providers do timeout-then-confirm). The first terminal outcome
      // stands: booking money effects anyway would let instruction state and
      // booked custody diverge, which is exactly what the terminal-state rule
      // exists to prevent (FINANCIAL_AUDIT.md F-1).
      if (!accepted || ledger.derivedPspState(accepted) !== 'succeeded') {
        await db.auditEvent.create({
          data: {
            actorPartyId: await systemPartyId(),
            eventType: 'psp_terminal_refused',
            subjectRef: instruction.id,
            payload: {
              event: payload.event,
              note: 'A "successful" delivery arrived for an instruction already terminal in another state. The first terminal outcome stands - nothing was booked.',
            },
            occurredAt: new Date(),
          },
        });
        return { matched: true as const, action: 'instruction_terminal_refused' as const };
      }

      const deal = await db.deal.findUniqueOrThrow({ where: { id: instruction.dealId } });
      // Booking guard: if the money effect cannot be applied (e.g. the
      // terms-changed tripwire firing between payment and booking), the
      // anomaly must be ops-visible IN THE DATABASE, not just a server log -
      // the provider will retry and keep failing, so this row is what
      // reconciliation looks for (FINANCIAL_AUDIT.md F-3). The rethrow keeps
      // the provider-retry contract (non-2xx means retry) intact.
      try {
        if (instruction.kind === 'collect') {
          if (deal.status === 'agreement_signed' || deal.status === 'payment_pending') {
            await applyEscrowFunding({
              dealId: deal.id,
              actorRole: 'psp_webhook',
              reason: 'Nylon Pay webhook confirmed the tenant’s payment.',
              instructionId: instruction.id,
            });
            return { matched: true as const, action: 'escrow_funded' as const };
          }
          // A SECOND "successful" for an already-applied collection: the
          // provider may have collected the tenant twice. The ledger booked
          // the money once; the collects-side reconciliation will show the
          // provider-side excess, and ops resolves it as a duplicate-payment
          // refund. Recorded here so the anomaly is visible immediately.
          await db.auditEvent.create({
            data: {
              actorPartyId: await systemPartyId(),
              eventType: 'psp_duplicate_collect_confirmation',
              subjectRef: instruction.id,
              payload: {
                dealId: deal.id,
                confirmed: payload.transaction.amount,
                note: 'A duplicate "successful" confirmation arrived for a collection already booked. If the provider collected the tenant twice, the duplicate must be returned - reconcile and record the duplicate-payment refund.',
              },
              occurredAt: new Date(),
            },
          });
          return { matched: true as const, action: 'already_applied' as const };
        }
        if (instruction.kind === 'release') {
          if (deal.status === 'commission_earned' || deal.status === 'settlement_pending') {
            await applySettlement({
              dealId: deal.id,
              actorRole: 'psp_webhook',
              reason: 'Nylon Pay webhook confirmed the landlord payout.',
              instructionId: instruction.id,
            });
            return { matched: true as const, action: 'settled' as const };
          }
          return { matched: true as const, action: 'already_applied' as const };
        }
        // kind === 'refund' - dispatch by the refund record's KIND through
        // the ONE shared dispatcher (the same one the retry path uses), so
        // the webhook and an admin retry can never disagree about what a
        // completed refund means. duplicate_payment records book NOTHING -
        // the duplicate was never a booked liability.
        const record = instruction.id
          ? await db.refundRecord.findFirst({ where: { instructionId: instruction.id } })
          : null;
        if (record) {
          const { completeRefundRecordByKind } = await import('./finance/refunds');
          await completeRefundRecordByKind({ recordId: record.id, actorRole: 'psp_webhook' });
          return { matched: true as const, action: `${record.kind}_completed` as const };
        }
        if (deal.status !== 'refunded') {
          await applyRefundCompletion({
            dealId: deal.id,
            actorRole: 'psp_webhook',
            reason: 'Nylon Pay webhook confirmed the refund.',
            instructionId: instruction.id,
          });
          return { matched: true as const, action: 'refunded' as const };
        }
        return { matched: true as const, action: 'already_applied' as const };
      } catch (err) {
        await db.auditEvent.create({
          data: {
            actorPartyId: await systemPartyId(),
            eventType: 'psp_booking_failed',
            subjectRef: instruction.id,
            payload: {
              dealId: deal.id,
              kind: instruction.kind,
              errorClass: err instanceof Error ? err.name : 'unknown',
              errorDetail: err instanceof Error ? err.message.slice(0, 300) : 'unknown error',
              note: 'The provider confirmed the money but the ledger booking did not complete. The provider will retry; ops must reconcile before this deal advances.',
            },
            occurredAt: new Date(),
          },
        });
        throw err;
      }
    }

    default:
      return { matched: true as const, action: 'unhandled_event' as const };
  }
}

export { TERMINAL_STATUSES };
