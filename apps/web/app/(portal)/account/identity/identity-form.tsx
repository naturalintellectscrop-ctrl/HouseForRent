'use client';

import { useActionState } from 'react';
import { verifyIdentityAction } from '@/app/actions/tenant';
import { IDLE, type ActionState } from '@/app/actions/state';
import { ApiAlert } from '@/app/ui';

export function IdentityForm() {
  const [state, submit, pending] = useActionState<ActionState, FormData>(
    verifyIdentityAction,
    IDLE,
  );

  return (
    <form action={submit} className="card stack">
      {state.error ? <ApiAlert message={state.error} code={state.code} /> : null}
      {state.ok ? <p className="notice notice-ok">{state.ok}</p> : null}

      <div className="field">
        <label className="label" htmlFor="nin">
          National Identification Number
        </label>
        <input
          id="nin"
          name="nin"
          className="input"
          required
          minLength={14}
          maxLength={14}
          autoComplete="off"
          spellCheck={false}
          style={{ textTransform: 'uppercase' }}
          placeholder="CM12345678ABCD"
        />
        <p className="hint">
          14 letters and digits, as printed on your national ID card.
        </p>
      </div>

      <div className="field">
        <label className="label" htmlFor="phone">
          Phone number registered to that ID
        </label>
        <input
          id="phone"
          name="phone"
          type="tel"
          className="input"
          inputMode="tel"
          required
          minLength={9}
          placeholder="+256 7…"
        />
      </div>

      {/*
        Consent is checked here AND enforced server-side: IdentityService
        refuses to verify a party with no consent record, so an unticked box
        is not merely discouraged by this form (NFR-3, DPA 2019).
      */}
      <div className="field">
        <label className="choice">
          <input type="checkbox" name="consent" required />
          <span>
            <span className="choice-title">
              I consent to identity verification
            </span>
            <span className="choice-note">
              House For Rent may pass these details to an identity provider to
              confirm who I am, under the Data Protection and Privacy Act 2019.
            </span>
          </span>
        </label>
      </div>

      <button
        type="submit"
        className="btn btn-primary btn-lg"
        disabled={pending}
      >
        {pending ? 'Verifying…' : 'Verify my identity'}
      </button>
    </form>
  );
}
