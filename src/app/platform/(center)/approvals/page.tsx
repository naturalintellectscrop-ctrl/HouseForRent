import Link from 'next/link';
import {
  ApplicationQueueRow,
  pendingApplicationQueue,
} from '@/server/ops';
import { DegradedPanel, humanize, loadPlatformData } from '../data';

export const metadata = {
  title: 'Account applications',
  robots: { index: false, follow: false },
};

/**
 * The approval queue - the platform's pending work, as accounts.
 *
 * Every self-service registration IS the application: the account exists,
 * can sign in under the pending policy, and waits on exactly one server
 * event - an identity check that passes - to become active. This page
 * makes that wait VISIBLE and ROUTED instead of discoverable only by
 * people who already know where the ops console keeps its directory.
 *
 * Ordering is operational: landlords first (their application gates a
 * business relationship), oldest waiting first inside each group. The
 * identity column shows what has already been TRIED, so a reviewer can
 * see an application that has failed checks before without opening it.
 */
function waitingFor(row: ApplicationQueueRow): string {
  const days = Math.floor((Date.now() - row.waitingSince.getTime()) / 86_400_000);
  if (days >= 30) return `${Math.floor(days / 30)} mo`;
  if (days >= 1) return `${days} d`;
  const hours = Math.floor((Date.now() - row.waitingSince.getTime()) / 3_600_000);
  if (hours >= 1) return `${hours} h`;
  return 'just now';
}

export default async function PlatformApprovalsPage() {
  const result = await loadPlatformData(() => pendingApplicationQueue());

  if (!result.ok) {
    return <DegradedPanel title="Account applications unavailable" />;
  }
  const rows = result.data;

  const landlords = rows.filter((r) => r.role === 'lister');
  const tenants = rows.filter((r) => r.role === 'tenant');

  return (
    <div className="stack-lg">
      <header className="stack-sm">
        <h1 className="h1">Account applications</h1>
        <p className="muted">
          Accounts waiting on activation. Approval means an identity check
          that passes - the one server path that flips an account active.
          It verifies the PERSON; it does not verify any property, approve
          any listing, or grant staff privileges.
        </p>
      </header>

      {rows.length === 0 ? (
        <div className="plat-empty">
          <h2 className="h2">No applications waiting</h2>
          <p className="muted">
            Every account on the platform has been decided: activation
            happens the moment an identity check passes, and this queue
            lists nothing until someone new registers.
          </p>
        </div>
      ) : (
        <>
          {[
            { title: 'Landlord applications', group: landlords },
            { title: 'Tenant applications', group: tenants },
          ]
            .filter((section) => section.group.length > 0)
            .map((section) => (
              <section key={section.title} className="card plat-section">
                <div className="plat-section-head">
                  <h2 className="h2">{section.title}</h2>
                  <span className="plat-count">{section.group.length}</span>
                </div>
                <div className="plat-table-wrap">
                  <table className="plat-table">
                    <thead>
                      <tr>
                        <th scope="col">Applicant</th>
                        <th scope="col">Phone</th>
                        <th scope="col">Tier</th>
                        <th scope="col">Identity</th>
                        <th scope="col">Waiting</th>
                        <th scope="col">
                          <span className="sr-only">Actions</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {section.group.map((row) => (
                        <tr key={row.partyId}>
                          <td>
                            <span className="plat-name">{row.displayName}</span>
                            {row.lastLoginAt ? (
                              <span className="plat-sub">signed in before</span>
                            ) : (
                              <span className="plat-sub">never signed in</span>
                            )}
                          </td>
                          <td>{row.primaryPhone}</td>
                          <td>{row.listerTier ? humanize(row.listerTier) : '—'}</td>
                          <td>
                            {row.identityState === null ? (
                              <span className="plat-pill plat-pill-idle">no attempt</span>
                            ) : row.identityState === 'verified' ? (
                              <span className="plat-pill plat-pill-ok">verified</span>
                            ) : (
                              <span className="plat-pill plat-pill-warn">
                                {row.identityAttempts} failed attempt
                                {row.identityAttempts === 1 ? '' : 's'}
                              </span>
                            )}
                          </td>
                          <td title={row.waitingSince.toISOString()}>{waitingFor(row)}</td>
                          <td>
                            <Link className="plat-action" href={`/platform/approvals/${row.partyId}`}>
                              Review →
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ))}

          <p className="muted plat-feed-note">
            An approved identity check activates the account immediately and
            is recorded on its trail with the acting reviewer. A rejection
            records the decision, its reason and the reviewer - the account
            is then refused at sign-in by the existing status policy.
          </p>
        </>
      )}
    </div>
  );
}
