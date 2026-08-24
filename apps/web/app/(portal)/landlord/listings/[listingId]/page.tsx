import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  api,
  ApiError,
  type ListingPhoto,
  type MyListing,
} from '@/lib/api';
import { BLOCKER_LABEL, PUBLICATION_LABEL } from '@/lib/portal';
import {
  daysAgo,
  FURNISHED_LABEL,
  Icon,
  PropertyMedia,
  shillings,
} from '@/app/ui';
import { AgreementPanel } from './agreement-panel';
import { PublishPanel } from './publish-panel';
import { PhotoManager } from './photo-manager';

export const metadata = { title: 'Your listing' };

/** The terms a landlord is shown before accepting (FR-9.1). */
interface PresentedTerms {
  listingId: string;
  monthlyRent: string;
  commissionRateBp: number;
  commissionIfLet: string;
  clause: { version: string; heading: string; body: string };
  payer: 'landlord';
  tenantPays: false;
  alreadyAccepted: boolean;
}

/**
 * One of the landlord's listings: its state, what it is waiting on, its
 * photographs, its agreement, and the publish control.
 *
 * ── The page is organised around `blockedBy` ──
 * The server says what is outstanding. This page turns each item into the
 * panel that resolves it — the agreement blocker renders the agreement, the
 * verification blocker explains that an officer has to come. It never
 * decides for itself whether publishing is possible; `canPublish` is the
 * server's answer and the button follows it.
 */
export default async function LandlordListingPage({
  params,
  searchParams,
}: {
  params: Promise<{ listingId: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const { listingId } = await params;
  const { created } = await searchParams;

  // Scoped from the session: this returns only the caller's own inventory,
  // so a listing id belonging to someone else simply is not in the list.
  const mine = await api<MyListing[]>('/v1/listings/mine');
  const listing = mine.find((l) => l.id === listingId);
  if (!listing) notFound();

  const [terms, photoResult] = await Promise.all([
    api<PresentedTerms>(`/v1/listings/${listingId}/agreement`).catch(
      (e: unknown) => {
        // 422 NO_RATE_IN_FORCE is a real operational state, not a page
        // failure: no commission rate has been published yet.
        if (e instanceof ApiError) return null;
        throw e;
      },
    ),
    api<{ photos: ListingPhoto[] }>(`/v1/listings/${listingId}/photos`).catch(
      () => ({ photos: [] as ListingPhoto[] }),
    ),
  ]);

  const photos = photoResult.photos;
  const confirmed = listing.availabilityConfirmedAt
    ? daysAgo(
        Math.floor(
          (Date.now() - new Date(listing.availabilityConfirmedAt).getTime()) /
            86400000,
        ),
      )
    : null;

  return (
    <div className="stack-lg">
      <p>
        <Link href="/landlord" className="btn btn-ghost btn-sm">
          ← Your properties
        </Link>
      </p>

      {created ? (
        <p className="notice notice-ok" role="status">
          Saved. Below is everything still standing between this property and
          the search results.
        </p>
      ) : null}

      <header className="stack-sm">
        <div className="row">
          <span
            className={
              listing.publicationState === 'live' ? 'badge badge-ok' : 'badge'
            }
          >
            {PUBLICATION_LABEL[listing.publicationState]}
          </span>
          {listing.verificationState === 'verified' ? (
            <span className="badge badge-ok">
              <Icon.check size={12} />
              Verified in person
            </span>
          ) : (
            <span className="badge badge-warn">Not yet verified</span>
          )}
          {confirmed ? (
            <span className="faint" style={{ fontSize: '0.875rem' }}>
              Availability confirmed {confirmed}
            </span>
          ) : null}
        </div>
        <h1 className="h1">
          {listing.bedrooms}-bed in {listing.neighbourhoodName}
        </h1>
        <p className="lede">{listing.landmarkText}</p>
      </header>

      <div className="detail-grid">
        <div className="stack-lg">
          {/* ── what is outstanding ──────────────────────────────── */}
          <section className="stack">
            <h2 className="h2">What happens next</h2>
            {listing.blockedBy.length === 0 ? (
              <p className="notice notice-ok">
                Everything is in place. Publish whenever you are ready.
              </p>
            ) : (
              <ul className="list">
                {listing.blockedBy.map((b) => (
                  <li key={b} className="list-item">
                    <span className="stack-sm">
                      <span className="card-title">
                        {BLOCKER_LABEL[b] ?? b.replace(/_/g, ' ')}
                      </span>
                      <span className="muted" style={{ fontSize: '0.9375rem' }}>
                        {b === 'field_verification'
                          ? 'We schedule this — you do not need to do anything. The officer will contact you to arrange a time.'
                          : b === 'listing_agreement'
                            ? 'The commission terms are below. Read them and accept when you are ready.'
                            : b === 'outside_service_area'
                              ? 'We are not yet operating in this neighbourhood, so no officer can verify it.'
                              : 'We need a verified mandate for this property before it can be published.'}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* ── photographs ─────────────────────────────────────── */}
          <section className="stack">
            <div className="row-between">
              <h2 className="h2">Photographs</h2>
              <span className="faint" style={{ fontSize: '0.875rem' }}>
                {photos.length} on this listing
              </span>
            </div>

            {photos.length > 0 ? (
              <div className="photo-grid">
                {photos.map((p) => (
                  <div key={p.id} className="photo-tile">
                    <PropertyMedia photo={p} alt={p.caption ?? ''} />
                    <p className="faint" style={{ fontSize: '0.75rem' }}>
                      {/* Provenance is asserted by the server. A landlord's
                          own upload can never be labelled officer
                          photography. */}
                      {p.isFieldVerified
                        ? 'Taken by our field officer'
                        : p.isDevelopmentFixture
                          ? 'Development fixture'
                          : 'Uploaded by you'}
                    </p>
                  </div>
                ))}
              </div>
            ) : null}

            <PhotoManager listingId={listingId} />
            <p className="hint">
              Your photographs help, and our officer takes their own on the
              verification visit. Only the officer&rsquo;s are shown to tenants
              as verified photography.
            </p>
          </section>
        </div>

        <aside className="detail-aside stack">
          <div className="card stack">
            <h2 className="h3">Your terms</h2>
            <dl className="terms">
              <div className="terms-row">
                <dt>Monthly rent</dt>
                <dd className="num">{shillings(listing.monthlyRent)}</dd>
              </div>
              <div className="terms-row">
                <dt>Deposit</dt>
                <dd className="num">{shillings(listing.depositAmount)}</dd>
              </div>
              <div className="terms-row">
                <dt>Months upfront</dt>
                <dd className="num">{listing.requiredMonthsUpfront}</dd>
              </div>
              <div className="terms-row">
                <dt>Bedrooms / bathrooms</dt>
                <dd className="num">
                  {listing.bedrooms} / {listing.bathrooms}
                </dd>
              </div>
            </dl>
          </div>

          <PublishPanel
            listingId={listingId}
            canPublish={listing.canPublish}
            isLive={listing.publicationState === 'live'}
          />

          {terms ? (
            <AgreementPanel listingId={listingId} terms={terms} />
          ) : (
            <div className="card">
              <h2 className="h3">Agreement</h2>
              <p className="muted" style={{ marginTop: '0.4rem' }}>
                We cannot show the commission terms right now because no rate
                is currently published. Nothing can be signed until one is.
              </p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
