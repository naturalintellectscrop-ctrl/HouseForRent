import Link from 'next/link';
import { redirect } from 'next/navigation';
import { api, ApiError, type DispatchQueue } from '@/lib/api';
import { AdminOnly, Empty, ShortId, when } from '../../../ui';
import { AssignForm } from './assign-form';

/**
 * Dispatch — FR-5.2, and the fix for F-002.
 *
 * ── What was broken ──
 * A tenant could request a viewing and nothing could ever act on it.
 * `POST /v1/viewings/:id/assign` existed, was admin-only and was tested; no
 * client called it, and no endpoint listed the viewings waiting to be
 * assigned. So `requested` was a terminal state in the real product, and
 * every step after it — the field report, the introduction, the deal, the
 * escrow — was unreachable no matter how well it worked.
 *
 * This page is the missing surface. It is deliberately the LAST screen in
 * the chain to be built and the smallest: one queue, one action per row.
 *
 * `blockedBy` is rendered, not filtered out. A viewing outside the corridor
 * must stay visible — a dispatcher needs to know a tenant is waiting on
 * something we cannot serve, which is a supply signal, not noise.
 */
const BLOCKER_COPY: Record<string, string> = {
  outside_service_area:
    'This listing sits outside the active service corridor, so assignment will be refused (FR-5.2, Decision 2).',
  listing_not_live:
    'The listing is no longer live — it was withdrawn or unpublished after the tenant asked to see it.',
};

export default async function DispatchPage() {
  let queue: DispatchQueue;
  try {
    queue = await api<DispatchQueue>('/v1/viewings/dispatch-queue');
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.status === 401) redirect('/login');
      if (err.status === 403) return <AdminOnly what="Dispatch" />;
    }
    throw err;
  }

  return (
    <>
      <h1>Dispatch</h1>
      <p className="lede">
        Viewings a tenant has asked for and nobody has been sent to yet,
        soonest first. {queue.total} waiting.
      </p>

      {queue.officers.length === 0 && (
        <p className="alert alert-error" role="alert">
          No active field officer accounts exist, so nothing here can be
          assigned. Staff accounts are provisioned by an admin — until one
          exists, every requested viewing stays requested.
        </p>
      )}

      {queue.rows.length === 0 ? (
        <Empty
          title="Nothing waiting to be assigned."
          action={
            <Link href="/" className="btn btn-secondary">
              Your own visits
            </Link>
          }
        >
          Every requested viewing has an officer on it. An empty queue here
          with tenants reporting no response means the requests are not
          arriving, not that dispatch is behind.
        </Empty>
      ) : (
        queue.rows.map((row) => {
          const blocked = row.blockedBy
            .map((code) => BLOCKER_COPY[code] ?? code)
            .join(' ');

          return (
            <div key={row.viewing.id} className="card">
              <div className="card-head">
                <span className="card-title">
                  {when(row.viewing.scheduledFor)}
                </span>
                {row.blockedBy.length === 0 ? (
                  <span className="pill pill-ok">assignable</span>
                ) : (
                  row.blockedBy.map((code) => (
                    <span key={code} className="pill pill-danger">
                      {code.replace(/_/g, ' ')}
                    </span>
                  ))
                )}
              </div>

              <p className="muted">
                {row.neighbourhood} · listing{' '}
                <ShortId value={row.listingId} /> · tenant{' '}
                <ShortId value={row.viewing.tenantPartyId} /> · requested{' '}
                {when(row.viewing.createdAt)}
              </p>

              <AssignForm
                viewingId={row.viewing.id}
                officers={queue.officers}
                blocked={blocked || null}
              />
            </div>
          );
        })
      )}

      <p className="muted">
        Assigning moves the viewing to <span className="pill pill-warn">
          scheduled
        </span>{' '}
        and puts it on that officer&rsquo;s board. Re-assigning before the
        visit is permitted; after it is not.
      </p>
    </>
  );
}
