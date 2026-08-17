import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import {
  api,
  ApiError,
  type FieldReport,
  type IntroductionRecord,
  type Viewing,
} from '@/lib/api';
import { ApiAlert, StatusPill, when } from '../../../ui';
import { FieldReportForm } from './field-report-form';
import { MediaCapture } from './media-capture';
import { CloseVisit } from './close-visit';
import { OpenDeal } from './open-deal';

interface ViewingDetail {
  viewing: Viewing;
  fieldReport: FieldReport | null;
  introduction: IntroductionRecord | null;
  canConduct: boolean;
  whatIsMissing: string[];
}

/**
 * One field visit, and the step it is actually on.
 *
 * The order of the page IS the invariant (Data_Model.md §5.1): report first,
 * then close. `canConduct` comes from the server rather than being computed
 * here, so the console never holds an opinion about the rule that could
 * drift from the one the backend and the database enforce.
 */
export default async function ViewingPage(props: {
  params: Promise<{ viewingId: string }>;
}) {
  const { viewingId } = await props.params;

  let detail: ViewingDetail;
  try {
    detail = await api<ViewingDetail>(`/v1/viewings/${viewingId}`);
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.status === 401) redirect('/login');
      if (err.status === 404) notFound();
      if (err.status === 403) {
        return (
          <>
            <h1>Not your visit</h1>
            <ApiAlert message={err.message} code={err.code} />
            <p>
              <Link href="/" className="btn btn-secondary">
                Back to your visits
              </Link>
            </p>
          </>
        );
      }
    }
    throw err;
  }

  const { viewing, fieldReport, introduction, canConduct } = detail;
  const closed = viewing.status !== 'scheduled';

  return (
    <>
      <p className="muted backlink">
        <Link href="/">← Your visits</Link>
      </p>

      <div className="card-head">
        <h1>{when(viewing.scheduledFor)}</h1>
        <StatusPill status={viewing.status} />
      </div>
      <p className="lede">
        Listing {viewing.listingId.slice(0, 8)} · tenant{' '}
        {viewing.tenantPartyId.slice(0, 8)}
      </p>

      {viewing.status === 'no_show' && (
        <p className="alert alert-note">
          Recorded as a no-show. No-shows are tracked rather than deleted, so
          the pattern stays visible.
        </p>
      )}

      {/* ── Step 1: the structured report (FR-5.4) ── */}
      <h2>Field report</h2>
      {fieldReport ? (
        <div className="card">
          <dl className="dl">
            <dt>Condition</dt>
            <dd>{fieldReport.conditionRating}</dd>
            <dt>Matches listing</dt>
            <dd>{fieldReport.matchesListing ? 'Yes' : 'No'}</dd>
            <dt>Available</dt>
            <dd>{fieldReport.isAvailable ? 'Yes' : 'No'}</dd>
            {fieldReport.issuesText && (
              <>
                <dt>Issues</dt>
                <dd>{fieldReport.issuesText}</dd>
              </>
            )}
            {fieldReport.timingNote && (
              <>
                <dt>Timing</dt>
                <dd>{fieldReport.timingNote}</dd>
              </>
            )}
            <dt>Media</dt>
            <dd>
              {fieldReport.mediaAssetIds.length
                ? `${fieldReport.mediaAssetIds.length} attached`
                : 'none'}
            </dd>
            <dt>Filed</dt>
            <dd>{when(fieldReport.reportedAt)}</dd>
          </dl>
        </div>
      ) : closed ? (
        <p className="alert alert-note">
          This visit closed without a report on file.
        </p>
      ) : (
        <FieldReportForm viewingId={viewing.id} mediaAssetIds={[]} />
      )}

      {/* ── Media capture (FR-5.5) ── */}
      {!closed && !fieldReport && (
        <>
          <h2>Photos &amp; video</h2>
          <MediaCapture viewingId={viewing.id} />
        </>
      )}

      {/* ── Step 2: close the visit (FR-5.3) ── */}
      <h2>Close the visit</h2>
      {introduction ? (
        <div className="card">
          <p>
            <span className="pill pill-ok">introduction recorded</span>
          </p>
          <dl className="dl">
            <dt>Introduced at</dt>
            <dd>{when(introduction.introducedAt)}</dd>
            <dt>Tenant</dt>
            <dd className="mono">{introduction.tenantPartyId}</dd>
            <dt>Landlord</dt>
            <dd className="mono">{introduction.landlordPartyId}</dd>
            <dt>Officer</dt>
            <dd className="mono">{introduction.fooPartyId}</dd>
          </dl>
          <p className="muted">
            This record is immutable and persists independently of any deal.
          </p>
        </div>
      ) : closed ? (
        <p className="alert alert-note">
          This visit is closed as <strong>{viewing.status}</strong>. No
          introduction record was created.
        </p>
      ) : (
        <CloseVisit viewingId={viewing.id} canConduct={canConduct} />
      )}

      {/* ── Step 3: the deal (FR-8.3) ──
          Only reachable once the introduction exists, which is the whole
          point: a deal cannot precede the meeting that evidences it. */}
      {introduction && (
        <>
          <h2>Open the deal</h2>
          <OpenDeal introductionRecordId={introduction.id} />
        </>
      )}
    </>
  );
}
