'use client';

import { useActionState } from 'react';
import {
  publishListingAction,
  withdrawListingAction,
} from '@/app/actions/landlord';
import { IDLE, type ActionState } from '@/app/actions/state';
import { ApiAlert } from '@/app/ui';

/**
 * Publish and withdraw.
 *
 * ── `canPublish` is the server's answer, not this component's ──
 * The button is disabled when the API says the listing is blocked, and the
 * API is also what refuses the call. Disabling it is a courtesy that saves a
 * landlord a 422 they can do nothing about; it is not the gate, and if this
 * component were wrong in the permissive direction the server would still
 * refuse.
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
  const [pubState, publish, publishing] = useActionState<ActionState, FormData>(
    publishListingAction.bind(null, listingId),
    IDLE,
  );
  const [wdState, withdraw, withdrawing] = useActionState<ActionState, FormData>(
    withdrawListingAction.bind(null, listingId),
    IDLE,
  );

  if (isLive) {
    return (
      <form action={withdraw} className="card stack-sm">
        <h2 className="h3">This listing is live</h2>
        <p className="muted">
          Tenants can find it and request viewings. Withdrawing takes it out of
          search; you can publish it again at any time.
        </p>
        {wdState.error ? (
          <ApiAlert message={wdState.error} code={wdState.code} />
        ) : null}
        {wdState.ok ? <p className="notice notice-ok">{wdState.ok}</p> : null}
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
    <form action={publish} className="card stack-sm">
      <h2 className="h3">Publish</h2>
      {pubState.error ? (
        <ApiAlert message={pubState.error} code={pubState.code} />
      ) : null}
      {pubState.ok ? <p className="notice notice-ok">{pubState.ok}</p> : null}

      <p className="muted">
        {canPublish
          ? 'Everything is in place. This will put the property into search results.'
          : 'Not yet — the steps above have to be complete first.'}
      </p>

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
