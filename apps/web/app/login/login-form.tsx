'use client';

import { useActionState } from 'react';
import { loginAction, type FormState } from '@/app/actions/auth';
import { ApiAlert } from '@/app/ui';

const INITIAL: FormState = { error: null };

/**
 * The only client component on this page. It exists for one reason: to show
 * a pending state and an error without a full reload. Everything it submits
 * is handled server-side, and the form works with JavaScript disabled — the
 * action is a real form action, not an onSubmit handler.
 */
export function LoginForm({ next }: { next: string | null }) {
  const [state, action, pending] = useActionState(loginAction, INITIAL);

  return (
    <form action={action} className="stack">
      {state.error ? <ApiAlert message={state.error} code={state.code} /> : null}

      {next ? <input type="hidden" name="next" value={next} /> : null}

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

      <button
        type="submit"
        className="btn btn-primary btn-lg btn-block"
        disabled={pending}
      >
        {pending ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}
