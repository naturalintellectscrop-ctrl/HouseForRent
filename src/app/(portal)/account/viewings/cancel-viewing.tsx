'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { postJson } from '@/lib/client';

/**
 * The cancel affordance on a tenant's own viewing row.
 *
 * ── Why a two-step button, not a checkbox gate ──
 * The typed-checkbox gate is for IRREVERSIBLE money actions (confirm
 * move-in, recognise commission). Cancelling a viewing is a normal,
 * recoverable decision - the tenant can simply request another time -
 * so it gets an ordinary confirm step, sized to the stakes. What it does
 * NOT get is a silent one-click: the landlord's board changes state the
 * moment this is pressed, and an accidental tap should not read as a
 * decision nobody made.
 *
 * The server re-checks everything - ownership, the frozen transition
 * graph - so a stale row (someone else scheduled it between render and
 * click) comes back as a 409 with the API's own message, shown here
 * verbatim: the code is the diagnostic.
 */
export function CancelViewingButton({ viewingId }: { viewingId: string }) {
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const router = useRouter();

  async function cancel() {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      await postJson(`/viewings/${viewingId}/cancel`);
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Cancelling failed.');
      setConfirming(false);
    } finally {
      setPending(false);
    }
  }

  if (!confirming) {
    return (
      <button
        type="button"
        className="btn btn-danger btn-sm"
        onClick={() => setConfirming(true)}
        aria-expanded={false}
      >
        Cancel viewing
      </button>
    );
  }

  return (
    <span className="stack-sm" style={{ alignItems: 'flex-end', gap: '0.4rem' }}>
      <span
        className="faint"
        style={{ fontSize: '0.8125rem', textAlign: 'right', maxWidth: '16rem' }}
      >
        Cancel this viewing? The landlord sees it as cancelled.
      </span>
      <span className="row" style={{ gap: '0.4rem' }}>
        <button
          type="button"
          className="btn btn-danger btn-sm"
          onClick={cancel}
          disabled={pending}
        >
          {pending ? 'Cancelling…' : 'Yes, cancel it'}
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => {
            setConfirming(false);
            setError(null);
          }}
          disabled={pending}
        >
          Keep it
        </button>
      </span>
      {error ? (
        <span
          role="alert"
          style={{ fontSize: '0.8125rem', color: 'var(--danger)', textAlign: 'right', maxWidth: '16rem' }}
        >
          {error}
        </span>
      ) : null}
    </span>
  );
}
