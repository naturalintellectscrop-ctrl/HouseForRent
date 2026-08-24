'use client';

import { useActionState } from 'react';
import { requestViewingAction } from '@/app/actions/tenant';
import { IDLE, type ActionState } from '@/app/actions/state';
import { ApiAlert } from '@/app/ui';

/** Tomorrow, as a `yyyy-mm-dd` string — the earliest sensible default. */
function tomorrow(): string {
  const d = new Date(Date.now() + 86400000);
  return d.toISOString().slice(0, 10);
}

export function RequestViewingForm({ listingId }: { listingId: string }) {
  const [state, submit, pending] = useActionState<ActionState, FormData>(
    requestViewingAction.bind(null, listingId),
    IDLE,
  );

  return (
    <form action={submit} className="card stack">
      {state.error ? <ApiAlert message={state.error} code={state.code} /> : null}

      <div className="row" style={{ gap: '1rem', alignItems: 'flex-start' }}>
        <div className="field" style={{ flex: '1 1 12rem', margin: 0 }}>
          <label className="label" htmlFor="date">
            Day
          </label>
          <input
            id="date"
            name="date"
            type="date"
            className="input"
            required
            min={tomorrow()}
            defaultValue={tomorrow()}
          />
        </div>
        <div className="field" style={{ flex: '1 1 9rem', margin: 0 }}>
          <label className="label" htmlFor="time">
            Time
          </label>
          <input
            id="time"
            name="time"
            type="time"
            className="input"
            required
            defaultValue="10:00"
            step={1800}
          />
        </div>
      </div>

      <p className="hint">
        {/* Honest about who decides: dispatch may move the slot, and saying
            so here avoids a tenant believing the time is already booked. */}
        This is the time you would prefer. Operations confirms it, and may
        propose a different one if no officer is free.
      </p>

      <button
        type="submit"
        className="btn btn-primary btn-lg btn-block"
        disabled={pending}
      >
        {pending ? 'Sending your request…' : 'Request this viewing'}
      </button>
    </form>
  );
}
