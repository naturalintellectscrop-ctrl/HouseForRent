'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { postJson, ClientApiError } from '@/lib/client';
import { ApiAlert } from '@/app/ui';

/**
 * Self-service registration. Only `tenant` and `lister` exist here - staff
 * are provisioned by an admin, and the backend refuses any other value
 * regardless of what this sends.
 */
export function RegisterForm({
  preset,
  next,
}: {
  preset: 'tenant' | 'lister';
  next: string | null;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<{ message: string; code?: string | null } | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const data = new FormData(e.currentTarget);
    try {
      const res = await postJson<{ home: string }>('/auth/register', {
        displayName: String(data.get('displayName') ?? ''),
        primaryPhone: String(data.get('primaryPhone') ?? ''),
        password: String(data.get('password') ?? ''),
        role: String(data.get('role') ?? ''),
      });
      const safeNext =
        next && next.startsWith('/') && !next.startsWith('//') ? next : res.home;
      router.push(safeNext ?? '/');
      router.refresh();
    } catch (err) {
      if (err instanceof ClientApiError) {
        setError({
          message:
            err.status === 409
              ? 'An account already exists for that number. Sign in instead.'
              : err.message,
          code: err.code,
        });
      } else {
        setError({
          message: 'Could not reach the House For Rent service. Check your connection and try again.',
        });
      }
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="stack-lg">
      {error ? <ApiAlert message={error.message} code={error.code} /> : null}

      {next ? <input type="hidden" name="next" value={next} /> : null}

      <fieldset>
        <legend>What brings you here?</legend>
        <div className="choice-group choice-group-2">
          <label className="choice">
            <input
              type="radio"
              name="role"
              value="tenant"
              defaultChecked={preset === 'tenant'}
            />
            <span>
              <span className="choice-title">I need a home</span>
              <span className="choice-note">
                Browse, request viewings, rent. Always free.
              </span>
            </span>
          </label>
          <label className="choice">
            <input
              type="radio"
              name="role"
              value="lister"
              defaultChecked={preset === 'lister'}
            />
            <span>
              <span className="choice-title">I have one to let</span>
              <span className="choice-note">
                List a property. Nothing to pay until a tenant moves in.
              </span>
            </span>
          </label>
        </div>
      </fieldset>

      <div className="field">
        <label className="label" htmlFor="displayName">
          Your name
        </label>
        <input
          id="displayName"
          name="displayName"
          type="text"
          className="input"
          autoComplete="name"
          required
          minLength={2}
        />
      </div>

      <div className="field">
        <label className="label" htmlFor="primaryPhone">
          Phone number
        </label>
        <input
          id="primaryPhone"
          name="primaryPhone"
          type="tel"
          className="input"
          inputMode="tel"
          autoComplete="tel"
          autoCapitalize="off"
          spellCheck={false}
          required
          minLength={9}
          placeholder="+256 7…"
        />
        <p className="hint">
          Include the country code. This is how we reach you about a viewing.
        </p>
      </div>

      <div className="field">
        <label className="label" htmlFor="password">
          Choose a password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          className="input"
          autoComplete="new-password"
          required
          minLength={8}
          aria-describedby="password-hint"
        />
        <p className="hint" id="password-hint">
          At least 8 characters.
        </p>
      </div>

      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? 'Creating your account…' : 'Create account'}
      </button>

      <p className="hint">
        Creating an account is free. Tenants are never charged anything on
        House For Rent - the landlord pays our commission, and only when a
        tenancy actually starts.
      </p>
    </form>
  );
}
