import Link from 'next/link';
import { redirect } from 'next/navigation';
import { api, ApiError, type Viewing } from '@/lib/api';
import { StatusPill, when } from '../ui';

/**
 * The dispatch board (FR-5.2).
 *
 * A server component: it fetches with the officer's session server-side and
 * ships the rendered list. No client JavaScript, no loading spinner, no
 * second round trip — which is the point on a field connection (NFR-5).
 *
 * `GET /v1/viewings/assigned/me` returns only viewings assigned to the
 * CALLER, resolved from their session. This page cannot show another
 * officer's work even if it wanted to.
 */
export default async function DispatchBoard() {
  let viewings: Viewing[];
  try {
    viewings = await api<Viewing[]>('/v1/viewings/assigned/me');
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      redirect('/login');
    }
    throw err;
  }

  return (
    <>
      <h1>Your visits</h1>
      <p className="lede">
        Viewings assigned to you and not yet closed, soonest first.
      </p>

      {viewings.length === 0 ? (
        <div className="empty">
          <p>
            <strong>Nothing assigned to you right now.</strong>
          </p>
          <p className="muted">
            Dispatch assigns visits within the service corridor. New ones will
            appear here.
          </p>
        </div>
      ) : (
        viewings.map((viewing) => (
          <Link
            key={viewing.id}
            href={`/viewings/${viewing.id}`}
            className="card card-link"
          >
            <div className="card-head">
              <span className="card-title">{when(viewing.scheduledFor)}</span>
              <StatusPill status={viewing.status} />
            </div>
            <p className="muted" style={{ margin: 0 }}>
              Listing {viewing.listingId.slice(0, 8)} · tenant{' '}
              {viewing.tenantPartyId.slice(0, 8)}
            </p>
          </Link>
        ))
      )}
    </>
  );
}
