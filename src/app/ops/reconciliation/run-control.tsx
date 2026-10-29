'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { postJson, ClientApiError } from '@/lib/client';
import { ApiAlert } from '@/app/ui';

/**
 * Runs the ledger ↔ custodian check through the real POST endpoint and
 * refreshes the server-rendered figures. The run is safe to repeat: each
 * execution writes one immutable history row; nothing is adjusted.
 */
export function RunReconciliationControl() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<{ message: string; code?: string | null } | null>(null);
  const [ranAt, setRanAt] = useState<string | null>(null);

  async function run() {
    setPending(true);
    setError(null);
    try {
      const res = await postJson<{ runAt: string }>('/ops/reconciliation', {});
      setRanAt(res.runAt);
      router.refresh();
    } catch (err) {
      if (err instanceof ClientApiError) setError({ message: err.message, code: err.code });
      else setError({ message: 'The check could not run. Try again in a moment.' });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="stack-sm">
      <button type="button" className="btn btn-primary" onClick={run} disabled={pending}>
        {pending ? 'Running the check…' : 'Run a reconciliation check now'}
      </button>
      {ranAt && !error ? (
        <p className="notice notice-ok" role="status">
          Check recorded. The figures on this page were refreshed to the latest run.
        </p>
      ) : null}
      {error ? <ApiAlert message={error.message} code={error.code} /> : null}
    </div>
  );
}
