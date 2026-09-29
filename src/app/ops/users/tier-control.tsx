'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { postJson, ClientApiError } from '@/lib/client';
import { ApiAlert } from '@/app/ui';

const TIER_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'property_owner', label: 'Property owner' },
  { value: 'broker_agent', label: 'Broker / agent' },
  { value: 'property_mgmt_company', label: 'Management company' },
];

/**
 * The tier control on a landlord row of the account directory.
 *
 * ── Why the confirm step says the consequence ──
 * The tier is what switches the mandate requirement on (broker / mgmt
 * company) or off (property owner). Moving it silently could hand a
 * middleman a publish path with no owner authority — or burden a genuine
 * owner with a mandate they cannot produce. So the operator picks a
 * value, reads what it changes, confirms, and the change lands with an
 * audit row carrying the previous tier. A same-value submit is a no-op
 * server-side and says so.
 */
export function TierControl({
  partyId,
  currentTier,
}: {
  partyId: string;
  currentTier: string | null;
}) {
  const router = useRouter();
  const [value, setValue] = useState(currentTier ?? 'property_owner');
  const [armed, setArmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<{ message: string; code?: string | null } | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const unchanged = value === (currentTier ?? 'property_owner');

  async function submit() {
    setPending(true);
    setError(null);
    try {
      const res = await postJson<{ changed: boolean; tier: string }>(
        `/admin/users/${partyId}/tier`,
        { tier: value },
      );
      setOk(
        res.changed
          ? `Tier set to ${res.tier.replace(/_/g, ' ')}. The publish gates read it immediately.`
          : 'That was already the tier — nothing changed.',
      );
      setArmed(false);
      router.refresh();
    } catch (err) {
      if (err instanceof ClientApiError) {
        setError({ message: err.message, code: err.code });
      } else {
        setError({
          message:
            'Could not reach the House For Rent API. Nothing was changed — try again when you have signal.',
        });
      }
    } finally {
      setPending(false);
    }
  }

  const consequence =
    value === 'property_owner'
      ? 'Lists their own homes. No mandate is required, and any mandate on file becomes irrelevant to publishing.'
      : 'Markets property this account may not own. Every listing needs the owner\u2019s verified mandate before it can publish.';

  if (ok) {
    return (
      <span className="stack-sm" style={{ display: 'inline-flex' }}>
        <span className="faint" style={{ fontSize: '0.8125rem' }}>{ok}</span>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => setOk(null)}
        >
          Change again
        </button>
      </span>
    );
  }

  if (!armed) {
    return (
      <span className="stack-sm" style={{ display: 'inline-flex' }}>
        <span className="row" style={{ gap: '0.4rem' }}>
          <select
            aria-label="Listing tier"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setOk(null);
              setError(null);
            }}
          >
            {TIER_OPTIONS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn btn-sm"
            disabled={unchanged || pending}
            onClick={() => setArmed(true)}
          >
            Set
          </button>
        </span>
        {error ? <ApiAlert message={error.message} code={error.code} /> : null}
      </span>
    );
  }

  return (
    <span className="stack-sm" style={{ display: 'inline-flex', maxWidth: '20rem' }}>
      <span style={{ fontSize: '0.8125rem' }}>
        Set this account to <strong>{TIER_OPTIONS.find((t) => t.value === value)?.label}</strong>?{' '}
        {consequence}
      </span>
      <span className="row" style={{ gap: '0.4rem' }}>
        <button type="button" className="btn btn-sm" onClick={submit} disabled={pending}>
          {pending ? 'Setting…' : 'Confirm'}
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => setArmed(false)}
          disabled={pending}
        >
          Back
        </button>
      </span>
      {error ? <ApiAlert message={error.message} code={error.code} /> : null}
    </span>
  );
}
