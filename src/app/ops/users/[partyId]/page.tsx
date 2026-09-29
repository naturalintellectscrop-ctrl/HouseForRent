import Link from 'next/link';
import { redirect } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { AdminOnly, Empty, onDay, shillings, when } from '@/app/ui';
import { TierControl } from '../tier-control';
import { IdentityCheckControl } from './identity-check';

/**
 * The account detail (admin) — the depth behind a directory row.
 *
 * ── What an operator actually needs when a landlord or tenant calls ──
 * Standing (active? verified?), what they hold (properties, deals,
 * viewings), and what has HAPPENED on this account (its own audit rows,
 * both events they acted in and events carried out on it — tier changes,
 * provisioning). The service scopes every query by this partyId, and the
 * page adds no arithmetic. Money amounts stay at the deal/rent level; the
 * ledger detail lives on the deal page, next to the audit trail that
 * explains it.
 */

interface PartyDetail {
  party: {
    id: string;
    displayName: string;
    primaryPhone: string;
    status: string;
    createdAt: string;
  };
  role: string;
  accountStatus: string;
  listerTier: string | null;
  identity: {
    state: string | null;
    method: string | null;
    checkedAt: string | null;
    attempts: number;
    provider: 'sandbox-mock' | null;
  };
  properties: Array<{
    id: string;
    label: string;
    neighbourhood: string;
    district: string;
    listingCount: number;
    liveListings: number;
    createdAt: string;
  }>;
  deals: Array<{
    id: string;
    side: 'tenant' | 'landlord';
    status: string;
    neighbourhood: string;
    monthlyRent: string;
    createdAt: string;
  }>;
  viewings: { requested: number; scheduled: number; conducted: number; cancelled: number };
  audit: Array<{
    id: string;
    action: string;
    entityType: string;
    entityId: string;
    actorName: string;
    actorRole: string | null;
    detail: Record<string, unknown> | null;
    createdAt: string;
  }>;
}

const ROLE_LABEL: Record<string, string> = {
  tenant: 'Tenant',
  lister: 'Landlord',
  foo: 'Field officer',
  admin: 'Operations',
};

const DEAL_STATE_LABEL: Record<string, string> = {
  created: 'created',
  tenant_matched: 'tenant matched',
  agreement_signed: 'agreement signed',
  escrow_funded: 'escrow funded',
  move_in_confirmed: 'move-in confirmed',
  commission_earned: 'commission earned',
  settled: 'settled',
  closed: 'closed',
  cancelled: 'cancelled',
  refunded: 'refunded',
};

function auditSentence(a: PartyDetail['audit'][number]): string {
  const d = a.detail ?? {};
  switch (a.action) {
    case 'lister_tier_changed':
      return `Listing tier ${d.from ? `from ${String(d.from).replace(/_/g, ' ')}` : 'set'} to ${String(d.to ?? '').replace(/_/g, ' ')}.`;
    case 'service_area_changed':
      return `${String(d.neighbourhood ?? 'Area')} (${String(d.district ?? '')}) ${d.to === true ? 'back in the service area' : 'moved out of the service area'}.`;
    case 'neighbourhood_created':
      return `${String(d.name ?? 'Neighbourhood')} (${String(d.district ?? '')}) added${d.inServiceArea ? ', in service area' : ', outside the service area'}.`;
    case 'mandate_submitted':
      return 'Submitted a listing mandate for verification.';
    case 'mandate_decided':
      return `Mandate ${String(d.decision ?? 'decided')}.`;
    case 'viewing_cancelled':
      return d.by === 'operations' ? 'A viewing was cancelled by operations.' : 'Cancelled a viewing.';
    case 'viewing_assigned':
      // Neutral on purpose: the row renders on the tenant's trail (a
      // visit of theirs got an officer) and on the officer's trail (a
      // visit was put on, or moved off, their board) with the same payload.
      return `Dispatch ${d.reassigned ? 'reassigned' : 'assigned'} the field officer for a viewing.${
        d.timeChanged ? ' The confirmed time changed.' : ''
      }`;
    case 'identity_verification':
      return d.by === 'operations'
        ? `Operations ran an identity check: ${String(d.state ?? '')}.`
        : `Identity check ${String(d.state ?? '')} (provider: ${String(d.provider ?? 'unknown')}).`;
    case 'password_changed':
      return 'Changed the account password; other sessions signed out.';
    case 'staff_provisioned':
      return `Staff account provisioned as ${String(d.role ?? '')}.`;
    case 'deal_created':
      return 'A deal was created from an introduction record.';
    case 'agreement_signed':
      return 'The listing agreement was signed.';
    case 'escrow_funded':
      return 'The tenant funded escrow for this deal.';
    case 'move_in_confirmed':
      return 'Move-in was confirmed.';
    case 'commission_earned':
      return 'Commission was earned on this deal.';
    case 'deal_settled':
      return 'This deal was settled from escrow.';
    case 'deal_closed':
      return 'This deal was closed.';
    case 'deal_cancelled':
      return 'This deal was cancelled.';
    case 'deal_refunded':
      return 'This deal was refunded.';
    default:
      return a.action.replace(/_/g, ' ');
  }
}

