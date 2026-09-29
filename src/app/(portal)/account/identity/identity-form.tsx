'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { postJson, ClientApiError } from '@/lib/client';
import { ApiAlert } from '@/app/ui';

/**
 * The identity check. It collects exactly the two factors the V1 baseline
 * requires — a National Identification Number and the name it belongs to —
 * and no documents (Decision 10).
 *
 * ── What the provider actually is ──
 * The provider behind this endpoint is a development mock, and the page
 * around this form says so. The mock checks the NIN's structure and whether
 * the name matches the one on your House For Rent account; a `failed`
 * result therefore comes back as an honest "the check did not pass" rather
 * than an invented story about a register.
 */
export function IdentityForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<{ message: string; code?: string | null } | null>(
    null,
  );
  const [ok, setOk] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setOk(null);

    const data = new FormData(e.currentTarget);
    if (data.get('consent') !== 'on') {
      setError({
        message:
          'We need your consent before running identity checks (Data Protection and Privacy Act 2019).',
      });
      return;
    }

    const nin = String(data.get('nin') ?? '').trim().toUpperCase();
    const fullName = String(data.get('fullName') ?? '').trim();

    if (!/^[A-Z0-9]{14}$/.test(nin)) {
      setError({
        message: 'A Ugandan National Identification Number is 14 letters and digits.',
      });
      return;
    }
    if (!fullName) {
      setError({ message: 'Enter your full name exactly as it appears on your account.' });
      return;
    }

    setPending(true);
    try {
      const res = await postJson<{ id: string; state: string; provider: string }>(
        '/identity',
        { method: 'nin', nin, fullName },
      );
      if (res.state === 'verified') {
        setOk('Your identity has been verified.');
        // The page above reads the verification state from the server;
        // refresh so it renders the verified view.
        router.refresh();
      } else {
        setError({
          message:
            'The check did not pass. The number must be a validly structured National Identification Number (14 characters, starting CM or CF), and the name must match the name on your House For Rent account. You can correct the details and try again.',
        });
      }
    } catch (err) {
      if (err instanceof ClientApiError) {
        setError({ message: err.message, code: err.code });
      } else {
        setError({
          message:
            'Could not reach House For Rent. Nothing was saved — try again in a moment.',
        });
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="card stack">
      {error ? <ApiAlert message={error.message} code={error.code} /> : null}
      {ok ? <p className="notice notice-ok">{ok}</p> : null}

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
        <label className="label" htmlFor="fullName">
          Your full name
        </label>
        <input
          id="fullName"
          name="fullName"
          className="input"
          required
          autoComplete="name"
          placeholder="As it appears on the ID"
        />
        <p className="hint">
          The name the provider checks against — it must match the name on
          your House For Rent account.
        </p>
      </div>

      {/*
        Consent is asked here AND honoured by the flow: no check is run and
        nothing is recorded until it is given (NFR-3, DPA 2019).
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
