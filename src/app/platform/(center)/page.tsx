import Link from 'next/link';
import { db } from '@/lib/db';
import { resolveSession } from '@/server/auth';
import { IDENTITY_PROVIDER_IS_MOCK, pendingApplicationQueue } from '@/server/ops';
import { adminVerificationQueue } from '@/server/listings';
import {
  DegradedPanel,
  PlatPageHead,
  SectionCard,
  humanize,
  loadPlatformData,
} from './data';
import { Icon } from '@/app/ui';

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
 * ── What this page is for ──
 * The composition follows the way an operator actually reads: the operator
 * band answers "how is the platform" in one composed surface, the priority
 * panel answers "what needs me", the queues show the concrete cases, the
 * standing rail carries the shape of the platform, and the honesty block
 * states which systems behind it are real. Every figure is a live query -
 * none is invented, none is cached, nothing here is decoration.
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
  const totalListings = data.listingStates.reduce((sum, s) => sum + s._count._all, 0);
  const inFlightDeals = data.dealsInFlight
    .filter((d) => !['settled', 'closed', 'cancelled', 'refunded'].includes(d.status))
    .reduce((sum, d) => sum + d._count._all, 0);

  // The attention list, heaviest first: queues where someone or something
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
  const attentionTotal = attention.reduce((sum, item) => sum + item.value, 0);

  // Server-rendered once per request in the platform's own clock: this is
  // context for the figures, not a ticking clock.
  const today = new Date().toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Africa/Kampala',
  });

  return (
    <div className="stack-lg">
      <PlatPageHead
        eyebrow="Platform control"
        title="Control center"
        lede="The whole platform on one surface - outstanding work first, then the shape behind it. Every figure is a live query against the operational database."
        context={<span className="plat-date-chip">{today} · Kampala</span>}
        actions={
          <>
            <span className="plat-who-id">
              <span className="plat-who-name">{data.session?.displayName ?? '—'}</span>
              <span className="plat-who-role">Platform owner · signed in</span>
            </span>
            <Link href="/platform/system" className="btn btn-sm plat-btn-ghost">
              System status
            </Link>
          </>
        }
      />

      {/* ── 1. The operator band: the platform in four live figures ─── */}
      <section className="opband" aria-label="Platform at a glance">
        <div className="opband-main">
          <span className="opband-eyebrow">Platform at a glance · live</span>
          <div className="opband-grid">
            <div className="opband-item opband-item--hero">
              <span className="opband-value">{attentionTotal.toLocaleString('en-UG')}</span>
              <span className="opband-label">items need attention</span>
              <span className="opband-sub">across {attention.filter((a) => a.value > 0).length} queues</span>
            </div>
            <div className="opband-item">
              <span className="opband-value">{liveListings.toLocaleString('en-UG')}</span>
              <span className="opband-label">Homes live in search</span>
            </div>
            <div className="opband-item">
              <span className="opband-value">{inFlightDeals.toLocaleString('en-UG')}</span>
              <span className="opband-label">Deals in flight</span>
            </div>
            <div className="opband-item">
              <span className="opband-value">{data.activeSessions.toLocaleString('en-UG')}</span>
              <span className="opband-label">Active sessions</span>
            </div>
          </div>
        </div>
        <div className="opband-side">
          <Link href="/platform/system" className="opband-link">
            System status
            <Icon.arrowUpRight size={14} />
          </Link>
          <p className="opband-note">
            Refreshed on every load. The full, filterable trail lives in the{' '}
            <Link href="/ops/audit" style={{ color: 'inherit' }}>
              staff audit view
            </Link>
            .
          </p>
        </div>
      </section>

      {/* ── 2. What needs attention: the case list ──────────────────── */}
      <SectionCard
        title="Needs attention"
        eyebrow="Work waiting on a person"
        count={attentionTotal > 0 ? `${attentionTotal} open` : 'clear'}
      >
        <ul className="prio">
          {attention.map((item) => (
            <li key={item.label}>
              <Link
                href={item.href}
                className={`prio-row ${item.value === 0 ? 'is-clear' : ''}`}
              >
                <span className="prio-num">{item.value.toLocaleString('en-UG')}</span>
                <span className="prio-body">
                  <span className="prio-label">{item.label}</span>
                  <span className="prio-detail">{item.detail}</span>
                </span>
                <span className="prio-state">
                  {item.value === 0 ? (
                    <span className="plat-pill plat-pill-ok">clear</span>
                  ) : (
                    <span className="plat-pill plat-pill-warn">open</span>
                  )}
                </span>
                <span className="prio-go">
                  <Icon.arrowUpRight size={15} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </SectionCard>

      {/* ── 3. The concrete queues + the standing rail ──────────────── */}
      <div className="plat-console-grid">
        <div className="stack-lg" style={{ gap: '1.25rem', margin: 0 }}>
          <SectionCard
            title="Oldest account applications"
            eyebrow="Approvals queue"
            href="/platform/approvals"
            count={data.applicationRows.length}
          >
            {data.applicationRows.length === 0 ? (
              <p className="muted" style={{ margin: 0 }}>
                No applications waiting - every account has been decided.
              </p>
            ) : (
              <ul className="plat-queue">
                {data.applicationRows.map((row) => (
                  <li key={row.partyId}>
                    <span className="plat-queue-main">
                      <strong className="plat-name">{row.displayName}</strong>
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

          <SectionCard
            title="Listings waiting on the publish gates"
            eyebrow="Supply pipeline"
            href="/platform/listings"
            count={data.verificationRows.length}
          >
            {data.verificationRows.length === 0 ? (
              <p className="muted" style={{ margin: 0 }}>
                Nothing is blocked - every listing is live, withdrawn or decided.
              </p>
            ) : (
              <ul className="plat-queue">
                {data.verificationRows.slice(0, 5).map((row) => (
                  <li key={row.listingId}>
                    <span className="plat-queue-main">
                      <strong className="plat-name">{row.listerName}</strong>
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

        <div className="stack-lg" style={{ gap: '1.25rem', margin: 0 }}>
          <SectionCard title="Accounts by standing" eyebrow="Directory">
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

          <SectionCard title="Inventory mix" eyebrow="Supply">
            {totalListings === 0 ? (
              <p className="muted" style={{ margin: 0 }}>
                No listings have been authored yet, so there is no live share
                to show. This becomes the live-share meter once the first
                home is authored.
              </p>
            ) : (
              <div
                className="meter"
                role="img"
                aria-label={`${Math.round((liveListings / totalListings) * 100)}% of authored listings are live in search`}
              >
                <div className="meter-track">
                  <div
                    className="meter-fill"
                    style={{ width: `${Math.round((liveListings / totalListings) * 100)}%` }}
                  />
                </div>
                <div className="meter-legend">
                  <span>
                    <span className="meter-value">
                      {Math.round((liveListings / totalListings) * 100)}%
                    </span>{' '}
                    live in search
                  </span>
                  <span>
                    {liveListings} of {totalListings} authored
                  </span>
                </div>
              </div>
            )}
            <ul className="plat-kv" style={{ marginTop: '0.75rem' }}>
              <li>
                <span>Listings in draft</span>
                <strong>{draftListings.toLocaleString('en-UG')}</strong>
              </li>
              <li>
                <span>Deals in flight</span>
                <strong>{inFlightDeals.toLocaleString('en-UG')}</strong>
              </li>
            </ul>
          </SectionCard>

          <SectionCard title="Latest activity" eyebrow="Audit" href="/ops/audit">
            {data.recentAudit.length === 0 ? (
              <p className="muted" style={{ margin: 0 }}>
                Nothing recorded yet.
              </p>
            ) : (
              <ul className="plat-feed">
                {data.recentAudit.map((event) => (
                  <li
                    key={event.id}
                    className={FAILURE_EVENTS.has(event.eventType) ? 'is-failure' : undefined}
                  >
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
              {data.auditTotal.toLocaleString('en-UG')} events in total.
            </p>
          </SectionCard>
        </div>
      </div>

      {/* ── 4. Whether the systems behind it are real ────────────────── */}
      <SectionCard title="Operational status" eyebrow="Platform health" href="/platform/system">
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
