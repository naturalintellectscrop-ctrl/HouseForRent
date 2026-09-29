/**
 * The deal lifecycle (Data_Model.md §7) — the spine that composes Identity,
 * Agreements and Ledger into the core business flow.
 *
 * Ported from apps/api/src/deals/deals.service.ts. Every transition:
 *   - is checked against ALLOWED_TRANSITIONS before anything is written;
 *   - writes the new status AND an immutable deal_transition row AND any
 *     ledger effect inside ONE transaction, so money state and deal state
 *     can never diverge;
 *   - is expressed as a named business operation — there is deliberately no
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

type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0];

/**
 * Every money-bearing transition runs inside an interactive transaction.
 * The budget is raised above Prisma's 5s default so a cold JIT pass or a
 * loaded SQLite checkpoint cannot abort a legitimate posting mid-flight —
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
 * Deal statuses whose arrival is a MONEY EVENT, and the audit action each
 * maps to. Mapping here means the audit write happens on the single path
 * every transition already takes.
 */
const AUDITED_STATUSES: Partial<Record<DealStatus, string>> = {
  escrow_funded: 'escrow_funded',
  commission_earned: 'commission_earned',
  settled: 'deal_settled',
  refunded: 'deal_refunded',
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
 * tenant_matched → agreement_signed. THE SNAPSHOT POINT (FR-7.4): rent and
 * rate are COPIED onto the deal here and never updated again.
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

    // Scoped to THIS DEAL'S LISTING in both branches — a supplied id that
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
          commissionRateBpSnapshot: agreement.commissionRateVersion.rateBp,
          commissionRateVersionId: agreement.commissionRateVersionId,
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
 * The amount is DERIVED, never accepted (F-012): monthlyRentSnapshot ×
 * requiredMonthsUpfront + depositAmount. The rent comes from the DEAL's
 * snapshot; a mismatch against the listing is a tripwire meaning the terms
 * were edited since signing, and the other two cannot be trusted either.
 */
export async function fundEscrow(params: {
  dealId: string;
  actorPartyId: string;
  /** Transitional, checked and never trusted (see the real API's F-012 note). */
  expectedAmount?: bigint;
  reason?: string;
}) {
  // The custodian instruction is issued BEFORE the transaction opens — same
  // ordering rationale as settle(): a network call (here, the PSP seam)
  // must never run while a database transaction holds its locks. The
  // instruction is idempotent per deal, so a retry reuses it.
  const preflight = await db.deal.findUnique({ where: { id: params.dealId } });
  if (!preflight) throw new DealNotFoundError(params.dealId);
  assertTransitionAllowed(preflight.status as DealStatus, 'escrow_funded');

  const listing = await db.listing.findUniqueOrThrow({ where: { id: preflight.listingId } });
  if (preflight.monthlyRentSnapshot === null) throw new ListingTermsChangedError(params.dealId);
  const amount = preflight.monthlyRentSnapshot * BigInt(listing.requiredMonthsUpfront) + listing.depositAmount;
  if (params.expectedAmount !== undefined && params.expectedAmount !== amount) {
    throw new AmountNotAuthoritativeError(params.expectedAmount, amount);
  }
  await ledger.issuePspInstruction({
    dealId: preflight.id,
    kind: 'collect',
    amount,
    idempotencyKey: `fund:${preflight.id}`,
  });

  return transactional(async (tx) => {
    const deal = await requireDeal(params.dealId, tx);
    assertTransitionAllowed(deal.status as DealStatus, 'escrow_funded');

    // Re-derive INSIDE the transaction: this is the figure that gets posted.
    if (deal.monthlyRentSnapshot === null || deal.monthlyRentSnapshot !== listing.monthlyRent) {
      throw new ListingTermsChangedError(params.dealId);
    }
    const derived = deal.monthlyRentSnapshot * BigInt(listing.requiredMonthsUpfront) + listing.depositAmount;
    if (params.expectedAmount !== undefined && params.expectedAmount !== derived) {
      throw new AmountNotAuthoritativeError(params.expectedAmount, derived);
    }

    await ledger.fundEscrow({ dealId: deal.id, amount: derived }, tx);

    return applyTransition(
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

/** escrow_funded → move_in_confirmed. No ledger effect — this UNLOCKS the earn step. */
export async function confirmMoveIn(params: { dealId: string; actorPartyId: string; reason?: string }) {
  return transactional(async (tx) => {
    const deal = await requireDeal(params.dealId, tx);
    assertTransitionAllowed(deal.status as DealStatus, 'move_in_confirmed');
    return applyTransition(
      { deal, to: 'move_in_confirmed', actorPartyId: params.actorPartyId, reason: params.reason },
      tx,
    );
  });
}

/**
 * move_in_confirmed → commission_earned. COMMISSION IS EARNED HERE (FR-7.5)
 * — not at funding, not at settlement.
 */
export async function earnCommission(params: { dealId: string; actorPartyId: string; reason?: string }) {
  return transactional(async (tx) => {
    const deal = await requireDeal(params.dealId, tx);
    assertTransitionAllowed(deal.status as DealStatus, 'commission_earned');

    // from the SNAPSHOTS — never a live rate, never the escrow total
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
 * commission_earned → settled. Releases what is still held to the landlord
 * (FR-7.6). The amount is the OUTSTANDING LIABILITY, read inside the
 * settling transaction — never a caller-supplied total.
 */
export async function settle(params: { dealId: string; actorPartyId: string; reason?: string }) {
  const preflight = await db.deal.findUnique({ where: { id: params.dealId } });
  if (!preflight) throw new DealNotFoundError(params.dealId);
  assertTransitionAllowed(preflight.status as DealStatus, 'settled');

  const provisional = await ledger.outstandingEscrowLiability(preflight.id);
  if (provisional <= 0n) throw new NothingHeldError(preflight.id);

  await ledger.issuePspInstruction({
    dealId: preflight.id,
    kind: 'release',
    amount: provisional,
    idempotencyKey: `settle:${preflight.id}`,
  });

  return transactional(async (tx) => {
    const deal = await requireDeal(params.dealId, tx);
    assertTransitionAllowed(deal.status as DealStatus, 'settled');

    // Re-read inside the transaction. THIS is the figure that gets posted.
    const netToLandlord = await ledger.outstandingEscrowLiability(deal.id, tx);
    if (netToLandlord <= 0n) throw new NothingHeldError(deal.id);

    await ledger.settle({ dealId: deal.id, amount: netToLandlord }, tx);
    await ledger.releaseToLandlord({ dealId: deal.id, amount: netToLandlord }, tx);

    return applyTransition(
      { deal, to: 'settled', actorPartyId: params.actorPartyId, reason: params.reason },
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
 * escrow_funded → refunded (also from dispute_hold). Everything still held
 * goes back to the tenant (FR-7.7) and NO commission is earned.
 */
export async function refund(params: { dealId: string; actorPartyId: string; reason?: string }) {
  const preflight = await db.deal.findUnique({ where: { id: params.dealId } });
  if (!preflight) throw new DealNotFoundError(params.dealId);
  assertTransitionAllowed(preflight.status as DealStatus, 'refunded');

  const provisional = await ledger.outstandingEscrowLiability(preflight.id);
  if (provisional <= 0n) throw new NothingHeldError(preflight.id);

  await ledger.issuePspInstruction({
    dealId: preflight.id,
    kind: 'refund',
    amount: provisional,
    idempotencyKey: `refund:${preflight.id}`,
  });

  return transactional(async (tx) => {
    const deal = await requireDeal(params.dealId, tx);
    assertTransitionAllowed(deal.status as DealStatus, 'refunded');

    const amount = await ledger.outstandingEscrowLiability(deal.id, tx);
    if (amount <= 0n) throw new NothingHeldError(deal.id);

    await ledger.refund({ dealId: deal.id, amount }, tx);

    return applyTransition(
      { deal, to: 'refunded', actorPartyId: params.actorPartyId, reason: params.reason },
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

/**
 * Everything an operator needs to understand this deal, computed HERE from
 * the ledger — the same rows reconciliation reads — so the console and the
 * books cannot disagree. Money leaves as STRINGS of integer shillings.
 */
export async function financialSummary(dealId: string) {
  const deal = await db.deal.findUnique({
    where: { id: dealId },
    include: { listing: true },
  });
  if (!deal) throw new DealNotFoundError(dealId);

  const entries = await db.ledgerEntry.findMany({
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

  const balance = (type: string) =>
    entries
      .filter((e) => e.account.accountType === type)
      .reduce((sum, e) => (e.direction === 'debit' ? sum + e.amount : sum - e.amount), 0n);

  const byReference = (reference: string) =>
    entries
      .filter((e) => e.reference === reference && e.direction === 'credit')
      .reduce((sum, e) => sum + e.amount, 0n);

  const expectedUpfront =
    deal.listing.monthlyRent * BigInt(deal.listing.requiredMonthsUpfront) + deal.listing.depositAmount;

  return {
    expectedUpfront: expectedUpfront.toString(),
    monthlyRentSnapshot: deal.monthlyRentSnapshot?.toString() ?? null,
    commissionRateBpSnapshot: deal.commissionRateBpSnapshot,
    commissionAmount: deal.commissionAmount?.toString() ?? null,
    heldInEscrow: (-balance('escrow_liability')).toString(),
    owedToLandlord: (-balance('landlord_payable')).toString(),
    commissionRecognised: (-balance('commission_revenue')).toString(),
    funded: byReference('fund_escrow').toString(),
    releasedToLandlord: byReference('release_to_landlord').toString(),
    refunded: byReference('refund').toString(),
    escrowDischarged: balance('escrow_liability') === 0n,
  };
}

/** The property and the two parties — minimum to know WHICH rental this is. */
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
 * The deal, its context, its figures and the caller's available actions —
 * the whole payload `GET /api/v1/deals/:id` returns.
 */
export async function getDealForCaller(dealId: string, callerPartyId: string, callerRole: AuthRole) {
  const deal = await db.deal.findUnique({ where: { id: dealId } });
  if (!deal) throw new DealNotFoundError(dealId);

  const isParty = deal.tenantPartyId === callerPartyId || deal.landlordPartyId === callerPartyId;
  const isStaff = callerRole === 'admin' || callerRole === 'foo';
  // 404, not 403, for non-parties: a 403 confirms the resource exists.
  if (!isParty && !isStaff) throw new DealNotFoundError(dealId);

  const [context, financials, transitions] = await Promise.all([
    dealContext(dealId),
    financialSummary(dealId),
    getTransitionHistory(dealId),
  ]);

  return {
    id: deal.id,
    status: deal.status,
    createdAt: deal.createdAt,
    updatedAt: deal.updatedAt,
    ...context,
    financials,
    availableActions: availableDealActions({
      deal: { status: deal.status, tenantPartyId: deal.tenantPartyId, landlordPartyId: deal.landlordPartyId },
      callerPartyId,
      callerRole,
    }),
    transitions: transitions.map((t) => ({
      id: t.id,
      fromStatus: t.fromStatus,
      toStatus: t.toStatus,
      actorPartyId: t.actorPartyId,
      actorRole: t.actorRole,
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

async function requireDeal(dealId: string, tx: Tx) {
  const deal = await tx.deal.findUnique({ where: { id: dealId } });
  if (!deal) throw new DealNotFoundError(dealId);
  return deal;
}

/**
 * Writes the status change and its immutable transition row together.
 * Callers are already inside a transaction that also holds any ledger
 * effect, so all three commit or roll back as one. Money events are
 * audit-logged in the SAME transaction, with amounts as strings.
 */
async function applyTransition(
  params: {
    deal: { id: string; status: string };
    to: DealStatus;
    actorPartyId: string;
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

  await tx.dealTransition.create({
    data: {
      dealId: params.deal.id,
      fromStatus: params.deal.status,
      toStatus: params.to,
      actorPartyId: params.actorPartyId,
      actorRole: params.actorRole ?? null,
      reason: params.reason ?? null,
      createdAt: occurredAt,
    },
  });

  const updated = await tx.deal.update({
    where: { id: params.deal.id },
    data: { ...(params.data as object), status: params.to },
  });

  const auditType = AUDITED_STATUSES[params.to];
  if (auditType) {
    await tx.auditEvent.create({
      data: {
        actorPartyId: params.actorPartyId,
        actorRole: params.actorRole ?? null,
        action: auditType,
        entityType: 'deal',
        entityId: updated.id,
        detail: JSON.stringify({
          fromStatus: params.deal.status,
          toStatus: params.to,
          commissionAmount: updated.commissionAmount?.toString() ?? null,
          monthlyRentSnapshot: updated.monthlyRentSnapshot?.toString() ?? null,
          commissionRateBpSnapshot: updated.commissionRateBpSnapshot ?? null,
        }),
        createdAt: occurredAt,
      },
    });
  }

  return updated;
}

export { TERMINAL_STATUSES };
