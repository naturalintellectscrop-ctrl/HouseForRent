import Link from 'next/link';
import { api, ApiError, type MyListing } from '@/lib/api';
import {
  BLOCKER_LABEL,
  PUBLICATION_LABEL,
  dealHeadline,
  statusTone,
  type PartyDeal,
} from '@/lib/portal';
import { daysAgo, Empty, Icon, shillings, Status } from '@/app/ui';

export const metadata = { title: 'Your properties' };

/**
 * The landlord's portfolio.
 *
 * ── `blockedBy` is the design ──
 * A landlord's real question is never "what is the publication_state of my
 * listing". It is "why is my property not showing, and what do I do about
 * it". The API answers exactly that, per listing, server-side. This page
 * renders those reasons in the landlord's own vocabulary and holds no
 * opinion of its own about what publishing requires — the moment it did, it
 * would eventually tell somebody they were ready when the server disagreed.
 */
export default async function LandlordPage() {
  const [listings, deals] = await Promise.all([
    api<MyListing[]>('/v1/listings/mine').catch((e) => {
      if (e instanceof ApiError) return [];
      throw e;
    }),
    api<PartyDeal[]>('/v1/deals').catch((e) => {
      if (e instanceof ApiError) return [];
      throw e;
    }),
  ]);

  const live = listings.filter((l) => l.publicationState === 'live');
  const waiting = listings.filter(
    (l) => l.publicationState !== 'live' && l.publicationState !== 'rented',
  );
  const activeDeals = deals.filter(
    (d) => d.status !== 'closed' && d.status !== 'cancelled',
  );

  return (
    <div className="stack-lg">
      <div className="row-between">
        <div>
          <h1 className="h1">Your properties</h1>
          <p className="lede">
            What is live, what we are still working on, and what each one is
            waiting for.
          </p>
        </div>
        <Link href="/landlord/properties/new" className="btn btn-primary">
          Add a property
        </Link>
      </div>

      {listings.length === 0 ? (
        <Empty
          title="No properties yet"
          action={
            <Link href="/landlord/properties/new" className="btn btn-primary">
              Add your first property
            </Link>
          }
        >
          Tell us about the property and your terms. A field officer visits,
          photographs it and confirms it — then you accept the agreement and it
          goes live. Nothing is charged until a tenant moves in.
        </Empty>
      ) : (
        <>
          <div className="metrics">
            <div className="metric">
              <p className="metric-label">Live</p>
              <p className="metric-value">{live.length}</p>
            </div>
            <div className="metric">
              <p className="metric-label">In progress</p>
              <p className="metric-value">{waiting.length}</p>
            </div>
            <div className="metric">
              <p className="metric-label">Lettings under way</p>
              <p className="metric-value">{activeDeals.length}</p>
            </div>
          </div>

          {waiting.length > 0 ? (
            <section className="stack">
              <h2 className="h2">Needs something from us, or from you</h2>
              <ul className="list">
                {waiting.map((l) => (
                  <li key={l.id}>
                    <Link
                      href={`/landlord/listings/${l.id}`}
                      className="list-item"
                    >
                      <span
                        className="stack-sm"
                        style={{ minWidth: '18rem', flex: 1 }}
                      >
                        <span className="row" style={{ gap: '0.5rem' }}>
                          <span className="badge">
                            {PUBLICATION_LABEL[l.publicationState]}
                          </span>
                          {l.verificationState === 'verified' ? (
                            <span className="badge badge-ok">
                              <Icon.check size={12} />
                              Verified
                            </span>
                          ) : null}
                        </span>
                        <span className="card-title">
                          {l.bedrooms}-bed in {l.neighbourhoodName}
                        </span>
                        <span
                          className="muted"
                          style={{ fontSize: '0.9375rem' }}
                        >
                          {l.landmarkText}
                        </span>
                        {/*
                          Reasons computed by the API. Rendered in the
                          landlord's words, never re-derived here.
                        */}
                        {l.blockedBy.length > 0 ? (
                          <span className="stack-sm">
                            {l.blockedBy.map((b) => (
                              <span
                                key={b}
                                className="faint"
                                style={{ fontSize: '0.875rem' }}
                              >
                                • {BLOCKER_LABEL[b] ?? b.replace(/_/g, ' ')}
                              </span>
                            ))}
                          </span>
                        ) : (
                          <span className="badge badge-ok">
                            Ready to publish
                          </span>
                        )}
                      </span>
                      <span className="num" style={{ fontWeight: 600 }}>
                        {shillings(l.monthlyRent)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {live.length > 0 ? (
            <section className="stack">
              <h2 className="h2">Live in search</h2>
              <ul className="list">
                {live.map((l) => {
                  const confirmed = l.availabilityConfirmedAt
                    ? daysAgo(
                        Math.floor(
                          (Date.now() -
                            new Date(l.availabilityConfirmedAt).getTime()) /
                            86400000,
                        ),
                      )
                    : null;
                  return (
                    <li key={l.id}>
                      <Link
                        href={`/landlord/listings/${l.id}`}
                        className="list-item"
                      >
                        <span
                          className="stack-sm"
                          style={{ minWidth: '18rem', flex: 1 }}
                        >
                          <span className="row" style={{ gap: '0.5rem' }}>
                            <span className="badge badge-ok">
                              <Icon.check size={12} />
                              Live
                            </span>
                            {confirmed ? (
                              <span
                                className="faint"
                                style={{ fontSize: '0.875rem' }}
                              >
                                Availability confirmed {confirmed}
                              </span>
                            ) : null}
                          </span>
                          <span className="card-title">
                            {l.bedrooms}-bed in {l.neighbourhoodName}
                          </span>
                          <span
                            className="muted"
                            style={{ fontSize: '0.9375rem' }}
                          >
                            {l.landmarkText}
                          </span>
                        </span>
                        <span className="num" style={{ fontWeight: 600 }}>
                          {shillings(l.monthlyRent)}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}
        </>
      )}

      {activeDeals.length > 0 ? (
        <section className="stack">
          <div className="row-between">
            <h2 className="h2">Lettings under way</h2>
            <Link href="/landlord/deals" className="btn btn-ghost btn-sm">
              All lettings →
            </Link>
          </div>
          <ul className="list">
            {activeDeals.map((deal) => (
              <li key={deal.id}>
                <Link href={`/landlord/deals/${deal.id}`} className="list-item">
                  <span
                    className="stack-sm"
                    style={{ minWidth: '18rem', flex: 1 }}
                  >
                    <span className="card-title">
                      {deal.listing.neighbourhoodName} · {deal.counterpartyName}
                    </span>
                    <span className="muted" style={{ fontSize: '0.9375rem' }}>
                      {dealHeadline(deal.status, 'landlord')}
                    </span>
                  </span>
                  <Status tone={statusTone(deal.status)}>
                    {deal.status.replace(/_/g, ' ')}
                  </Status>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
