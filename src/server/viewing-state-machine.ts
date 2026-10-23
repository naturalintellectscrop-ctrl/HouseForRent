/**
 * The viewing lifecycle over the states of Data_Model.md §5.1 - a frozen
 * graph, ported verbatim from apps/api/src/viewings/viewing-state-machine.ts.
 *
 * The two absences that carry weight:
 *  - `conducted` is TERMINAL. Retroactively turning a conducted visit into
 *    a no-show would deny an introduction that demonstrably happened -
 *    precisely the circumvention evidence the record preserves.
 *  - There is no `requested → conducted` edge: a viewing nobody was
 *    dispatched to cannot have been conducted.
 */
export const ALLOWED_VIEWING_TRANSITIONS: Readonly<
  Record<string, readonly string[]>
> = Object.freeze({
  requested: Object.freeze(['scheduled', 'cancelled']),
  // `scheduled → scheduled` is deliberate: re-assigning an officer before
  // the visit is ordinary dispatch work, not a state change.
  scheduled: Object.freeze(['scheduled', 'conducted', 'no_show', 'cancelled']),
  conducted: Object.freeze([]),
  no_show: Object.freeze([]),
  cancelled: Object.freeze([]),
});

export const TERMINAL_VIEWING_STATUSES: readonly string[] = Object.freeze([
  'conducted',
  'no_show',
  'cancelled',
]);

/**
 * A viewing transition the frozen graph refuses. Typed so the HTTP edge can
 * answer 409 instead of a generic 500 - the caller's page is stale or the
 * request is wrong, and either way the state did not change.
 */
export class IllegalViewingTransitionError extends Error {
  constructor(from: string, to: string) {
    super(`viewing transition ${from} → ${to} is not permitted`);
    this.name = 'IllegalViewingTransitionError';
  }
}

export function isViewingTransitionAllowed(from: string, to: string): boolean {
  return (ALLOWED_VIEWING_TRANSITIONS[from] ?? []).includes(to);
}

export function assertViewingTransitionAllowed(from: string, to: string): void {
  if (!isViewingTransitionAllowed(from, to)) {
    throw new IllegalViewingTransitionError(from, to);
  }
}
