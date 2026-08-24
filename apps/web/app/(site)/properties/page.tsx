import Link from 'next/link';
import { apiGet, type Neighbourhood, type SearchResponse } from '@/lib/api';
import { Empty, Icon, PropertyCard } from '@/app/ui';

export const metadata = {
  title: 'Homes to rent',
  description:
    'Verified homes to rent in Kampala and Wakiso. Every property visited in person by a House For Rent field officer.',
};

type Params = Record<string, string | string[] | undefined>;

function one(params: Params, key: string): string | undefined {
  const v = params[key];
  const s = Array.isArray(v) ? v[0] : v;
  return s && s.length > 0 ? s : undefined;
}

/**
 * The search page.
 *
 * ── Why the filters are a plain GET form ──
 * Every filter lives in the URL. That makes a search shareable, bookmarkable
 * and back-button-correct, it lets the whole page stay a server component
 * with no client JavaScript at all, and it means the filter state cannot
 * drift out of sync with what was actually fetched — because there is only
 * one copy of it.
 *
 * ── What this page does NOT decide ──
 * Not what counts as verified, not what counts as stale, not what the empty
 * state should say. All three arrive from the API, which applies the three
 * non-negotiable feed constraints (live, verified, in-corridor) regardless
 * of what any query string asks for.
 */
