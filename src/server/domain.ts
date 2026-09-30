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
] as const;
export type DealStatus = (typeof DEAL_STATUSES)[number];

export const LEDGER_ACCOUNT_TYPES = [
  'escrow_liability',
  'commission_receivable',
  'commission_revenue',
  'landlord_payable',
  'psp_clearing',
] as const;
export type LedgerAccountType = (typeof LEDGER_ACCOUNT_TYPES)[number];

export const IDENTITY_METHODS = ['nin', 'phone', 'selfie_match'] as const;
export type IdentityMethod = (typeof IDENTITY_METHODS)[number];

// ── the state machine ────────────────────────────────────────────────────

/**
 * THE STATE MACHINE (Data_Model.md §7.3) - a direct encoding of the
 * transition table. Everything else is rejected (FR-8.1).
 */
export const ALLOWED_TRANSITIONS: Readonly<
  Record<DealStatus, readonly DealStatus[]>
> = Object.freeze({
  created: ['tenant_matched', 'cancelled', 'dispute_hold'],
  tenant_matched: ['agreement_signed', 'cancelled', 'dispute_hold'],
  agreement_signed: ['escrow_funded', 'cancelled', 'dispute_hold'],
  // No 'settled' (the guarantee) and no 'cancelled' (Amendment A1).
  escrow_funded: ['move_in_confirmed', 'refunded', 'dispute_hold'],
  move_in_confirmed: ['commission_earned', 'dispute_hold'],
  commission_earned: ['settled', 'dispute_hold'],
  settled: ['closed', 'dispute_hold'],
  dispute_hold: ['refunded', 'settled'],
  closed: [],
  cancelled: [],
  refunded: [],
});

/** Statuses from which no further transition is possible. */
export const TERMINAL_STATUSES: readonly DealStatus[] = Object.freeze([
  'closed',
  'cancelled',
  'refunded',
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
    to: 'move_in_confirmed',
    label: 'Confirm move-in',
    consequence:
      "Records that the tenant has moved in. This UNLOCKS commission and settlement - until now their money was protected. It is the tenant's confirmation to give; recording it on their behalf releases their protection.",
    reversible: false,
    movesMoney: false,
    partyScoped: true,
    fields: [],
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
        ? params.deal.status === 'dispute_hold'
        : isTransitionAllowed(params.deal.status as DealStatus, spec.to);
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
};

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
