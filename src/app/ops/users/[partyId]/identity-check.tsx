'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { postJson, ClientApiError } from '@/lib/client';
import { ApiAlert } from '@/app/ui';

/**
 * Operations-run identity check (Task 14) - the phone-call path.
 *
 * ── Why this is a re-run of the same check, never a shortcut ──
 * The product sells verification, so the fastest way to lose it would be
 * an admin "mark verified" button. This control runs the SAME mock check
 * the account holder runs on themselves, with the details they give over
 * the phone, and the trail records operations as the acting party. A
 * failed result is shown as a true record and stays correctable - the
 * attempt is already written, pass or fail, and that is stated before the
 * operator confirms.
 */
export function IdentityCheckControl({
  partyId,
  displayName,
  currentState,
}: {
  partyId: string;
  displayName: string;
  currentState: string | null;
}) {
  const router = useRouter();
  const [nin, setNin] = useState('');
  const [fullName, setFullName] = useState(displayName);
  const [armed, setArmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<{ message: string; code?: string | null } | null>(null);
  const [result, setResult] = useState<'verified' | 'failed' | null>(null);

  const ninOk = /^[A-Z0-9]{14}$/.test(nin.trim().toUpperCase());
  const nameOk = fullName.trim().length > 0;

  async function submit() {
    setPending(true);
    setError(null);
    try {
      const res = await postJson<{ state: 'verified' | 'failed' }>(
        `/admin/users/${partyId}/identity-check`,
        { nin: nin.trim().toUpperCase(), fullName: fullName.trim(), method: 'nin' },
      );
      setResult(res.state);
      setArmed(false);
      setNin('');
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
        if (!ninOk) {
          setError({ message: 'A Ugandan National Identification Number is 14 letters and digits.' });
          return;
        }
        if (!nameOk) {
          setError({ message: 'Enter the full name exactly as it appears on this account.' });
          return;
        }
        setArmed(true);
      }}
    >
      <p className="faint" style={{ fontSize: '0.8125rem', margin: 0 }}>
        Runs the same development check the account holder runs on
        themselves: the NIN&rsquo;s structure, and whether the name matches
        the name on this account. It is not a live query against the
        national register.
      </p>

      {result === 'verified' ? (
        <p className="notice notice-ok" style={{ margin: 0 }}>
          Identity check verified. The account is marked verified
          {currentState === 'verified' ? '' : ' - the trail records that operations ran it'}.
        </p>
      ) : null}
      {result === 'failed' ? (
        <p className="alert alert-error" role="alert" style={{ margin: 0 }}>
          The check did not pass - and that attempt is now on the
          account&rsquo;s trail, as attempts on the self-service form are.
          Either the number is malformed or the name does not match the
          account name exactly. Correct the details and run it again.
        </p>
      ) : null}

      {!armed ? (
        <>
          <div className="field" style={{ marginBottom: 0 }}>
            <label className="label" htmlFor={`nin-${partyId.slice(0, 8)}`}>
              National Identification Number
            </label>
            <input
              id={`nin-${partyId.slice(0, 8)}`}
              name="nin"
              className="input"
              autoComplete="off"
              placeholder="CM… or CF…, 14 characters"
              value={nin}
              onChange={(e) => {
                setNin(e.target.value);
                setError(null);
              }}
            />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label className="label" htmlFor={`name-${partyId.slice(0, 8)}`}>
              Full name as it appears on this account
            </label>
            <input
              id={`name-${partyId.slice(0, 8)}`}
              name="fullName"
              className="input"
              autoComplete="off"
              value={fullName}
              onChange={(e) => {
                setFullName(e.target.value);
                setError(null);
              }}
            />
          </div>
          <span className="row" style={{ gap: '0.4rem' }}>
            <button type="submit" className="btn btn-sm" disabled={pending}>
              Run check
            </button>
          </span>
          {error ? <ApiAlert message={error.message} code={error.code} /> : null}
        </>
      ) : (
        <>
          <span style={{ fontSize: '0.8125rem' }}>
            Record an identity check against{' '}
            <strong>{displayName}</strong>&rsquo;s account - pass or fail,
            the attempt stays on the trail, with operations as the acting
            party. A pass also activates an account still waiting on
            verification.
          </span>
          <span className="row" style={{ gap: '0.4rem' }}>
            <button type="button" className="btn btn-sm" onClick={submit} disabled={pending}>
              {pending ? 'Running…' : 'Confirm'}
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setArmed(false)}
              disabled={pending}
            >
              Edit details
            </button>
          </span>
        </>
      )}
    </form>
  );
}
