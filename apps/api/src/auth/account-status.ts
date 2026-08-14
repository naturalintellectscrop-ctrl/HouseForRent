import { PartyStatus } from '@prisma/client';

/**
 * What each account state PERMITS.
 *
 * ── Why this is a table and not an `if` in the login handler ──
 * Before this existed, `party.status` was a column nothing read: a
 * suspended party signed in exactly like an active one, and ops had a
 * control that did nothing. The failure was silent — the column looked
 * like enforcement while being decoration.
 *
 * Centralising it here means:
 *   - one place decides, so login, refresh and any future entry point
 *     cannot disagree about what "suspended" means;
 *   - a NEW status is a compile error until it is classified, because the
 *     record is keyed on the full enum. Adding a state without deciding
 *     whether it can sign in becomes impossible rather than merely
 *     inadvisable.
 *
 * ── Why `pending_verification` may sign in ──
 * Identity verification happens INSIDE the app — a tenant has to reach the
 * screens in order to complete it. Blocking sign-in until verified would
 * make verification unreachable. What an unverified party cannot do is
 * request a viewing (FR-5.1) or publish a listing (FR-3.1); those gates
 * live in the domain services where they belong, not at the door.
 */
export interface StatusPolicy {
  /** May exchange credentials for a session. */
  canSignIn: boolean;
  /** May exchange a refresh token for a new session. */
  canRefresh: boolean;
  /** Shown to the user when refused. Never reveals whether the account exists. */
  refusalReason: string | null;
}

export const ACCOUNT_STATUS_POLICY: Record<PartyStatus, StatusPolicy> = {
  pending_verification: {
    canSignIn: true,
    canRefresh: true,
    refusalReason: null,
  },
  active: {
    canSignIn: true,
    canRefresh: true,
    refusalReason: null,
  },
  suspended: {
    canSignIn: false,
    canRefresh: false,
    refusalReason:
      'This account is suspended. Contact House For Rent support to restore it.',
  },
  disabled: {
    canSignIn: false,
    canRefresh: false,
    refusalReason: 'This account has been disabled.',
  },
  archived: {
    canSignIn: false,
    canRefresh: false,
    refusalReason: 'This account is no longer active.',
  },
  closed: {
    canSignIn: false,
    canRefresh: false,
    refusalReason: 'This account has been closed.',
  },
};

export function canSignIn(status: PartyStatus): boolean {
  return ACCOUNT_STATUS_POLICY[status].canSignIn;
}

export function canRefresh(status: PartyStatus): boolean {
  return ACCOUNT_STATUS_POLICY[status].canRefresh;
}

export function refusalReason(status: PartyStatus): string {
  return (
    ACCOUNT_STATUS_POLICY[status].refusalReason ?? 'This account cannot sign in.'
  );
}

/**
 * States that block access. Derived from the policy rather than listed
 * again, so the two can never drift apart.
 */
export const BLOCKED_STATUSES: PartyStatus[] = (
  Object.keys(ACCOUNT_STATUS_POLICY) as PartyStatus[]
).filter((status) => !ACCOUNT_STATUS_POLICY[status].canSignIn);
