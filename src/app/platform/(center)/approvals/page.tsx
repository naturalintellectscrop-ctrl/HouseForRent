import Link from 'next/link';
import {
  ApplicationQueueRow,
  pendingApplicationQueue,
} from '@/server/ops';
import { DegradedPanel, PlatPageHead, SectionCard, humanize, loadPlatformData } from '../data';

export const metadata = {
  title: 'Account applications',
  robots: { index: false, follow: false },
};

/**
 * The approval queue - the platform's pending work, as accounts.
 *
 * A landlord registration IS the application: the account exists, can
 * sign in under the pending policy, and waits on one decision - the
 * platform's recorded activation, ideally evidenced by a passing
 * identity check. Tenants are NOT here: they register active, because
 * their account only ever speaks for the tenant themself - the landlord
 * approves each tenancy application and identity checks happen at deal
 * time. A pending tenant on this page is a legacy account created
 * before self-activation, kept visible so it gets decided exactly once.
 *
 * This page makes that wait VISIBLE and ROUTED instead of discoverable only by
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
      <PlatPageHead
        eyebrow="Account workqueue"
        title="Account applications"
        lede="Landlord accounts waiting on activation. Approval is the platform's recorded decision to activate - evidenced ideally by a passing identity check. It verifies the PERSON; it does not verify any property, approve any listing, or grant staff privileges. Tenant accounts no longer wait here: they activate at registration, because a tenant account only ever speaks for the tenant themself."
      />

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
            // Tenants register active since self-activation; a pending
            // tenant here is a legacy account created before it. Keep the
            // section so each legacy account still gets decided once.
            { title: 'Tenant accounts (before self-activation)', group: tenants },
          ]
            .filter((section) => section.group.length > 0)
            .map((section) => (
              <SectionCard key={section.title} title={section.title} count={section.group.length}>
                <div className="plat-table-wrap">
                  <table className="plat-table">
                    <thead>
                      <tr>
                        <th scope="col">Applicant</th>
                        <th scope="col">Phone</th>
                        <th scope="col">Tier</th>
                        <th scope="col">Identity</th>
                        <th scope="col" className="is-num">Waiting</th>
                        <th scope="col">
                          <span className="sr-only">Actions</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {section.group.map((row) => (
                        <tr key={row.partyId}>
                          <td>
                            <span className="plat-table-main">
                              <span className="plat-name">{row.displayName}</span>
                              <span className="plat-sub">
                                {row.lastLoginAt ? 'signed in before' : 'never signed in'}
                              </span>
                            </span>
                          </td>
                          <td className="plat-table-muted">{row.primaryPhone}</td>
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
                          <td className="is-num" title={row.waitingSince.toISOString()}>{waitingFor(row)}</td>
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
              </SectionCard>
            ))}

          <p className="muted plat-feed-note">
            Approval activates the account immediately - by your recorded
            decision, or by a passing identity check - and is written on its
            trail with the acting reviewer. A rejection records the decision,
            its reason and the reviewer - the account is then refused at
            sign-in by the existing status policy. Why tenants no longer
            wait: their account gates nothing but their own tenancy - the
            landlord still approves every application, and identity checks
            happen at deal time, when there is a lease to protect.
          </p>
        </>
      )}
    </div>
  );
}
