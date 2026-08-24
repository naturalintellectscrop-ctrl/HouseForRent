'use client';

import { useActionState } from 'react';
import { openDealAction } from '@/app/actions/deals';
import { IDLE, type ActionState } from '@/app/actions/state';

/**
 * The step after the introduction (FR-8.3) — F-001's missing user action.
 *
 * The officer who made the introduction is the one who opens the deal, and
 * the only thing they send is the record's id. Every party on the resulting
 * deal is read server-side from that record, so this button cannot be made
 * to open a deal between two people who never met.
 *
 * It is offered unconditionally rather than hidden once a deal exists. The
 * console has no route that would tell it, and inventing one to grey out a
 * button would mean two places deciding when a duplicate is legitimate. The
 * backend answers with 409 and names the existing deal, which is the more
 * useful outcome anyway.
 */
export function OpenDeal({
  introductionRecordId,
}: {
  introductionRecordId: string;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    openDealAction.bind(null, introductionRecordId),
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

      <button type="submit" disabled={pending}>
        {pending ? 'Opening…' : 'Open the deal'}
      </button>

      <p className="hint">
        This creates the rental against the introduction above. Nothing moves
        yet — the landlord signs the agreement before any money is asked for,
        and the tenant&rsquo;s funds are held in escrow until they confirm
        they have moved in.
      </p>
    </form>
  );
}
