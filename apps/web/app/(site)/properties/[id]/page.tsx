import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ApiError, apiGet, type ListingDetail } from '@/lib/api';
import {
  daysAgo,
  FURNISHED_LABEL,
  Icon,
  onDay,
  PropertyMedia,
  shillings,
  TYPE_LABEL,
} from '@/app/ui';
import { currentRole, isSignedIn } from '@/lib/session';

const CONDITION_LABEL: Record<string, string> = {
  excellent: 'Excellent',
  good: 'Good',
  fair: 'Fair',
  poor: 'Poor',
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  try {
    const l = await apiGet<ListingDetail>(`/v1/listings/${id}`, {
      revalidate: 60,
    });
    return {
      title: `${l.bedrooms}-bedroom ${TYPE_LABEL[l.propertyType]?.toLowerCase() ?? 'home'} in ${l.neighbourhoodName}`,
      description: `${shillings(l.monthlyRent)} a month. ${l.landmarkText}. Verified in person by a House For Rent field officer.`,
    };
  } catch {
    return { title: 'Home not found' };
  }
}

/**
 * One property.
 *
 * ── The evidence is the page ──
 * Price and bedrooms are what every listing site shows. What distinguishes
 * this one is the block headed "What our officer found": a structured field
 * report, filed by the person who went, with a date on it. That is the
 * reason to trust the rest of the page, so it sits above the fold on the
 * aside rather than buried under the description.
 *
 * ── Nothing here is computed ──
 * `expectedUpfront` arrives from the API, derived from the same listing
 * terms that `fund-escrow` derives its authoritative figure from (F-012).
 * This page displays it. Multiplying rent by months here would put a second
 * copy of the number a tenant is about to pay on the least trustworthy side
 * of the boundary.
 */
