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
import { ActivityFeed } from '../activity-feed';
import type { ActivityRow } from '@/server/activity';

export const metadata = { title: 'Your properties' };

/**
 * The landlord's portfolio.
 *
 * ── `blockedBy` is the design ──
 * A landlord's real question is never "what is the publication_state of my
 * listing". It is "why is my property not showing, and what do I do about
 * it". The API answers exactly that, per listing, server-side. This page
 * renders those reasons in the landlord's own vocabulary and holds no
 * opinion of its own about what publishing requires - the moment it did, it
 * would eventually tell somebody they were ready when the server disagreed.
 */
export default async function LandlordPage() {
  const [listings, deals, activity] = await Promise.all([
    api<MyListing[]>('/v1/listings/mine').catch((e) => {
      if (e instanceof ApiError) return [];
      throw e;
    }),
    api<PartyDeal[]>('/v1/deals').catch((e) => {
      if (e instanceof ApiError) return [];
      throw e;
    }),
    api<ActivityRow[]>('/v1/activity/mine').catch((e) => {
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
  const liveRent = live.reduce((sum, l) => sum + Number(l.monthlyRent), 0);

  return (
    <div className="stack-lg">
      <div className="page-head">
        <div className="page-head-titles">
          <h1>Your properties</h1>
          <p className="page-sub">
            What is live, what we are still working on, and what each one is
            waiting for.
          </p>
        </div>
        <div className="page-head-actions">
          <Link href="/landlord/properties/new" className="btn btn-primary">
            <Icon.plus size={16} />
            Add a property
          </Link>
        </div>
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
          photographs it and confirms it - then you accept the agreement and it
          goes live. Nothing is charged until a tenant moves in.
        </Empty>
      ) : (
        <>
          {/* ── The stat row: one accent tile, the rest quiet ──
              The rent figure is the sum across LIVE homes only - a draft
              listing has never earned anything, and a tile that pretended
              otherwise would be a lie with a number in it. */}
          <div className="metrics">
            <div className="stat stat--accent">
              <span className="stat-icon" aria-hidden="true">
                <Icon.home />
              </span>
              <p className="stat-label">Live in search</p>
              <p className="stat-value">{live.length}</p>
              <p className="stat-note">
                {live.length === 1
                  ? 'Home visible to every tenant'
                  : 'Homes visible to every tenant'}
              </p>
            </div>
            <div className="stat">
              <span className="stat-icon" aria-hidden="true">
                <Icon.clock />
              </span>
              <p className="stat-label">In progress</p>
              <p className="stat-value">{waiting.length}</p>
              <p className="stat-note">Verification or publication pending</p>
            </div>
            <div className="stat">
              <span className="stat-icon" aria-hidden="true">
                <Icon.swap />
              </span>
              <p className="stat-label">Lettings under way</p>
              <p className="stat-value">{activeDeals.length}</p>
              <p className="stat-note">From agreement to move-in</p>
            </div>
            <div className="stat">
              <span className="stat-icon" aria-hidden="true">
                <Icon.coins />
              </span>
              <p className="stat-label">Rent across live homes</p>
              <p className="stat-value">{shillings(String(liveRent))}</p>
              <p className="stat-note">Per month, before commission</p>
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
                      <span className="list-item-body stack-sm">
                        <span className="row gap-tight">
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
                        <span className="muted fine">{l.landmarkText}</span>
                        {/*
                          Reasons computed by the API. Rendered in the
                          landlord's words, never re-derived here.
                        */}
                        {l.blockedBy.length > 0 ? (
                          <span className="stack-sm">
                            {l.blockedBy.map((b) => (
                              <span key={b} className="fine-faint">
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
                      <span className="num list-item-amount">
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
                        <span className="list-item-body stack-sm">
                          <span className="row gap-tight">
                            <span className="badge badge-ok">
                              <Icon.check size={12} />
                              Live
                            </span>
                            {confirmed ? (
                              <span className="fine-faint">
                                Availability confirmed {confirmed}
                              </span>
                            ) : null}
                          </span>
                          <span className="card-title">
                            {l.bedrooms}-bed in {l.neighbourhoodName}
                          </span>
                          <span className="muted fine">{l.landmarkText}</span>
                        </span>
                        <span className="num list-item-amount">
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
                  <span className="list-item-body stack-sm">
                    <span className="card-title">
                      {deal.listing.neighbourhoodName} · {deal.counterpartyName}
                    </span>
                    <span className="muted fine">
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

      {/* ── recent activity: viewings and lettings on your properties ── */}
      <section className="stack">
        <h2 className="h2">Recent activity</h2>
        <ActivityFeed rows={activity} />
      </section>
    </div>
  );
}
