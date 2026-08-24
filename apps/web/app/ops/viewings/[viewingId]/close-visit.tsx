'use client';

import { useActionState } from 'react';
import { conductAction, noShowAction } from '@/app/actions/viewings';
import { IDLE, type ActionState } from '@/app/actions/state';

/**
 * The two ways a visit ends.
 *
 * `Close visit` is disabled when the SERVER said it cannot be conducted
 * (`canConduct: false`) — but that is a courtesy, not the enforcement. If it
 * were submitted anyway, the backend returns 422 FIELD_REPORT_REQUIRED and
 * the database refuses beneath it. The button reflects the rule; it does not
 * hold it.
 */
export function CloseVisit({
  viewingId,
  canConduct,
}: {
  viewingId: string;
  canConduct: boolean;
}) {
  const [conductState, conduct, conducting] = useActionState<
    ActionState,
    FormData
  >(conductAction.bind(null, viewingId), IDLE);
  const [noShowState, noShow, marking] = useActionState<ActionState, FormData>(
    noShowAction.bind(null, viewingId),
    IDLE,
  );

  const state = conductState.error ? conductState : noShowState;

  return (
    <>
      {state.error && (
        <p className="alert alert-error" role="alert">
          {state.error} {state.code && <code>{state.code}</code>}
        </p>
      )}

      {!canConduct && (
        <p className="alert alert-note">
          File the structured field report first. A visit cannot be closed
          without one — the introduction record is only created alongside it.
        </p>
      )}

      <div className="btn-row">
        <form action={conduct}>
          <button
            type="submit"
            className="btn-block"
            disabled={!canConduct || conducting}
          >
            {conducting ? 'Closing…' : 'Close visit'}
          </button>
        </form>

        <form action={noShow}>
          <button
            type="submit"
            className="btn-danger btn-block"
            disabled={marking}
          >
            {marking ? 'Recording…' : 'Tenant did not show'}
          </button>
        </form>
      </div>
    </>
  );
}
