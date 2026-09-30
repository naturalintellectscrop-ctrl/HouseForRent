'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { postJson, ClientApiError } from '@/lib/client';
import { ApiAlert } from '@/app/ui';

const CONDITIONS = ['excellent', 'good', 'fair', 'poor'] as const;

/**
 * FR-5.4 - the structured field report.
 *
 * The three fields that matter are radios, not free text, because they are
 * the ones that become baseline data for future Certified Partner standards
 * (SSOT Decision 9) - you cannot certify against a standard you only ever
 * recorded as prose. `issuesText` and `timingNote` are optional annotations
 * beside them, never instead of them.
 *
 * SANDBOX ADAPTATION: the reference used a server action; here the form
 * POSTs over real HTTP to /api/v1/viewings/:id/field-report from the
 * browser. Presence checks on the three structured fields only - the
 * backend validates the VALUES and enforces immutability regardless.
 */
export function FieldReportForm({ viewingId }: { viewingId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<{ message: string; code?: string | null } | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setOk(null);
    const form = e.currentTarget;
    const data = new FormData(form);

    const conditionRating = String(data.get('conditionRating') ?? '');
    const matchesListing = data.get('matchesListing');
    const isAvailable = data.get('isAvailable');

    // Presence checks only - these three are required because the report is
    // structured (FR-5.4), and an unanswered radio would otherwise submit as
    // absent. The backend validates the VALUES; this just avoids a pointless
    // round trip on a field connection.
    if (!conditionRating || matchesListing === null || isAvailable === null) {
      setError({
        message:
          'Condition, accuracy and availability are all required - they are the structured part of the report.',
      });
      setPending(false);
      return;
    }

    const issuesText = String(data.get('issuesText') ?? '').trim();
    const timingNote = String(data.get('timingNote') ?? '').trim();

    try {
      await postJson(`/viewings/${viewingId}/field-report`, {
        conditionRating,
        matchesListing: matchesListing === 'true',
        isAvailable: isAvailable === 'true',
        ...(issuesText ? { issuesText } : {}),
        ...(timingNote ? { timingNote } : {}),
      });
      setOk('Report filed. Availability freshness updated.');
      router.refresh();
    } catch (err) {
      if (err instanceof ClientApiError) {
        setError({ message: err.message, code: err.code });
      } else {
        setError({
          message:
            'Could not reach the House For Rent API. Your work was not saved - try again when you have signal.',
        });
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit}>
      {error && <ApiAlert message={error.message} code={error.code} />}
      {ok && <p className="alert alert-ok">{ok}</p>}

      <fieldset>
        <legend>Condition</legend>
        <div className="choices" role="radiogroup" aria-label="Condition">
          {CONDITIONS.map((value) => (
            <label key={value} className="choice">
              <input
                type="radio"
                name="conditionRating"
                value={value}
                required
              />
              <span>{value}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend>Does it match the listing?</legend>
        <div className="choices" role="radiogroup" aria-label="Matches listing">
          <label className="choice">
            <input type="radio" name="matchesListing" value="true" required />
            <span>Matches</span>
          </label>
          <label className="choice">
            <input type="radio" name="matchesListing" value="false" required />
            <span>Does not match</span>
          </label>
        </div>
        <p className="hint">
          Marking it inaccurate removes the listing&rsquo;s verified standing,
          so it cannot be republished on a check this visit contradicted.
        </p>
      </fieldset>

      <fieldset>
        <legend>Is it available?</legend>
        <div className="choices" role="radiogroup" aria-label="Availability">
          <label className="choice">
            <input type="radio" name="isAvailable" value="true" required />
            <span>Available</span>
          </label>
          <label className="choice">
            <input type="radio" name="isAvailable" value="false" required />
            <span>Not available</span>
          </label>
        </div>
        <p className="hint">
          Either answer refreshes the availability clock - a visit is a visit.
        </p>
      </fieldset>

      <div className="field">
        <label htmlFor="issuesText">On-site issues (optional)</label>
        <textarea
          id="issuesText"
          name="issuesText"
          placeholder="Leaking tap in the second bathroom…"
        />
      </div>

      <div className="field">
        <label htmlFor="timingNote">Timing note (optional)</label>
        <textarea
          id="timingNote"
          name="timingNote"
          placeholder="Landlord arrived 20 minutes late…"
        />
      </div>

      <p className="alert alert-note">
        A report is filed once. It records what you saw at a moment, so it
        cannot be revised afterwards - check it before submitting.
      </p>

      <button type="submit" disabled={pending}>
        {pending ? 'Filing…' : 'File report'}
      </button>
    </form>
  );
}
