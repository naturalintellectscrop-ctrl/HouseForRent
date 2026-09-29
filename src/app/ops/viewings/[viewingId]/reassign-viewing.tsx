'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { postJson, ClientApiError } from '@/lib/client';
import { ApiAlert } from '@/app/ui';
import type { AssignableOfficer } from '@/lib/api';

/**
 * Operations' reassign control on a SCHEDULED viewing (Task 16).
 *
 * ── Why it exists ──
 * The dispatch page has always promised "re-assigning before the visit is
 * permitted; after it is not" — the frozen graph even encodes
 * `scheduled → scheduled` as a deliberate edge — but no surface could
 * reach it: the queue lists only REQUESTED viewings, so once a visit was
 * on an officer's board it was stuck there. An officer falls sick, a
 * corridor changes, and the admin's only honest option was a cancellation
 * that would have lied about a visit that never happened.
 *
 * The same POST /ops/dispatch the queue uses does the work; the server
 * re-checks the transition graph, refuses non-officers, keeps the tenant's
 * slot when no new time is given, records nothing for a same-officer/
 * same-slot no-op, and writes the `viewing_assigned` audit row (with the
 * previous officer) when something did move.
 */
export function ReassignViewing({
  viewingId,
  officers,
  tenantName,
  officerName,
}: {
  viewingId: string;
  officers: AssignableOfficer[];
  /** For the consequence sentence ("Grace's visit moves to…"). */
  tenantName: string;
  /** The officer currently on the visit. */
  officerName: string;
}) {
  const router = useRouter();
  const [armed, setArmed] = useState(false);
  const [officerId, setOfficerId] = useState('');
  const [when, setWhen] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<{ message: string; code?: string | null } | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function reassign() {
    setPending(true);
    setError(null);
    try {
      const selected = officers.find((o) => o.partyId === officerId);
      const res = await postJson<{ changed: boolean }>('/ops/dispatch', {
        viewingId,
        fooPartyId: officerId,
        ...(when ? { scheduledFor: new Date(when).toISOString() } : {}),
      });
      setDone(
        res.changed
          ? `Reassigned. The visit is now on ${selected?.displayName ?? 'the officer'}'s board and the tenant sees it as scheduled. The audit trail keeps who made the change.`
          : 'That was already the assignment — nothing changed, and nothing was recorded.',
      );
      router.refresh();
    } catch (err) {
      if (err instanceof ClientApiError) {
        setError({ message: err.message, code: err.code });
      } else {
        setError({
          message:
            'Could not reach the House For Rent API. Nothing was changed — try again when you have signal.',
        });
      }
    } finally {
      setPending(false);
    }
  }

  if (done) {
    return <p className="alert alert-ok" role="status">{done}</p>;
  }

  if (!armed) {
    return (
      <div className="card stack-sm">
        <h2 className="h3">Reassign or move this visit</h2>
        <p className="muted" style={{ margin: 0 }}>
          {officerName} is on this visit. Before it happens, moving it to
          another officer — or moving the time — is ordinary dispatch work,
          not a state change: the tenant keeps a scheduled visit, and the
          audit trail keeps who sent whom. After the visit has happened, the
          record stands.
        </p>
        {error ? <ApiAlert message={error.message} code={error.code} /> : null}
        <p style={{ margin: 0 }}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setArmed(true)}>
            Reassign officer
          </button>
        </p>
      </div>
    );
  }

  const officerFieldId = `reassign-officer-${viewingId}`;
  const whenFieldId = `reassign-when-${viewingId}`;
  const selected = officers.find((o) => o.partyId === officerId);

  return (
    <div className="card stack-sm">
      <h2 className="h3">Confirm the reassignment</h2>
      <div className="field">
        <label htmlFor={officerFieldId}>Send instead</label>
        <select
          id={officerFieldId}
          value={officerId}
          onChange={(e) => setOfficerId(e.target.value)}
        >
          <option value="">Choose an officer</option>
          {officers.map((o) => (
            <option key={o.partyId} value={o.partyId}>
              {o.displayName} — {o.assignedCount} on board
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor={whenFieldId}>Move the time (optional)</label>
        <input
          id={whenFieldId}
          type="datetime-local"
          value={when}
          onChange={(e) => setWhen(e.target.value)}
        />
        <p className="faint" style={{ fontSize: '0.8125rem', margin: '0.3rem 0 0' }}>
          Blank keeps the confirmed slot. Dispatch never invents a time.
        </p>
      </div>
      <p className="muted" style={{ margin: 0 }}>
        {selected
          ? `${tenantName}'s visit moves to ${selected.displayName}'s board, and the audit trail records the move with the officer it came from.`
          : 'Choose the officer to send — the consequence shows here before you confirm.'}
      </p>
      <span className="row" style={{ gap: '0.5rem' }}>
        <button
          type="button"
          className="btn btn-primary"
          onClick={reassign}
          disabled={pending || !officerId}
        >
          {pending ? 'Reassigning…' : 'Confirm reassignment'}
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => setArmed(false)}
          disabled={pending}
        >
          Back
        </button>
      </span>
      {error ? <ApiAlert message={error.message} code={error.code} /> : null}
    </div>
  );
}
