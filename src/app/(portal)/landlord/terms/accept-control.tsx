'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { postJson, ClientApiError } from '@/lib/client';

/**
 * The explicit acceptance control. One action, one version, no inference:
 * the server writes the ConsentRecord naming this exact version, and the
 * client can only offer the version it was actually shown.
 */
export function AcceptTermsControl({ currentVersion }: { currentVersion: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function accept() {
    setBusy(true);
    setError(null);
    try {
      await postJson('/landlord/terms', { version: currentVersion });
      router.refresh();
    } catch (err) {
      setError(err instanceof ClientApiError ? err.message : 'acceptance failed - try again');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack-sm">
      <button className="btn btn-primary" onClick={accept} disabled={busy}>
        {busy ? 'Recording…' : 'I have read these terms — accept this version'}
      </button>
      {error ? (
        <p className="alert alert-warn" role="alert" style={{ margin: 0 }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
