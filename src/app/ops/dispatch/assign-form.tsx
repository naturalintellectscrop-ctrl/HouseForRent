'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { postJson, ClientApiError } from '@/lib/client';
import { ApiAlert } from '@/app/ui';
import type { AssignableOfficer } from '@/lib/api';

/**
 * Send an officer to one requested viewing (FR-5.2).
 *
 * ── Why the blocked rows still render a form ──
 * `blocked` disables the button and says why, but the reason comes from the
 * server and the server is what refuses. This is a courtesy that saves a
 * round trip from a stairwell, not a gate: an admin who submits anyway gets
 * the backend's 422, which is the answer that binds.
 *
 * SANDBOX ADAPTATION: the reference used a server action; here the form
 * POSTs over real HTTP to /api/v1/ops/dispatch from the browser, so the
 * journey crosses an API boundary exactly as it does in production. Nothing
 * is checked here that the backend does not re-check.
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
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<{ message: string; code?: string | null } | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const selectId = `foo-${viewingId}`;
  const timeId = `when-${viewingId}`;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setOk(null);
    const data = new FormData(e.currentTarget);

    const fooPartyId = String(data.get('fooPartyId') ?? '').trim();
    if (!fooPartyId) {
      setError({ message: 'Choose a field officer to send.' });
      setPending(false);
      return;
    }

    // Optional: dispatch may move the time the tenant proposed. Absent means
    // "keep it", which the backend treats as such — it does not default to now.
    const scheduledFor = String(data.get('scheduledFor') ?? '').trim();

    try {
      await postJson('/ops/dispatch', {
        viewingId,
        fooPartyId,
        ...(scheduledFor ? { scheduledFor: new Date(scheduledFor).toISOString() } : {}),
      });
      setOk('Assigned. It now appears on that officer’s board and the tenant sees it as scheduled.');
      router.refresh();
    } catch (err) {
      if (err instanceof ClientApiError) {
        setError({ message: err.message, code: err.code });
      } else {
        setError({
          message:
            'Could not reach the House For Rent API. Your work was not saved — try again when you have signal.',
        });
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="assign-form">
      {error && <ApiAlert message={error.message} code={error.code} />}
      {ok && <p className="alert alert-ok">{ok}</p>}

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
