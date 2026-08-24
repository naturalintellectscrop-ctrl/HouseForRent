'use client';

import { useActionState } from 'react';
import { registerAction, type FormState } from '@/app/actions/auth';
import { ApiAlert } from '@/app/ui';

const INITIAL: FormState = { error: null };

/**
 * ── Why the role is a radio group and not a hidden field ──
 * It changes what the account can do, so the person creating it has to
 * choose it deliberately and be able to see what they chose. It is also the
 * one field on this form the server does not derive: the API's own DTO
 * accepts `tenant` and `lister` and rejects anything else, so a tampered
 * value gets a 400 rather than a staff account (API Spec §3).
 */
export function RegisterForm({
  preset,
  next,
}: {
  preset: 'tenant' | 'lister';
  next: string | null;
}) {
  const [state, action, pending] = useActionState(registerAction, INITIAL);

  return (
    <form action={action} className="stack">
      {state.error ? <ApiAlert message={state.error} code={state.code} /> : null}

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
        />
        <p className="hint">At least 8 characters.</p>
      </div>

      <button
        type="submit"
        className="btn btn-primary btn-lg btn-block"
        disabled={pending}
      >
        {pending ? 'Creating your account…' : 'Create account'}
      </button>

      <p className="hint">
        Field officer and operations accounts are created by an administrator,
        not here.
      </p>
    </form>
  );
}
