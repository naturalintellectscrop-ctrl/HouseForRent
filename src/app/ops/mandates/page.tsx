import Link from 'next/link';
import { redirect } from 'next/navigation';
import { api, ApiError, type MandateRow } from '@/lib/api';
import { AdminOnly, Empty, when } from '@/app/ui';
import { MandateActions } from './mandate-actions';

export const metadata = { title: 'Mandates' };

const STATE_TABS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'pending', label: 'Pending' },
  { value: 'verified', label: 'Verified' },
  { value: 'rejected', label: 'Rejected' },
];

/**
 * The mandate queue (SSOT Decision 8 / FR-3.2 — the decision half of
 * F-003).
 *
 * ── What this page is deciding ──
 * A lister whose tier is not `property_owner` markets a home they do not
 * own. Before such a listing may publish, the platform must hold the
 * OWNER's written authority for that specific property — the mandate.
 * Operations verifies that authority: does the named owner match the
 * property's registered owner, does the document say what it claims.
 *
 * Verifying is consequential: it is the step that unblocks publication of
 * somebody else's property, so the action sits behind a confirm step with
 * the consequence written out. The decision note goes to the audit trail,
 * never to the row — one copy of the reasoning, where the audit lives.
 */
export default async function MandatesPage(props: {
  searchParams: Promise<{ state?: string }>;
}) {
  const { state: rawState } = await props.searchParams;
  const state = rawState ?? 'pending';

  let rows: MandateRow[];
  try {
    rows = await api<MandateRow[]>(
      `/v1/admin/mandates?state=${encodeURIComponent(state)}`,
    );
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.status === 401) redirect('/login');
      if (err.status === 403) return <AdminOnly what="Mandate decisions" />;
      if (err.status === 400) {
        return (
          <>
            <h1>Mandates</h1>
            <p className="alert alert-error" role="alert">
              That is not a mandate state.{' '}
              <Link href="/ops/mandates">Show pending mandates</Link>.
            </p>
          </>
        );
      }
    }
    throw err;
  }

  return (
    <>
      <h1>Mandates</h1>
      <p className="lede">
        A lister who is not the property&rsquo;s owner may only market it with
        the owner&rsquo;s written authority on file. {rows.length}{' '}
        {state === 'pending' ? 'waiting for a decision' : state}.
      </p>

      <nav className="row" aria-label="Mandate state" style={{ gap: '0.5rem', marginBottom: '1.25rem' }}>
        {STATE_TABS.map((tab) => (
          <Link
            key={tab.value}
            href={`/ops/mandates?state=${tab.value}`}
            aria-current={state === tab.value ? 'page' : undefined}
            className="btn btn-sm"
            style={
              state === tab.value
                ? undefined
                : { background: 'transparent', color: 'var(--ink-soft)', border: '1px solid var(--line)' }
            }
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <Empty
          title={state === 'pending' ? 'Nothing waiting on a mandate decision.' : `No ${state} mandates.`}
          action={
            <Link href="/ops/queue" className="btn btn-secondary">
              Check the verification queue
            </Link>
          }
        >
          {state === 'pending'
            ? 'Every mandate that has been submitted has been decided. A non-owner listing still blocked on "mandate" in the verification queue means its mandate has not been submitted yet — the landlord submits it from their listing page.'
            : 'Mandates re-enter this queue only when a lister submits one.'}
        </Empty>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Submitted</th>
                <th>Lister</th>
                <th>Property</th>
                <th>Registered owner</th>
                <th>Authority note from the lister</th>
                <th>
                  {state === 'pending' ? 'Decision' : 'Outcome'}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{when(m.createdAt)}</td>
                  <td>
                    {m.listerPartyId ? (
                      <>
                        <Link
                          href={`/ops/users/${m.listerPartyId}`}
                          style={{ fontWeight: 600 }}
                        >
                          {m.listerName ?? '—'}
                        </Link>
                        {m.listerTier ? (
                          <span className="faint" style={{ display: 'block', fontSize: '0.8125rem' }}>
                            {m.listerTier.replace(/_/g, ' ')}
                          </span>
                        ) : null}
                      </>
                    ) : (
                      m.listerName ?? '—'
                    )}
                  </td>
                  <td>
                    {m.property.landmarkText}
                    <span className="faint" style={{ display: 'block', fontSize: '0.8125rem' }}>
                      {m.property.neighbourhoodName}
                    </span>
                  </td>
                  <td>
                    {m.property.ownerId ? (
                      <Link href={`/ops/users/${m.property.ownerId}`}>{m.property.ownerName ?? '—'}</Link>
                    ) : (
                      (m.property.ownerName ?? '—')
                    )}
                  </td>
                  <td style={{ maxWidth: '18rem' }}>
                    {m.note ?? (
                      <span className="faint">none given</span>
                    )}
                  </td>
                  <td>
                    {m.state === 'pending' ? (
                      <MandateActions mandateId={m.id} ownerName={m.property.ownerName} />
                    ) : (
                      <span className="stack-sm" style={{ fontSize: '0.875rem' }}>
                        <span>{m.state}</span>
                        {m.decidedAt ? (
                          <span className="faint">{when(m.decidedAt)}</span>
                        ) : null}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
