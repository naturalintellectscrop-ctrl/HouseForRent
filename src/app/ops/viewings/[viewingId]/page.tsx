import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import {
  api,
  ApiError,
  type ViewingDetail,
} from '@/lib/api';
import { ApiAlert, FURNISHED_LABEL, shillings, StatusPill, TYPE_LABEL, when } from '@/app/ui';
import { currentRole } from '@/lib/session';
import { FieldReportForm } from './field-report-form';
import { MediaCapture } from './media-capture';
import { CloseVisit } from './close-visit';
import { OpenDeal } from './open-deal';
import { OpsCancelViewing } from './ops-cancel-viewing';

/**
 * One field visit, and the step it is actually on.
 *
 * The order of the page IS the invariant (Data_Model.md §5.1): report first,
 * then close. `canConduct` comes from the server rather than being computed
 * here, so the console never holds an opinion about the rule that could
 * drift from the one the backend and the database enforce.
 *
 * SANDBOX ADAPTATION: the in-process adapter does not expose the tenant's
 * party id on staff surfaces (minimal disclosure), so the tenant is named
 * where the row carries a name and falls back to the short id otherwise.
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
              <Link href="/ops/today" className="btn btn-secondary">
                Back to your visits
              </Link>
            </p>
          </>
        );
      }
    }
    throw err;
  }

  const { viewing, listing, fieldReport, introduction, canConduct } = detail;
  // A REQUESTED viewing is not a closed one — it has simply not been
  // scheduled yet. Treating "not scheduled" as "closed" made the page tell
  // an operator that a waiting request had "closed without a report", which
  // is a lie about the state of the world.
  const closed = ['conducted', 'no_show', 'cancelled'].includes(viewing.status);
  const scheduled = viewing.status === 'scheduled';
  const role = await currentRole();

  return (
    <>
      <p className="muted backlink">
        <Link href="/ops/today">← Your visits</Link>
      </p>

      <div className="card-head">
        <h1>{when(viewing.scheduledFor)}</h1>
        <StatusPill status={viewing.status} />
      </div>
      <p className="lede">
        {viewing.bedrooms}-bed{' '}
        {(TYPE_LABEL[listing.propertyType] ?? listing.propertyType).toLowerCase()} in{' '}
        {viewing.neighbourhood} · tenant{' '}
        {viewing.tenantName ?? viewing.tenantPartyId.slice(0, 8)}
      </p>

      {/* ── Where the visit happens (Task 15) ──
          An officer standing in a stairwell needs the landmark and the
          terms the tenant is working from — not an opaque listing id. The
          money figure is derived server-side; the public link renders only
          when the exact predicate the public detail page answers 404 with
          holds, so the officer can never follow a dead link. */}
      <div className="card">
        <div className="card-head">
          <span className="card-title">
            {closed ? 'Where the visit was' : 'Where you are going'}
          </span>
          <span className="mono faint" style={{ fontSize: '0.8125rem' }}>
            listing {viewing.listingId.slice(0, 8)}
          </span>
        </div>
        <dl className="dl">
          <dt>Home</dt>
          <dd>
            {listing.bedrooms}-bed {TYPE_LABEL[listing.propertyType] ?? listing.propertyType} ·{' '}
            {FURNISHED_LABEL[listing.furnished] ?? listing.furnished}
          </dd>
          <dt>Landmark</dt>
          <dd>{listing.landmarkText}</dd>
          <dt>Advertised rent</dt>
          <dd>
            {shillings(listing.monthlyRent)} / month · deposit{' '}
            {shillings(listing.depositAmount)}
          </dd>
          <dt>Tenant funds at agreement</dt>
          <dd>{shillings(listing.expectedUpfront)}</dd>
        </dl>
        {listing.publiclyVisible ? (
          <p className="muted" style={{ marginBottom: 0 }}>
            <Link href={`/properties/${viewing.listingId}`}>
              Open the public listing
            </Link>{' '}
            — the photographs and description the tenant is working from.
          </p>
        ) : (
          <p className="muted" style={{ marginBottom: 0 }}>
            This listing is not publicly visible any more, so there is no
            public page to open — the tenant asked to see it before that
            changed.
          </p>
        )}
      </div>

      {viewing.status === 'no_show' && (
        <p className="alert alert-note">
          Recorded as a no-show. No-shows are tracked rather than deleted, so
          the pattern stays visible.
        </p>
      )}

      {viewing.status === 'requested' && (
        <p className="alert alert-note">
          Not yet scheduled. This request is waiting for the operations desk
          to assign a field officer and confirm the time — the dispatch
          queue is where that happens.
        </p>
      )}

      {/* Operations may withdraw a request that cannot go ahead — the
          landlord-reported case. Officers cannot: dispatch is the admin's
          decision, and the tenant's own cancel lives on their side. */}
      {(viewing.status === 'requested' || viewing.status === 'scheduled') &&
        role === 'admin' && (
          <OpsCancelViewing viewingId={viewing.id} status={viewing.status} />
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
      ) : !scheduled ? (
        <p className="alert alert-note">
          A report is filed on the visit itself. This one has no confirmed
          time yet, so there is nothing to report on.
        </p>
      ) : (
        <FieldReportForm viewingId={viewing.id} />
      )}

      {/* ── Media capture (FR-5.5) ── */}
      {scheduled && !fieldReport && (
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
            <dd className="mono">{introduction.tenantPartyId || viewing.tenantName}</dd>
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
      ) : !scheduled ? (
        <p className="alert alert-note">
          A visit is closed only once it has happened. This one has no
          confirmed time yet.
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
