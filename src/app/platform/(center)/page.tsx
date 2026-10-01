import Link from 'next/link';
import { db } from '@/lib/db';
import { DegradedPanel, SectionCard, loadPlatformData, humanize } from './data';

/**
 * Platform overview - the whole platform on one surface: the people on it,
 * the homes on it, the money moving through it, and what the audit trail
 * last recorded. Figures are live counts, not samples; every section only
 * exposes what the underlying models actually hold.
 */
export default async function PlatformOverviewPage() {
  const result = await loadPlatformData(async () => {
    const [partyTotal, roleCounts, listingStates, dealStates, activeSessions, auditTotal, recentAudit] =
      await Promise.all([
        db.party.count(),
        db.userAccount.groupBy({ by: ['authRole'], _count: { _all: true } }),
        db.listing.groupBy({ by: ['publicationState'], _count: { _all: true } }),
        db.deal.groupBy({ by: ['status'], _count: { _all: true } }),
        db.session.count({ where: { revokedAt: null, expiresAt: { gt: new Date() } } }),
        db.auditEvent.count(),
        db.auditEvent.findMany({
          take: 8,
          orderBy: { occurredAt: 'desc' },
          include: { actorParty: { select: { displayName: true } } },
        }),
      ]);
    return { partyTotal, roleCounts, listingStates, dealStates, activeSessions, auditTotal, recentAudit };
  });

  if (!result.ok) {
    return <DegradedPanel title="Platform overview unavailable" />;
  }
  const { partyTotal, roleCounts, listingStates, dealStates, activeSessions, auditTotal, recentAudit } =
    result.data;

  const roleTotal = (role: string) =>
    roleCounts.find((r) => r.authRole === role)?._count._all ?? 0;
  const stateTotal = (map: Array<{ [k: string]: unknown }>, key: string, field: string) =>
    (map as Array<Record<string, any>>).find((r) => r[field] === key)?._count._all ?? 0;

  const metrics = [
    { label: 'People on the platform', value: partyTotal },
    { label: 'Tenant accounts', value: roleTotal('tenant') },
    { label: 'Landlord accounts', value: roleTotal('lister') },
    { label: 'Field officers', value: roleTotal('foo') },
    { label: 'Homes live now', value: stateTotal(listingStates, 'live', 'publicationState') },
    { label: 'Awaiting verification', value: stateTotal(listingStates, 'awaiting_verification', 'publicationState') },
    { label: 'Deals in flight', value: dealStates.reduce((sum, d) => sum + d._count._all, 0) },
    { label: 'Active sessions', value: activeSessions },
  ];

  return (
    <div className="stack-lg">
      <header className="stack-sm">
        <h1 className="h1">Platform overview</h1>
        <p className="muted">
          The entire platform on one surface - every figure below is a live
          count from the operational database, not a sample.
        </p>
      </header>

      <div className="plat-stats">
        {metrics.map((m) => (
          <div key={m.label} className="plat-stat">
            <span className="plat-stat-value">{m.value.toLocaleString('en-UG')}</span>
            <span className="plat-stat-label">{m.label}</span>
          </div>
        ))}
      </div>

      <div className="plat-grid-2">
        <SectionCard title="Listings by publication state" href="/platform/listings">
          <ul className="plat-kv">
            {listingStates.length === 0 ? <li className="muted">No listings yet.</li> : null}
            {listingStates.map((s) => (
              <li key={s.publicationState}>
                <span>{humanize(s.publicationState)}</span>
                <strong>{s._count._all}</strong>
              </li>
            ))}
          </ul>
        </SectionCard>

        <SectionCard title="Deals by status" href="/platform/transactions">
          <ul className="plat-kv">
            {dealStates.length === 0 ? <li className="muted">No deals yet.</li> : null}
            {dealStates.map((s) => (
              <li key={s.status}>
                <span>{humanize(s.status)}</span>
                <strong>{s._count._all}</strong>
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>

      <SectionCard title="Latest audit activity" href="/ops/audit">
        {recentAudit.length === 0 ? (
          <p className="muted">Nothing recorded yet.</p>
        ) : (
          <ul className="plat-feed">
            {recentAudit.map((event) => (
              <li key={event.id}>
                <span className="plat-feed-when">
                  {event.occurredAt.toISOString().replace('T', ' ').slice(0, 16)} UTC
                </span>
                <span className="plat-feed-what">
                  <strong>{event.actorParty.displayName}</strong> · {humanize(event.eventType)}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="muted plat-feed-note">
          {auditTotal.toLocaleString('en-UG')} events recorded in total. The full,
          filterable trail lives in the{' '}
          <Link href="/ops/audit">staff audit view</Link>.
        </p>
      </SectionCard>
    </div>
  );
}
