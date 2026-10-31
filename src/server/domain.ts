/**
 * The House For Rent domain - enums, the deal state machine, the commission
 * engine and the server-derived action catalogue.
 *
 * Ported line-for-line from apps/api/src/deals/{deal-state-machine,commission,
 * deal-actions}.ts in the HouseForRent repository. The Postgres enums become
 * string unions + validators here (SQLite), but the RULES are unchanged:
 *
 *  - This table IS the state machine (Data_Model.md §7.3). Only transitions
 *    appearing here are legal; everything else is rejected (FR-8.1).
 *  - There is deliberately NO `escrow_funded → settled` edge. The only exits
 *    from `escrow_funded` are `move_in_confirmed` or `refunded`. The
 *    Move-In Guarantee is the SHAPE OF THE GRAPH, not a flag.
 *  - `escrow_funded → cancelled` is NOT permitted (Amendment A1, 2026-07-27):
 *    a funded deal reaching a terminal state without a refund posting would
 *    strand client money.
 *  - Money is BigInt, never a float; amounts cross the wire as strings.
 */

// ── enums (SQLite: validated strings) ────────────────────────────────────

export const AUTH_ROLES = ['tenant', 'lister', 'foo', 'admin'] as const;
export type AuthRole = (typeof AUTH_ROLES)[number];

export const PARTY_STATUSES = [
  'pending_verification',
  'active',
  'suspended',
  'disabled',
  'archived',
  'closed',
] as const;
export type PartyStatus = (typeof PARTY_STATUSES)[number];

/** Statuses that may sign in (AccountStatusPolicy). */
const SIGNIN_ALLOWED: readonly PartyStatus[] = ['active'];
/** Statuses that may sign in while completing verification. */
const SIGNIN_PENDING_OK: readonly PartyStatus[] = ['pending_verification'];

export function maySignIn(status: string, role: AuthRole): boolean {
  if (SIGNIN_ALLOWED.includes(status as PartyStatus)) return true;
  if (role === 'tenant' || role === 'lister') {
    return SIGNIN_PENDING_OK.includes(status as PartyStatus);
  }
  return false;
}

export const LISTER_TIERS = [
  'property_owner',
  'broker_agent',
  'property_mgmt_company',
] as const;
export type ListerTier = (typeof LISTER_TIERS)[number];

export const PROPERTY_TYPES = ['apartment', 'house', 'room', 'other'] as const;
export type PropertyType = (typeof PROPERTY_TYPES)[number];

export const FURNISHED_STATES = [
  'furnished',
  'semi_furnished',
  'unfurnished',
] as const;
export type FurnishedState = (typeof FURNISHED_STATES)[number];

export const PUBLICATION_STATES = [
  'draft',
  'awaiting_verification',
  'live',
  'rented',
  'withdrawn',
] as const;
export type PublicationState = (typeof PUBLICATION_STATES)[number];

export const VIEWING_STATUSES = [
  'requested',
  'scheduled',
  'conducted',
  'no_show',
  'cancelled',
] as const;
export type ViewingStatus = (typeof VIEWING_STATUSES)[number];

export const CONDITION_RATINGS = ['excellent', 'good', 'fair', 'poor'] as const;
export type ConditionRating = (typeof CONDITION_RATINGS)[number];

export const DEAL_STATUSES = [
  'created',
  'tenant_matched',
  'agreement_signed',
  'escrow_funded',
  'move_in_confirmed',
  'commission_earned',
  'settled',
  'closed',
  'cancelled',
  'refunded',
  'dispute_hold',
  // financial-architecture extension (docs/FINANCIAL_ARCHITECTURE.md §7):
  'payment_pending',
  'move_in_awaiting_verification',
  'move_in_disputed',
  'settlement_pending',
  'refund_pending',
  'partially_refunded',
  'financial_review_required',
  'reversed',
] as const;
export type DealStatus = (typeof DEAL_STATUSES)[number];

export const LEDGER_ACCOUNT_TYPES = [
  'escrow_liability',
  'commission_receivable',
  'commission_revenue',
  'landlord_payable',
  'psp_clearing',
  'rent_escrow_liability',
  'deposit_liability',
  'psp_fee_expense',
] as const;
export type LedgerAccountType = (typeof LEDGER_ACCOUNT_TYPES)[number];

export const IDENTITY_METHODS = ['nin', 'phone', 'selfie_match'] as const;
export type IdentityMethod = (typeof IDENTITY_METHODS)[number];

// ── the state machine ────────────────────────────────────────────────────

