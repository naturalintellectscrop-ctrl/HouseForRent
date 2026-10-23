import { db } from '@/lib/db';
import { DegradedPanel, SectionCard, loadPlatformData, fmtUGX } from '../data';

/**
 * The supply side of the platform: what homes exist, in what publication
 * state, and what the most recent ones are. Live listings are the product's
 * entire inventory, so the state distribution is the honest health metric.
 */
export default async function PlatformListingsPage() {
  const result = await loadPlatformData(async () => {
    const [publicationStates, verificationStates, recent] = await Promise.all([
      db.listing.groupBy({ by: ['publicationState'], _count: { _all: true } }),
      db.listing.groupBy({ by: ['verificationState'], _count: { _all: true } }),
      db.listing.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: {
          property: {
            select: {
              propertyType: true,
              bedrooms: true,
              landmarkText: true,
              neighbourhood: { select: { name: true } },
            },
          },
        },
      }),
    ]);
    return { publicationStates, verificationStates, recent };
  });

  if (!result.ok) {
    return <DegradedPanel title="Listings overview unavailable" />;
  }
  const { publicationStates, verificationStates, recent } = result.data;

  return (
    <div className="stack-lg">
      <header className="stack-sm">
        <h1 className="h1">Listings</h1>
        <p className="muted">
          Every home on the platform and where it sits in the pipeline - from
          draft to live to rented.
        </p>
      </header>

      <div className="plat-grid-2">
        <SectionCard title="By publication state">
          <ul className="plat-kv">
            {publicationStates.map((s) => (
              <li key={s.publicationState}>
                <span>{s.publicationState.replace(/_/g, ' ')}</span>
                <strong>{s._count._all}</strong>
              </li>
            ))}
          </ul>
        </SectionCard>

        <SectionCard title="By verification state">
          <ul className="plat-kv">
            {verificationStates.map((s) => (
              <li key={s.verificationState}>
                <span>{s.verificationState.replace(/_/g, ' ')}</span>
                <strong>{s._count._all}</strong>
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>

      <SectionCard title="Most recent listings">
        <div className="plat-table-wrap">
          <table className="plat-table">
            <thead>
              <tr>
                <th scope="col">Home</th>
                <th scope="col">Area</th>
                <th scope="col">Monthly rent</th>
                <th scope="col">State</th>
                <th scope="col">Created</th>
              </tr>
            </thead>
            <tbody>
              {recent.length === 0 ? (
                <tr>
                  <td colSpan={5} className="muted">
                    No listings yet.
                  </td>
                </tr>
              ) : null}
              {recent.map((l) => (
                <tr key={l.id}>
                  <td>
                    {l.property.propertyType} · {l.property.bedrooms} bed ·{' '}
                    {l.property.landmarkText}
                  </td>
                  <td>{l.property.neighbourhood.name}</td>
                  <td>{fmtUGX(l.monthlyRent)}</td>
                  <td>{l.publicationState.replace(/_/g, ' ')}</td>
                  <td>{l.createdAt.toISOString().slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}
