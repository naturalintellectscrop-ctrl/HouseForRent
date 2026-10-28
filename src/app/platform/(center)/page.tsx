import Link from 'next/link';
import { db } from '@/lib/db';
import { resolveSession } from '@/server/auth';
import { IDENTITY_PROVIDER_IS_MOCK, pendingApplicationQueue } from '@/server/ops';
import { adminVerificationQueue } from '@/server/listings';
import { DegradedPanel, SectionCard, humanize, loadPlatformData } from './data';

export const metadata = {
  title: 'Control center',
  robots: { index: false, follow: false },
};

/** `3 d` / `14 h` / `just now` - queue ages at a glance. */
function ageOf(when: Date): string {
  const ms = Date.now() - when.getTime();
  const days = Math.floor(ms / 86_400_000);
  if (days >= 30) return `${Math.floor(days / 30)} mo`;
  if (days >= 1) return `${days} d`;
  const hours = Math.floor(ms / 3_600_000);
  if (hours >= 1) return `${hours} h`;
  const minutes = Math.max(1, Math.floor(ms / 60_000));
  return `${minutes} min`;
}

/** Audit event types that mean something went wrong - shown as failures. */
const FAILURE_EVENTS = new Set(['signin_failed']);

/**
 * Platform Control Center - the operational overview.
 *
 * ── What this page is for (and what it replaced) ──
 * The previous overview was a wall of equally-weighted counts: nothing
 * prioritised, nothing actionable, no answer to "what needs me?". This
 * redesign keeps every figure a live, real query - and none invented -
 * but orders the page the way an operator reads: what needs attention,
 * then the shape of the platform, then the concrete queues, then what
 * just happened, then whether the systems behind it are real.
 */