/**
 * THE STATE MACHINE (Data_Model.md §7.3) - a direct encoding of the
 * transition table. Everything else is rejected (FR-8.1).
 *
 * 2026-10-30 extension (docs/FINANCIAL_ARCHITECTURE.md §7) - ADDITIVE only;
 * every pre-extension edge and terminal rule is untouched:
 *  - pending states make live PSP in-flight money VISIBLE (payment /
 *    settlement / refund instructed but unconfirmed). The sandbox mock
 *    completes instantly and keeps the original direct edges, so existing
 *    journeys are unchanged.
 *  - move-in verification replaces the single-click confirm: the only path
 *    to move_in_confirmed now runs through the verification window, with a
 *    recorded decision (both parties confirmed, or an authorized review).
 *  - `reversed` is the terminal state of a pre-settlement provider clawback.
 *  - `financial_review_required` is the ops-visible flag for money-guard
 *    anomalies; restoring the prior status is a recorded admin decision.
 */
export const ALLOWED_TRANSITIONS: Readonly<
  Record<DealStatus, readonly DealStatus[]>
> = Object.freeze({
  created: ['tenant_matched', 'cancelled', 'dispute_hold'],
  tenant_matched: ['agreement_signed', 'cancelled', 'dispute_hold'],
  agreement_signed: ['escrow_funded', 'payment_pending', 'cancelled', 'dispute_hold'],
  // No 'settled' (the guarantee) and no 'cancelled' (Amendment A1).
  escrow_funded: [
    'move_in_awaiting_verification',
    'refund_pending',
    'refunded',
    'dispute_hold',
    'partially_refunded',
    'financial_review_required',
    'reversed',
  ],
  move_in_awaiting_verification: [
    'move_in_confirmed',
    'move_in_disputed',
    // the recorded "not verified" decision outcome: money stays held and
    // only a refund can now release it
    'escrow_funded',
    'refund_pending',
    'refunded',
    'dispute_hold',
    'financial_review_required',
  ],
  move_in_disputed: [
    'move_in_confirmed',
    'escrow_funded',
    'refund_pending',
    'refunded',
    'dispute_hold',
    'financial_review_required',
    // a provider clawback of the confirmed payment ends the deal REVERSED,
    // same as from escrow_funded / awaiting verification / partially refunded
    'reversed',
  ],
  move_in_confirmed: ['settlement_pending', 'settled', 'commission_earned', 'dispute_hold'],
  commission_earned: ['settled', 'settlement_pending', 'dispute_hold'],
  payment_pending: ['escrow_funded', 'agreement_signed', 'financial_review_required'],
  settlement_pending: ['settled', 'commission_earned', 'financial_review_required'],
  refund_pending: ['refunded', 'partially_refunded'],
  partially_refunded: [
    'move_in_awaiting_verification',
    'refund_pending',
    'refunded',
    'dispute_hold',
    'financial_review_required',
    'reversed',
  ],
  financial_review_required: ['refunded'],
  dispute_hold: ['refunded', 'settled'],
  settled: ['closed', 'dispute_hold', 'financial_review_required'],
  reversed: [],
  closed: [],
  cancelled: [],
  refunded: [],
});

/** Statuses from which no further transition is possible. */
export const TERMINAL_STATUSES: readonly DealStatus[] = Object.freeze([
  'closed',
  'cancelled',
  'refunded',
  'reversed',
]);

export class IllegalTransitionError extends Error {
  constructor(
    readonly from: DealStatus,
    readonly to: DealStatus,
  ) {
    super(
      `illegal deal transition ${from} → ${to}: not permitted by the state machine (Data_Model.md §7.3)`,
    );
    this.name = 'IllegalTransitionError';
  }
}

