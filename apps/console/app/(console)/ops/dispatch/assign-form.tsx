'use client';

import { useActionState } from 'react';
import { assignViewingAction } from '../../../actions/viewings';
import { IDLE, type ActionState } from '../../../actions/state';
import type { AssignableOfficer } from '@/lib/api';

/**
 * Send an officer to one requested viewing (FR-5.2).
 *
 * ── Why the blocked rows still render a form ──
 * `blocked` disables the button and says why, but the reason comes from the
 * server and the server is what refuses. This is a courtesy that saves a
 * round trip from a stairwell, not a gate: an admin who submits anyway gets
 * the backend's 422, which is the answer that binds.
 */
export function AssignForm({
  viewingId,
  officers,
  blocked,
}: {
  viewingId: string;
  officers: AssignableOfficer[];
  blocked: string | null;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    assignViewingAction.bind(null, viewingId),
    IDLE,
  );

  const selectId = `foo-${viewingId}`;
  const timeId = `when-${viewingId}`;

  return (
    <form action={action} className="assign-form">
      {state.error && (
        <p className="alert alert-error" role="alert">
          {state.error} {state.code && <code>{state.code}</code>}
        </p>
      )}
      {state.ok && <p className="alert alert-ok">{state.ok}</p>}

      <div className="field">
        <label htmlFor={selectId}>Field officer</label>
        <select id={selectId} name="fooPartyId" required defaultValue="">
          <option value="" disabled>
            Choose an officer
          </option>
          {officers.map((officer) => (
            <option key={officer.partyId} value={officer.partyId}>
              {officer.displayName} — {officer.assignedCount} on board
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label htmlFor={timeId}>Move the time (optional)</label>
        <input id={timeId} name="scheduledFor" type="datetime-local" />
        <p className="hint">
          Blank keeps the slot the tenant proposed.
        </p>
      </div>

      <button type="submit" disabled={pending || officers.length === 0}>
        {pending ? 'Assigning…' : 'Send an officer'}
      </button>

      {/* No ARIA role: `note` is not one, and this is ordinary explanatory
          text that the label above already associates with the control. */}
      {blocked && <p className="hint">{blocked}</p>}
    </form>
  );
}
