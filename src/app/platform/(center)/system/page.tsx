import { db } from '@/lib/db';
import { DegradedPanel, PlatPageHead, SectionCard, loadPlatformData } from '../data';

/**
 * System status: is the database reachable, how many sessions are alive,
 * what the current platform configuration is. The freshness figure matters
 * because availability carries a date in this product - a stale listing
 * leaves search by design, so "how fresh is the freshest confirmation" is a
 * real operational signal, not vanity.
 */
export default async function PlatformSystemPage() {
  const result = await loadPlatformData(async () => {
    const startedAt = Date.now();
    await db.$queryRaw`SELECT 1`;
    const dbLatencyMs = Date.now() - startedAt;

    const [activeSessions, totalSessions, latestRate, latestConfig, freshestListing] =
      await Promise.all([
        db.session.count({ where: { revokedAt: null, expiresAt: { gt: new Date() } } }),
        db.session.count(),
        db.commissionRateVersion.findFirst({ orderBy: { effectiveFrom: 'desc' } }),
        db.configVersion.findMany({
          take: 5,
          orderBy: { effectiveFrom: 'desc' },
          include: { parameter: { select: { key: true } } },
        }),
        db.listing.findFirst({
          orderBy: { availabilityConfirmedAt: 'desc' },
          select: { availabilityConfirmedAt: true },
        }),
      ]);
    return { dbLatencyMs, activeSessions, totalSessions, latestRate, latestConfig, freshestListing };
  });

  if (!result.ok) {
    return <DegradedPanel title="System status unavailable" />;
  }
  const { dbLatencyMs, activeSessions, totalSessions, latestRate, latestConfig, freshestListing } =
    result.data;

  return (
    <div className="stack-lg">
      <PlatPageHead
        eyebrow="Platform health"
        title="System"
        lede="Platform plumbing and configuration - the things that are either true or false, never opinions."
      />

      <div className="plat-stats">
        <div className="plat-stat">
          <span className="plat-stat-value">{dbLatencyMs} ms</span>
          <span className="plat-stat-label">Database round-trip</span>
        </div>
        <div className="plat-stat">
          <span className="plat-stat-value">{activeSessions.toLocaleString('en-UG')}</span>
          <span className="plat-stat-label">Active sessions</span>
        </div>
        <div className="plat-stat">
          <span className="plat-stat-value">{totalSessions.toLocaleString('en-UG')}</span>
          <span className="plat-stat-label">Sessions since launch</span>
        </div>
      </div>

      <div className="plat-grid-2">
        <SectionCard title="Current commission rate" eyebrow="Money">
          {latestRate ? (
            <p className="prose">
              <strong>{latestRate.rateBpOfMonth.toLocaleString('en-UG')} bp</strong> of one
              month&rsquo;s rent ({Math.round(latestRate.rateBpOfMonth / 100)}%), effective{' '}
              {latestRate.effectiveFrom.toISOString().slice(0, 10)}.
              {latestRate.note ? <> Note: {latestRate.note}</> : null}
            </p>
          ) : (
            <p className="muted">No commission rate versioned yet.</p>
          )}
          <p className="muted plat-feed-note">
            In-flight deals hold a snapshot of the rate at signing, so this
            value never retroactively touches live money.
          </p>
        </SectionCard>

        <SectionCard title="Listing freshness" eyebrow="Availability">
          {freshestListing?.availabilityConfirmedAt ? (
            <p className="prose">
              Freshest availability confirmation:{' '}
              <strong>
                {freshestListing.availabilityConfirmedAt.toISOString().replace('T', ' ').slice(0, 16)} UTC
              </strong>
              . Availability carries a date; stale confirmations leave search
              by design.
            </p>
          ) : (
            <p className="muted">No availability confirmed yet.</p>
          )}
        </SectionCard>
      </div>

      <SectionCard
        title="Platform configuration (latest versions)"
        eyebrow="Immutable by version"
        href="/ops/config"
        count={latestConfig.length}
      >
        <div className="plat-table-wrap">
          <table className="plat-table">
            <thead>
              <tr>
                <th scope="col">Parameter</th>
                <th scope="col">Value</th>
                <th scope="col" className="is-num">Effective from</th>
              </tr>
            </thead>
            <tbody>
              {latestConfig.length === 0 ? (
                <tr>
                  <td colSpan={3} className="muted">
                    No configuration versions yet.
                  </td>
                </tr>
              ) : null}
              {latestConfig.map((v) => (
                <tr key={v.id}>
                  <td>
                    <code className="plat-code">{v.parameter.key}</code>
                  </td>
                  <td>
                    <code className="plat-code">{JSON.stringify(v.value).slice(0, 80)}</code>
                  </td>
                  <td className="is-num plat-table-muted">{v.effectiveFrom.toISOString().slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted plat-feed-note">
          Configuration is immutable-by-version: a change creates a new row,
          never an edit. Operate it from the staff console&rsquo;s config view.
        </p>
      </SectionCard>
    </div>
  );
}
