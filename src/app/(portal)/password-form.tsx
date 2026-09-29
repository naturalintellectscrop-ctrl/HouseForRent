'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { postJson, ClientApiError } from '@/lib/client';
import { ApiAlert } from '@/app/ui';

/**
 * The shared password-change form, rendered by BOTH /account/security
 * (tenant surface) and /landlord/security (landlord surface) — one form,
 * one API call, because the rules it obeys are not role-specific.
 *
 * ── Client-side checks are courtesies, not rules ──
 * The mismatch check between the two new-password fields saves a round
 * trip; the 8-character minimum is ENFORCED by the service and the API
 * (422 PASSWORD_POLICY), because a client-side rule is a suggestion. The
 * server's message is the one shown when it disagrees.
 *
 * The success state says exactly what actually happened — including that
 * other devices were signed out. A user who then finds their phone logged
 * out should never have to wonder whether that was them.
 */
export function PasswordForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<{ message: string; code?: string | null } | null>(null);
  const [ok, setOk] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setOk(false);

    const data = new FormData(e.currentTarget);
    const currentPassword = String(data.get('currentPassword') ?? '');
    const newPassword = String(data.get('newPassword') ?? '');
    const confirm = String(data.get('confirm') ?? '');

    if (newPassword !== confirm) {
      setError({ message: 'The two new passwords do not match.' });
      return;
    }

    setPending(true);
    try {
      await postJson('/auth/password', { currentPassword, newPassword });
      setOk(true);
      // The header shows server-resolved session state; nothing changes in
      // it (this session survives), but a refresh keeps any cached copy of
      // the page from showing a stale form as if nothing happened.
      router.refresh();
    } catch (err) {
      if (err instanceof ClientApiError) {
        setError({ message: err.message, code: err.code });
      } else {
        setError({
          message:
            'Could not reach House For Rent. Your password was not changed — try again in a moment.',
        });
      }
    } finally {
      setPending(false);
    }
  }

  if (ok) {
    return (
      <div className="stack">
        <p className="notice notice-ok" role="status">
          Your password has been changed. Any other device signed in to this
          account has been signed out.
        </p>
        <form onSubmit={onSubmit} className="stack">
          <PasswordFields />
          <div className="row">
            <button type="submit" className="btn btn-secondary" disabled={pending}>
              {pending ? 'Changing…' : 'Change it again'}
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="stack">
      <PasswordFields />
      {error ? <ApiAlert message={error.message} code={error.code} /> : null}
      <div className="row">
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? 'Changing…' : 'Change password'}
        </button>
      </div>
    </form>
  );
}

function PasswordFields() {
  return (
    <>
      <div>
        <label className="label" htmlFor="pw-current">
          Current password
        </label>
        <input
          id="pw-current"
          name="currentPassword"
          type="password"
          className="input"
          autoComplete="current-password"
          required
        />
      </div>
      <div>
        <label className="label" htmlFor="pw-new">
          New password
        </label>
        <input
          id="pw-new"
          name="newPassword"
          type="password"
          className="input"
          autoComplete="new-password"
          minLength={8}
          required
          aria-describedby="pw-policy"
        />
        <p className="hint" id="pw-policy" style={{ marginTop: '0.35rem' }}>
          At least 8 characters.
        </p>
      </div>
      <div>
        <label className="label" htmlFor="pw-confirm">
          Repeat the new password
        </label>
        <input
          id="pw-confirm"
          name="confirm"
          type="password"
          className="input"
          autoComplete="new-password"
          required
        />
      </div>
    </>
  );
}