export default async function PlatformOverviewPage() {
  const result = await loadPlatformData(async () => {
    const [
      session,
      applicationRows,
      verificationRows,
      viewingRequested,
      disputeHold,
      dealsInFlight,
      partyStatusCounts,
      roleCounts,
      listingStates,
      activeSessions,
      auditTotal,
      recentAudit,
    ] = await Promise.all([
      resolveSession(),
      pendingApplicationQueue(5),
      adminVerificationQueue(),
      db.viewing.count({ where: { status: 'requested' } }),
      db.deal.count({ where: { status: 'dispute_hold' } }),
      db.deal.groupBy({ by: ['status'], _count: { _all: true } }),
      db.party.groupBy({ by: ['status'], _count: { _all: true } }),
      db.userAccount.groupBy({ by: ['authRole'], _count: { _all: true } }),
      db.listing.groupBy({ by: ['publicationState'], _count: { _all: true } }),
      db.session.count({ where: { revokedAt: null, expiresAt: { gt: new Date() } } }),
      db.auditEvent.count(),
      db.auditEvent.findMany({
        take: 10,
        orderBy: { occurredAt: 'desc' },
        include: { actorParty: { select: { displayName: true } } },
      }),
    ]);
    return {
      session,
      applicationRows,
      verificationRows,
      viewingRequested,
      disputeHold,
      dealsInFlight,
      partyStatusCounts,
      roleCounts,
      listingStates,
      activeSessions,
      auditTotal,
      recentAudit,
    };
  });

  if (!result.ok) {
    return <DegradedPanel title="Platform overview unavailable" />;
  }
  const data = result.data;

  const liveListings =
    data.listingStates.find((s) => s.publicationState === 'live')?._count._all ?? 0;
  const draftListings =
    data.listingStates.find((s) => s.publicationState === 'draft')?._count._all ?? 0;
  const inFlightDeals = data.dealsInFlight
    .filter((d) => !['settled', 'closed', 'cancelled', 'refunded'].includes(d.status))
    .reduce((sum, d) => sum + d._count._all, 0);

  // The attention band, heaviest first: queues where someone or something
  // is waiting on a person. Every figure links to where the work happens.
  const pendingApplications =
    data.partyStatusCounts.find((s) => s.status === 'pending_verification')?._count._all ?? 0;
  const listingsAwaitingVerification = data.verificationRows.length;
  const attention = [
    {
      label: 'Account applications waiting',
      value: pendingApplications,
      href: '/platform/approvals',
      detail: 'identity checks that decide activation',
    },
    {
      label: 'Listings blocked from publication',
      value: listingsAwaitingVerification,
      href: '/platform/listings',
      detail: 'waiting on field verification and the publish gates',
    },
    {
      label: 'Viewing requests to assign',
      value: data.viewingRequested,
      href: '/ops/dispatch',
      detail: 'need a field officer',
    },
    {
      label: 'Deals on dispute hold',
      value: data.disputeHold,
      href: '/platform/transactions',
      detail: 'no money moves until resolved',
    },
  ];

  return (
    <div className="stack-lg">
      <header className="plat-page-head">
        <div className="stack-sm">
          <h1 className="h1">Control center</h1>
          <p className="muted">
            The whole platform on one surface. Every figure is a live query
            against the operational database - outstanding work first.
          </p>
        </div>
        <div className="plat-page-actions">
          <span className="plat-who-id">
            <span className="plat-who-name">{data.session?.displayName ?? '—'}</span>
            <span className="plat-who-role">Platform owner · signed in</span>
          </span>
          <Link href="/platform/system" className="btn btn-sm plat-btn-ghost">
            System status
          </Link>
        </div>
      </header>

      {/* ── 1. What needs attention ──────────────────────────────────── */}
      <section aria-label="Needs attention" className="plat-attention">
        {attention.map((item) => (
          <Link key={item.label} href={item.href} className={`plat-attention-item ${item.value === 0 ? 'is-clear' : ''}`}>
            <span className="plat-attention-value">{item.value}</span>
            <span className="plat-attention-label">{item.label}</span>
            <span className="plat-attention-detail">{item.detail}</span>
          </Link>
        ))}
      </section>

      {/* ── 2. The shape of the platform ─────────────────────────────── */}
      <div className="plat-grid-2">
        <SectionCard title="Accounts by standing">
          <ul className="plat-kv">
            {data.partyStatusCounts.length === 0 ? (
              <li className="muted">No accounts yet.</li>
            ) : (
              data.partyStatusCounts
                .slice()
                .sort((a, b) => b._count._all - a._count._all)
                .map((s) => (
                  <li key={s.status}>
                    <span>{humanize(s.status)}</span>
                    <strong>{s._count._all.toLocaleString('en-UG')}</strong>
                  </li>
                ))
            )}
          </ul>
          <p className="muted plat-feed-note">
            {data.roleCounts
              .map((r) => `${humanize(r.authRole)}: ${r._count._all.toLocaleString('en-UG')}`)
              .join(' · ')}
          </p>
        </SectionCard>

        <SectionCard title="Inventory and deal flow">
          <ul className="plat-kv">
            <li>
              <span>Homes live in search</span>
              <strong>{liveListings.toLocaleString('en-UG')}</strong>
            </li>
            <li>
              <span>Listings in draft</span>
              <strong>{draftListings.toLocaleString('en-UG')}</strong>
            </li>
            <li>
              <span>Deals in flight</span>
              <strong>{inFlightDeals.toLocaleString('en-UG')}</strong>
            </li>
            <li>
              <span>Active sessions</span>
              <strong>{data.activeSessions.toLocaleString('en-UG')}</strong>
            </li>
          </ul>
          <p className="muted plat-feed-note">
            {data.listingStates.length === 0
              ? 'No listings yet.'
              : data.listingStates
                  .map((s) => `${humanize(s.publicationState)}: ${s._count._all}`)
                  .join(' · ')}
          </p>
        </SectionCard>
      </div>

      {/* ── 3. The concrete queues ───────────────────────────────────── */}
      <div className="plat-grid-2">
        <SectionCard title="Oldest account applications" href="/platform/approvals">
          {data.applicationRows.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>
              No applications waiting - every account has been decided.
            </p>
          ) : (
            <ul className="plat-queue">
              {data.applicationRows.map((row) => (
                <li key={row.partyId}>
                  <span className="plat-queue-main">
                    <strong>{row.displayName}</strong>
                    <span className="plat-sub">
                      {humanize(row.role)}
                      {row.identityState === 'verified'
                        ? ' · identity verified'
                        : row.identityState !== null
                          ? ` · ${row.identityAttempts} failed check${row.identityAttempts === 1 ? '' : 's'}`
                          : ' · no identity attempt yet'}
                    </span>
                  </span>
                  <span className="plat-queue-side">
                    <span className="plat-pill plat-pill-warn">{ageOf(row.waitingSince)}</span>
                    <Link href={`/platform/approvals/${row.partyId}`} className="plat-action">
                      Review →
                    </Link>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard title="Listings waiting on the publish gates" href="/platform/listings">
          {data.verificationRows.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>
              Nothing is blocked - every listing is live, withdrawn or decided.
            </p>
          ) : (
            <ul className="plat-queue">
              {data.verificationRows.slice(0, 5).map((row) => (
                <li key={row.listingId}>
                  <span className="plat-queue-main">
                    <strong>{row.listerName}</strong>
                    <span className="plat-sub">
                      {row.neighbourhood} · {humanize(row.publicationState)}
                      {row.blockedBy.length > 0 ? ` · needs ${row.blockedBy.join(', ').replace(/_/g, ' ')}` : ''}
                    </span>
                  </span>
                  <span className="plat-queue-side">
                    <span className="plat-pill plat-pill-idle">{ageOf(new Date(row.createdAt))}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      {/* ── 4. What just happened ────────────────────────────────────── */}
      <SectionCard title="Latest activity" href="/ops/audit">
        {data.recentAudit.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            Nothing recorded yet.
          </p>
        ) : (
          <ul className="plat-feed">
            {data.recentAudit.map((event) => (
              <li key={event.id}>
                <span className="plat-feed-when">
                  {event.occurredAt.toISOString().replace('T', ' ').slice(0, 16)} UTC
                </span>
                <span className="plat-feed-what">
                  <strong>{event.actorParty.displayName}</strong> ·{' '}
                  {humanize(event.eventType)}
                </span>
                {FAILURE_EVENTS.has(event.eventType) ? (
                  <span className="plat-pill plat-pill-danger">failed</span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        <p className="muted plat-feed-note">
          {data.auditTotal.toLocaleString('en-UG')} events in total. The
          full, filterable trail lives in the{' '}
          <Link href="/ops/audit">staff audit view</Link>.
        </p>
      </SectionCard>

      {/* ── 5. Whether the systems behind it are real ────────────────── */}
      <SectionCard title="Operational status" href="/platform/system">
        <ul className="plat-status-list">
          <li>
            <span className="plat-pill plat-pill-ok">operating</span>
            <span>
              Platform database reachable - every figure on this page is live.
            </span>
          </li>
          <li>
            <span className={`plat-pill ${IDENTITY_PROVIDER_IS_MOCK ? 'plat-pill-warn' : 'plat-pill-ok'}`}>
              {IDENTITY_PROVIDER_IS_MOCK ? 'sandbox mock' : 'live'}
            </span>
            <span>
              Identity checks: the provider is the development mock - it
              checks NIN structure and name match, not the national register.
              Approval decisions carry that limit on their face.
            </span>
          </li>
          <li>
            <span className="plat-pill plat-pill-warn">mock PSP</span>
            <span>
              Payments: the provider is the development seam - instructions
              and the double-entry ledger are real records, but no money
              moves and nothing here should read as custody of funds.
            </span>
          </li>
        </ul>
      </SectionCard>
    </div>
  );
}
