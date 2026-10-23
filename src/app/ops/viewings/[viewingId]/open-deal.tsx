'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { postJson, ClientApiError } from '@/lib/client';
import { ApiAlert } from '@/app/ui';

/**
 * The step after the introduction (FR-8.3) - F-001's missing user action.
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
 *
 * SANDBOX ADAPTATION: the reference used a server action; here the form
 * POSTs over real HTTP to /api/v1/deals from the browser.
 */
export function OpenDeal({ introductionRecordId }: { introductionRecordId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<{ message: string; code?: string | null } | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setOk(null);
    try {
      const deal = await postJson<{ id: string }>('/deals', { introductionRecordId });
      setOk(
        `Deal ${deal.id.slice(0, 8)} opened. The tenant can now see it, and it is waiting on the match-tenant step.`,
      );
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

      <button type="submit" disabled={pending}>
        {pending ? 'Opening…' : 'Open the deal'}
      </button>

      <p className="hint">
        This creates the rental against the introduction above. Nothing moves
        yet - the landlord signs the agreement before any money is asked for,
        and the tenant&rsquo;s funds are held in escrow until they confirm
        they have moved in.
      </p>
    </form>
  );
}
