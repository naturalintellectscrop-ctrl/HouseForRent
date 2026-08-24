import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { api, ApiError, apiGet, type ListingDetail } from '@/lib/api';
import type { IdentityStatus } from '@/lib/portal';
import { Icon, PropertyMedia, shillings, TYPE_LABEL } from '@/app/ui';
import { RequestViewingForm } from './request-form';

export const metadata = { title: 'Request a viewing' };

/**
 * Request a viewing for one listing.
 *
 * ── Identity is checked here as a COURTESY, not as the gate ──
 * `POST /v1/viewings` refuses an unverified tenant with 422
 * TENANT_NOT_VERIFIED whatever this page does. Checking first only means
 * someone is sent to the verification step instead of filling in a form that
 * was always going to be rejected. Removing this check would change nothing
 * about what is possible.
 */
export default async function NewViewingPage({
  searchParams,
}: {
  searchParams: Promise<{ listingId?: string }>;
}) {
  const { listingId } = await searchParams;
  if (!listingId) redirect('/properties');

  let listing: ListingDetail;
  try {
    listing = await apiGet<ListingDetail>(`/v1/listings/${listingId}`, {
      revalidate: 0,
    });
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  const identity = await api<IdentityStatus>('/v1/identity/me').catch(
    () => null,
  );

  if (identity && !identity.identityVerified) {
    return (
      <div className="stack-lg" style={{ maxWidth: '38rem' }}>
        <div className="stack">
          <h1 className="h1">One step first</h1>
          <p className="lede">
            We verify who you are before you meet a landlord. Once that is
            done, come straight back and book this viewing.
          </p>
        </div>
        <div className="row">
          <Link href="/account/identity" className="btn btn-primary btn-lg">
            Verify my identity
          </Link>
          <Link
            href={`/properties/${listingId}`}
            className="btn btn-secondary btn-lg"
          >
            Back to the property
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="detail-grid">
      <div className="stack-lg" style={{ maxWidth: '34rem' }}>
        <div className="stack">
          <p>
            <Link href={`/properties/${listingId}`} className="btn btn-ghost btn-sm">
              ← Back to the property
            </Link>
          </p>
          <h1 className="h1">Request a viewing</h1>
          <p className="lede">
            Tell us when suits you. Our operations desk assigns a field officer
            and confirms the time — you will not be sent an address and left to
            it.
          </p>
        </div>

        <RequestViewingForm listingId={listingId} />

        <div className="card stack-sm">
          <h2 className="h3">What happens after you ask</h2>
          <ul className="trust-list">
            <li>
              <Icon.clock size={14} />
              <span>
                Operations assigns an officer and confirms the slot with you.
              </span>
            </li>
            <li>
              <Icon.pin size={14} />
              <span>The officer meets you at the property at that time.</span>
            </li>
            <li>
              <Icon.shield size={14} />
              <span>
                We record the introduction to the landlord. Nothing is owed by
                you at any point.
              </span>
            </li>
          </ul>
        </div>
      </div>

      <aside className="detail-aside">
        <div className="card card-flush">
          <PropertyMedia
            photo={listing.photos[0]}
            alt={`${TYPE_LABEL[listing.propertyType]} in ${listing.neighbourhoodName}`}
          />
          <div className="pcard-body">
            <p className="pcard-price num">
              {shillings(listing.monthlyRent)} <span>/ month</span>
            </p>
            <p className="pcard-where">{listing.neighbourhoodName}</p>
            <p className="pcard-land">{listing.landmarkText}</p>
            <p className="pcard-facts">
              <span>{listing.bedrooms} beds</span>
              <span>{listing.bathrooms} baths</span>
            </p>
          </div>
        </div>
      </aside>
    </div>
  );
}
