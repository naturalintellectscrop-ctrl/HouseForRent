import Link from 'next/link';
import { db } from '@/lib/db';
import { DegradedPanel, PlatPageHead, SectionCard, loadPlatformData, humanize } from '../data';

/**
 * Every account on the platform, most recent first, with its party status
 * and last sign-in. This is the owner's view of WHO exists - it deliberately
 * shows what the ops console shows staff, because the owner oversees the
 * platform without becoming a participant in it.
 */
export default async function PlatformUsersPage() {
  const result = await loadPlatformData(async () => {
    const [roleCounts, statusCounts, accounts] = await Promise.all([
      db.userAccount.groupBy({ by: ['authRole'], _count: { _all: true } }),
      db.party.groupBy({ by: ['status'], _count: { _all: true } }),
      db.userAccount.findMany({
        take: 15,
        orderBy: { createdAt: 'desc' },
        include: {
          party: { select: { displayName: true, primaryPhone: true, email: true, status: true } },
        },
      }),
    ]);
    return { roleCounts, statusCounts, accounts };
  });

  if (!result.ok) {
    return <DegradedPanel title="User directory unavailable" />;
  }
  const { roleCounts, statusCounts, accounts } = result.data;

  return (
    <div className="stack-lg">
      <PlatPageHead
        eyebrow="Directory"
        title="Users"
        lede="Accounts across the whole platform - tenants, landlords, field officers and platform staff - most recent first."
      />

      <div className="plat-grid-2">
        <SectionCard title="By platform role" eyebrow="Who exists">
          <ul className="plat-kv">
            {roleCounts.map((r) => (
              <li key={r.authRole}>
                <span>{humanize(r.authRole)}</span>
                <strong>{r._count._all.toLocaleString('en-UG')}</strong>
              </li>
            ))}
          </ul>
        </SectionCard>

        <SectionCard title="By account status" eyebrow="Standing">
          <ul className="plat-kv">
            {statusCounts.map((s) => (
              <li key={s.status}>
                <span>{humanize(s.status)}</span>
                <strong>{s._count._all.toLocaleString('en-UG')}</strong>
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>

      <SectionCard title="Most recent accounts" href="/ops/users" count={accounts.length}>
        <div className="plat-table-wrap">
          <table className="plat-table">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Email</th>
                <th scope="col">Role</th>
                <th scope="col">Status</th>
                <th scope="col" className="is-num">Last sign-in</th>
              </tr>
            </thead>
            <tbody>
              {accounts.length === 0 ? (
                <tr>
                  <td colSpan={5} className="muted">
                    No accounts yet.
                  </td>
                </tr>
              ) : null}
              {accounts.map((a) => (
                <tr key={a.id}>
                  <td>
                    <span className="plat-table-main">
                      <span className="plat-name">{a.party.displayName}</span>
                      <span className="plat-sub">{a.party.primaryPhone}</span>
                    </span>
                  </td>
                  <td className="plat-table-muted">{a.party.email ?? '—'}</td>
                  <td>{humanize(a.authRole)}</td>
                  <td>
                    {a.party.status === 'pending_verification' ? (
                      <Link href={`/platform/approvals/${a.partyId}`} className="plat-action">
                        {humanize(a.party.status)} →
                      </Link>
                    ) : a.party.status === 'active' ? (
                      <span className="plat-pill plat-pill-ok">active</span>
                    ) : (
                      <span className="plat-pill">{humanize(a.party.status)}</span>
                    )}
                  </td>
                  <td className="is-num plat-table-muted">
                    {a.lastLoginAt
                      ? a.lastLoginAt.toISOString().replace('T', ' ').slice(0, 16) + ' UTC'
                      : 'never'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted plat-feed-note">
          Showing the 15 most recent. Deep account operations (verification,
          suspension, staff provisioning) live in the{' '}
          <a href="/ops/users">staff console</a>.
        </p>
      </SectionCard>
    </div>
  );
}
