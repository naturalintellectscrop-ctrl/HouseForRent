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
  // ESCROW_FUNDED_CANCEL_AMBIGUITY below.
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
 * ⚠️ FLAGGED SSOT AMBIGUITY — Data_Model.md §7.3 (see /docs/DOMAIN.md).
 *
 * §7.3 row 8 lists `escrow_funded` in the "From" column for `cancelled`,
 * but that same row's guard reads "pre-funding cancel; if funded → must
 * route via refunded", which forbids exactly that transition. §7.3's
 * closing paragraph then states as a structural fact that "the only exits
 * from escrow_funded are move_in_confirmed (forward) or refunded (money
 * back)".
 *
 * Allowing `escrow_funded → cancelled` would let a funded deal reach a
 * terminal state with no refund posting — held tenant money stranded, and
 * the Move-In Guarantee broken. The strict reading is therefore implemented
 * (the edge is ABSENT) pending an explicit ruling, because it is the only
 * reading that is safe if wrong.
 */
export const ESCROW_FUNDED_CANCEL_AMBIGUITY = Object.freeze({
  document: 'Data_Model.md §7.3',
  conflict:
    "row 8 lists escrow_funded → cancelled, but its own guard and §7.3's closing " +
    'paragraph both forbid it',
  implemented: 'strict reading — escrow_funded → cancelled is NOT permitted',
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
