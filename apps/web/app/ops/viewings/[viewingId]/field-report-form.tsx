'use client';

import { useActionState } from 'react';
import { submitFieldReportAction } from '@/app/actions/viewings';
import { IDLE, type ActionState } from '@/app/actions/state';

const CONDITIONS = ['excellent', 'good', 'fair', 'poor'] as const;

/**
 * FR-5.4 — the structured field report.
 *
 * The three fields that matter are radios, not free text, because they are
 * the ones that become baseline data for future Certified Partner standards
 * (SSOT Decision 9) — you cannot certify against a standard you only ever
 * recorded as prose. `issuesText` and `timingNote` are optional annotations
 * beside them, never instead of them.
 */
export function FieldReportForm({
  viewingId,
  mediaAssetIds,
}: {
  viewingId: string;
  mediaAssetIds: string[];
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    submitFieldReportAction.bind(null, viewingId),
    IDLE,
  );

  return (
    <form action={action}>
      {state.error && (
        <p className="alert alert-error" role="alert">
          {state.error} {state.code && <code>{state.code}</code>}
        </p>
      )}

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
          Either answer refreshes the availability clock — a visit is a visit.
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

      <input
        type="hidden"
        name="mediaAssetIds"
        value={mediaAssetIds.join(',')}
      />

      <p className="alert alert-note">
        A report is filed once. It records what you saw at a moment, so it
        cannot be revised afterwards — check it before submitting.
      </p>

      <button type="submit" disabled={pending}>
        {pending ? 'Filing…' : 'File report'}
      </button>
    </form>
  );
}
