import { ViewingStatus } from '@prisma/client';

export class IllegalViewingTransitionError extends Error {
  constructor(from: ViewingStatus, to: ViewingStatus) {
    super(
      `viewing transition ${from} → ${to} is not permitted. Only the edges in ` +
        'ALLOWED_VIEWING_TRANSITIONS exist; everything else is rejected.',
    );
    this.name = 'IllegalViewingTransitionError';
  }
}

/**
 * The viewing lifecycle over the states of Data_Model.md §5.1.
 *
 * ── Why a frozen graph rather than ad-hoc checks ──
 * Same reasoning as `deal-state-machine.ts`: an explicit table makes the
 * illegal edges auditable by reading it, and freezing it means no runtime
 * code can widen the graph. The two absences that carry weight:
 *
 *   - `conducted` is TERMINAL. A conducted viewing has produced an immutable
 *     introduction_record; letting it later become `no_show` or `cancelled`
 *     would let an operator retroactively deny an introduction that
 *     demonstrably happened, which is precisely the circumvention evidence
 *     the record exists to preserve (FR-5.3, FR-8.3).
 *   - There is no `requested → conducted` edge. A viewing nobody was
 *     dispatched to cannot have been conducted, so `conducted_by_party_id`
 *     can never be null on a conducted viewing.
 *
 * `scheduled → scheduled` is present deliberately: re-assigning a viewing to
 * a different officer before the visit is ordinary dispatch work, not a
 * state change.
 *
 * `cancelled` is reachable in the graph but has NO endpoint in V1 — API Spec
 * §4.3 lists no cancel operation, and adding one would be a scope change
 * requiring an SSOT amendment, not an API iteration (§11).
 */
export const ALLOWED_VIEWING_TRANSITIONS: Readonly<
  Record<ViewingStatus, readonly ViewingStatus[]>
> = Object.freeze({
  requested: Object.freeze(['scheduled', 'cancelled'] as ViewingStatus[]),
  scheduled: Object.freeze([
    'scheduled',
    'conducted',
    'no_show',
    'cancelled',
  ] as ViewingStatus[]),
  conducted: Object.freeze([] as ViewingStatus[]),
  no_show: Object.freeze([] as ViewingStatus[]),
  cancelled: Object.freeze([] as ViewingStatus[]),
});

export const TERMINAL_VIEWING_STATUSES: readonly ViewingStatus[] =
  Object.freeze(['conducted', 'no_show', 'cancelled'] as ViewingStatus[]);

export function isViewingTransitionAllowed(
  from: ViewingStatus,
  to: ViewingStatus,
): boolean {
  return ALLOWED_VIEWING_TRANSITIONS[from].includes(to);
}

export function assertViewingTransitionAllowed(
  from: ViewingStatus,
  to: ViewingStatus,
): void {
  if (!isViewingTransitionAllowed(from, to)) {
    throw new IllegalViewingTransitionError(from, to);
  }
}
