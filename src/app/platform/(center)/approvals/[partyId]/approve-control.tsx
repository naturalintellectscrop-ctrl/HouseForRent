'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { postJson, ClientApiError } from '@/lib/client';
import { ApiAlert } from '@/app/ui';

/**
 * Approve an account application - the platform decides to activate.
 *
 * ── Why this is a decision, not a checkbox ──
 * Approval flips a real person's account active, so it is recorded the
 * same way rejection is: the acting reviewer's identity and the moment
 * go on the account trail. The note is optional - but the trail is
 * exactly where a future reviewer looks for WHY, so the placeholder
 * asks for the basis (documents seen, phone call, in-person meeting).
 * The identity check - which can run instead - is the stronger evidence
 * and stays available beside this control.
 */
export function ApproveApplicationControl({
  partyId,
  displayName,
}: {
  partyId: string;
  displayName: string;
}) {
  const router = useRouter();
  const [note, setNote] = useState('');
  const [armed, setArmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<{ message: string; code?: string | null } | null>(null);

  async function submit() {
    setPending(true);
    setError(null);
    try {
      await postJson(`/admin/users/${partyId}/approve`, { note: note.trim() });
      // Back to the queue: the row's disappearance is the visible proof
      // the decision stuck, and the account trail carries the record.
      router.push('/platform/approvals');
      router.refresh();
    } catch (err) {
      if (err instanceof ClientApiError) {
        setError({ message: err.message, code: err.code });
        setArmed(false);
      } else {
        setError({
          message:
            'Could not reach the House For Rent API. Nothing was recorded - try again when you have signal.',
        });
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      className="stack-sm"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        setArmed(true);
      }}
    >
      <p className="faint" style={{ fontSize: '0.8125rem', margin: 0 }}>
        Activates the account now: the person can sign in and use the
        platform. The approval, your identity and the moment are recorded
        on the account trail.
      </p>

      <div className="field" style={{ marginBottom: 0 }}>
        <label className="label" htmlFor={`approve-note-${partyId.slice(0, 8)}`}>
          Basis for approval <span className="muted">(optional, recorded)</span>
        </label>
        <textarea
          id={`approve-note-${partyId.slice(0, 8)}`}
          name="note"
          className="input"
          rows={2}
          maxLength={500}
          placeholder="e.g. documents inspected in person; name and photo match the account"
          value={note}
          onChange={(e) => {
            setNote(e.target.value);
            setError(null);
          }}
        />
      </div>

      {!armed ? (
        <span className="row" style={{ gap: '0.4rem' }}>
          <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>
            Approve application
          </button>
        </span>
      ) : (
        <>
          <span style={{ fontSize: '0.8125rem' }}>
            Activate <strong>{displayName}</strong>&rsquo;s account now?
            {note.trim()
              ? ' Your note is recorded with the decision.'
              : ' The decision is recorded without a note.'}
          </span>
          <span className="row" style={{ gap: '0.4rem' }}>
            <button type="button" className="btn btn-primary btn-sm" onClick={submit} disabled={pending}>
              {pending ? 'Recording…' : 'Confirm approval'}
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setArmed(false)}
              disabled={pending}
            >
              Edit note
            </button>
          </span>
        </>
      )}
      {error ? <ApiAlert message={error.message} code={error.code} /> : null}
    </form>
  );
}
