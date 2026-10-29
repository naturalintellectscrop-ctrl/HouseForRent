import Link from 'next/link';
import { loadPlatformData } from '../data';
import { onDayShort } from '@/app/ui';

export const metadata = {
  title: 'Landlord verification queue',
  robots: { index: false, follow: false },
};

/**
 * The landlord-onboarding verification queue — every application with its
 * three independent section states and reviewer-facing flags. The queue
 * shows; the review screen (one application) decides.
 */

interface QueueRow {
  id: string;
  submittedAt: string;
  updatedAt: string;
  applicant: { id: string; displayName: string; primaryPhone: string; status: string; createdAt: string };
  legalName: string;
  idDocumentType: string;
  relationship: string;
  identityState: string;
  authorityState: string;
  payoutState: string;
  flags: string[];
}

interface QueueData {
  total: number;
  rows: QueueRow[];
}

const STATE_BADGE: Record<string, string> = {
  pending: 'plat-pill plat-pill-warn',
  more_info: 'plat-pill plat-pill-warn',
  approved: 'plat-pill plat-pill-ok',
  rejected: 'plat-pill plat-pill-danger',
};

function Pill({ state }: { state: string }) {
  const labels: Record<string, string> = {
    pending: 'awaiting review',
    more_info: 'info requested',
    approved: 'approved',
    rejected: 'rejected',
  };
  return <span className={STATE_BADGE[state] ?? 'plat-pill'}>{labels[state] ?? state}</span>;
}

export default async function KycQueuePage() {
  const result = await loadPlatformData(async () => {
    const { adminKycQueue } = await import('@/server/kyc');
    return adminKycQueue();
  });

  if (!result.ok) {
    return (
      <div className="stack-lg">
        <h1 className="h1">Landlord verification</h1>
        <div className="plat-degraded card">
          <h2 className="h2">Queue unavailable</h2>
          <p className="muted">
            The platform database could not be reached, so the verification
            queue is not available right now. Nothing was lost — this is the
            by-design degraded state.
          </p>
        </div>
      </div>
    );
  }

  const rows: QueueRow[] = result.data.map(({ row, flags }) => ({
    id: row.id,
    submittedAt: row.submittedAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    applicant: {
      id: row.party.id,
      displayName: row.party.displayName,
      primaryPhone: row.party.primaryPhone,
      status: row.party.status,
      createdAt: row.party.createdAt.toISOString(),
    },
    legalName: row.legalName,
    idDocumentType: row.idDocumentType,
    relationship: row.relationship,
    identityState: row.identityState,
    authorityState: row.authorityState,
    payoutState: row.payoutState,
    flags,
  }));
  const data: QueueData = { total: rows.length, rows };

  const open = data.rows.filter(
    (r) => ['pending', 'more_info'].includes(r.identityState) || ['pending', 'more_info'].includes(r.authorityState),
  );

  return (
    <div className="stack-lg">
      <header className="stack-sm">
        <h1 className="h1">Landlord verification</h1>
        <p className="muted">
          Applications from landlords: identity documents, declared
          relationship with the property, and payout details. Three reviews
          per application, decided independently — approving one never
          approves the others, and nothing here verifies a property or
          publishes a listing.
        </p>
      </header>

      <div className="plat-stats">
        <div className="plat-stat">
          <span className="plat-stat-label">Open applications</span>
          <span className="plat-stat-value">{open.length}</span>
        </div>
        <div className="plat-stat">
          <span className="plat-stat-label">All applications</span>
          <span className="plat-stat-value">{data.total}</span>
        </div>
        <div className="plat-stat">
          <span className="plat-stat-label">Non-standard documents</span>
          <span className="plat-stat-value">
            {data.rows.filter((r) => r.idDocumentType === 'other_document').length}
          </span>
        </div>
      </div>

      {data.rows.length === 0 ? (
        <div className="card plat-section">
          <h2 className="h2">No applications yet</h2>
          <p className="muted">
            When a landlord submits the onboarding verification, it appears
            here for review. No applications is the honest empty state —
            there is nothing to pretend otherwise about.
          </p>
        </div>
      ) : (
        <div className="plat-table-wrap">
          <table className="plat-table">
            <thead>
              <tr>
                <th>Applicant</th>
                <th>Submitted</th>
                <th>Identity</th>
                <th>Authority</th>
                <th>Payout</th>
                <th>Flags</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link href={`/platform/kyc/${r.id}`}>
                      <strong>{r.applicant.displayName}</strong>
                    </Link>
                    <div className="muted" style={{ fontSize: '0.8125rem' }}>
                      {r.applicant.primaryPhone} · as {r.relationship.replace(/_/g, ' ')}
                    </div>
                  </td>
                  <td className="muted">{onDayShort(r.submittedAt)}</td>
                  <td><Pill state={r.identityState} /></td>
                  <td><Pill state={r.authorityState} /></td>
                  <td><Pill state={r.payoutState} /></td>
                  <td>
                    {r.flags.length === 0 ? (
                      <span className="muted" style={{ fontSize: '0.8125rem' }}>—</span>
                    ) : (
                      <ul className="plat-flag-list">
                        {r.flags.map((f) => (
                          <li key={f}>{f}</li>
                        ))}
                      </ul>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
