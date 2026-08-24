import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import {
  api,
  ApiError,
  type AuditEvent,
  type DealDetail,
} from '@/lib/api';
import { AdminOnly, ApiAlert, Empty, ShortId, shillings, when } from '@/app/ui';
import { DealAction } from './deal-action';

/**
 * One deal, and what can be done to it — F-007.
 *
 * ── What was broken ──
 * `earn-commission`, `settle`, `close`, `refund`, `dispute-hold`,
 * `resolve-dispute`, `match-tenant` and `sign-agreement` were all built and
 * tested, and none was callable from any surface. The two transitions that
 * DID have surfaces were the two that put money in. Client funds could enter
 * escrow from the mobile app and had no exit.
 *
 * ── The rule this page follows ──
 * It contains no copy of the deal state machine. It does not know that
 * `settle` follows `commission_earned`, and it never asks what the status
 * is in order to decide what to offer. It renders `availableActions`, which
 * the server derives from the real transition graph and the real `@Roles()`
 * decorators. If the graph changes, this page changes with it, without
 * being edited.
 *
 * Every figure below comes from `financial`, computed server-side from the
 * ledger — the same rows reconciliation reads. Nothing on this page performs
 * arithmetic on money.
 */
export default async function DealDetailPage(props: {
  params: Promise<{ dealId: string }>;
}) {
  const { dealId } = await props.params;

  let detail: DealDetail;
  try {
    detail = await api<DealDetail>(`/v1/deals/${dealId}`);
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.status === 401) redirect('/login');
      // The backend returns 404 rather than 403 for a caller who is not a
      // party — a 403 would confirm the deal exists and let someone probe
      // for real ids. This page must not undo that by saying more.
      if (err.status === 404) notFound();
      if (err.status === 403) return <AdminOnly what="Deal operations" />;
    }
    throw err;
  }

  const { deal, transitions, listing, property, parties, financial } = detail;

  /*
   * The audit trail is a separate, admin-only read. A field officer may open
   * a deal (the role matrix permits it) but may not read the audit log, so a
   * failure here must not take the page down with it.
   */
  let audit: AuditEvent[] | null = null;
  try {
    audit = await api<AuditEvent[]>(`/v1/admin/audit/${deal.id}`);
  } catch {
    audit = null;
  }

  const home = `${property.bedrooms}-bed ${property.propertyType.replace(/_/g, ' ')}`;

  return (
    <>
      <p className="muted backlink">
        <Link href="/ops/deals">← All deals</Link>
      </p>

      <div className="card-head">
        <h1>
          {home} in {property.neighbourhood}
        </h1>
        <span className="pill">{deal.status.replace(/_/g, ' ')}</span>
      </div>
      <p className="lede">
        Deal <ShortId value={deal.id} /> · opened {when(deal.createdAt)} · last
        changed {when(deal.updatedAt)}
      </p>

      {/* ── Property ── */}
      <h2>Property</h2>
      <div className="card">
        <dl className="dl">
          <dt>Type</dt>
          <dd>
            {home}, {property.bathrooms} bath, {property.furnished.replace(/_/g, ' ')}
          </dd>
          <dt>Neighbourhood</dt>
          <dd>
            {property.neighbourhood}
            {!property.inServiceArea && (
              <> · <span className="pill pill-danger">out of corridor</span></>
            )}
          </dd>
          {property.landmarkText && (
            <>
              <dt>Landmark</dt>
              <dd>{property.landmarkText}</dd>
            </>
          )}
          <dt>Listing</dt>
          <dd>
            <ShortId value={listing.id} /> · {listing.publicationState} ·{' '}
            {listing.verificationState} · {listing.availabilityStatus}
          </dd>
          <dt>Asking</dt>
          <dd>
            {shillings(listing.monthlyRent)} / month ·{' '}
            {listing.requiredMonthsUpfront} months upfront · deposit{' '}
            {shillings(listing.depositAmount)}
          </dd>
        </dl>
      </div>

      {/* ── Parties ── */}
      <h2>Parties</h2>
      <div className="card">
        <dl className="dl">
          <dt>Tenant</dt>
          <dd>
            {parties.tenant.displayName} · <ShortId value={parties.tenant.partyId} />
          </dd>
          <dt>Landlord</dt>
          <dd>
            {parties.landlord.displayName} ·{' '}
            <ShortId value={parties.landlord.partyId} />
          </dd>
          <dt>Introduction</dt>
          <dd>
            {deal.introductionRecordId ? (
              <ShortId value={deal.introductionRecordId} />
            ) : (
              <span className="pill pill-warn">none recorded</span>
            )}
          </dd>
        </dl>
        <p className="muted">
          Contact numbers are deliberately not shown here. A deal page listing
          both counterparties&rsquo; phone numbers is a contact export with a
          deal attached; widening it is a data-protection decision, not a
          convenience.
        </p>
      </div>

      {/* ── Money ── */}
      <h2>Money</h2>
      <div className="kpis">
        <div className="kpi">
          <p className="kpi-label">Held in escrow</p>
          <p className="kpi-value">{shillings(financial.heldInEscrow)}</p>
        </div>
        <div className="kpi">
          <p className="kpi-label">Listing asks upfront</p>
          <p className="kpi-value">{shillings(financial.expectedUpfront)}</p>
        </div>
        <div className="kpi">
          <p className="kpi-label">Commission</p>
          <p className="kpi-value">
            {financial.commissionAmount
              ? shillings(financial.commissionAmount)
              : '—'}
          </p>
        </div>
      </div>

      <div className="card">
        <dl className="dl">
          <dt>Funded in</dt>
          <dd>{shillings(financial.funded)}</dd>
          <dt>Released to landlord</dt>
          <dd>{shillings(financial.releasedToLandlord)}</dd>
          <dt>Refunded to tenant</dt>
          <dd>{shillings(financial.refunded)}</dd>
          <dt>Owed to landlord, not yet moved</dt>
          <dd>{shillings(financial.owedToLandlord)}</dd>
          <dt>Commission recognised as revenue</dt>
          <dd>{shillings(financial.commissionRecognised)}</dd>
          <dt>Rent frozen at signing</dt>
          <dd>
            {financial.monthlyRentSnapshot
              ? shillings(financial.monthlyRentSnapshot)
              : 'not yet frozen'}
          </dd>
          <dt>Rate frozen at signing</dt>
          <dd>
            {financial.commissionRateBpSnapshot !== null
              ? `${financial.commissionRateBpSnapshot} bp of one month`
              : 'not yet frozen'}
          </dd>
          <dt>Escrow discharged</dt>
          <dd>
            {financial.escrowDischarged ? (
              <span className="pill pill-ok">yes</span>
            ) : (
              <span className="pill pill-warn">no — a balance remains</span>
            )}
          </dd>
        </dl>
      </div>

      {financial.funded !== '0' &&
        financial.funded !== financial.expectedUpfront && (
          <p className="alert alert-note">
            The amount funded does not equal what the listing asks upfront.
            The system does not currently check this (finding F-012), so this
            is shown for your judgement rather than flagged as an error — it
            may be a part payment, a negotiated figure, or a mistake.
          </p>
        )}

      {/* ── Actions the SERVER permits ── */}
      <h2>What can be done now</h2>
      {detail.availableActions.length === 0 ? (
        <Empty title="No transitions are available from this state.">
          Either this deal has reached a terminal status, or every remaining
          transition belongs to a role your account does not hold. This list
          is the server&rsquo;s answer, not this page&rsquo;s guess.
        </Empty>
      ) : (
        detail.availableActions.map((action) => (
          <DealAction
            key={action.action}
            dealId={deal.id}
            action={action}
            amounts={{
              heldInEscrow: financial.heldInEscrow,
              commissionAmount: financial.commissionAmount,
            }}
          />
        ))
      )}

      {/* ── History ── */}
      <h2>Lifecycle</h2>
      {transitions.length === 0 ? (
        <p className="muted">
          No transitions yet — this deal is still at <code>{deal.status}</code>.
        </p>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th scope="col">From</th>
                <th scope="col">To</th>
                <th scope="col">When</th>
                <th scope="col">By</th>
                <th scope="col">Reason</th>
              </tr>
            </thead>
            <tbody>
              {transitions.map((row) => (
                <tr key={row.id}>
                  <td>{row.fromStatus.replace(/_/g, ' ')}</td>
                  <td>{row.toStatus.replace(/_/g, ' ')}</td>
                  <td>{when(row.occurredAt)}</td>
                  <td className="mono">{row.actorPartyId.slice(0, 8)}</td>
                  <td>{row.reason ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Audit (NFR-2) ── */}
      <h2>Audit trail</h2>
      {audit === null ? (
        <ApiAlert
          message="The audit trail is admin-only, and your account did not receive it."
          code="FORBIDDEN_ROLE"
        />
      ) : audit.length === 0 ? (
        <p className="muted">
          No audited events yet. Money events are written inside the same
          transaction that causes them, so an empty trail here means no money
          has moved — not that logging is behind.
        </p>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th scope="col">Event</th>
                <th scope="col">When</th>
                <th scope="col">Actor</th>
              </tr>
            </thead>
            <tbody>
              {audit.map((event) => (
                <tr key={event.id}>
                  <td>{event.eventType.replace(/_/g, ' ')}</td>
                  <td>{when(event.occurredAt)}</td>
                  <td className="mono">{event.actorPartyId.slice(0, 8)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="muted">
        Audit rows are immutable at the database level — they cannot be edited
        or deleted, here or anywhere.
      </p>
    </>
  );
}
