'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { postJson, ClientApiError } from '@/lib/client';
import type { PresentedTerms } from '@/lib/api';
import { ApiAlert, shillings } from '@/app/ui';

/**
 * The listing agreement (FR-9.1).
 *
 * ── Every figure here comes from the server ──
 * `commissionIfLet` is what this let would actually cost, in shillings,
 * computed from the rate version currently in force. It is NOT a percentage
 * the landlord is left to do arithmetic on, and this component does not
 * multiply anything: a commission figure computed in a browser is a
 * commission figure an attacker can change.
 *
 * ── Why the clause version is echoed back ──
 * The terms are accepted exactly as presented. If what the server holds
 * changed between this landlord reading the terms and ticking the box, the
 * server refuses rather than binding them to terms they never saw.
 */
export function AgreementPanel({
  listingId,
  terms,
}: {
  listingId: string;
  terms: PresentedTerms;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<{ message: string; code?: string | null } | null>(
    null,
  );
  const [ok, setOk] = useState<string | null>(null);

  if (terms.alreadyAccepted) {
    return (
      <div className="card stack-sm">
        <h2 className="h3">Agreement accepted</h2>
        <p className="muted">
          You accepted these terms, and they are recorded against this listing.
          A later change to our published rate does not affect them.
        </p>
        <dl className="terms">
          <div className="terms-row">
            <dt>Commission on a let</dt>
            <dd className="num">{shillings(terms.commissionIfLet)}</dd>
          </div>
          <div className="terms-row">
            <dt>Paid by</dt>
            <dd>The landlord</dd>
          </div>
        </dl>
      </div>
    );
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setOk(null);

    const data = new FormData(e.currentTarget);
    if (data.get('accept') !== 'on') {
      setError({
        message:
          'Tick the box to confirm you accept the commission terms and the circumvention clause.',
      });
      return;
    }

    setPending(true);
    try {
      await postJson(`/landlord/listings/${listingId}/agreement`, {});
      setOk('Agreement accepted.');
      // The blockers list above is computed server-side from this fact.
      router.refresh();
    } catch (err) {
      if (err instanceof ClientApiError) {
        setError({ message: err.message, code: err.code });
      } else {
        setError({
          message:
            'Could not reach House For Rent. Nothing was saved - try again in a moment.',
        });
      }
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="card stack">
      <h2 className="h3">Listing agreement</h2>

      {error ? <ApiAlert message={error.message} code={error.code} /> : null}
      {ok ? <p className="notice notice-ok">{ok}</p> : null}

      <dl className="terms">
        <div className="terms-row">
          <dt>Monthly rent</dt>
          <dd className="num">{shillings(terms.monthlyRent)}</dd>
        </div>
        <div className="terms-row terms-total">
          <dt>Our commission, if it lets</dt>
          <dd className="num">{shillings(terms.commissionIfLet)}</dd>
        </div>
      </dl>

      <p className="hint">
        Charged once, only when a tenant moves in, and taken out of the
        settlement - you never write us a cheque. The tenant pays nothing.
      </p>

      <details className="agreement-clause">
        <summary>{terms.clause.heading}</summary>
        {/* The clause text is served by the API and rendered verbatim.
            Paraphrasing a contract term in a UI would mean the landlord
            agreed to one thing and read another. */}
        <p>{terms.clause.body}</p>
      </details>

      <div className="field">
        <label className="choice">
          <input type="checkbox" name="accept" required />
          <span>
            <span className="choice-title">I accept these terms</span>
            <span className="choice-note">
              Including the commission of {shillings(terms.commissionIfLet)} on
              a completed let, and the clause above.
            </span>
          </span>
        </label>
      </div>

      <button type="submit" className="btn btn-primary btn-block" disabled={pending}>
        {pending ? 'Recording…' : 'Accept the agreement'}
      </button>
    </form>
  );
}
