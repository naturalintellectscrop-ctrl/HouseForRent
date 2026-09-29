import { redirect } from 'next/navigation';
import { api, ApiError, type DirectoryRow } from '@/lib/api';
import { AdminOnly, onDay } from '@/app/ui';

/**
 * The account directory (admin).
 *
 * ── What this page is, and is not ──
 * It answers the operational questions: who has an account, is it active,
 * have they completed identity verification, what are they doing on the
 * platform. It does NOT join identity documents, ledger balances or the
 * audit firehose — those remain subject-scoped reads on purpose (see the
 * audit page). Role, status and verification state come from the server;
 * nothing on this page is computed client-side.
 */
export default async function UsersPage(props: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await props.searchParams;

  let rows: DirectoryRow[];
  try {
    const path = q ? `/v1/admin/users?q=${encodeURIComponent(q)}` : '/v1/admin/users';
    rows = await api<DirectoryRow[]>(path);
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.status === 401) redirect('/login');
      if (err.status === 403) return <AdminOnly what="The account directory" />;
    }
    throw err;
  }

  const ROLE_LABEL: Record<string, string> = {
    tenant: 'Tenant',
    lister: 'Landlord',
    foo: 'Field officer',
    admin: 'Operations',
  };

  return (
    <>
      <h1>Users</h1>
      <p className="lede">
        Every account on the platform, its standing, and how it is used.
        Documents and money stay in their own subject-scoped records — this
        is account administration, not surveillance.
      </p>

      <form method="get" className="card" style={{ marginBottom: '1.25rem' }}>
        <div className="field">
          <label htmlFor="q">Search by name or phone</label>
          <input
            id="q"
            name="q"
            type="search"
            defaultValue={q ?? ''}
            placeholder="e.g. Grace or 700100010"
          />
        </div>
        <p style={{ marginTop: '0.75rem' }}>
          <button type="submit" className="btn btn-primary btn-sm">
            Search
          </button>
          {q ? (
            <a href="/ops/users" className="btn btn-ghost btn-sm">
              Clear
            </a>
          ) : null}
        </p>
      </form>

      {rows.length === 0 ? (
        <p className="notice notice-info" role="status">
          No account matches “{q}”.
        </p>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Phone</th>
                <th scope="col">Role</th>
                <th scope="col">Status</th>
                <th scope="col">Identity</th>
                <th scope="col" className="num">
                  Properties
                </th>
                <th scope="col" className="num">
                  Lettings
                </th>
                <th scope="col">Joined</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.partyId}>
                  <td>{r.displayName}</td>
                  <td className="mono">{r.primaryPhone}</td>
                  <td>{ROLE_LABEL[r.role] ?? r.role}</td>
                  <td>
                    {r.accountStatus === 'active' ? (
                      'active'
                    ) : (
                      <span className="badge badge-warn">{r.accountStatus.replace(/_/g, ' ')}</span>
                    )}
                  </td>
                  <td>
                    {r.identityVerified ? (
                      <span className="badge badge-ok">verified</span>
                    ) : (
                      <span className="badge">not verified</span>
                    )}
                  </td>
                  <td className="num">{r.listingCount}</td>
                  <td className="num">{r.dealCount}</td>
                  <td>{onDay(r.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
