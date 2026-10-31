'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { postJson, ClientApiError } from '@/lib/client';
import { ApiAlert } from '@/app/ui';

/**
 * Retries a FAILED refund record through the real endpoint. The control
 * exists so the retry is an explicit, audited decision - never an
 * automatic loop: a pending record CANNOT be retried (the server refuses,
 * because a second provider instruction would risk a double payout), and a
 * confirmed one has nothing left to retry.
 */
export function RetryRefundControl({ recordId }: { recordId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<{ message: string; code?: string | null } | null>(null);
  const [done, setDone] = useState(false);

  async function retry() {
    setPending(true);
    setError(null);
    try {
      await postJson(`/admin/finance/refund-records/${recordId}/retry`, {});
      setDone(true);
      router.refresh();
    } catch (err) {
      if (err instanceof ClientApiError) setError({ message: err.message, code: err.code });
      else setError({ message: 'The retry could not be issued. Try again in a moment.' });
    } finally {
      setPending(false);
    }
  }

  return (
    <span style={{ display: 'inline-flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
      <button type="button" className="btn btn-secondary" onClick={retry} disabled={pending || done}>
        {pending ? 'Retrying…' : done ? 'Retry issued' : 'Retry payout'}
      </button>
      {error ? <ApiAlert message={error.message} code={error.code} /> : null}
    </span>
  );
}
