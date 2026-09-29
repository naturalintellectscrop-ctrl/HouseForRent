import { redirect } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError, type DirectoryRow } from '@/lib/api';
import { AdminOnly, onDayShort } from '@/app/ui';
import { TierControl } from './tier-control';

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
 *
 * ── The role filter (Task 15) ──
 * A row of chips that compose with the search box: both live in the URL
 * (`?q=` and `?role=`), so a filtered view is shareable like every other
 * filter in the product. The chips are the only writer of `role` — but a
 * hand-typed `?role=` value is still handled honestly: the server refuses
 * unknown values (422), so this page validates FIRST and says so, rather
 * than rendering an error boundary or silently ignoring the filter.
 */

/** The fixed filter vocabulary — mirrors AUTH_ROLES on the server. */
const ROLE_FILTERS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'tenant', label: 'Tenants' },
  { value: 'lister', label: 'Landlords' },
  { value: 'foo', label: 'Field officers' },
  { value: 'admin', label: 'Operations' },
];

const ROLE_LABEL: Record<string, string> = {
  tenant: 'Tenant',
  lister: 'Landlord',
  foo: 'Field officer',
  admin: 'Operations',
};

/** Plural, human phrasing for empty states ("no landlord accounts yet"). */
const ROLE_PLURAL: Record<string, string> = {
  tenant: 'tenant',
  lister: 'landlord',
  foo: 'field officer',
  admin: 'operations',
};

export default async function UsersPage(props: {
  searchParams: Promise<{ q?: string; role?: string }>;
}) {
  const { q, role: rawRole } = await props.searchParams;
  const role = rawRole?.trim();
  const roleKnown = !role || ROLE_FILTERS.some((f) => f.value === role);

  let rows: DirectoryRow[];
  try {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (roleKnown && role) params.set('role', role);
    const qs = params.toString();
    rows = await api<DirectoryRow[]>(`/v1/admin/users${qs ? `?${qs}` : ''}`);
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.status === 401) redirect('/login');
      if (err.status === 403) return <AdminOnly what="The account directory" />;
    }
    throw err;
  }

  /** Chip href: switches role while preserving the current search term. */
  const chipHref = (value?: string) => {
    const p = new URLSearchParams();
    if (q) p.set('q', q);
    if (value) p.set('role', value);
    const s = p.toString();
    return `/ops/users${s ? `?${s}` : ''}`;
  };
  const activeRole = roleKnown ? (role ?? undefined) : undefined;

  return (
    <>
      <h1>Users</h1>
      <p className="lede">
        Every account on the platform, its standing, and how it is used.
        Documents and money stay in their own subject-scoped records — this
        is account administration, not surveillance.
      </p>

      {!roleKnown && (
        <p className="alert alert-note" role="status">
          “{role}” is not an account role, so the filter is off — showing
          every account.
        </p>
      )}

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
        {activeRole && <input type="hidden" name="role" value={activeRole} />}
        <p style={{ marginTop: '0.75rem' }}>
          <button type="submit" className="btn btn-primary btn-sm">
            Search
          </button>
          {q || activeRole ? (
            <a href="/ops/users" className="btn btn-ghost btn-sm">
              Clear
            </a>
          ) : null}
        </p>
      </form>

      <nav
        className="row"
        aria-label="Filter by role"
        style={{ gap: '0.5rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}
      >
        <Link
          href={chipHref()}
          aria-current={activeRole ? undefined : 'page'}
          className="btn btn-sm"
          style={
            activeRole
              ? { background: 'transparent', color: 'var(--ink-soft)', border: '1px solid var(--line)' }
              : undefined
          }
        >
          All roles
        </Link>
        {ROLE_FILTERS.map((f) => (
          <Link
            key={f.value}
            href={chipHref(f.value)}
            aria-current={activeRole === f.value ? 'page' : undefined}
            className="btn btn-sm"
            style={
              activeRole === f.value
                ? undefined
                : { background: 'transparent', color: 'var(--ink-soft)', border: '1px solid var(--line)' }
            }
          >
            {f.label}
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <p className="notice notice-info" role="status">
          {q
            ? `No account matches “${q}”${activeRole ? ` among ${ROLE_PLURAL[activeRole] ?? activeRole} accounts` : ''}.`
            : activeRole
              ? `No ${ROLE_PLURAL[activeRole] ?? activeRole} accounts yet.`
              : 'No accounts yet.'}
        </p>
      ) : (
        <div className="table-scroll">
          {/**
            * table-compact: the directory carries 9 columns; at the default
            * size they forced a horizontal scroll even on a full desktop.
            * The detail page (name link) now carries the depth, so the row
            * can afford to be tighter.
            */}
          <table className="table-compact">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Phone</th>
                <th scope="col">Role</th>
                <th scope="col">Lists as</th>
                <th scope="col">Standing</th>
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
                  <td>
                    <Link href={`/ops/users/${r.partyId}`} style={{ fontWeight: 600 }}>
                      {r.displayName}
                    </Link>
                  </td>
                  <td className="mono">
                    <Link href={`/ops/users/${r.partyId}`}>{r.primaryPhone}</Link>
                  </td>
                  <td>{ROLE_LABEL[r.role] ?? r.role}</td>
                  <td>
                    {r.role === 'lister' ? (
                      <TierControl partyId={r.partyId} currentTier={r.listerTier} />
                    ) : (
                      <span className="faint">—</span>
                    )}
                  </td>
                  <td>
                    {/** Account standing and identity in one column: the two
                        badges are read together ("pending verification AND
                        unverified" is a different account from "active but
                        unverified"), and splitting them across two columns
                        was what pushed the table past a desktop's width. */}
                    <span className="stack-sm" style={{ display: 'inline-flex', gap: '0.25rem' }}>
                      {r.accountStatus === 'active' ? (
                        <span className="badge badge-ok">active</span>
                      ) : (
                        <span className="badge badge-warn">{r.accountStatus.replace(/_/g, ' ')}</span>
                      )}
                      {r.identityVerified ? (
                        <span className="badge badge-ok">identity verified</span>
                      ) : (
                        <span className="badge">identity unverified</span>
                      )}
                    </span>
                  </td>
                  <td className="num">{r.listingCount}</td>
                  <td className="num">{r.dealCount}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{onDayShort(r.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="faint" style={{ fontSize: '0.8125rem', marginTop: '0.75rem' }}>
        Open an account for its full standing, holdings and trail.
      </p>
    </>
  );
}
