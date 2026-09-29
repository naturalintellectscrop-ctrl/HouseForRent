'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { postJson, ClientApiError } from '@/lib/client';
import { ApiAlert } from '@/app/ui';

/** Tomorrow, as a `yyyy-mm-dd` string — the earliest sensible default. */
function tomorrow(): string {
  const d = new Date(Date.now() + 86400000);
  return d.toISOString().slice(0, 10);
}

/**
 * The viewing request. The body carries the listing and the preferred time,
 * and nothing else — the tenant is read from the session server-side, so no
 * form field here could book a viewing in someone else's name.
 */
export function RequestViewingForm({ listingId }: { listingId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<{ message: string; code?: string | null } | null>(
    null,
  );

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const data = new FormData(e.currentTarget);
    const date = String(data.get('date') ?? '').trim();
    const time = String(data.get('time') ?? '').trim();

    // The same checks the reference carried, in the same words: nothing
    // here decides whether the request is ALLOWED — that is the API's job
    // (TENANT_NOT_VERIFIED / OUTSIDE_SERVICE_AREA / LISTING_NOT_VIEWABLE).
    if (!date || !time) {
      setError({ message: 'Choose a day and a time that suit you.' });
      return;
    }
    const scheduledFor = new Date(`${date}T${time}`);
    if (Number.isNaN(scheduledFor.getTime())) {
      setError({ message: 'That is not a time we could read. Try again.' });
      return;
    }
    if (scheduledFor.getTime() < Date.now()) {
      setError({ message: 'Choose a time in the future.' });
      return;
    }

    setPending(true);
    try {
      await postJson('/viewings', {
        listingId,
        preferredDate: scheduledFor.toISOString(),
      });
      // The reference forwarded to the list, where the confirmation lives.
      router.push('/account/viewings?requested=1');
      router.refresh();
    } catch (err) {
      if (err instanceof ClientApiError) {
        setError({ message: err.message, code: err.code });
      } else {
        setError({
          message:
            'Could not reach House For Rent. Nothing was saved — try again in a moment.',
        });
      }
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="card stack">
      {error ? <ApiAlert message={error.message} code={error.code} /> : null}

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
