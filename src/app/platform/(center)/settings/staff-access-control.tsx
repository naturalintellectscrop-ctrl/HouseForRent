'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { postJson, ClientApiError } from '@/lib/client';
import { ApiAlert } from '@/app/ui';

/**
 * Suspend or restore one staff account's access, from the roster row.
 *
 * The server holds the real rails (staff-only, no self-change, last-admin
 * protection, conditional status move, session revocation, audit row);
 * this control arms the consequential action, then renders the server's
 * verdict. Nothing here is cosmetic: a suspension ends live sessions the
 * moment the server accepts it.
 */
export function StaffAccessControl({
  partyId,
  status,
  isSelf,
}: {
  partyId: string;
  status: string;
  isSelf: boolean;
}) {
  const router = useRouter();
  const [armed, setArmed] = useState(false);
  const [pending, setPending] = useState<'suspend' | 'restore' | null>(null);
  const [error, setError] = useState<{ message: string; code?: string | null } | null>(null);

  async function submit(action: 'suspend' | 'restore') {
    setPending(action);
    setError(null);
    try {
      await postJson(`/ops/staff/${partyId}/access`, { action });
      setArmed(false);
      router.refresh();
    } catch (err) {
      if (err instanceof ClientApiError) {
        setError({ message: err.message, code: err.code });
        setArmed(false);
      } else {
        setError({ message: 'Could not reach the House For Rent API - nothing changed. Try again.' });
      }
    } finally {
      setPending(null);
    }
  }

  if (isSelf) {
    return (
      <span className="muted" style={{ fontSize: '0.8125rem' }}>
        this is you
      </span>
    );
  }

  if (status === 'active') {
    return (
      <span className="stack-sm" style={{ gap: '0.3rem' }}>
        {!armed ? (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setError(null);
              setArmed(true);
            }}
          >
            Suspend
          </button>
        ) : (
          <span className="row" style={{ gap: '0.4rem' }}>
            <button
              type="button"
              className="btn btn-danger btn-sm"
              onClick={() => submit('suspend')}
              disabled={pending !== null}
            >
              {pending === 'suspend' ? 'Suspending…' : 'Confirm suspend'}
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setArmed(false)}
              disabled={pending !== null}
            >
              Keep
            </button>
          </span>
        )}
        {error ? <ApiAlert message={error.message} code={error.code} /> : null}
      </span>
    );
  }

  if (status === 'suspended') {
    return (
      <span className="stack-sm" style={{ gap: '0.3rem' }}>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => submit('restore')}
          disabled={pending !== null}
        >
          {pending === 'restore' ? 'Restoring…' : 'Restore access'}
        </button>
        {error ? <ApiAlert message={error.message} code={error.code} /> : null}
      </span>
    );
  }

  return <span className="muted" style={{ fontSize: '0.8125rem' }}>—</span>;
}
