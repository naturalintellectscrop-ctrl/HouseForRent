import { AuthRole, Deal, DealStatus } from '@prisma/client';
import { isTransitionAllowed } from './deal-state-machine';

/**
 * WHAT AN OPERATOR MAY DO TO THIS DEAL, RIGHT NOW — computed on the server.
 *
 * ── Why this exists ──
 * Every surface that offers deal transitions needs to know which ones are
 * legal from the current status, for the current caller. There are exactly
 * two ways to answer that: the client re-implements the transition graph and
 * the role matrix, or the server answers and the client renders the answer.
 *
 * The first is how a console ends up offering "Settle" on a deal that cannot
 * be settled, and — worse — how it ends up NOT offering an action that is
 * legal, because its copy of the graph drifted from the real one. The rule
 * that funds cannot be released before move-in is the shape of
 * ALLOWED_TRANSITIONS; a second copy in a React component is a second rule,
 * and the wrong one the moment the two disagree.
 *
 * ── Why the roles are not listed here ──
 * They are read from the controller's own `@Roles()` decorators at request
 * time and passed in as `rolesFor`. Writing them into this table would be
 * exactly the duplication the table exists to prevent: the guard would
 * enforce one list and the console would render another, and nothing would
 * fail when they diverged. Here, they cannot diverge — there is one list.
 *
 * ── What this is NOT ──
 * It is not authorisation. `RolesGuard`, `DealPartyGuard` and the state
 * machine still refuse anything illegal, whoever asks and however they ask.
 * This decides what to OFFER; those decide what to ALLOW. A client that
 * ignores this and posts anyway is refused exactly as before.
 */

export interface DealActionField {
  name: string;
  /** `shillings` is an integer-string amount (API Spec §2). */
  kind: 'shillings' | 'text';
  label: string;
  hint?: string;
  required: boolean;
}

export interface DealActionSpec {
  /** Stable id, and the URL segment: `POST /v1/deals/:id/{action}`. */
  action: string;
  /** The `DealsController` method that implements it. Roles come FROM it. */
  handler: string;
  /**
   * The status this action reaches, or `null` when the target is dynamic.
   * `resolve-dispute` restores whatever status the deal held before the
   * hold, read from its own transition history — so it has no fixed target
   * and its availability is keyed to `dispute_hold` directly.
   */
  to: DealStatus | null;
  label: string;
  /** Plain language: what actually happens. Shown in the confirmation. */
  consequence: string;
  /** Whether the system offers any path back afterwards. */
  reversible: boolean;
  /** True when real money moves or is recognised. */
  movesMoney: boolean;
  /** Mirrors `@RequiresDealParty()` on the handler. */
  partyScoped: boolean;
  fields: DealActionField[];
}

/**
 * One row per legal transition endpoint on `DealsController` — and no
 * others. There is no row for a status the machine cannot reach, because
 * there is no endpoint that would accept one.
 */