export default async function PropertiesPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const params = await searchParams;

  const q = one(params, 'q');
  const neighbourhoodId = one(params, 'neighbourhoodId');
  const bedrooms = one(params, 'bedrooms');
  const maxRent = one(params, 'maxRent');
  const propertyType = one(params, 'propertyType');
  const furnished = one(params, 'furnished');
  const sort = one(params, 'sort') ?? 'fresh';
  const offset = Number(one(params, 'offset') ?? 0) || 0;

  const query = new URLSearchParams();
  if (q) query.set('q', q);
  if (neighbourhoodId) query.set('neighbourhoodId', neighbourhoodId);
  if (bedrooms) query.set('bedrooms', bedrooms);
  if (maxRent) query.set('maxRent', maxRent);
  if (propertyType) query.set('propertyType', propertyType);
  if (furnished) query.set('furnished', furnished);
  query.set('sort', sort);
  query.set('limit', '24');
  if (offset > 0) query.set('offset', String(offset));

  const [feed, taxonomy] = await Promise.all([
    apiGet<SearchResponse>(`/v1/listings?${query}`, { revalidate: 30 }),
    apiGet<{ neighbourhoods: Neighbourhood[] }>('/v1/neighbourhoods', {
      revalidate: 300,
    }),
  ]);

  const areas = taxonomy.neighbourhoods.filter((n) => n.liveListingCount > 0);
  const shown = feed.offset + feed.results.length;
  const hasMore = shown < feed.totalCount;

  /** Builds a URL that keeps every current filter and changes one thing. */
  const withParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(query);
    next.delete('limit');
    next.delete('offset');
    if (value === null) next.delete(key);
    else next.set(key, value);
    const s = next.toString();
    return s ? `/properties?${s}` : '/properties';
  };

  const activeFilters = [
    q ? { key: 'q', label: `“${q}”` } : null,
    neighbourhoodId
      ? {
          key: 'neighbourhoodId',
          label: areas.find((a) => a.id === neighbourhoodId)?.name ?? 'Area',
        }
      : null,
    bedrooms ? { key: 'bedrooms', label: `${bedrooms}+ bed` } : null,
    maxRent
      ? {
          key: 'maxRent',
          label: `Up to UGX ${Number(maxRent).toLocaleString('en-GB')}`,
        }
      : null,
    propertyType ? { key: 'propertyType', label: propertyType } : null,
    furnished
      ? { key: 'furnished', label: furnished.replace(/_/g, ' ') }
      : null,
  ].filter(Boolean) as { key: string; label: string }[];

  return (
    <>
      <div className="page section" style={{ paddingBottom: '1.5rem' }}>
        <div className="stack">
          <div>
            <p className="eyebrow">Verified homes</p>
            <h1 className="h1">
              {feed.totalCount === 0
                ? 'No homes match this search'
                : `${feed.totalCount} ${feed.totalCount === 1 ? 'home' : 'homes'} available`}
            </h1>
          </div>

          <form className="filters" method="get" action="/properties">
            <div>
              <label className="label" htmlFor="f-q">
                Where
              </label>
              <input
                id="f-q"
                name="q"
                type="search"
                className="input"
                defaultValue={q ?? ''}
                placeholder="Neighbourhood or landmark"
                list="areas"
                autoComplete="off"
              />
              <datalist id="areas">
                {areas.map((a) => (
                  <option key={a.id} value={a.name} />
                ))}
              </datalist>
            </div>

            <div>
              <label className="label" htmlFor="f-beds">
                Bedrooms
              </label>
              <select
                id="f-beds"
                name="bedrooms"
                className="select"
                defaultValue={bedrooms ?? ''}
              >
                <option value="">Any</option>
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="label" htmlFor="f-rent">
                Max rent
              </label>
              <select
                id="f-rent"
                name="maxRent"
                className="select"
                defaultValue={maxRent ?? ''}
              >
                <option value="">Any</option>
                {[500000, 1000000, 1500000, 2000000, 3000000, 5000000].map(
                  (n) => (
                    <option key={n} value={n}>
                      {(n / 1000000).toFixed(n % 1000000 === 0 ? 0 : 1)}m
                    </option>
                  ),
                )}
              </select>
            </div>

            <div className="filters-wide">
              <label className="label" htmlFor="f-type">
                Type
              </label>
              <select
                id="f-type"
                name="propertyType"
                className="select"
                defaultValue={propertyType ?? ''}
              >
                <option value="">Any</option>
                <option value="apartment">Apartment</option>
                <option value="house">House</option>
                <option value="room">Single room</option>
              </select>
            </div>

            <div className="filters-wide">
              <label className="label" htmlFor="f-furn">
                Furnishing
              </label>
              <select
                id="f-furn"
                name="furnished"
                className="select"
                defaultValue={furnished ?? ''}
              >
                <option value="">Any</option>
                <option value="furnished">Furnished</option>
                <option value="semi_furnished">Part furnished</option>
                <option value="unfurnished">Unfurnished</option>
              </select>
            </div>

            <button type="submit" className="btn btn-primary">
              Apply
            </button>
          </form>

          <div className="row-between">
            <div className="chiprow">
              {activeFilters.length > 0 ? (
                <>
                  {activeFilters.map((f) => (
                    <Link
                      key={f.key}
                      href={withParam(f.key, null)}
                      className="chip chip-active"
                    >
                      {f.label}
                      <span aria-hidden="true">×</span>
                      <span className="sr-only">Remove filter</span>
                    </Link>
                  ))}
                  <Link href="/properties" className="chip">
                    Clear all
                  </Link>
                </>
              ) : null}
            </div>

            <div className="chiprow">
              <span className="faint" style={{ fontSize: '0.8125rem' }}>
                Sort
              </span>
              {(
                [
                  ['fresh', 'Recently confirmed'],
                  ['rent_asc', 'Rent: low to high'],
                  ['rent_desc', 'Rent: high to low'],
                ] as const
              ).map(([value, label]) => (
                <Link
                  key={value}
                  href={withParam('sort', value)}
                  className={sort === value ? 'chip chip-active' : 'chip'}
                >
                  {label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="page" style={{ paddingBottom: '4rem' }}>
        {feed.results.length === 0 ? (
          <Empty
            title="Nothing matches this search yet"
            action={
              <Link href="/properties" className="btn btn-secondary">
                Clear the filters
              </Link>
            }
          >
            {/* Written server-side (FR-4.4) and rendered verbatim: it
                explains that verification takes feet on the ground, which is
                a truer answer than "no results found". */}
            {feed.emptyStateMessage}
          </Empty>
        ) : (
          <>
            {feed.emptyStateMessage ? (
              <p className="notice notice-info" style={{ marginBottom: '1.5rem' }}>
                {feed.emptyStateMessage}
              </p>
            ) : null}

            <div className="grid-cards enter">
              {feed.results.map((listing, i) => (
                <PropertyCard
                  key={listing.listingId}
                  listing={listing}
                  priority={i < 3}
                />
              ))}
            </div>

            {hasMore || offset > 0 ? (
              <nav className="pager" aria-label="Pagination">
                {offset > 0 ? (
                  <Link
                    href={`/properties?${new URLSearchParams({
                      ...Object.fromEntries(query),
                      offset: String(Math.max(0, offset - 24)),
                    })}`}
                    className="btn btn-secondary"
                  >
                    Previous
                  </Link>
                ) : null}
                <span className="faint num">
                  {feed.offset + 1}–{shown} of {feed.totalCount}
                </span>
                {hasMore ? (
                  <Link
                    href={`/properties?${new URLSearchParams({
                      ...Object.fromEntries(query),
                      offset: String(offset + 24),
                    })}`}
                    className="btn btn-secondary"
                  >
                    Next
                    <Icon.arrow size={16} />
                  </Link>
                ) : null}
              </nav>
            ) : null}
          </>
        )}
      </div>
    </>
  );
}
