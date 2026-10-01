import Link from 'next/link';
import type { ListingPhoto } from '@/lib/contract';
import { mediaUrl } from '@/lib/contract';
import { apiGet, type Neighbourhood, type SearchResponse } from '@/lib/api';
import { Icon, PropertyCard, SectionHeader, TAGLINE } from '@/app/ui';

/*
 * The marketplace is rendered per request: listings, escrow figures and
 * availability change with landlord/officer actions, and prerendering at
 * build time would freeze the homepage to the build machine's database.
 * (It would also make `next build` require a live DATABASE_URL, which no
 * deployment pipeline should.)
 */
export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'House For Rent | verified homes to rent in Kampala',
  description:
    'Find your next home with ease. Every home is visited and confirmed in person by a House For Rent field officer before it reaches you. Free for tenants, in Kampala and Wakiso.',
};

/**
 * The home page.
 *
 * ── What it claims, and where each claim comes from ──
 * Every number on this page is one the API actually returned: how many
 * homes are live, how many neighbourhoods hold one. The third figure is a
 * constant of the business, not a metric: tenants are never charged a fee,
 * so the number of shillings a tenant has ever paid this platform is zero.
 * There is no "10,000 happy tenants", no "4.9 stars", no logo wall of
 * companies that have never heard of us. A trust-first product that opens
 * with invented social proof has spent its credibility on the first screen.
 *
 * ── Shape (the reference wireframe's composition, in brand) ──
 * Ink hero panel (display = the registered tagline, search, dual CTA, the
 * newest verified home) → the three-line promise → homes available now
 * with the marketplace's own type tabs → the four-step first-timer guide →
 * why this is different → the field standard (guarantee + the system's own
 * photographs) → the corridor and its real numbers → renting, explained →
 * the landlord proposition. Two reference sections are deliberately not
 * copied: testimonials would be fabricated, and a blog would be scheduled
 * content that does not exist - both slots are filled with true things
 * instead (see the field band and the guide cards).
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

  // The type tabs are the marketplace's own filters, surfaced one screen
  // earlier. They are links, not a client-side tab state - the result of
  // pressing one is the real search page with the real filter applied.
  const feedTabs = [
    { label: 'All homes', href: '/properties', current: true },
    { label: 'House', href: '/properties?propertyType=house' },
    { label: 'Apartment', href: '/properties?propertyType=apartment' },
    { label: 'Single room', href: '/properties?propertyType=room' },
  ];

  // The field band's photographs are the system's own, newest visits
  // first. The hero card already shows the lead photo of the newest
  // listing, so the stack prefers each home's second frame before reusing
  // a lead - two distinct frames when the data has them, one when it does
  // not, and an honest empty frame when it has none.
  const stackPhotos: ListingPhoto[] = [];
  if (feed.results[0]?.photos[1]) stackPhotos.push(feed.results[0].photos[1]);
  if (feed.results[1]?.photos[0]) stackPhotos.push(feed.results[1].photos[0]);
  if (stackPhotos.length === 0 && feed.results[0]?.photos[0]) {
    stackPhotos.push(feed.results[0].photos[0]);
  }

  // The reference's blog slot, filled with real content: each card links
  // to a page that genuinely answers the question it raises. There is no
  // editorial desk behind this product, so there are no posts, dates or
  // authors - and none are invented.
  const guideCards = [
    {
      tag: 'Verification',
      title: 'What “verified” actually means',
      body: 'The checks an officer completes on site before a home can go live, and what the badge does not claim.',
      href: '/how-it-works',
    },
    {
      tag: 'On a live listing',
      title: 'Reading a field report',
      body: 'Condition, fixtures, photographs, and the date availability was last confirmed. Open any home to see one.',
      href: feed.results[0]
        ? `/properties/${feed.results[0].listingId}`
        : '/properties',
    },
    {
      tag: 'Your money',
      title: 'Held until you have moved in',
      body: 'Rent and deposit sit with House For Rent until you confirm move-in; the landlord is paid after, not before.',
      href: '/how-it-works',
    },
    {
      tag: 'For landlords',
      title: 'One commission, on move-in',
      body: 'No listing fee, no monthly fee. We are paid once, when a tenant we introduced actually moves in.',
      href: '/for-landlords',
    },
  ];

  return (
    <div className="stagger">
      {/* ── hero (full-bleed ink band) ─────────────────────────────── */}
      <section className="hero-panel">
        <div className="page">
          <div className="hero">
            <div className="hero-copy stack">
              <h1 className="display">{TAGLINE}</h1>
              <p className="lede">
                We do not publish a listing until one of our field officers
                has visited the property, photographed it, and confirmed
                with the landlord that it is genuinely available. Searching,
                viewing and renting are free for tenants.
              </p>

              <form
                action="/properties"
                className="hero-search"
                role="search"
              >
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
                  list="home-areas"
                />
                {/* The same names the marketplace's own search offers - not
                    a second list that could drift from what search actually
                    knows. Only areas with live homes, for the same reason
                    the home page's picker filters to live areas. */}
                <datalist id="home-areas">
                  {areas.map((a) => (
                    <option key={a.id} value={a.name} />
                  ))}
                </datalist>
                <button type="submit" className="btn btn-primary">
                  Search homes
                </button>
              </form>

              <div className="row-between" style={{ maxWidth: '30rem' }}>
                <p className="faint" style={{ fontSize: '0.875rem' }}>
                  {feed.totalCount === 0
                    ? 'Verification is under way in the first corridor.'
                    : `${feed.totalCount} verified ${
                        feed.totalCount === 1 ? 'home' : 'homes'
                      } available right now.`}
                </p>
                <Link
                  href="/how-it-works"
                  className="btn btn-secondary btn-sm"
                >
                  How it works
                </Link>
              </div>
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
          <div>
            <strong>
              <span className="proof-icon" aria-hidden="true">
                <Icon.shield size={18} />
              </span>
              Visited in person
            </strong>
            <span>Every live home has a field report.</span>
          </div>
          <div>
            <strong>
              <span className="proof-icon" aria-hidden="true">
                <Icon.key size={18} />
              </span>
              Free for tenants
            </strong>
            <span>No search, viewing, or rental fee.</span>
          </div>
          <div>
            <strong>
              <span className="proof-icon" aria-hidden="true">
                <Icon.pin size={18} />
              </span>
              Built for Kampala
            </strong>
            <span>Local neighbourhood knowledge, not scraped listings.</span>
          </div>
        </div>
      </section>

      {/* ── the feed ─────────────────────────────────────────────────── */}
      <section className="section">
        <div className="page stack-lg">
          <SectionHeader
            title="Recently confirmed"
            size="h1"
            action={
              <Link href="/properties" className="btn btn-secondary">
                See all homes
                <Icon.arrow size={16} />
              </Link>
            }
          />

          <nav className="feed-tabs" aria-label="Browse homes by type">
            {feedTabs.map((tab) => (
              <Link
                key={tab.label}
                href={tab.href}
                className={tab.current ? 'chip chip-active' : 'chip'}
                aria-current={tab.current ? 'page' : undefined}
              >
                {tab.label}
              </Link>
            ))}
          </nav>

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
        </div>
      </section>

      {/* ── how it works ─────────────────────────────────────────────── */}
      <section className="section section-sunk">
        <div className="page">
          <div className="guide">
            <div className="guide-head stack">
              <h2 className="h1">From search to keys</h2>
              <p className="prose">
                Four steps, and a person from this company is on the ground in
                each of them. No account is needed to start looking.
              </p>
              <p>
                <Link href="/how-it-works" className="btn btn-secondary">
                  Read the detail
                </Link>
              </p>
            </div>

            <ol className="steps-rule">
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
                  Create an account, verify who you are, and request a time.
                  One of our officers meets you at the property.
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
          </div>
        </div>
      </section>

      {/* ── the promise ──────────────────────────────────────────────── */}
      <section className="section">
        <div className="page">
          <div className="stack-lg">
            <div>
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

      {/* ── the field standard (the reference's testimonial slot) ───── */}
      <section className="section">
        <div className="page stack-lg">
          <SectionHeader
            title="The guarantee behind every listing"
          />

          <div className="field-grid">
            <div className="field-photos">
              {/*
                Photographs the system itself holds, from real field visits.
                Demo fixtures are labelled on the image - a label a screenshot
                cannot crop away. With nothing live the frame says so.
              */}
              {stackPhotos.map((photo, i) => (
                <div
                  key={photo.url}
                  className={`field-photo field-photo-${String.fromCharCode(97 + i)}${
                    stackPhotos.length === 1 ? ' field-photo-solo' : ''
                  }`}
                >
                  <img
                    src={mediaUrl(photo.url)}
                    alt="Photograph taken during a House For Rent field visit"
                    loading="lazy"
                    decoding="async"
                  />
                  {photo.isDevelopmentFixture ? (
                    <span className="media-fixture">Demo image</span>
                  ) : null}
                </div>
              ))}
              {stackPhotos.length === 0 ? (
                <div className="field-photo field-photo-solo">
                  <div className="media-empty">
                    <Icon.camera size={20} />
                    <span>The first field visits are under way</span>
                  </div>
                </div>
              ) : null}
            </div>

            {/*
              The reference puts an invented client quote here. This product
              does not have invented clients, so the card carries the one
              statement a visitor can actually hold us to - and every clause
              of it is enforced by the product's own architecture.
            */}
            <div className="card field-card">
              <blockquote className="field-quote">
                If a home is live on this site, a field officer we employ has
                stood inside it, photographed it, and confirmed with the
                landlord that it is available.
              </blockquote>
              <ul className="field-checks">
                <li>
                  <Icon.shield size={16} />
                  <span>
                    Every live home carries a structured field report, filed by
                    the officer on the visit - not the landlord's word.
                  </span>
                </li>
                <li>
                  <Icon.camera size={16} />
                  <span>
                    The photographs come from that visit, and where an image is
                    a demo fixture it is labelled on the image itself.
                  </span>
                </li>
                <li>
                  <Icon.clock size={16} />
                  <span>
                    Availability is re-confirmed with the landlord, and the
                    date of that confirmation is shown on the listing.
                  </span>
                </li>
              </ul>
              <p style={{ margin: 0 }}>
                <Link href="/how-it-works" className="btn btn-primary">
                  See how we verify
                </Link>
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── the corridor: locations, in real numbers ─────────────────── */}
      <section className="section section-sunk">
        <div className="page">
          <div className="corridor">
            <div className="numbers">
              <h2 className="h2" style={{ marginBottom: '0.75rem' }}>
                Where we work
              </h2>
              <div className="num-figure">
                <strong className="num">{feed.totalCount}</strong>
                <span>
                  {feed.totalCount === 1
                    ? 'verified home live right now'
                    : 'verified homes live right now'}
                  {feed.totalCount === 0
                    ? '. The first visits are under way'
                    : ''}
                </span>
              </div>
              <div className="num-figure">
                <strong className="num">{areas.length}</strong>
                <span>
                  {areas.length === 1
                    ? 'neighbourhood currently holds one'
                    : 'neighbourhoods currently hold at least one'}{' '}
                  of those homes.
                </span>
              </div>
              <div className="num-figure">
                <strong className="num">UGX 0</strong>
                <span>
                  What a tenant has ever paid this platform. Searching, viewing
                  and renting are free; the landlord pays one commission, after
                  move-in.
                </span>
              </div>
            </div>

            <div className="corridor-note">
              <h3 className="h2">One corridor at a time</h3>
              <p className="prose">
                We verify street by street rather than everywhere at once: a
                home can only go live inside a neighbourhood we currently
                serve, and every area below has at least one officer-verified
                home in it right now. The map grows one verified neighbourhood
                at a time.
              </p>
              {areas.length > 0 ? (
                <div className="chiprow">
                  {areas.slice(0, 6).map((area) => (
                    <Link
                      key={area.id}
                      href={`/properties?neighbourhoodId=${area.id}`}
                      className="chip"
                    >
                      {area.name}
                      <span className="faint num">{area.liveListingCount}</span>
                    </Link>
                  ))}
                  <Link href="/areas" className="chip">
                    All areas
                    <Icon.arrow size={14} />
                  </Link>
                </div>
              ) : (
                <div className="chiprow">
                  <Link href="/areas" className="chip">
                    See the areas we cover
                    <Icon.arrow size={14} />
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── renting, explained (the reference's blog slot) ───────────── */}
      <section className="section">
        <div className="page stack-lg">
          <SectionHeader title="Renting, explained" />

          <div className="guide-cards">
            {guideCards.map((guide) => (
              <Link key={guide.title} href={guide.href} className="guide-card">
                <span className="guide-tag">{guide.tag}</span>
                <h3>{guide.title}</h3>
                <p>{guide.body}</p>
                <span className="guide-more">
                  Read
                  <Icon.arrow size={14} />
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── landlord cta ─────────────────────────────────────────────── */}
      <section className="section">
        <div className="page">
          <div className="cta cta-photograph">
            {/*
              The dusk skyline under an ink wash: the landlord panel keeps
              AA contrast (the wash is part of the CSS), and the photograph
              is decorative, so it is aria-hidden.
            */}
            <img
              className="cta-photo"
              src="/site/cta-band.jpg"
              alt=""
              aria-hidden="true"
              loading="lazy"
              decoding="async"
            />
            <div className="cta-grid">
              <div className="stack">
                <h2 className="h1" style={{ maxWidth: '18ch' }}>
                  Let to a tenant we have actually met.
                </h2>
                <p className="lede">
                  We verify your property, verify the tenant, hold the money in
                  escrow, and take one commission once, only when someone
                  moves in. No monthly fee, no listing fee, nothing up front.
                </p>
                <div className="row">
                  <Link
                    href="/register?role=lister"
                    className="btn btn-primary btn-lg"
                  >
                    List your property
                  </Link>
                  <Link
                    href="/for-landlords"
                    className="btn btn-secondary btn-lg"
                  >
                    How we work with landlords
                  </Link>
                </div>
              </div>

              <ol className="cta-steps" aria-label="What letting through us looks like">
                <li>
                  <h3 className="h3">Tell us about the home</h3>
                  <p>
                    You describe it; the photographs are taken by the officer
                    who comes to verify it.
                  </p>
                </li>
                <li>
                  <h3 className="h3">We verify, then we let it</h3>
                  <p>
                    A field officer confirms the property matches what you
                    listed, and conducts every viewing with the tenant.
                  </p>
                </li>
                <li>
                  <h3 className="h3">One commission, on move-in</h3>
                  <p>
                    We are paid once, when a tenant we introduced actually
                    moves in. Nothing before that.
                  </p>
                </li>
              </ol>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
