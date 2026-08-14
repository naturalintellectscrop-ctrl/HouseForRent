'use client';

import { useActionState } from 'react';
import { loginAction, type FormState } from '../actions/auth';

const INITIAL: FormState = { error: null };

/**
 * The only client component on this page. It exists for one reason: to show
 * a pending state and an error without a full reload. Everything it submits
 * is handled server-side.
 */
export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, INITIAL);

  return (
    <form action={action}>
      {state.error && (
        <p className="alert alert-error" role="alert">
          {state.error}
        </p>
      )}

      <div className="field">
        <label htmlFor="primaryPhone">Phone number</label>
        <input
          id="primaryPhone"
          name="primaryPhone"
          type="tel"
          inputMode="tel"
          autoComplete="username"
          autoCapitalize="off"
          spellCheck={false}
          required
          placeholder="+2567…"
        />
      </div>

      <div className="field">
        <label htmlFor="password">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>

      <button type="submit" disabled={pending}>
        {pending ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}
