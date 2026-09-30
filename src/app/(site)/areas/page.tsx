import Link from 'next/link';
import { apiGet, type Neighbourhood } from '@/lib/api';
import { Empty, Icon, PageIntro } from '@/app/ui';

/* Service-area coverage changes when ops edits neighbourhoods - render per request. */
export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Areas we cover',
  description:
    'The neighbourhoods House For Rent currently covers in Kampala and Wakiso, and how many verified homes each has right now.',
};

/**
 * The service-area directory.
 *
 * ── Why this page exists ──
 * "Where do you operate?" is the first question a landlord asks and the
 * second question a tenant asks. This page answers it with the same counts
 * the search API serves - nothing is hand-written here, so it cannot drift
 * from what a search actually returns.
 *
 * ── Why zero-count areas stay visible ──
 * Unlike the home page (which shows only areas that currently have homes),
 * this directory shows every in-service area, because the honest answer
 * "we cover Mukono, but have nothing verified there yet" is exactly the
 * answer both audiences need: it tells a landlord there is demand we can
 * verify into, and it tells a tenant the truth instead of a silent gap.
 */
export default async function AreasPage() {
  const taxonomy = await apiGet<{ neighbourhoods: Neighbourhood[] }>(
    '/v1/neighbourhoods',
    { revalidate: 300 },
  );

  const districts = new Map<string, Neighbourhood[]>();
  for (const n of taxonomy.neighbourhoods) {
    // Taxonomy marks district optional; the parent name is the same string
    // in this deployment, and the fallback keeps an area without either
    // visible under an honest label rather than dropped.
    const districtName = n.district || n.parentName || 'Other areas';
    const list = districts.get(districtName) ?? [];
    list.push(n);
    districts.set(districtName, list);
  }
  const sortedDistricts = [...districts.entries()].sort((a, b) =>
    a[0].localeCompare(b[0]),
  );

  const totalLive = taxonomy.neighbourhoods.reduce(
    (sum, n) => sum + n.liveListingCount,
    0,
  );

  return (
    <>
      <div className="page section" style={{ paddingBottom: '2rem' }}>
        <div className="stack">
          <PageIntro title="Areas we cover">
            <p className="lede" style={{ maxWidth: '46rem' }}>
              Every neighbourhood our field officers work in. The number next
              to each area is how many verified homes are live there right
              now - the same count search uses, not a figure we wrote by hand.
            </p>
          </PageIntro>
          <p className="faint" style={{ fontSize: '0.875rem' }}>
            {totalLive === 0
              ? 'No verified homes anywhere yet - the first visits are being scheduled.'
              : `${totalLive} verified ${totalLive === 1 ? 'home' : 'homes'} across ${taxonomy.neighbourhoods.length} ${
                  taxonomy.neighbourhoods.length === 1 ? 'area' : 'areas'
                }.`}
          </p>
        </div>
      </div>

      <div className="page" style={{ paddingBottom: '4rem' }}>
        {sortedDistricts.length === 0 ? (
          <Empty
            title="No service areas yet"
            action={
              <Link href="/properties" className="btn btn-secondary">
                Browse all homes
              </Link>
            }
          >
            We are setting up the first corridor. When an area enters service,
            it appears here.
          </Empty>
        ) : (
          <div className="stack-lg">
            {sortedDistricts.map(([district, areas]) => (
              <section key={district} className="stack">
                <h2 className="h2">{district}</h2>
                <ul className="area-grid">
                  {areas
                    .slice()
                    .sort((a, b) => b.liveListingCount - a.liveListingCount)
                    .map((area) => (
                      <li key={area.id}>
                        <Link
                          href={`/properties?neighbourhoodId=${area.id}`}
                          className={`area-card${area.liveListingCount === 0 ? ' area-card-empty' : ''}`}
                        >
                          <span className="row" style={{ gap: '0.45rem' }}>
                            <Icon.pin size={16} />
                            <strong>{area.name}</strong>
                          </span>
                          {area.liveListingCount > 0 ? (
                            <span className="num area-count">
                              {area.liveListingCount}{' '}
                              {area.liveListingCount === 1 ? 'home' : 'homes'}{' '}
                              verified
                            </span>
                          ) : (
                            <span className="muted area-count">
                              No verified homes here yet
                            </span>
                          )}
                        </Link>
                      </li>
                    ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