export function isTransitionAllowed(from: DealStatus, to: DealStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function assertTransitionAllowed(from: DealStatus, to: DealStatus): void {
  if (!isTransitionAllowed(from, to)) {
    throw new IllegalTransitionError(from, to);
  }
}

// ── the commission engine (FR-7.3, FR-7.4) ───────────────────────────────

export class MissingSnapshotError extends Error {
  constructor(field: string) {
    super(
      `cannot compute commission: ${field} is not set - the deal has not been ` +
        'through agreement_signed, where snapshots are taken (FR-7.4)',
    );
    this.name = 'MissingSnapshotError';
  }
}

/** 10000 basis points = 1.0 month's rent (Data_Model.md §3.2). */
export const BASIS_POINTS_PER_MONTH = 10000n;

/**
 * commission = monthly_rent_snapshot × commission_rate_bp_snapshot / 10000.
 *
 * Pure function over the deal's OWN SNAPSHOTS - it has no access to a live
 * rate, a listing, or an escrow total. Integer arithmetic, truncating
 * division: any fractional shilling resolves in the payer's favour.
 */
export function computeCommission(params: {
  monthlyRentSnapshot: bigint | null;
  commissionRateBpSnapshot: number | null;
}): bigint {
  if (params.monthlyRentSnapshot === null || params.monthlyRentSnapshot === undefined) {
    throw new MissingSnapshotError('monthlyRentSnapshot');
  }
  if (
    params.commissionRateBpSnapshot === null ||
    params.commissionRateBpSnapshot === undefined
  ) {
    throw new MissingSnapshotError('commissionRateBpSnapshot');
  }
  return (
    (params.monthlyRentSnapshot * BigInt(params.commissionRateBpSnapshot)) /
    BASIS_POINTS_PER_MONTH
  );
}

// ── the action catalogue (deal-actions.ts) ───────────────────────────────

export interface DealActionField {
  name: string;
  kind: 'shillings' | 'text';
  label: string;
  hint?: string;
  required: boolean;
}

export interface DealActionSpec {
  /** Stable id, and the URL segment: `POST /api/v1/deals/:id/{action}`. */
  action: string;
  handler: string;
  to: DealStatus | null;
  label: string;
  consequence: string;
  reversible: boolean;
  movesMoney: boolean;
  partyScoped: boolean;
  fields: DealActionField[];
  /**
   * For `to: null` actions (no deal-status change of their own), the deal
   * statuses the action is offered in - e.g. deposit-deduction actions
   * outlive the rent journey and are offered on settled deals too.
   */
  offeredIn?: readonly DealStatus[];
  /**
   * Extra statuses (beyond `to`'s natural reachability) the action is also
   * offered from - e.g. officer evidence is accepted while a verification is
   * open AND while it is disputed.
   */
  alsoReachableFrom?: readonly DealStatus[];
}

/**
 * One row per legal transition endpoint - and no others. The `roles` here
 * ARE the controller's authorisation matrix (single source; in the real API
 * they are read off the @Roles() decorators at request time - same list).
 */
export const DEAL_ACTIONS: readonly (DealActionSpec & {
  roles: readonly AuthRole[];
})[] = Object.freeze([
  {
    action: 'match-tenant',
    handler: 'matchTenant',
    to: 'tenant_matched',
    label: 'Match the tenant',
    consequence:
      'Records that our officer introduced this tenant to this property. No money moves. The landlord can sign the agreement afterwards.',
    reversible: true,
    movesMoney: false,
    partyScoped: false,
    fields: [{ name: 'reason', kind: 'text', label: 'Note (optional)', required: false }],
    roles: ['foo', 'admin'],
  },
  {
    action: 'sign-agreement',
    handler: 'signAgreement',
    to: 'agreement_signed',
    label: 'Sign the agreement',
    consequence:
      'FREEZES the rent and the commission rate onto this deal permanently. A later rate change cannot re-price it, and these figures can never be edited.',
    reversible: false,
    movesMoney: false,
    partyScoped: true,
    fields: [
      {
        name: 'agreementId',
        kind: 'text',
        label: 'Accepted listing agreement',
        hint: 'The agreement the landlord already accepted on this listing.',
        required: true,
      },
    ],
    roles: ['lister', 'admin'],
  },
  {
    action: 'fund-escrow',
    handler: 'fundEscrow',
    to: 'escrow_funded',
    label: 'Record escrow funding',
    consequence:
      "Records the tenant's upfront payment into escrow as a liability we owe back. The amount is derived from this deal's own signed terms. No revenue is recognised. Once funded, the deal can only move forward to move-in or back as a full refund - it cannot be cancelled.",
    reversible: false,
    movesMoney: true,
    partyScoped: true,
    fields: [],
    roles: ['tenant', 'admin'],
  },
  {
    action: 'confirm-move-in',
    handler: 'confirmMoveIn',
    to: 'move_in_awaiting_verification',
    label: 'Confirm move-in',
    consequence:
      "Opens the move-in verification and records YOUR confirmation as its first entry (a note and optional evidence ref may be attached). The landlord confirms independently; the deal verifies when both have confirmed - or an authorized review decides. No money moves until the handover is verified.",
    reversible: false,
    movesMoney: false,
    partyScoped: true,
    fields: [
      { name: 'note', kind: 'text', label: 'Handover note (optional)', required: false },
      { name: 'evidenceRef', kind: 'text', label: 'Evidence reference (optional)', hint: 'A photo/document reference recording the handover.', required: false },
    ],
    roles: ['tenant', 'admin'],
  },
  {
    action: 'earn-commission',
    handler: 'earnCommission',
    to: 'commission_earned',
    label: 'Recognise commission',
    consequence:
      "Recognises our commission as revenue, computed from this deal's own frozen snapshots - not from the escrow total and not from any current rate. This is an accounting event and it is permanent.",
    reversible: false,
    movesMoney: true,
    partyScoped: false,
    fields: [],
    roles: ['admin'],
  },
  {
    action: 'settle',
    handler: 'settle',
    to: 'settled',
    label: 'Settle - pay the landlord',
    consequence:
      'Instructs the custodian to pay the landlord everything still held for this deal - the commission has already been taken out of it. The amount is the ledger balance, not a figure anyone types. Real money leaves, and a settlement cannot be undone.',
    reversible: false,
    movesMoney: true,
    partyScoped: false,
    fields: [],
    roles: ['admin'],
  },
  {
    action: 'close',
    handler: 'close',
    to: 'closed',
    label: 'Close the deal',
    consequence:
      'Marks a settled deal finished. Terminal - no further transition exists from here. No money moves.',
    reversible: false,
    movesMoney: false,
    partyScoped: false,
    fields: [],
    roles: ['admin'],
  },
  {
    action: 'refund',
    handler: 'refund',
    to: 'refunded',
    label: 'Refund the tenant',
    consequence:
      'Returns everything still held to the tenant and earns NO commission. The amount is the ledger balance, not a figure anyone types. Real money leaves. Terminal - the deal ends here and cannot be revived.',
    reversible: false,
    movesMoney: true,
    partyScoped: false,
    fields: [],
    roles: ['admin'],
  },
  {
    action: 'cancel',
    handler: 'cancel',
    to: 'cancelled',
    label: 'Cancel the deal',
    consequence:
      'Ends the deal before any money is held. Terminal. A deal that has already been funded cannot be cancelled at all - it must be refunded instead, so held client money is never stranded.',
    reversible: false,
    movesMoney: false,
    partyScoped: true,
    fields: [
      { name: 'reason', kind: 'text', label: 'Reason', hint: 'Recorded permanently on the transition.', required: true },
    ],
    roles: ['lister', 'admin'],
  },
  {
    action: 'dispute-hold',
    handler: 'disputeHold',
    to: 'dispute_hold',
    label: 'Place on dispute hold',
    consequence:
      'Freezes the deal and blocks settlement while the dispute is worked. Resolving the hold restores whatever status it held before, so this is reversible.',
    reversible: true,
    movesMoney: false,
    partyScoped: false,
    fields: [{ name: 'reason', kind: 'text', label: 'Reason for the hold', required: true }],
    roles: ['admin'],
  },
  {
    action: 'resolve-dispute',
    handler: 'resolveDispute',
    to: null,
    label: 'Resolve the hold',
    consequence:
      'Restores the status this deal held before the hold, read from its own transition history rather than chosen. To end the dispute by refunding or settling instead, use those actions directly so their money effects still run.',
    reversible: true,
    movesMoney: false,
    partyScoped: false,
    fields: [{ name: 'reason', kind: 'text', label: 'Resolution note (optional)', required: false }],
    roles: ['admin'],
  },

  // ── move-in verification (docs/FINANCIAL_ARCHITECTURE.md §4) ───────────

  {
    action: 'confirm-move-in-landlord',
    handler: 'confirmMoveInByLandlord',
    // to:null + offeredIn (not `to:`): the landlord confirms on an OPEN
    // verification only - the tenant (or an officer with evidence) opens it.
    // With `to: move_in_awaiting_verification` the catalogue's reachability
    // math offered this action in escrow_funded (where the handler refuses)
    // and hid it exactly where it works, so the dual-confirm completion was
    // invisible to the people it exists for.
    to: null,
    offeredIn: ['move_in_awaiting_verification'],
    label: 'Confirm handover (landlord)',
    consequence:
      'Records the landlord\'s independent confirmation of the handover, with an optional note and evidence reference. When the tenant has confirmed too, the verification completes and the deal moves to move-in confirmed - the only state from which settlement can run.',
    reversible: false,
    movesMoney: false,
    partyScoped: true,
    fields: [
      { name: 'note', kind: 'text', label: 'Handover note (optional)', required: false },
      { name: 'evidenceRef', kind: 'text', label: 'Evidence reference (optional)', required: false },
    ],
    roles: ['lister', 'admin'],
  },
  {
    action: 'dispute-move-in',
    handler: 'disputeMoveIn',
    to: 'move_in_disputed',
    label: 'Dispute the handover',
    consequence:
      'Records your conflicting account of the handover with the reason and evidence you supply. The deal freezes away from settlement and an authorized review decides the outcome; both the dispute and its resolution are recorded permanently.',
    reversible: true,
    movesMoney: false,
    partyScoped: true,
    fields: [
      { name: 'reason', kind: 'text', label: 'What is disputed', required: true },
      { name: 'evidenceRef', kind: 'text', label: 'Evidence reference (optional)', required: false },
    ],
    roles: ['tenant', 'lister', 'admin'],
  },
  {
    action: 'add-move-in-evidence',
    handler: 'addMoveInEvidence',
    to: 'move_in_awaiting_verification',
    alsoReachableFrom: ['move_in_awaiting_verification', 'move_in_disputed', 'escrow_funded'],
    label: 'Attach verification evidence',
    consequence:
      'Attaches field evidence (note + reference) to the open move-in verification. Officers may submit evidence; the verification decision and every settlement authority remain with the administrator.',
    reversible: true,
    movesMoney: false,
    partyScoped: true,
    fields: [
      { name: 'note', kind: 'text', label: 'What the evidence shows', required: true },
      { name: 'evidenceRef', kind: 'text', label: 'Evidence reference (optional)', required: false },
    ],
    roles: ['foo', 'admin'],
  },
  {
    action: 'verify-move-in',
    handler: 'verifyMoveIn',
    to: 'move_in_confirmed',
    label: 'Decide: handover verified',
    consequence:
      'The authorized review decision that the handover is verified. This unlocks settlement - the money decision the verification window protects. The decision, its reason and the reviewer are recorded permanently.',
    reversible: false,
    movesMoney: false,
    partyScoped: false,
    fields: [
      { name: 'reason', kind: 'text', label: 'Why the handover is verified', required: true },
      { name: 'evidenceRef', kind: 'text', label: 'Evidence reference (optional)', required: false },
    ],
    roles: ['admin'],
  },
  {
    action: 'reject-move-in',
    handler: 'rejectMoveIn',
    to: 'escrow_funded',
    label: 'Decide: handover NOT verified',
    consequence:
      'The authorized review decision that no verified move-in took place. The deal returns to escrow-funded with the money still held - only a refund can now release it. The decision and its reason are recorded permanently.',
    reversible: false,
    movesMoney: false,
    partyScoped: false,
    fields: [
      { name: 'reason', kind: 'text', label: 'Why the handover is not verified', required: true },
      { name: 'evidenceRef', kind: 'text', label: 'Evidence reference (optional)', required: false },
    ],
    roles: ['admin'],
  },

  // ── deposits (docs/FINANCIAL_ARCHITECTURE.md §5) ────────────────────────

  {
    action: 'propose-deduction',
    handler: 'proposeDeduction',
    to: null,
    offeredIn: ['escrow_funded', 'partially_refunded', 'settlement_pending', 'settled', 'closed'],
    label: 'Propose a deposit deduction',
    consequence:
      'Records the landlord\'s proposal to deduct part of the security deposit, with the amount, the reason and any evidence. Nothing is deducted yet: House For Rent reviews the proposal, and the tenant accepts or disputes it before any money moves.',
    reversible: true,
    movesMoney: false,
    partyScoped: true,
    fields: [
      { name: 'amount', kind: 'shillings', label: 'Amount to deduct (UGX)', required: true },
      { name: 'reason', kind: 'text', label: 'What the deduction covers', required: true },
      { name: 'evidenceRef', kind: 'text', label: 'Evidence reference (optional)', required: false },
    ],
    roles: ['lister', 'admin'],
  },
  {
    action: 'approve-deduction',
    handler: 'approveDeduction',
    to: null,
    offeredIn: ['escrow_funded', 'partially_refunded', 'settlement_pending', 'settled', 'closed'],
    label: 'Approve the deduction',
    consequence:
      'The House For Rent review decision that this deduction is valid and within the deposit rules (normal wear and tear is never charged to the tenant). Approval alone moves no money - the tenant still accepts or disputes it.',
    reversible: false,
    movesMoney: false,
    partyScoped: false,
    fields: [
      { name: 'deductionId', kind: 'text', label: 'Deduction to approve', required: true },
      { name: 'reason', kind: 'text', label: 'Why it is approved', required: true },
    ],
    roles: ['admin'],
  },
  {
    action: 'reject-deduction',
    handler: 'rejectDeduction',
    to: null,
    offeredIn: ['escrow_funded', 'partially_refunded', 'settlement_pending', 'settled', 'closed'],
    label: 'Reject the deduction',
    consequence:
      'The House For Rent review decision that this deduction is not valid - including anything that charges normal wear and tear to the tenant. The reason is recorded and the landlord is expected to see it.',
    reversible: false,
    movesMoney: false,
    partyScoped: false,
    fields: [
      { name: 'deductionId', kind: 'text', label: 'Deduction to reject', required: true },
      { name: 'reason', kind: 'text', label: 'Why it is rejected', required: true },
    ],
    roles: ['admin'],
  },
  {
    action: 'accept-deduction',
    handler: 'acceptDeduction',
    to: null,
    offeredIn: ['escrow_funded', 'partially_refunded', 'settlement_pending', 'settled', 'closed'],
    label: 'Accept the deduction',
    consequence:
      'The tenant accepts the reviewed deduction. It becomes payable out of the deposit when an administrator applies it.',
    reversible: false,
    movesMoney: false,
    partyScoped: true,
    fields: [
      { name: 'deductionId', kind: 'text', label: 'Deduction to accept', required: true },
      { name: 'note', kind: 'text', label: 'Note (optional)', required: false },
    ],
    roles: ['tenant', 'admin'],
  },
  {
    action: 'dispute-deduction',
    handler: 'disputeDeduction',
    to: null,
    offeredIn: ['escrow_funded', 'partially_refunded', 'settlement_pending', 'settled', 'closed'],
    label: 'Dispute the deduction',
    consequence:
      'The tenant disputes the proposed deduction. It cannot be applied while disputed; an authorized review decides. The dispute and its reason are recorded permanently.',
    reversible: true,
    movesMoney: false,
    partyScoped: true,
    fields: [
      { name: 'deductionId', kind: 'text', label: 'Deduction to dispute', required: true },
      { name: 'reason', kind: 'text', label: 'Why it is disputed', required: true },
    ],
    roles: ['tenant', 'admin'],
  },
  {
    action: 'apply-deduction',
    handler: 'applyDeduction',
    to: null,
    offeredIn: ['escrow_funded', 'partially_refunded', 'settlement_pending', 'settled', 'closed'],
    label: 'Apply the deduction',
    consequence:
      'Moves the money: the approved and tenant-accepted deduction leaves the deposit - the deducted share is paid to the landlord and any un-deducted balance the proposal covers returns to the tenant. This is a real payout on the deposit ledger and cannot be undone.',
    reversible: false,
    movesMoney: true,
    partyScoped: false,
    fields: [{ name: 'deductionId', kind: 'text', label: 'Deduction to apply', required: true }],
    roles: ['admin'],
  },
  {
    action: 'withdraw-deduction',
    handler: 'withdrawDeduction',
    to: null,
    offeredIn: ['escrow_funded', 'partially_refunded', 'settlement_pending', 'settled', 'closed'],
    label: 'Withdraw the proposal',
    consequence:
      'The landlord withdraws their own deduction proposal before it is applied. The withdrawal is recorded; nothing is deleted.',
    reversible: false,
    movesMoney: false,
    partyScoped: true,
    fields: [{ name: 'deductionId', kind: 'text', label: 'Deduction to withdraw', required: true }],
    roles: ['lister', 'admin'],
  },
  {
    action: 'refund-deposit',
    handler: 'refundDeposit',
    to: null,
    offeredIn: ['escrow_funded', 'partially_refunded', 'settlement_pending', 'settled', 'closed'],
    label: 'Release the deposit to the tenant',
    consequence:
      'Returns the deposit balance still held to the tenant - the deposit is separate from rent and was never platform or landlord revenue. The amount is the ledger balance of this deal\'s deposit liability, not a figure anyone types. Real money leaves.',
    reversible: false,
    movesMoney: true,
    partyScoped: false,
    fields: [{ name: 'reason', kind: 'text', label: 'Reason for the release', required: true }],
    roles: ['admin'],
  },
  {
    action: 'close-deposit-case',
    handler: 'closeDepositCase',
    to: null,
    offeredIn: ['escrow_funded', 'partially_refunded', 'settlement_pending', 'settled', 'closed'],
    label: 'Close the deposit case',
    consequence:
      'Closes the deposit lifecycle for this deal. Only possible when the deposit ledger balance is zero - every shilling accounted for by release, deduction or refund.',
    reversible: false,
    movesMoney: false,
    partyScoped: false,
    fields: [{ name: 'reason', kind: 'text', label: 'Closing note', required: true }],
    roles: ['admin'],
  },

  // ── refunds, reversals, fees, adjustments (docs/FINANCIAL_ARCHITECTURE.md §6) ──

  {
    action: 'partial-refund',
    handler: 'partialRefund',
    to: 'refund_pending',
    label: 'Refund part of the held rent',
    consequence:
      'Returns part of the rent still held to the tenant. The amount is checked against the ledger - it can never exceed what is actually held - and the reason is recorded permanently. The deal stays live for the remainder.',
    reversible: false,
    movesMoney: true,
    partyScoped: false,
    fields: [
      { name: 'amount', kind: 'shillings', label: 'Amount to refund (UGX)', required: true },
      { name: 'reason', kind: 'text', label: 'Reason', required: true },
    ],
    roles: ['admin'],
  },
  {
    action: 'duplicate-payment-refund',
    handler: 'duplicatePaymentRefund',
    to: null,
    offeredIn: [
      'payment_pending',
      'escrow_funded',
      'move_in_awaiting_verification',
      'move_in_disputed',
      'move_in_confirmed',
      'commission_earned',
      'partially_refunded',
      'refund_pending',
      'settlement_pending',
      'settled',
      'financial_review_required',
    ],
    label: 'Record a duplicate-payment refund',
    consequence:
      'The provider collected this payment twice and the duplicate must be returned to the tenant. The ledger booked the payment once, so no second booking is made: the decision, its amount and the source payment are recorded, a payout is instructed through the payment provider, and the record completes ONLY when the provider confirms the money left - never because this form was submitted.',
    reversible: false,
    movesMoney: false,
    partyScoped: false,
    fields: [
      { name: 'amount', kind: 'shillings', label: 'Duplicate amount (UGX)', required: true },
      { name: 'reason', kind: 'text', label: 'Reconciliation reference / what happened', required: true },
      { name: 'duplicateOfInstructionId', kind: 'text', label: 'Source payment instruction id (optional, from the duplicate-confirmation audit event)', required: false },
    ],
    roles: ['admin'],
  },
  {
    action: 'reverse-payment',
    handler: 'reversePayment',
    to: 'reversed',
    label: 'Record a provider payment reversal',
    consequence:
      'The provider clawed back the confirmed payment (for example a mobile-money sender dispute). The funding and commission postings are reversed with exact reversing entries, the deal ends as REVERSED, and the decision is recorded. Real ledger movement; cannot be undone.',
    reversible: false,
    movesMoney: true,
    partyScoped: false,
    fields: [
      { name: 'reason', kind: 'text', label: 'What the provider reversed, and its reference', required: true },
      { name: 'evidenceRef', kind: 'text', label: 'Provider evidence reference (optional)', required: false },
    ],
    roles: ['admin'],
  },
  {
    action: 'reverse-commission',
    handler: 'reverseCommission',
    to: null,
    offeredIn: ['refunded', 'reversed'],
    label: 'Reverse the commission',
    consequence:
      'Gives the platform\'s commission back to the tenant. Legal only for the approved categories - the landlord failing to provide the property, or a provider payment reversal. Any other category is refused until the business approves it; the category and reason are recorded permanently.',
    reversible: false,
    movesMoney: true,
    partyScoped: false,
    fields: [
      {
        name: 'reasonCategory',
        kind: 'text',
        label: 'Approved category',
        hint: 'landlord_failure_to_provide_property | provider_payment_reversal',
        required: true,
      },
      { name: 'reason', kind: 'text', label: 'Reason', required: true },
    ],
    roles: ['admin'],
  },
  {
    action: 'record-provider-fee',
    handler: 'recordProviderFee',
    to: null,
    offeredIn: ['escrow_funded', 'partially_refunded', 'settlement_pending', 'settled'],
    label: 'Record a provider processing fee',
    consequence:
      'Records a payment-provider fee as a House For Rent operating expense. Fees are borne by the platform: they are never deducted from the tenant\'s deposit and never silently added to the tenant\'s payment. The amount must come from verified provider data.',
    reversible: false,
    movesMoney: true,
    partyScoped: false,
    fields: [
      { name: 'amount', kind: 'shillings', label: 'Fee amount (UGX)', required: true },
      { name: 'reason', kind: 'text', label: 'Provider source / reference', required: true },
    ],
    roles: ['admin'],
  },
  {
    action: 'restore-from-pending',
    handler: 'restoreFromPending',
    to: null,
    offeredIn: ['payment_pending', 'settlement_pending', 'refund_pending', 'financial_review_required'],
    label: 'Restore the prior status',
    consequence:
      'An authorized review restores the status this deal held before it entered the pending/review state - read from the transition history, not chosen. Used to clear a stuck payment, settlement or refund, or to close a financial review. The reason is recorded permanently.',
    reversible: true,
    movesMoney: false,
    partyScoped: false,
    fields: [{ name: 'reason', kind: 'text', label: 'Why it is restored', required: true }],
    roles: ['admin'],
  },

  // ── post-settlement landlord refund responsibility (docs/FINANCIAL_ARCHITECTURE.md §6) ──

  {
    action: 'record-post-settlement-refund',
    handler: 'recordPostSettlementRefund',
    to: null,
    offeredIn: ['settled', 'closed'],
    label: 'Record unearned prepaid rent to coordinate',
    consequence:
      'After settlement, unearned prepaid rent is the LANDLORD\'s contractual responsibility - this records the claim so House For Rent can coordinate it. It is not a platform liability, no platform balance is created, and no refund is promised: resolution states name what actually happened.',
    reversible: false,
    movesMoney: false,
    partyScoped: true,
    fields: [
      { name: 'amount', kind: 'shillings', label: 'Amount claimed (UGX)', required: true },
      { name: 'reason', kind: 'text', label: 'What the claim covers', required: true },
    ],
    roles: ['tenant', 'admin'],
  },
  {
    action: 'progress-post-settlement-refund',
    handler: 'progressPostSettlementRefund',
    to: null,
    offeredIn: ['settled', 'closed'],
    label: 'Update the refund coordination',
    consequence:
      'Advances the landlord-refund coordination: acknowledged by the landlord, in coordination, resolved as paid by the landlord, resolved as waived by the tenant, or escalated to review. The outcome and note are recorded - money effects, if any, happen outside this record and are never booked as platform liabilities.',
    reversible: true,
    movesMoney: false,
    partyScoped: false,
    fields: [
      { name: 'refundId', kind: 'text', label: 'Coordination record', required: true },
      {
        name: 'outcome',
        kind: 'text',
        label: 'Outcome',
        hint: 'landlord_acknowledged | coordinating | resolved_paid_by_landlord | resolved_waived_by_tenant | escalated',
        required: true,
      },
      { name: 'note', kind: 'text', label: 'Note (optional)', required: false },
    ],
    roles: ['lister', 'admin'],
  },
]);

export interface AvailableDealAction {
  action: string;
  label: string;
  consequence: string;
  reversible: boolean;
  movesMoney: boolean;
  fields: DealActionField[];
}

/**
 * The actions this caller may take on this deal, in this status.
 *
 * Three conditions, all of which must hold - the same three the request
 * itself would face: state machine, role matrix, party scope. An action
 * failing any of them is simply absent (never a "blocked" flag, which would
 * leak the shape of the graph to an unprivileged client).
 */
export function availableDealActions(params: {
  deal: {
    status: string;
    tenantPartyId: string;
    landlordPartyId: string;
  };
  callerPartyId: string;
  callerRole: AuthRole;
  /** Live PSP honesty: funding/payout actions wait on a phone prompt, not the server. */
  pspLive?: boolean;
}): AvailableDealAction[] {
  const isStaff = params.callerRole === 'admin' || params.callerRole === 'foo';
  const isParty =
    params.deal.tenantPartyId === params.callerPartyId ||
    params.deal.landlordPartyId === params.callerPartyId;

  return DEAL_ACTIONS.filter((spec) => {
    const reachable =
      spec.to === null
        ? // to:null actions carry their own offered-in list; resolve-dispute
          // predates it and defaults to the dispute hold.
          spec.offeredIn
          ? spec.offeredIn.includes(params.deal.status as DealStatus)
          : params.deal.status === 'dispute_hold'
        : isTransitionAllowed(params.deal.status as DealStatus, spec.to) ||
          (spec.alsoReachableFrom?.includes(params.deal.status as DealStatus) ?? false);
    if (!reachable) return false;
    if (!spec.roles.includes(params.callerRole)) return false;
    if (spec.partyScoped && !isParty && !isStaff) return false;
    return true;
  }).map((spec) => ({
    action: spec.action,
    label: spec.label,
    consequence:
      params.pspLive && (spec.action === 'fund-escrow' || spec.action === 'settle' || spec.action === 'refund')
        ? `${spec.consequence} With the live payment provider this waits on a Nylon Pay payment prompt - the action records as pending and completes when the money is confirmed, not when the button is pressed.`
        : spec.consequence,
    reversible: spec.reversible,
    movesMoney: spec.movesMoney,
    fields: spec.fields,
  }));
}

// ── human labels for the console surfaces ────────────────────────────────

export const DEAL_STATUS_LABELS: Record<DealStatus, string> = {
  created: 'Created',
  tenant_matched: 'Tenant matched',
  agreement_signed: 'Agreement signed',
  escrow_funded: 'Escrow funded',
  move_in_confirmed: 'Move-in confirmed',
  commission_earned: 'Commission earned',
  settled: 'Settled',
  closed: 'Closed',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
  dispute_hold: 'Dispute hold',
  payment_pending: 'Payment pending',
  move_in_awaiting_verification: 'Move-in awaiting verification',
  move_in_disputed: 'Move-in disputed',
  settlement_pending: 'Settlement pending',
  refund_pending: 'Refund pending',
  partially_refunded: 'Partially refunded',
  financial_review_required: 'Financial review required',
  reversed: 'Reversed',
};

/** Approved reversal categories for commission retention (policy-gated). */
export const APPROVED_COMMISSION_REVERSAL_CATEGORIES = [
  'landlord_failure_to_provide_property',
  'provider_payment_reversal',
] as const;
export type CommissionReversalCategory = (typeof APPROVED_COMMISSION_REVERSAL_CATEGORIES)[number];

export const VIEWING_STATUS_LABELS: Record<ViewingStatus, string> = {
  requested: 'Requested',
  scheduled: 'Scheduled',
  conducted: 'Conducted',
  no_show: 'No show',
  cancelled: 'Cancelled',
};

export const PUBLICATION_LABELS: Record<PublicationState, string> = {
  draft: 'Draft',
  awaiting_verification: 'Awaiting verification',
  live: 'Live',
  rented: 'Rented',
  withdrawn: 'Withdrawn',
};

export const PROPERTY_TYPE_LABELS: Record<PropertyType, string> = {
  apartment: 'Apartment',
  house: 'House',
  room: 'Single room',
  other: 'Other',
};

export const FURNISHED_LABELS: Record<FurnishedState, string> = {
  furnished: 'Furnished',
  semi_furnished: 'Semi-furnished',
  unfurnished: 'Unfurnished',
};

export const CONDITION_LABELS: Record<ConditionRating, string> = {
  excellent: 'Excellent',
  good: 'Good',
  fair: 'Fair',
  poor: 'Poor',
};

export const LISTER_TIER_LABELS: Record<ListerTier, string> = {
  property_owner: 'Property owner',
  broker_agent: 'Broker / agent',
  property_mgmt_company: 'Management company',
};
