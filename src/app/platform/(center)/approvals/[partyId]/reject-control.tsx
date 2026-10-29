'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { postJson, ClientApiError } from '@/lib/client';
import { ApiAlert } from '@/app/ui';

/**
 * Reject an account application - the platform declines to activate.
 *
 * ── Why the reason is not optional and the button is armed ──
 * A rejection is a consequential, recorded decision about a person, so it
 * carries the same weight as the approval path: a reason is required (the
 * server refuses to record one without), the control restates what will
 * happen before the confirm, and the trail keeps the acting admin, the
 * moment and the wording forever. The affected person sees only the
 * platform's standard blocked-account message at sign-in - the reason is
 * presented to REVIEWERS on this trail, not broadcast to the applicant.
 */
export function RejectApplicationControl({
  partyId,
  displayName,
}: {
  partyId: string;
  displayName: string;
}) {
  const router = useRouter();
  const [reason, setReason] = useState('');
  const [armed, setArmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<{ message: string; code?: string | null } | null>(null);
  const [done, setDone] = useState(false);

  async function submit() {
    setPending(true);
    setError(null);
    try {
      await postJson(`/admin/users/${partyId}/reject`, { reason: reason.trim() });
      setDone(true);
      setArmed(false);
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

  if (done) {
    return (
      <p className="notice notice-warn" style={{ margin: 0 }}>
        Application rejected. The decision, its reason and your identity are
        on the account trail below; the account can no longer sign in.
      </p>
    );
  }

  return (
    <form
      className="stack-sm"
      onSubmit={(e) => {
        e.preventDefault();
        if (reason.trim().length < 4) {
          setError({ message: 'Give a short reason - it is recorded on the account trail.' });
          return;
        }
        setArmed(true);
      }}
    >
      <p className="faint" style={{ fontSize: '0.8125rem', margin: 0 }}>
        Declining keeps the account out of the platform: sign-in is refused
        by the account-status policy, and the reason below is recorded with
        your identity on the audit trail.
      </p>

      <div className="field" style={{ marginBottom: 0 }}>
        <label className="label" htmlFor={`reject-reason-${partyId.slice(0, 8)}`}>
          Reason for rejection
        </label>
        <textarea
          id={`reject-reason-${partyId.slice(0, 8)}`}
          name="reason"
          className="input"
          rows={2}
          maxLength={500}
          required
          placeholder="e.g. the name on the ID does not match the account name"
          value={reason}
          onChange={(e) => {
            setReason(e.target.value);
            setError(null);
          }}
        />
      </div>

      {!armed ? (
        <span className="row" style={{ gap: '0.4rem' }}>
          <button type="submit" className="btn btn-sm btn-danger" disabled={pending}>
            Reject application
          </button>
        </span>
      ) : (
        <>
          <span style={{ fontSize: '0.8125rem' }}>
            Reject <strong>{displayName}</strong>&rsquo;s application for the
            reason recorded above? This ends their pending access and cannot
            be undone from here - a new application would be a new account.
          </span>
          <span className="row" style={{ gap: '0.4rem' }}>
            <button type="button" className="btn btn-sm btn-danger" onClick={submit} disabled={pending}>
              {pending ? 'Recording…' : 'Confirm rejection'}
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setArmed(false)}
              disabled={pending}
            >
              Edit reason
            </button>
          </span>
        </>
      )}
      {error ? <ApiAlert message={error.message} code={error.code} /> : null}
    </form>
  );
}
