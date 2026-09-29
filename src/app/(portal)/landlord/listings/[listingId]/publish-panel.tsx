'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { postJson, ClientApiError } from '@/lib/client';
import { ApiAlert } from '@/app/ui';

const BLOCKER_COPY: Record<string, string> = {
  field_verification: 'Waiting for a field officer to visit and verify the property',
  outside_service_area: 'This neighbourhood is outside the area we currently cover',
  listing_agreement: 'You have not yet accepted the listing agreement',
  mandate: 'We need a verified mandate for this specific property',
};

/**
 * Publish and withdraw.
 *
 * ── `canPublish` is the server's answer, not this component's ──
 * The button is disabled when the API says the listing is blocked, and the
 * API is also what refuses the call. Disabling it is a courtesy that saves a
 * landlord a 422 they can do nothing about; it is not the gate, and if this
 * component were wrong in the permissive direction the server would still
 * refuse.
 *
 * The publish click first asks the server for a DRY RUN. Only when the
 * server answers `canPublish` does it publish for real — so a stale page
 * produces the server's own list of blockers rather than a mutation that was
 * never going to succeed.
 */
export function PublishPanel({
  listingId,
  canPublish,
  isLive,
}: {
  listingId: string;
  canPublish: boolean;
  isLive: boolean;
}) {
  const router = useRouter();
  const [publishing, setPublishing] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [error, setError] = useState<{ message: string; code?: string | null } | null>(
    null,
  );
  const [ok, setOk] = useState<string | null>(null);
  /** Blockers the server itself reported, in its own vocabulary. */
  const [blockedBy, setBlockedBy] = useState<string[] | null>(null);

  async function onPublish(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setOk(null);
    setBlockedBy(null);
    setPublishing(true);
    try {
      // 1 — the dry run: what does the server say is outstanding?
      const dry = await postJson<{ blockedBy: string[]; canPublish: boolean }>(
        `/landlord/listings/${listingId}/publish`,
        { dryRun: true },
      );
      if (!dry.canPublish) {
        setBlockedBy(dry.blockedBy);
        setError({
          message: 'Not yet — the server reports these steps are still outstanding.',
        });
        return;
      }
      // 2 — the real thing.
      await postJson(`/landlord/listings/${listingId}/publish`, {});
      setOk('Your property is live. Tenants can find it now.');
      router.refresh();
    } catch (err) {
      if (err instanceof ClientApiError) {
        setError({ message: err.message, code: err.code });
      } else {
        setError({
          message:
            'Could not reach House For Rent. Nothing was changed — try again in a moment.',
        });
      }
      router.refresh();
    } finally {
      setPublishing(false);
    }
  }

  async function onWithdraw(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setOk(null);
    setWithdrawing(true);
    try {
      await postJson(`/landlord/listings/${listingId}/withdraw`, {});
      setOk('Withdrawn. It is no longer in search; you can publish it again later.');
      router.refresh();
    } catch (err) {
      if (err instanceof ClientApiError) {
        setError({ message: err.message, code: err.code });
      } else {
        setError({
          message:
            'Could not reach House For Rent. Nothing was changed — try again in a moment.',
        });
      }
      router.refresh();
    } finally {
      setWithdrawing(false);
    }
  }

  if (isLive) {
    return (
      <form onSubmit={onWithdraw} className="card stack-sm">
        <h2 className="h3">This listing is live</h2>
        <p className="muted">
          Tenants can find it and request viewings. Withdrawing takes it out of
          search; you can publish it again at any time.
        </p>
        {error ? <ApiAlert message={error.message} code={error.code} /> : null}
        {ok ? <p className="notice notice-ok">{ok}</p> : null}
        <button
          type="submit"
          className="btn btn-secondary btn-block"
          disabled={withdrawing}
        >
          {withdrawing ? 'Withdrawing…' : 'Withdraw from search'}
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={onPublish} className="card stack-sm">
      <h2 className="h3">Publish</h2>
      {error ? <ApiAlert message={error.message} code={error.code} /> : null}
      {ok ? <p className="notice notice-ok">{ok}</p> : null}

      <p className="muted">
        {canPublish
          ? 'Everything is in place. This will put the property into search results.'
          : 'Not yet — the steps above have to be complete first.'}
      </p>

      {blockedBy && blockedBy.length > 0 ? (
        <ul className="stack-sm" style={{ margin: 0, padding: 0, listStyle: 'none' }}>
          {blockedBy.map((b) => (
            <li key={b} className="faint" style={{ fontSize: '0.875rem' }}>
              • {BLOCKER_COPY[b] ?? b.replace(/_/g, ' ')}
            </li>
          ))}
        </ul>
      ) : null}

      <button
        type="submit"
        className="btn btn-primary btn-block"
        disabled={!canPublish || publishing}
      >
        {publishing ? 'Publishing…' : 'Publish this listing'}
      </button>
    </form>
  );
}
