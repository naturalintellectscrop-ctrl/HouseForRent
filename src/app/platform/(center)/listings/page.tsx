import { db } from '@/lib/db';
import { DegradedPanel, PlatPageHead, SectionCard, loadPlatformData, fmtUGX } from '../data';

/** Publication states carry their own word and their own tone. */
const PUB_PILL: Record<string, string> = {
  live: 'plat-pill plat-pill-ok',
  draft: 'plat-pill plat-pill-idle',
  rented: 'plat-pill',
  withdrawn: 'plat-pill plat-pill-idle',
};

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
      <PlatPageHead
        eyebrow="Supply"
        title="Listings"
        lede="Every home on the platform and where it sits in the pipeline - from draft to live to rented."
      />

      <div className="plat-grid-2">
        <SectionCard title="By publication state" eyebrow="Pipeline">
          <ul className="plat-kv">
            {publicationStates.map((s) => (
              <li key={s.publicationState}>
                <span>{s.publicationState.replace(/_/g, ' ')}</span>
                <strong>{s._count._all.toLocaleString('en-UG')}</strong>
              </li>
            ))}
          </ul>
        </SectionCard>

        <SectionCard title="By verification state" eyebrow="Field work">
          <ul className="plat-kv">
            {verificationStates.map((s) => (
              <li key={s.verificationState}>
                <span>{s.verificationState.replace(/_/g, ' ')}</span>
                <strong>{s._count._all.toLocaleString('en-UG')}</strong>
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>

      <SectionCard title="Most recent listings" count={recent.length}>
        <div className="plat-table-wrap">
          <table className="plat-table">
            <thead>
              <tr>
                <th scope="col">Home</th>
                <th scope="col">Area</th>
                <th scope="col" className="is-num">Monthly rent</th>
                <th scope="col">State</th>
                <th scope="col" className="is-num">Created</th>
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
                    <span className="plat-table-main">
                      <span className="plat-name">
                        {l.property.bedrooms} bed {l.property.propertyType}
                      </span>
                      <span className="plat-sub">{l.property.landmarkText}</span>
                    </span>
                  </td>
                  <td>{l.property.neighbourhood.name}</td>
                  <td className="is-num">{fmtUGX(l.monthlyRent)}</td>
                  <td>
                    <span className={PUB_PILL[l.publicationState] ?? 'plat-pill'}>
                      {l.publicationState.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="is-num plat-table-muted">{l.createdAt.toISOString().slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}
