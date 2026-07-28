import { DealStatus } from '@prisma/client';

/**
 * THE STATE MACHINE (Data_Model.md §7.3).
 *
 * This table IS the machine — it is a direct, line-by-line encoding of the
 * transition table in §7.3, and only transitions appearing here are legal.
 * Everything else is rejected (FR-8.1).
 *
 * ── The Move-In Guarantee, as a structural fact (FR-8.2) ──
 * There is deliberately NO `escrow_funded → settled` edge. The only exits
 * from `escrow_funded` are `move_in_confirmed` (forward) or `refunded`
 * (money back). Funds are therefore unreleasable until move-in — the
 * guarantee is the SHAPE OF THIS GRAPH, not a flag, a product, or a reserve
 * fund. Adding that edge would silently destroy the guarantee, which is why
 * a test asserts its absence directly.
 */
export const ALLOWED_TRANSITIONS: Readonly<
  Record<DealStatus, readonly DealStatus[]>
> = Object.freeze({
  // | created | tenant_matched | FOO viewing conducted + introduction_record exists |
  created: ['tenant_matched', 'cancelled', 'dispute_hold'],

  // | tenant_matched | agreement_signed | rate + rent snapshotted here |
  tenant_matched: ['agreement_signed', 'cancelled', 'dispute_hold'],

  // | agreement_signed | escrow_funded | Payments.fundEscrow (liability up, no revenue) |
  agreement_signed: ['escrow_funded', 'cancelled', 'dispute_hold'],

  // | escrow_funded | move_in_confirmed | tenant confirms move-in |
  // | escrow_funded | refunded          | pre-move-in refund → full tenant refund |
  // NOTE: no 'settled' (the guarantee) and no 'cancelled' — see
  // ESCROW_FUNDED_CANCEL_RULING below (Amendment A1).
  escrow_funded: ['move_in_confirmed', 'refunded', 'dispute_hold'],

  // | move_in_confirmed | commission_earned | Payments.recogniseCommission (EARNED here) |
  move_in_confirmed: ['commission_earned', 'dispute_hold'],

  // | commission_earned | settled | Payments.settle (landlord paid net via PSP) |
  commission_earned: ['settled', 'dispute_hold'],

  // | settled | closed | terminal |
  settled: ['closed', 'dispute_hold'],

  // | dispute_hold | (prior or refunded/settled) | ops resolution |
  // The "prior" half is handled by resolveDispute(), which restores the
  // status the deal held when it entered the hold; the direct edges here
  // are the terminal resolutions §7.3 names explicitly.
  dispute_hold: ['refunded', 'settled'],

  // terminal states
  closed: [],
  cancelled: [],
  refunded: [],
});

/**
 * RESOLVED — Data_Model.md §7.3, Amendment A1 (2026-07-27).
 *
 * §7.3's `cancelled` row used to list `escrow_funded` in its "From" column
 * while its own guard said "if funded → must route via refunded". Raised at
 * Stage 3, ruled at Stage 4 review: a funded deal can NEVER be cancelled.
 * Cancelling to a terminal state with no refund posting would strand held
 * client money and break the Move-In Guarantee (FR-8.2). The doc has been
 * amended to match; the edge stays absent from the graph above and its
 * absence is asserted by test.
 */
export const ESCROW_FUNDED_CANCEL_RULING = Object.freeze({
  document: 'Data_Model.md §7.3, Amendment A1',
  ruledOn: '2026-07-27',
  ruling:
    'escrow_funded → cancelled is NOT permitted; a funded deal exits only via move_in_confirmed or refunded',
  rationale:
    'a funded deal reaching a terminal state without a refund posting would strand ' +
    'client money and break the Move-In Guarantee (FR-8.2)',
});

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

export function assertTransitionAllowed(
  from: DealStatus,
  to: DealStatus,
): void {
  if (!isTransitionAllowed(from, to)) {
    throw new IllegalTransitionError(from, to);
  }
}

/** Statuses from which no further transition is possible. */
export const TERMINAL_STATUSES: readonly DealStatus[] = Object.freeze([
  'closed',
  'cancelled',
  'refunded',
]);
