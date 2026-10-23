'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { postJson, ClientApiError } from '@/lib/client';
import { ApiAlert } from '@/app/ui';

/**
 * The operator sign-in form. Exists for the same reason the public one does:
 * a pending state and an error without a full reload. It POSTs over real HTTP
 * to /api/v1/auth/login with an `identifier` (the owner's email - phone also
 * resolves); the server resolves the session, enforces the status policy and
 * sets the httpOnly cookie. This component carries intent and renders the
 * answer - it holds no privilege.
 */
export function OperatorLoginForm({ next }: { next: string | null }) {
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
        identifier: String(data.get('identifier') ?? ''),
        password: String(data.get('password') ?? ''),
      });
      // Only same-site paths are honoured as redirect targets - an
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
        <label className="label" htmlFor="identifier">
          Operator email or phone
        </label>
        <input
          id="identifier"
          name="identifier"
          type="text"
          className="input"
          autoComplete="username"
          autoCapitalize="off"
          spellCheck={false}
          required
          placeholder="operator email"
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

      <button type="submit" className="btn btn-primary btn-block" disabled={pending}>
        {pending ? 'Verifying…' : 'Enter control center'}
      </button>
    </form>
  );
}
