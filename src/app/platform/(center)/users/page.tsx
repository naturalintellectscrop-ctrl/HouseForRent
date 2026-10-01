import { db } from '@/lib/db';
import { DegradedPanel, SectionCard, loadPlatformData, humanize } from '../data';

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
      <header className="stack-sm">
        <h1 className="h1">Users</h1>
        <p className="muted">
          Accounts across the whole platform - tenants, landlords, field
          officers and platform staff - most recent first.
        </p>
      </header>

      <div className="plat-grid-2">
        <SectionCard title="By platform role">
          <ul className="plat-kv">
            {roleCounts.map((r) => (
              <li key={r.authRole}>
                <span>{humanize(r.authRole)}</span>
                <strong>{r._count._all}</strong>
              </li>
            ))}
          </ul>
        </SectionCard>

        <SectionCard title="By account status">
          <ul className="plat-kv">
            {statusCounts.map((s) => (
              <li key={s.status}>
                <span>{humanize(s.status)}</span>
                <strong>{s._count._all}</strong>
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>

      <SectionCard title="Most recent accounts" href="/ops/users">
        <div className="plat-table-wrap">
          <table className="plat-table">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Phone</th>
                <th scope="col">Email</th>
                <th scope="col">Role</th>
                <th scope="col">Status</th>
                <th scope="col">Last sign-in</th>
              </tr>
            </thead>
            <tbody>
              {accounts.length === 0 ? (
                <tr>
                  <td colSpan={6} className="muted">
                    No accounts yet.
                  </td>
                </tr>
              ) : null}
              {accounts.map((a) => (
                <tr key={a.id}>
                  <td>{a.party.displayName}</td>
                  <td>{a.party.primaryPhone}</td>
                  <td>{a.party.email ?? '—'}</td>
                  <td>{humanize(a.authRole)}</td>
                  <td>{humanize(a.party.status)}</td>
                  <td>
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
