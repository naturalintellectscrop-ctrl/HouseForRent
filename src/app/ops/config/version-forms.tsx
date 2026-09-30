'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { postJson, ClientApiError } from '@/lib/client';
import { ApiAlert } from '@/app/ui';

/**
 * FR-10.1 - both forms CREATE VERSIONS. Neither edits anything.
 *
 * That is not a UI convention: there is no edit endpoint to call, and both
 * tables reject UPDATE at the database level. The forms look this way
 * because the system does.
 *
 * SANDBOX ADAPTATION: the reference posted to two dedicated endpoints
 * (`/v1/admin/commission-rates` and `/v1/admin/config/:key/versions`). This
 * port exposes one admin mutation - `POST /api/v1/ops/config` - which
 * creates a new rate version when the key is `commission_rate_bp` and a new
 * parameter version otherwise. It accepts no future effective date and no
 * note, so those fields are not shown: offering them and silently dropping
 * what was entered would be worse than not offering them.
 */

export function RateVersionForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<{ message: string; code?: string | null } | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setOk(null);
    const data = new FormData(e.currentTarget);

    const raw = String(data.get('rateBpOfMonth') ?? '').trim();
    if (!raw) {
      setError({ message: 'Enter a rate in basis points of one month’s rent.' });
      setPending(false);
      return;
    }

    // Sent as the raw string the endpoint parses. Range, integrality and
    // type are the server's call; duplicating those bounds here would
    // create a second set free to drift from the one that actually binds.
    try {
      await postJson('/ops/config', { key: 'commission_rate_bp', value: raw });
      setOk('New rate version created. Deals already signed keep their snapshot.');
      router.refresh();
    } catch (err) {
      if (err instanceof ClientApiError) {
        setError({ message: err.message, code: err.code });
      } else {
        setError({ message: 'Could not reach the House For Rent API.' });
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit}>
      {error && <ApiAlert message={error.message} code={error.code} />}
      {ok && <p className="alert alert-ok">{ok}</p>}

      <div className="field">
        <label htmlFor="rateBpOfMonth">
          Rate, in basis points of one month&rsquo;s rent
        </label>
        <input
          id="rateBpOfMonth"
          name="rateBpOfMonth"
          type="text"
          inputMode="numeric"
          placeholder="10000"
          required
        />
        <p className="hint">
          10000 = one full month&rsquo;s rent. An integer, so the commission
          calculation never touches a fraction.
        </p>
      </div>

      <p className="alert alert-note">
        This creates a new version, effective immediately in this port. Deals
        already signed hold a snapshot of the rate they were signed under and
        are structurally unaffected - there is no path, here or anywhere,
        that re-prices them.
      </p>

      <button type="submit" disabled={pending}>
        {pending ? 'Creating…' : 'Create rate version'}
      </button>
    </form>
  );
}

export function ConfigVersionForm({ keys }: { keys: string[] }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<{ message: string; code?: string | null } | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setOk(null);
    const data = new FormData(e.currentTarget);

    const key = String(data.get('key') ?? '').trim();
    const raw = String(data.get('value') ?? '').trim();

    if (!key || !raw) {
      setError({ message: 'Both a parameter key and a value are required.' });
      setPending(false);
      return;
    }

    // The value travels as the raw string and is stored as one; the
    // readers of each parameter parse it (an integer day-count, a gate
    // count). The server owns whether the key exists at all.
    try {
      await postJson('/ops/config', { key, value: raw });
      setOk(`New version of "${key}" created.`);
      router.refresh();
    } catch (err) {
      if (err instanceof ClientApiError) {
        setError({ message: err.message, code: err.code });
      } else {
        setError({ message: 'Could not reach the House For Rent API.' });
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit}>
      {error && <ApiAlert message={error.message} code={error.code} />}
      {ok && <p className="alert alert-ok">{ok}</p>}

      <div className="field">
        <label htmlFor="key">Parameter</label>
        <select id="key" name="key" required defaultValue="">
          <option value="" disabled>
            Choose a parameter
          </option>
          {keys.map((key) => (
            <option key={key} value={key}>
              {key}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label htmlFor="value">Value</label>
        <input
          id="value"
          name="value"
          type="text"
          placeholder="14  ·  12"
          required
          spellCheck={false}
        />
        <p className="hint">
          A plain value, stored as recorded - for these parameters, a whole
          number of days or listings.
        </p>
      </div>

      <button type="submit" className="btn-secondary" disabled={pending}>
        {pending ? 'Creating…' : 'Create config version'}
      </button>
    </form>
  );
}