export default async function PartyPage(props: { params: Promise<{ partyId: string }> }) {
  const { partyId } = await props.params;

  let d: PartyDetail;
  try {
    d = await api<PartyDetail>(`/v1/admin/users/${encodeURIComponent(partyId)}`);
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.status === 401) redirect('/login');
      if (err.status === 403) return <AdminOnly what="The account detail" />;
      if (err.status === 404) {
        return (
          <>
            <p>
              <Link href="/ops/users" className="btn btn-ghost btn-sm">
                ← Back to users
              </Link>
            </p>
            <Empty title="No account answers to that reference.">
              A party that does not exist and one that was never given an
              account look the same from here — the more common cause is a
              truncated or mistyped ID.
            </Empty>
          </>
        );
      }
    }
    throw err;
  }

  const pendingDeals = d.deals.filter(
    (x) => x.status !== 'closed' && x.status !== 'cancelled' && x.status !== 'refunded',
  ).length;

  return (
    <>
      <p>
        <Link href="/ops/users" className="btn btn-ghost btn-sm">
          ← Back to users
        </Link>
      </p>

      <h1 style={{ marginBottom: '0.25rem' }}>{d.party.displayName}</h1>
      <p className="lede" style={{ marginTop: 0 }}>
        <span className="mono">{d.party.primaryPhone}</span> ·{' '}
        {ROLE_LABEL[d.role] ?? d.role} · joined {onDay(d.party.createdAt)}
      </p>

      <div className="kpis">
        <div className="kpi">
          <div className="kpi-label">Account</div>
          <div className="kpi-value" style={{ fontSize: '1rem', paddingTop: '0.35rem' }}>
            {d.accountStatus === 'active' ? (
              <span className="badge badge-ok">active</span>
            ) : (
              <span className="badge badge-warn">{d.accountStatus.replace(/_/g, ' ')}</span>
            )}
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Identity</div>
          <div className="kpi-value" style={{ fontSize: '1rem', paddingTop: '0.35rem' }}>
            {d.identity.state === 'verified' ? (
              <span className="badge badge-ok">verified</span>
            ) : (
              <span className="badge">not verified</span>
            )}
          </div>
          <div className="kpi-state">
            {d.identity.attempts > 0
              ? `${d.identity.attempts} check${d.identity.attempts === 1 ? '' : 's'} · ${d.identity.provider}`
              : 'never attempted'}
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Properties</div>
          <div className="kpi-value">{d.properties.length}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Deals in progress</div>
          <div className="kpi-value">{pendingDeals}</div>
          <div className="kpi-state">{d.deals.length} all time</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Viewings as tenant</div>
          <div className="kpi-value">
            {d.viewings.requested + d.viewings.scheduled + d.viewings.conducted}
          </div>
          <div className="kpi-state">
            {d.viewings.conducted} conducted · {d.viewings.cancelled} cancelled
          </div>
        </div>
      </div>

      {(d.role === 'tenant' || d.role === 'lister') && d.identity.state !== 'verified' ? (
        <div className="card" style={{ marginBottom: '1.25rem' }}>
          <div className="card-head">
            <span className="card-title">Run an identity check</span>
            <span className="muted">provider: {d.identity.provider ?? 'sandbox-mock'}</span>
          </div>
          <p className="faint" style={{ fontSize: '0.8125rem', marginTop: 0 }}>
            {d.identity.attempts > 0
              ? `${d.identity.attempts} attempt${d.identity.attempts === 1 ? '' : 's'} on file${d.identity.checkedAt ? `, last ${onDay(d.identity.checkedAt)}` : ''}. A pass marks the account verified${d.accountStatus === 'pending_verification' ? ' — this account is waiting on that' : ''}.`
              : 'This account has never attempted a check. A pass marks the account verified' + (d.accountStatus === 'pending_verification' ? ' — this account is waiting on that.' : '.')}
          </p>
          <IdentityCheckControl
            partyId={d.party.id}
            displayName={d.party.displayName}
            currentState={d.identity.state}
          />
        </div>
      ) : null}

      {d.role === 'lister' ? (
        <div className="card" style={{ marginBottom: '1.25rem' }}>
          <div className="card-head">
            <span className="card-title">Listing relationship</span>
          </div>
          <dl className="dl">
            <dt>Lists as</dt>
            <dd>
              {d.listerTier ? d.listerTier.replace(/_/g, ' ') : 'not set'}{' '}
              <span className="faint">·</span>{' '}
              <span className="faint" style={{ fontSize: '0.8125rem' }}>
                {d.listerTier === 'property_owner' || !d.listerTier
                  ? 'owns what they list — no mandate required'
                  : 'markets for others — every listing needs the owner’s verified mandate'}
              </span>
            </dd>
          </dl>
          <TierControl partyId={d.party.id} currentTier={d.listerTier} />
        </div>
      ) : null}

      {/*
        Two cards only: auto-fit keeps them side by side on a wide screen
        without the empty third column .grid-cards' 3-column tier would
        leave here.
      */}
      <div
        className="grid-cards"
        style={{ marginBottom: '1.25rem', gridTemplateColumns: 'repeat(auto-fit, minmax(20rem, 1fr))' }}
      >
        <section className="card" aria-label="Properties">
          <div className="card-head">
            <span className="card-title">Properties</span>
            <span className="muted">{d.properties.length}</span>
          </div>
          {d.properties.length === 0 ? (
            <p className="faint" style={{ margin: 0 }}>
              {d.role === 'lister'
                ? 'No property registered yet.'
                : 'Property records belong to landlord accounts.'}
            </p>
          ) : (
            <ul className="list" style={{ gap: '0.5rem' }}>
              {d.properties.map((p) => (
                <li key={p.id} className="list-item" style={{ padding: '0.7rem 0.9rem' }}>
                  <span>
                    <strong>
                      {p.label} · {p.neighbourhood}
                    </strong>
                    <span className="faint" style={{ display: 'block', fontSize: '0.8125rem' }}>
                      {p.district} · {p.listingCount} listing
                      {p.listingCount === 1 ? '' : 's'}
                      {p.liveListings > 0 ? ` · ${p.liveListings} live` : ''}
                    </span>
                  </span>
                  <span className="muted" style={{ fontSize: '0.8125rem' }}>
                    {onDay(p.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card" aria-label="Deals">
          <div className="card-head">
            <span className="card-title">Deals</span>
            <span className="muted">{d.deals.length}</span>
          </div>
          {d.deals.length === 0 ? (
            <p className="faint" style={{ margin: 0 }}>
              {d.role === 'tenant'
                ? 'No deal yet — deals begin after a conducted viewing.'
                : 'No deal on this account.'}
            </p>
          ) : (
            <ul className="list" style={{ gap: '0.5rem' }}>
              {d.deals.map((x) => (
                <li key={x.id} className="list-item" style={{ padding: '0.7rem 0.9rem' }}>
                  <span>
                    <Link href={`/ops/deals/${x.id}`}>
                      {d.role === 'tenant' ? 'As tenant' : 'As landlord'} · {x.neighbourhood} ·{' '}
                      {shillings(x.monthlyRent)}/month
                    </Link>
                    <span className="faint" style={{ display: 'block', fontSize: '0.8125rem' }}>
                      opened {onDay(x.createdAt)}
                    </span>
                  </span>
                  <span className="badge">{DEAL_STATE_LABEL[x.status] ?? x.status}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="card" aria-label="Account trail" style={{ marginBottom: '1.25rem' }}>
        <div className="card-head">
          <span className="card-title">Account trail</span>
          <span className="muted">{d.audit.length} most recent</span>
        </div>
        <p className="faint" style={{ fontSize: '0.8125rem', marginTop: 0 }}>
          Events this account acted in, and events carried out on it. Every
          row is append-only; the full log stays on the audit page.
        </p>
        {d.audit.length === 0 ? (
          <p className="faint" style={{ margin: 0 }}>
            Nothing recorded yet — an account that has only signed in has no
            trail, and that is the honest answer.
          </p>
        ) : (
          <ul className="list" style={{ gap: '0.5rem' }}>
            {d.audit.map((a) => (
              <li
                key={a.id}
                className="list-item"
                style={{ padding: '0.7rem 0.9rem', alignItems: 'baseline' }}
              >
                <span>
                  <strong>{auditSentence(a)}</strong>
                  <span className="faint" style={{ display: 'block', fontSize: '0.8125rem' }}>
                    {a.action.replace(/_/g, ' ')} · by {a.actorName}
                    {a.actorRole ? ` (${a.actorRole})` : ''}
                  </span>
                </span>
                <span className="muted" style={{ fontSize: '0.8125rem', whiteSpace: 'nowrap' }}>
                  {when(a.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
