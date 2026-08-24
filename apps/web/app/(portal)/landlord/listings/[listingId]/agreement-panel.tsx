'use client';

import { useActionState } from 'react';
import { acceptAgreementAction } from '@/app/actions/landlord';
import { IDLE, type ActionState } from '@/app/actions/state';
import { ApiAlert, shillings } from '@/app/ui';

interface PresentedTerms {
  monthlyRent: string;
  commissionRateBp: number;
  commissionIfLet: string;
  clause: { version: string; heading: string; body: string };
  payer: 'landlord';
  tenantPays: false;
  alreadyAccepted: boolean;
  rateVersionId?: string;
}

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
 * ── Why the rate version is echoed back ──
 * `expectedRateVersionId` is returned exactly as presented. If the published
 * rate changes between this landlord reading the terms and ticking the box,
 * the server refuses rather than binding them to a rate they never saw. That
 * is the entire purpose of the field, so it is never dropped.
 */
export function AgreementPanel({
  listingId,
  terms,
}: {
  listingId: string;
  terms: PresentedTerms;
}) {
  const [state, submit, pending] = useActionState<ActionState, FormData>(
    acceptAgreementAction.bind(null, listingId),
    IDLE,
  );

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

  return (
    <form action={submit} className="card stack">
      <h2 className="h3">Listing agreement</h2>

      {state.error ? <ApiAlert message={state.error} code={state.code} /> : null}
      {state.ok ? <p className="notice notice-ok">{state.ok}</p> : null}

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
        settlement — you never write us a cheque. The tenant pays nothing.
      </p>

      <details className="agreement-clause">
        <summary>{terms.clause.heading}</summary>
        {/* The clause text is served by the API and rendered verbatim.
            Paraphrasing a contract term in a UI would mean the landlord
            agreed to one thing and read another. */}
        <p>{terms.clause.body}</p>
      </details>

      {terms.rateVersionId ? (
        <input
          type="hidden"
          name="expectedRateVersionId"
          value={terms.rateVersionId}
        />
      ) : null}
      <input type="hidden" name="clauseVersion" value={terms.clause.version} />

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
