'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { postJson, ClientApiError } from '@/lib/client';
import { ApiAlert } from '@/app/ui';

/**
 * The only client component on this page. It exists for one reason: to show
 * a pending state and an error without a full reload. It POSTs over real
 * HTTP to /api/v1/auth/login — the server resolves the session, enforces
 * the account-status policy and sets the httpOnly cookie; this component
 * merely carries intent and renders the answer.
 */
export function LoginForm({ next }: { next: string | null }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<{ message: string; code?: string | null } | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const data = new FormData(e.currentTarget);
    try {
      const res = await postJson<{ home: string }>('/auth/login', {
        primaryPhone: String(data.get('primaryPhone') ?? ''),
        password: String(data.get('password') ?? ''),
      });
      // Only same-site paths are honoured as redirect targets — an
      // unchecked `next` from a query string is an open redirect.
      const safeNext =
        next && next.startsWith('/') && !next.startsWith('//') ? next : res.home;
      router.push(safeNext ?? '/');
      router.refresh();
    } catch (err) {
      if (err instanceof ClientApiError) {
        setError({
          message:
            err.status === 401
              ? 'Those credentials were not accepted.'
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
    <form onSubmit={onSubmit} className="stack">
      {error ? <ApiAlert message={error.message} code={error.code} /> : null}

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
          autoComplete="username"
          autoCapitalize="off"
          spellCheck={false}
          required
          placeholder="+256 7…"
        />
      </div>

      <div className="field">
        <label className="label" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          className="input"
          autoComplete="current-password"
          required
        />
      </div>

      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}
