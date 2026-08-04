import Link from 'next/link';
import { redirect } from 'next/navigation';
import { api, ApiError, type VerificationQueue } from '@/lib/api';
import { Empty, when } from '../../../ui';

/**
 * FR-10.2 — the verification queue.
 *
 * A table, deliberately: these rows carry many meaningful columns, which is
 * past the point where a chart helps.
 *
 * The `blockedBy` column is the reason this page exists at all. A bare list
 * of unpublished listings tells an ops officer nothing about what to do
 * next; "waiting on a field visit" and "waiting on a mandate decision"
 * dispatch to different people. The server computes it — this page does not
 * re-derive publishability from the raw states beside it.
 */
const BLOCKER_LABEL: Record<string, string> = {
  field_verification: 'field visit',
  outside_service_area: 'out of corridor',
  mandate: 'mandate',
  listing_agreement: 'agreement',
};

export default async function QueuePage() {
  let queue: VerificationQueue;
  try {
    queue = await api<VerificationQueue>('/v1/admin/verification-queue');
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) redirect('/login');
    throw err;
  }

  return (
    <>
      <h1>Verification queue</h1>
      <p className="lede">
        Listings not yet live, and what each is waiting on. {queue.total} in
        the queue.
      </p>

      {queue.rows.length === 0 ? (
        <Empty
          title="Nothing waiting."
          action={
            <Link href="/ops" className="btn btn-secondary">
              Check the launch gate
            </Link>
          }
        >
          Every listing is either live or withdrawn, so no property is
          currently held up on a field visit, a mandate or an agreement. An
          empty queue with the launch gate unmet means the constraint is
          supply, not verification.
        </Empty>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th scope="col">Listing</th>
                <th scope="col">Neighbourhood</th>
                <th scope="col">Lister tier</th>
                <th scope="col">Verification</th>
                <th scope="col">Mandate</th>
                <th scope="col">Waiting on</th>
                <th scope="col">Added</th>
              </tr>
            </thead>
            <tbody>
              {queue.rows.map((row) => (
                <tr key={row.listingId}>
                  <td className="mono">{row.listingId.slice(0, 8)}</td>
                  <td>
                    {row.neighbourhood}
                    {!row.inServiceArea && (
                      <>
                        {' '}
                        <span className="pill pill-danger">out of corridor</span>
                      </>
                    )}
                  </td>
                  <td>{(row.listerTier ?? 'unset').replace(/_/g, ' ')}</td>
                  <td>{row.verificationState}</td>
                  <td>{row.mandateState ?? '—'}</td>
                  <td>
                    <span className="tags">
                      {row.blockedBy.length === 0 ? (
                        <span className="pill pill-ok">ready</span>
                      ) : (
                        row.blockedBy.map((blocker) => (
                          <span key={blocker} className="pill pill-warn">
                            {BLOCKER_LABEL[blocker] ?? blocker}
                          </span>
                        ))
                      )}
                    </span>
                  </td>
                  <td>{when(row.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="muted">
        A listing showing <span className="pill pill-ok">ready</span> has
        cleared every gate and is waiting only on its lister to publish.
      </p>
    </>
  );
}
