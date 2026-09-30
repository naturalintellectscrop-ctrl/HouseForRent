'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { postJson, ClientApiError } from '@/lib/client';
import { ApiAlert } from '@/app/ui';

/**
 * Verify or reject one pending mandate.
 *
 * ── Why the decision carries a confirm step ──
 * Verifying is the act that lets a non-owner publish somebody else's
 * property. It deserves a beat of friction: the operator picks a verdict,
 * the consequence is spelled out in the operator's own register, and only
 * then is the call made. The optional note travels to the AUDIT trail -
 * the row deliberately does not carry it (mandates.ts).
 *
 * Both buttons always work: the service re-checks `pending` and answers
 * 409 MANDATE_ALREADY_DECIDED if a colleague decided it first, which this
 * component renders verbatim instead of pretending to own the gate.
 */
export function MandateActions({
  mandateId,
  ownerName,
}: {
  mandateId: string;
  ownerName: string | null;
}) {
  const router = useRouter();
  const [armed, setArmed] = useState<'verified' | 'rejected' | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<{ message: string; code?: string | null } | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  async function decide(decision: 'verified' | 'rejected', note: string) {
    setPending(true);
    setError(null);
    try {
      await postJson(`/admin/mandates/${mandateId}/decision`, {
        decision,
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      setOk(
        decision === 'verified'
          ? 'Verified. The authority is on file and publication of this property is no longer blocked on the mandate.'
          : 'Rejected. The lister can resubmit from their listing page.',
      );
      setArmed(null);
      router.refresh();
    } catch (err) {
      if (err instanceof ClientApiError) {
        setError({ message: err.message, code: err.code });
      } else {
        setError({
          message:
            'Could not reach the House For Rent API. Nothing was decided - try again when you have signal.',
        });
      }
    } finally {
      setPending(false);
    }
  }

  if (ok) {
    return (
      <p className="alert alert-ok" style={{ margin: 0, maxWidth: '18rem' }}>
        {ok}
      </p>
    );
  }

  if (!armed) {
    return (
      <div className="stack-sm">
        <span className="row" style={{ gap: '0.4rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => {
              setError(null);
              setArmed('verified');
            }}
          >
            Verify
          </button>
          <button
            type="button"
            className="btn btn-danger btn-sm"
            onClick={() => {
              setError(null);
              setArmed('rejected');
            }}
          >
            Reject
          </button>
        </span>
        {error ? <ApiAlert message={error.message} code={error.code} /> : null}
      </div>
    );
  }

  return (
    <MandateConfirm
      decision={armed}
      ownerName={ownerName}
      pending={pending}
      error={error}
      onBack={() => setArmed(null)}
      onConfirm={decide}
    />
  );
}

/**
 * The confirm step. A separate component so its textarea state dies with
 * the choice: going back and taking the other verdict starts the note
 * again, rather than carrying a sentence written for the opposite
 * decision.
 */
function MandateConfirm({
  decision,
  ownerName,
  pending,
  error,
  onBack,
  onConfirm,
}: {
  decision: 'verified' | 'rejected';
  ownerName: string | null;
  pending: boolean;
  error: { message: string; code?: string | null } | null;
  onBack: () => void;
  onConfirm: (decision: 'verified' | 'rejected', note: string) => void;
}) {
  const [note, setNote] = useState('');
  const noteId = `mandate-note-${decision}`;
  const consequence =
    decision === 'verified'
      ? `Record the owner's authority as verified${ownerName ? ` for ${ownerName}` : ''}. This listing can then be published by the lister marketing it.`
      : 'Reject this mandate. The property stays un-publishable by this lister until they resubmit.';

  return (
    <div className="stack-sm" style={{ minWidth: '16rem', maxWidth: '20rem' }}>
      <span style={{ fontSize: '0.875rem' }}>{consequence}</span>
      <label htmlFor={noteId} className="faint" style={{ fontSize: '0.8125rem' }}>
        Decision note (goes to the audit trail)
      </label>
      <textarea
        id={noteId}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        style={{ width: '100%', resize: 'vertical' }}
        placeholder={
          decision === 'verified'
            ? 'e.g. Original document sighted; signature matches the registered owner.'
            : 'e.g. Document names a different property.'
        }
      />
      <span className="row" style={{ gap: '0.4rem' }}>
        <button
          type="button"
          className={decision === 'verified' ? 'btn btn-sm' : 'btn btn-danger btn-sm'}
          onClick={() => onConfirm(decision, note)}
          disabled={pending}
        >
          {pending
            ? 'Recording…'
            : decision === 'verified'
              ? 'Confirm: verified'
              : 'Confirm: rejected'}
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={onBack}
          disabled={pending}
        >
          Back
        </button>
      </span>
      {error ? <ApiAlert message={error.message} code={error.code} /> : null}
    </div>
  );
}
