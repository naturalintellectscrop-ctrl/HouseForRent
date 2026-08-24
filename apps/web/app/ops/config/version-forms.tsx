'use client';

import { useActionState } from 'react';
import {
  createConfigVersionAction,
  createRateVersionAction,
} from '@/app/actions/admin';
import { IDLE, type ActionState } from '@/app/actions/state';

/**
 * FR-10.1 — both forms CREATE VERSIONS. Neither edits anything.
 *
 * That is not a UI convention: there is no edit endpoint to call, and both
 * tables reject UPDATE at the database level. The forms look this way
 * because the system does.
 */
export function RateVersionForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    createRateVersionAction,
    IDLE,
  );

  return (
    <form action={action}>
      {state.error && (
        <p className="alert alert-error" role="alert">
          {state.error} {state.code && <code>{state.code}</code>}
        </p>
      )}
      {state.ok && <p className="alert alert-ok">{state.ok}</p>}

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

      <div className="field">
        <label htmlFor="rate-effectiveFrom">Effective from (optional)</label>
        <input
          id="rate-effectiveFrom"
          name="effectiveFrom"
          type="datetime-local"
        />
        <p className="hint">
          Leave blank for immediately. A future date stages the change
          without it taking effect early.
        </p>
      </div>

      <div className="field">
        <label htmlFor="note">Note (optional)</label>
        <input id="note" name="note" type="text" placeholder="Q3 review" />
      </div>

      <p className="alert alert-note">
        This creates a new version. Deals already signed hold a snapshot of
        the rate they were signed under and are structurally unaffected —
        there is no path, here or anywhere, that re-prices them.
      </p>

      <button type="submit" disabled={pending}>
        {pending ? 'Creating…' : 'Create rate version'}
      </button>
    </form>
  );
}

export function ConfigVersionForm({ keys }: { keys: string[] }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    createConfigVersionAction,
    IDLE,
  );

  return (
    <form action={action}>
      {state.error && (
        <p className="alert alert-error" role="alert">
          {state.error} {state.code && <code>{state.code}</code>}
        </p>
      )}
      {state.ok && <p className="alert alert-ok">{state.ok}</p>}

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
        <label htmlFor="value">Value (JSON)</label>
        <input
          id="value"
          name="value"
          type="text"
          placeholder='7  ·  ["identity"]  ·  "v2"'
          required
          spellCheck={false}
        />
        <p className="hint">
          Typed by the parameter itself. A number for a window in days, an
          array for the screening module set.
        </p>
      </div>

      <div className="field">
        <label htmlFor="cfg-effectiveFrom">Effective from (optional)</label>
        <input
          id="cfg-effectiveFrom"
          name="effectiveFrom"
          type="datetime-local"
        />
      </div>

      <button type="submit" className="btn-secondary" disabled={pending}>
        {pending ? 'Creating…' : 'Create config version'}
      </button>
    </form>
  );
}