export default async function PropertyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let listing: ListingDetail;
  try {
    listing = await apiGet<ListingDetail>(`/v1/listings/${id}`, {
      revalidate: 30,
    });
  } catch (err) {
    // The API returns 404 for anything outside the public feed —
    // unverified, withdrawn or out of corridor — rather than 403, which
    // would confirm that an unpublished address exists.
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  const signedIn = await isSignedIn();
  const role = await currentRole();
  const confirmed = daysAgo(listing.daysSinceConfirmed);
  const heroPhotos = listing.photos.slice(0, 3);
  const isFixture = listing.photos.some((p) => p.isDevelopmentFixture);

  const viewingHref = signedIn
    ? `/account/viewings/new?listingId=${listing.listingId}`
    : `/register?role=tenant&next=${encodeURIComponent(
        `/account/viewings/new?listingId=${listing.listingId}`,
      )}`;

  return (
    <div className="page section">
      <p style={{ marginBottom: '1.25rem' }}>
        <Link href="/properties" className="btn btn-ghost btn-sm">
          ← All homes
        </Link>
      </p>

      <div
        className={
          heroPhotos.length > 1 ? 'gallery gallery-multi' : 'gallery'
        }
      >
        {heroPhotos.length > 0 ? (
          heroPhotos.map((photo, i) => (
            <PropertyMedia
              key={photo.id}
              photo={photo}
              alt={
                photo.caption ??
                `${TYPE_LABEL[listing.propertyType] ?? 'Home'} in ${listing.neighbourhoodName}`
              }
              priority={i === 0}
            />
          ))
        ) : (
          <PropertyMedia alt="" />
        )}
      </div>

      {isFixture ? (
        <p
          className="notice notice-warn"
          style={{ marginTop: '0.75rem' }}
          role="note"
        >
          The images on this listing are generated development fixtures, not
          photographs of a real property. Live listings carry photography taken
          by the field officer who visited.
        </p>
      ) : null}

      <div className="detail-grid" style={{ marginTop: '2.5rem' }}>
        <div className="stack-lg">
          <header className="stack-sm">
            <div className="row">
              {listing.isVerified ? (
                <span className="badge badge-ok">
                  <Icon.check size={12} />
                  Verified in person
                </span>
              ) : null}
              {listing.isStale ? (
                <span className="badge badge-warn">
                  Availability not recently confirmed
                </span>
              ) : null}
              <span className="badge">{TYPE_LABEL[listing.propertyType]}</span>
            </div>

            <h1 className="h1">
              {listing.bedrooms}-bedroom{' '}
              {(TYPE_LABEL[listing.propertyType] ?? 'home').toLowerCase()} in{' '}
              {listing.neighbourhoodName}
            </h1>

            <p className="row" style={{ color: 'var(--ink-soft)', gap: '0.4rem' }}>
              <Icon.pin size={16} />
              {listing.landmarkText}
            </p>
          </header>

          <dl className="spec">
            <div>
              <dt>Bedrooms</dt>
              <dd className="num">{listing.bedrooms}</dd>
            </div>
            <div>
              <dt>Bathrooms</dt>
              <dd className="num">{listing.bathrooms}</dd>
            </div>
            <div>
              <dt>Furnishing</dt>
              <dd>{FURNISHED_LABEL[listing.furnished] ?? listing.furnished}</dd>
            </div>
            <div>
              <dt>Available</dt>
              <dd>{confirmed ? `Confirmed ${confirmed}` : 'Not confirmed'}</dd>
            </div>
          </dl>

          {listing.descriptionText ? (
            <section className="stack">
              <h2 className="h2">About this home</h2>
              <div className="prose">
                <p>{listing.descriptionText}</p>
              </div>
            </section>
          ) : null}

          {listing.amenities.length > 0 ? (
            <section className="stack">
              <h2 className="h2">Amenities</h2>
              <div className="chiprow">
                {listing.amenities.map((a) => (
                  <span key={a.id} className="chip">
                    {a.name}
                  </span>
                ))}
              </div>
            </section>
          ) : null}

          <section className="stack">
            <h2 className="h2">Where it is</h2>
            <div className="prose">
              <p>
                {listing.landmarkText}, {listing.neighbourhoodName}.
              </p>
              <p>
                {/* FR-2.2: location is taxonomy-and-landmark first. A street
                    address is optional and is never required of a landlord,
                    because most properties in this corridor do not usefully
                    have one. */}
                We describe location by neighbourhood and landmark rather than
                by street address — that is how people here actually give
                directions. Your officer will meet you at the property and take
                you the last part of the way.
              </p>
            </div>
            <p>
              <Link
                href={`/properties?neighbourhoodId=${listing.neighbourhoodId}`}
                className="btn btn-secondary btn-sm"
              >
                See other homes in {listing.neighbourhoodName}
              </Link>
            </p>
          </section>
        </div>

        {/* ── the aside: terms, evidence, action ───────────────────── */}
        <aside className="detail-aside stack">
          <div className="card stack">
            <div>
              <p className="pcard-price num" style={{ fontSize: '1.6rem' }}>
                {shillings(listing.monthlyRent)} <span>/ month</span>
              </p>
            </div>

            <dl className="terms">
              <div className="terms-row">
                <dt>Deposit</dt>
                <dd className="num">{shillings(listing.depositAmount)}</dd>
              </div>
              <div className="terms-row">
                <dt>Months payable upfront</dt>
                <dd className="num">{listing.requiredMonthsUpfront}</dd>
              </div>
              <div className="terms-row terms-total">
                <dt>Held in escrow at agreement</dt>
                <dd className="num">{shillings(listing.expectedUpfront)}</dd>
              </div>
            </dl>

            <p className="hint">
              {/* The figure above is the server's, not this page's. */}
              House For Rent holds this amount until you confirm you have moved
              in. The landlord is paid after that.
            </p>

            {role === 'lister' || role === 'foo' || role === 'admin' ? (
              <p className="notice notice-info">
                You are signed in as{' '}
                {role === 'lister' ? 'a landlord' : 'staff'}. Viewings are
                requested from a tenant account.
              </p>
            ) : (
              <Link href={viewingHref} className="btn btn-primary btn-lg btn-block">
                Request a viewing
              </Link>
            )}

            <p className="hint" style={{ textAlign: 'center' }}>
              Free for tenants. You are never charged to view or to rent.
            </p>
          </div>

          {/* ── what the officer found ─────────────────────────────── */}
          {listing.fieldConfirmed ? (
            <div className="trust">
              <h3 className="row" style={{ gap: '0.4rem' }}>
                <Icon.shield size={16} />
                What our officer found
              </h3>
              <ul className="trust-list">
                <li>
                  <Icon.check size={14} />
                  <span>
                    Condition:{' '}
                    <strong>
                      {CONDITION_LABEL[listing.fieldConfirmed.conditionRating]}
                    </strong>
                  </span>
                </li>
                <li>
                  <Icon.check size={14} />
                  <span>
                    {listing.fieldConfirmed.matchesListing
                      ? 'The property matches this listing'
                      : 'Differences from the listing were recorded'}
                  </span>
                </li>
                <li>
                  <Icon.check size={14} />
                  <span>
                    {listing.fieldConfirmed.isAvailable
                      ? 'Confirmed available with the landlord'
                      : 'Not available at the time of the visit'}
                  </span>
                </li>
                <li>
                  <Icon.clock size={14} />
                  <span>
                    Visited {onDay(listing.fieldConfirmed.reportedAt)}
                  </span>
                </li>
              </ul>
            </div>
          ) : (
            <div className="card">
              <h3 className="h3">Verification</h3>
              <p className="muted" style={{ marginTop: '0.4rem' }}>
                This listing has passed field verification. The detailed report
                from that visit is not published on this page.
              </p>
            </div>
          )}

          <div className="card">
            <h3 className="h3">How the money works</h3>
            <ul className="trust-list" style={{ marginTop: '0.6rem' }}>
              <li>
                <Icon.lock size={14} />
                <span>Rent and deposit are held by us, not sent onward.</span>
              </li>
              <li>
                <Icon.key size={14} />
                <span>Released to the landlord after you move in.</span>
              </li>
              <li>
                <Icon.check size={14} />
                <span>
                  Our commission is paid by the landlord, once, and only on a
                  completed move-in.
                </span>
              </li>
            </ul>
            <p style={{ marginTop: '0.75rem' }}>
              <Link href="/how-it-works" className="btn btn-ghost btn-sm">
                Read the full process →
              </Link>
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