export const DEAL_ACTIONS: readonly DealActionSpec[] = Object.freeze([
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
    fields: [
      {
        name: 'reason',
        kind: 'text',
        label: 'Note (optional)',
        required: false,
      },
    ],
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
  },
  {
    action: 'fund-escrow',
    handler: 'fundEscrow',
    to: 'escrow_funded',
    label: 'Record escrow funding',
    consequence:
      "Records the tenant's upfront payment into escrow as a liability we owe back. The amount is derived from this deal's own signed terms. No revenue is recognised. Once funded, the deal can only move forward to move-in or back as a full refund — it cannot be cancelled.",
    reversible: false,
    movesMoney: true,
    partyScoped: true,
    // No amount field: the server derives the upfront total from the deal's
    // own signed terms (F-012).
    fields: [],
  },
  {
    action: 'confirm-move-in',
    handler: 'confirmMoveIn',
    to: 'move_in_confirmed',
    label: 'Confirm move-in',
    consequence:
      "Records that the tenant has moved in. This UNLOCKS commission and settlement — until now their money was protected. It is the tenant's confirmation to give; recording it on their behalf releases their protection.",
    reversible: false,
    movesMoney: false,
    partyScoped: true,
    fields: [],
  },
  {
    action: 'earn-commission',
    handler: 'earnCommission',
    to: 'commission_earned',
    label: 'Recognise commission',
    consequence:
      "Recognises our commission as revenue, computed from this deal's own frozen snapshots — not from the escrow total and not from any current rate. This is an accounting event and it is permanent.",
    reversible: false,
    movesMoney: true,
    partyScoped: false,
    fields: [],
  },
  {
    action: 'settle',
    handler: 'settle',
    to: 'settled',
    label: 'Settle — pay the landlord',
    consequence:
      'Instructs the custodian to pay the landlord everything still held for this deal — the commission has already been taken out of it. The amount is the ledger balance, not a figure anyone types. Real money leaves, and a settlement cannot be undone.',
    reversible: false,
    movesMoney: true,
    partyScoped: false,
    // No amount field: what the landlord receives is the outstanding escrow
    // liability, which already has the commission debited out of it (F-012).
    fields: [],
  },
  {
    action: 'close',
    handler: 'close',
    to: 'closed',
    label: 'Close the deal',
    consequence:
      'Marks a settled deal finished. Terminal — no further transition exists from here. No money moves.',
    reversible: false,
    movesMoney: false,
    partyScoped: false,
    fields: [],
  },
  {
    action: 'refund',
    handler: 'refund',
    to: 'refunded',
    label: 'Refund the tenant',
    consequence:
      'Returns everything still held to the tenant and earns NO commission. The amount is the ledger balance, not a figure anyone types. Real money leaves. Terminal — the deal ends here and cannot be revived.',
    reversible: false,
    movesMoney: true,
    partyScoped: false,
    // No amount field: a full refund is what the ledger says we still hold.
    fields: [],
  },
  {
    action: 'cancel',
    handler: 'cancel',
    to: 'cancelled',
    label: 'Cancel the deal',
    consequence:
      'Ends the deal before any money is held. Terminal. A deal that has already been funded cannot be cancelled at all — it must be refunded instead, so held client money is never stranded.',
    reversible: false,
    movesMoney: false,
    partyScoped: true,
    fields: [
      {
        name: 'reason',
        kind: 'text',
        label: 'Reason',
        hint: 'Recorded permanently on the transition.',
        required: true,
      },
    ],
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
    fields: [
      {
        name: 'reason',
        kind: 'text',
        label: 'Reason for the hold',
        required: true,
      },
    ],
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
    fields: [
      {
        name: 'reason',
        kind: 'text',
        label: 'Resolution note (optional)',
        required: false,
      },
    ],
  },
]);

/** What a client is told about one currently-permitted action. */
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
 * Three independent conditions, all of which must hold — the same three the
 * request itself would face:
 *   1. the state machine permits the transition (or, for `resolve-dispute`,
 *      the deal is actually on hold);
 *   2. the caller's role appears in the handler's own `@Roles()` list;
 *   3. if the handler carries `@RequiresDealParty()`, the caller is a party
 *      — staff pass this, exactly as `DealPartyGuard` lets them.
 *
 * An action failing any of these is simply absent. It is deliberately NOT
 * returned with a "blocked" flag: listing every action a caller cannot take,
 * with the reason, tells an unprivileged client the shape of the whole
 * transition graph and which deals are in which state. The queue and the
 * status are already visible to those who may see them; the rest is not
 * theirs to enumerate.
 */
export function availableDealActions(params: {
  deal: Pick<Deal, 'status' | 'tenantPartyId' | 'landlordPartyId'>;
  callerPartyId: string;
  callerRole: AuthRole;
  /** Reads `@Roles()` off the controller method. One source, not a copy. */
  rolesFor: (handler: string) => readonly AuthRole[] | undefined;
}): AvailableDealAction[] {
  const isStaff = params.callerRole === 'admin' || params.callerRole === 'foo';
  const isParty =
    params.deal.tenantPartyId === params.callerPartyId ||
    params.deal.landlordPartyId === params.callerPartyId;

  return DEAL_ACTIONS.filter((spec) => {
    const reachable =
      spec.to === null
        ? params.deal.status === 'dispute_hold'
        : isTransitionAllowed(params.deal.status, spec.to);
    if (!reachable) return false;

    const roles = params.rolesFor(spec.handler);
    // No decorator means any authenticated caller — but every transition
    // endpoint carries one, so this is a guard against a future handler
    // being added without one rather than a case that occurs today.
    if (roles && roles.length > 0 && !roles.includes(params.callerRole)) {
      return false;
    }

    if (spec.partyScoped && !isParty && !isStaff) return false;

    return true;
  }).map((spec) => ({
    action: spec.action,
    label: spec.label,
    consequence: spec.consequence,
    reversible: spec.reversible,
    movesMoney: spec.movesMoney,
    fields: spec.fields,
  }));
}
