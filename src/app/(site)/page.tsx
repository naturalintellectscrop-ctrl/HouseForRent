import Link from 'next/link';
import { apiGet, type Neighbourhood, type SearchResponse } from '@/lib/api';
import { Icon, PropertyCard } from '@/app/ui';

export const metadata = {
  title: 'House For Rent — verified homes to rent in Kampala',
  description:
    'Every home is visited and confirmed in person by a House For Rent field officer before it reaches you. Free for tenants, in Kampala and Wakiso.',
};

/**
 * The home page.
 *
 * ── What it does and does not claim ──
 * Every number on this page is one the API actually returned: how many
 * homes are live, how many neighbourhoods are in the service corridor. There
 * is no "10,000 happy tenants", no "4.9 stars", no logo wall of companies
 * that have never heard of us. A trust-first product that opens with
 * invented social proof has spent its credibility on the first screen.
 *
 * If the corridor is thin, the page says so and explains why — verification
 * takes an officer on a boda, and a short list of homes somebody actually
 * stood inside is the product, not an embarrassment.
 */
export default async function HomePage() {
  const [feed, taxonomy] = await Promise.all([
    apiGet<SearchResponse>('/v1/listings?limit=6&sort=fresh', {
      revalidate: 60,
    }),
    apiGet<{ neighbourhoods: Neighbourhood[] }>('/v1/neighbourhoods', {
      revalidate: 300,
    }),
  ]);

  // Only areas that currently have something to show. A picker offering
  // eight empty neighbourhoods is a worse first impression than one
  // offering three real ones.
  const areas = taxonomy.neighbourhoods
    .filter((n) => n.liveListingCount > 0)
    .sort((a, b) => b.liveListingCount - a.liveListingCount);

  return (
    <>
      {/* ── hero ─────────────────────────────────────────────────────── */}
      <section className="section-lg">
        <div className="page">
          <div className="hero">
            <div className="hero-copy stack">
              <p className="eyebrow">Kampala &amp; Wakiso</p>
              <h1 className="display">
                Every home here has been stood inside by someone who works for
                us.
              </h1>
              <p className="lede">
                We do not publish a listing until one of our field officers has
                visited the property, photographed it, and confirmed with the
                landlord that it is genuinely available. Searching, viewing and
                renting are free for tenants.
              </p>

              <form action="/properties" className="hero-search" role="search">
                <label className="sr-only" htmlFor="q">
                  Search by neighbourhood or landmark
                </label>
                <input
                  id="q"
                  name="q"
                  type="search"
                  className="input"
                  placeholder="Ntinda, Kira, Bugolobi…"
                  autoComplete="off"
                />
                <button type="submit" className="btn btn-primary">
                  Search homes
                </button>
              </form>

              <p className="faint" style={{ fontSize: '0.875rem' }}>
                {feed.totalCount === 0
                  ? 'Verification is under way in the first corridor.'
                  : `${feed.totalCount} verified ${
                      feed.totalCount === 1 ? 'home' : 'homes'
                    } available right now across ${areas.length} ${
                      areas.length === 1 ? 'neighbourhood' : 'neighbourhoods'
                    }.`}
              </p>
            </div>

            {/*
              The hero image is the newest verified listing, not a stock
              photograph. If there is nothing live, the frame is honest about
              that rather than borrowing somebody else's house.
            */}
            <div className="hero-media">
              {feed.results[0] ? (
                <PropertyCard listing={feed.results[0]} priority />
              ) : (
                <div className="card">
                  <p className="h3">Nothing live yet</p>
                  <p className="muted" style={{ marginTop: '0.5rem' }}>
                    The first properties are being verified on the ground.
                    Nothing appears here until an officer has been.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="proof-strip" aria-label="House For Rent promise">
        <div className="page proof-grid">
          <div><strong>Visited in person</strong><span>Every live home has a field report.</span></div>
          <div><strong>Free for tenants</strong><span>No search, viewing, or rental fee.</span></div>
          <div><strong>Built for Kampala</strong><span>Local neighbourhood knowledge, not scraped listings.</span></div>
        </div>
      </section>

      {/* ── the promise ──────────────────────────────────────────────── */}
      <section className="section section-sunk">
        <div className="page">
          <div className="stack-lg">
            <div>
              <p className="eyebrow">Why this is different</p>
              <h2 className="h1" style={{ maxWidth: '20ch' }}>
                The listing is not the product. The visit is.
              </h2>
            </div>

            <div className="promise-grid">
              <div className="stack-sm">
                <Icon.shield size={24} />
                <h3 className="h3">Visited before it is published</h3>
                <p className="muted">
                  A field officer goes to the property, records a structured
                  report on its condition, and confirms it matches the listing.
                  Nothing goes live on our word alone.
                </p>
              </div>
              <div className="stack-sm">
                <Icon.clock size={24} />
                <h3 className="h3">Availability with a date on it</h3>
                <p className="muted">
                  Each home shows when we last confirmed it was still free. Once
                  that confirmation goes stale, the listing drops out of search
                  rather than wasting your Saturday.
                </p>
              </div>
              <div className="stack-sm">
                <Icon.lock size={24} />
                <h3 className="h3">Money held, not handed over</h3>
                <p className="muted">
                  Rent and deposit are held by House For Rent until you have
                  moved in. The landlord is paid after that, not before.
                </p>
              </div>
              <div className="stack-sm">
                <Icon.key size={24} />
                <h3 className="h3">Free for tenants</h3>
                <p className="muted">
                  We are paid once, by the landlord, and only when someone
                  actually moves in. You are never charged to search, to view,
                  or to rent.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── the feed ─────────────────────────────────────────────────── */}
      <section className="section">
        <div className="page stack-lg">
          <div className="row-between">
            <div>
              <p className="eyebrow">Available now</p>
              <h2 className="h1">Recently confirmed</h2>
            </div>
            <Link href="/properties" className="btn btn-secondary">
              See all homes
              <Icon.arrow size={16} />
            </Link>
          </div>

          {feed.results.length === 0 ? (
            <div className="empty">
              <p className="empty-title">Nothing is live in the corridor yet</p>
              <p>{feed.emptyStateMessage}</p>
            </div>
          ) : (
            <div className="grid-cards">
              {feed.results.map((listing, i) => (
                <PropertyCard
                  key={listing.listingId}
                  listing={listing}
                  priority={i < 3}
                />
              ))}
            </div>
          )}

          {areas.length > 0 ? (
            <div className="chiprow">
              <span className="faint" style={{ fontSize: '0.875rem' }}>
                Browse by area:
              </span>
              {areas.slice(0, 8).map((area) => (
                <Link
                  key={area.id}
                  href={`/properties?neighbourhoodId=${area.id}`}
                  className="chip"
                >
                  {area.name}
                  <span className="faint num">{area.liveListingCount}</span>
                </Link>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      {/* ── how it works ─────────────────────────────────────────────── */}
      <section className="section section-sunk">
        <div className="page stack-lg">
          <div>
            <p className="eyebrow">How it works</p>
            <h2 className="h1">From search to keys</h2>
          </div>

          <ol className="steps steps-across">
            <li>
              <h3 className="h3">Find a home</h3>
              <p>
                Browse verified listings and see when each was last confirmed
                available. No account needed to look.
              </p>
            </li>
            <li>
              <h3 className="h3">Ask for a viewing</h3>
              <p>
                Create an account, verify who you are, and request a time. One
                of our officers meets you at the property.
              </p>
            </li>
            <li>
              <h3 className="h3">Agree the terms</h3>
              <p>
                If you want it, we record the introduction and set up the
                agreement with the landlord in writing.
              </p>
            </li>
            <li>
              <h3 className="h3">Move in, then we pay out</h3>
              <p>
                Your rent and deposit sit with us until you confirm you have
                moved in. Only then is the landlord paid.
              </p>
            </li>
          </ol>

          <div className="row">
            <Link href="/how-it-works" className="btn btn-secondary">
              Read the detail
            </Link>
          </div>
        </div>
      </section>

      {/* ── landlord cta ─────────────────────────────────────────────── */}
      <section className="section">
        <div className="page">
          <div className="cta">
            <div className="stack">
              <p className="eyebrow">For landlords</p>
              <h2 className="h1" style={{ maxWidth: '18ch' }}>
                Let to a tenant we have actually met.
              </h2>
              <p className="lede">
                We verify your property, verify the tenant, hold the money in
                escrow, and take one commission once — only when someone moves
                in. No monthly fee, no listing fee, nothing up front.
              </p>
              <div className="row">
                <Link href="/register?role=lister" className="btn btn-primary btn-lg">
                  List your property
                </Link>
                <Link href="/for-landlords" className="btn btn-secondary btn-lg">
                  How we work with landlords
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
