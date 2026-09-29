'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { postJson, ClientApiError } from '@/lib/client';
import { ApiAlert } from '@/app/ui';

/**
 * The two ways a visit ends.
 *
 * `Close visit` is disabled when the SERVER said it cannot be conducted
 * (`canConduct: false`) — but that is a courtesy, not the enforcement. If it
 * were submitted anyway, the backend returns 422 FIELD_REPORT_REQUIRED and
 * the database refuses beneath it. The button reflects the rule; it does not
 * hold it.
 *
 * SANDBOX ADAPTATION: the reference used server actions; here each ending
 * POSTs over real HTTP to /api/v1/viewings/:id/conduct or /no-show.
 */
export function CloseVisit({
  viewingId,
  canConduct,
}: {
  viewingId: string;
  canConduct: boolean;
}) {
  const router = useRouter();
  const [conducting, setConducting] = useState(false);
  const [marking, setMarking] = useState(false);
  const [error, setError] = useState<{ message: string; code?: string | null } | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  async function endVisit(
    path: 'conduct' | 'no-show',
    success: string,
    setPending: (v: boolean) => void,
  ) {
    setPending(true);
    setError(null);
    setOk(null);
    try {
      await postJson(`/viewings/${viewingId}/${path}`, {});
      setOk(success);
      router.refresh();
    } catch (err) {
      if (err instanceof ClientApiError) {
        setError({ message: err.message, code: err.code });
      } else {
        setError({
          message:
            'Could not reach the House For Rent API. Your work was not saved — try again when you have signal.',
        });
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      {error && <ApiAlert message={error.message} code={error.code} />}
      {ok && <p className="alert alert-ok">{ok}</p>}

      {!canConduct && (
        <p className="alert alert-note">
          File the structured field report first. A visit cannot be closed
          without one — the introduction record is only created alongside it.
        </p>
      )}

      <div className="btn-row">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void endVisit('conduct', 'Visit closed. Introduction record created.', setConducting);
          }}
        >
          <button
            type="submit"
            className="btn-block"
            disabled={!canConduct || conducting}
          >
            {conducting ? 'Closing…' : 'Close visit'}
          </button>
        </form>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void endVisit('no-show', 'Recorded as a no-show.', setMarking);
          }}
        >
          <button
            type="submit"
            className="btn-danger btn-block"
            disabled={marking}
          >
            {marking ? 'Recording…' : 'Tenant did not show'}
          </button>
        </form>
      </div>
    </>
  );
}
