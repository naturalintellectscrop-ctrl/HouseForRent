'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { postJson, ClientApiError } from '@/lib/client';
import { ApiAlert } from '@/app/ui';

const STATE_HEADLINE: Record<string, string> = {
  pending: 'Awaiting verification',
  rejected: 'The last submission was rejected',
  verified: 'Mandate verified',
};

/**
 * The landlord's side of the mandate flow (SSOT Decision 8 / FR-3.2).
 *
 * ── When this card exists ──
 * The listing page renders it only when the SERVER's blocker list contains
 * `mandate` — meaning this account lists on a tier that markets property
 * it does not own, and publish is gated on the owner's written authority.
 * A property owner never sees it: for them a mandate is not a thing the
 * platform holds, and the backend would answer 422 MANDATE_NOT_NEEDED to
 * any attempt anyway.
 *
 * Submitting is idempotent server-side: a pending or verified mandate
 * returns unchanged, and a rejected one resets to pending — so "submit
 * again" after a rejection is the same control as the first submission,
 * and the row's history stays one row per relationship.
 */
export function MandatePanel({
  propertyId,
  state,
}: {
  propertyId: string;
  state: string | null;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<{ message: string; code?: string | null } | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const headline = state ? STATE_HEADLINE[state] ?? state : 'No mandate on file yet';

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setOk(null);
    setPending(true);
    const data = new FormData(e.currentTarget);
    const note = String(data.get('note') ?? '').trim();
    try {
      await postJson('/landlord/mandates', {
        propertyId,
        ...(note ? { note } : {}),
      });
      setOk(
        'Submitted. Operations will verify the authority against the property\u2019s registered owner, and publication unlocks the moment it is verified.',
      );
      router.refresh();
    } catch (err) {
      if (err instanceof ClientApiError) {
        setError({ message: err.message, code: err.code });
      } else {
        setError({
          message:
            'Could not reach House For Rent. Nothing was submitted — try again in a moment.',
        });
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="card stack-sm">
      <h2 className="h3">Owner&rsquo;s mandate</h2>
      <p className="muted" style={{ margin: 0 }}>
        Because this account markets property it does not own, a listing can
        only publish once the property&rsquo;s registered owner has given
        written authority for us to market it. That authority is verified by
        our operations desk — it is what keeps a middleman from listing a
        home the owner has never agreed to.
      </p>

      <p style={{ margin: 0, fontWeight: 600 }}>{headline}</p>

      {state === 'pending' ? (
        <p className="muted" style={{ margin: 0 }}>
          Operations is verifying the authority. Nothing more is needed from
          you right now.
        </p>
      ) : null}

      {state !== 'pending' && state !== 'verified' ? (
        <form onSubmit={onSubmit} className="stack-sm">
          {error ? <ApiAlert message={error.message} code={error.code} /> : null}
          {ok ? <p className="notice notice-ok" role="status">{ok}</p> : null}
          {state === 'rejected' ? (
            <p className="muted" style={{ margin: 0 }}>
              You can submit again — the decision note from operations is in
              your audit history, and a fresh submission re-enters the queue.
            </p>
          ) : null}
          <div className="field">
            <label htmlFor="mandate-note">Note for operations (optional)</label>
            <textarea
              id="mandate-note"
              name="note"
              rows={3}
              placeholder="e.g. Signed mandate scanned and held by our office; the owner can be reached on the number on file."
              style={{ width: '100%', resize: 'vertical' }}
            />
            <p className="hint">
              The authority document itself stays with your office; the note
              tells the verifying officer what to ask for and where it is.
            </p>
          </div>
          <button type="submit" className="btn btn-secondary" disabled={pending}>
            {pending
              ? 'Submitting…'
              : state === 'rejected'
                ? 'Submit the mandate again'
                : 'Submit the mandate for verification'}
          </button>
        </form>
      ) : null}
    </div>
  );
}
