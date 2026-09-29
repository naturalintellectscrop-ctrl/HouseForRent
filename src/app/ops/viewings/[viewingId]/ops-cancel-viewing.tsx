'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { postJson, ClientApiError } from '@/lib/client';
import { ApiAlert } from '@/app/ui';

/**
 * Operations' cancel control on a requested or scheduled viewing.
 *
 * ── The case it exists for ──
 * The landlord phones in: the home was let yesterday, or the arrangement
 * collapsed. The viewing must leave the queue — but the record must not
 * pretend the visit happened, and the decision must not blur with a
 * tenant's own cancellation. Hence: an admin-only control, a confirm step
 * with the consequence in plain words, an optional note, and an audit row
 * that names OPERATIONS as the actor (`by: 'operations'` in the detail).
 *
 * The server re-checks the transition graph, so a viewing that got
 * dispatched or conducted between render and click comes back as the
 * API's own 409, shown verbatim.
 */
export function OpsCancelViewing({
  viewingId,
  status,
}: {
  viewingId: string;
  status: string;
}) {
  const router = useRouter();
  const [armed, setArmed] = useState(false);
  const [note, setNote] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<{ message: string; code?: string | null } | null>(null);
  const [done, setDone] = useState(false);

  async function cancel() {
    setPending(true);
    setError(null);
    try {
      await postJson(`/ops/viewings/${viewingId}/cancel`, {
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      setDone(true);
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
    return (
      <p className="alert alert-ok">
        Cancelled. It has left the officer's board, the tenant sees it as
        cancelled, and the audit trail records that operations made this
        call.
      </p>
    );
  }

  if (!armed) {
    return (
      <div className="card stack-sm">
        <h2 className="h3">Cancel this viewing</h2>
        <p className="muted" style={{ margin: 0 }}>
          For the landlord-reported cases: the home was let, the arrangement
          fell through, or the visit cannot go ahead. The tenant's list and
          the officer's board will show it as cancelled — never as a visit
          that happened.
        </p>
        {error ? <ApiAlert message={error.message} code={error.code} /> : null}
        <p style={{ margin: 0 }}>
          <button type="button" className="btn btn-danger btn-sm" onClick={() => setArmed(true)}>
            Cancel this viewing
          </button>
        </p>
      </div>
    );
  }

  const noteId = `ops-cancel-note-${viewingId}`;

  return (
    <div className="card stack-sm">
      <h2 className="h3">Confirm the cancellation</h2>
      <p className="muted" style={{ margin: 0 }}>
        This viewing is <strong>{status}</strong>. Cancelling it is final —
        the tenant can request a new viewing, but this record stays
        cancelled and is visible to the landlord as such.
      </p>
      <div className="field">
        <label htmlFor={noteId}>Reason (goes to the audit trail)</label>
        <textarea
          id={noteId}
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. Landlord called: the property was let yesterday afternoon."
          style={{ width: '100%', resize: 'vertical' }}
        />
      </div>
      <span className="row" style={{ gap: '0.5rem' }}>
        <button type="button" className="btn btn-danger" onClick={cancel} disabled={pending}>
          {pending ? 'Cancelling…' : 'Confirm cancellation'}
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
