'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ClientApiError, postJson } from '@/lib/client';

/**
 * One section's decision control. Every decision REQUIRES a reason —
 * "approve" too, because "why" is exactly what a future reviewer (or the
 * applicant) will ask. Re-deciding a decided section is the documented
 * suspend/revoke path; the server records it as a new audit row and
 * refuses an identical no-op with 409.
 */
export function KycDecisionControl({
  submissionId,
  section,
  currentState,
}: {
  submissionId: string;
  section: 'identity' | 'authority' | 'payout';
  currentState: string;
}) {
  const router = useRouter();
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState<'approve' | 'request_info' | 'reject' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const decided = currentState === 'approved' || currentState === 'rejected';

  async function decide(decision: 'approve' | 'request_info' | 'reject') {
    setError(null);
    if (reason.trim().length < 4) {
      setError('A review reason is required — write what a future reader needs.');
      return;
    }
    setPending(decision);
    try {
      await postJson(`/admin/kyc/${submissionId}/decision`, {
        section,
        decision,
        reason: reason.trim(),
      });
      setReason('');
      router.refresh();
    } catch (err) {
      setError(err instanceof ClientApiError ? err.message : 'decision failed - try again');
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="stack-sm" style={{ gap: '0.6rem' }}>
      <div className="field" style={{ margin: 0 }}>
        <label htmlFor={`reason-${section}`}>
          Review reason {decided ? '(re-decision — recorded as a new entry)' : ''}
        </label>
        <textarea
          id={`reason-${section}`}
          rows={2}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={
            section === 'identity'
              ? 'e.g. ID front and back consistent with the selfie; name matches the account.'
              : section === 'authority'
                ? 'e.g. Title particulars and evidence reviewed; declared relationship is coherent.'
                : 'e.g. Mobile-money number format valid; recipient name recorded.'
          }
        />
      </div>
      <div className="row" style={{ gap: '0.6rem', flexWrap: 'wrap' }}>
        <button
          className="btn btn-primary btn-sm"
          onClick={() => decide('approve')}
          disabled={pending !== null}
        >
          {pending === 'approve' ? 'Recording…' : `Approve ${section}`}
        </button>
        <button
          className="btn btn-secondary btn-sm"
          onClick={() => decide('request_info')}
          disabled={pending !== null}
        >
          Request more information
        </button>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => decide('reject')}
          disabled={pending !== null}
        >
          {decided ? 'Revoke / reject' : 'Reject'}
        </button>
      </div>
      <p className="faint" style={{ fontSize: '0.8125rem', margin: 0 }}>
        Approving {section === 'identity' ? 'identity' : section === 'authority' ? 'authority' : 'payout'}{' '}
        records a manual review of the submitted material. It does not
        activate the account, verify any property, publish any listing, or
        switch payouts on.
      </p>
      {error ? (
        <p className="notice notice-error" role="alert" style={{ margin: 0 }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
