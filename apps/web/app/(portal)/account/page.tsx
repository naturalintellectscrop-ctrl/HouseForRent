import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import {
  dealHeadline,
  statusTone,
  type IdentityStatus,
  type PartyDeal,
  type TenantViewing,
} from '@/lib/portal';
import { Empty, Icon, shillings, Status, StatusPill, when } from '@/app/ui';

export const metadata = { title: 'My account' };

/**
 * The tenant's overview.
 *
 * ── Ordered by what is blocking them ──
 * Identity verification comes first when it is missing, because until it
 * exists the API refuses every viewing request (422 TENANT_NOT_VERIFIED) and
 * nothing else on this page can happen. A dashboard that leads with a
 * summary card while the one blocking step sits below the fold is a
 * dashboard that makes people ask us why the button does not work.
 */
export default async function AccountPage() {
  const [identity, viewings, deals] = await Promise.all([
    api<IdentityStatus>('/v1/identity/me').catch(() => null),
    api<TenantViewing[]>('/v1/viewings/mine').catch((e) => {
      if (e instanceof ApiError) return [];
      throw e;
    }),
    api<PartyDeal[]>('/v1/deals').catch((e) => {
      if (e instanceof ApiError) return [];
      throw e;
    }),
  ]);

  const upcoming = viewings.filter(
    (v) => v.status === 'requested' || v.status === 'scheduled',
  );
  const live = deals.filter(
    (d) => d.status !== 'closed' && d.status !== 'cancelled',
  );

  return (
    <div className="stack-lg">
      <div>
        <h1 className="h1">Your account</h1>
        <p className="lede">
          Everything you have in progress with House For Rent.
        </p>
      </div>

      {identity && !identity.identityVerified ? (
        <section className="card stack">
          <div className="row">
            <Icon.shield size={20} />
            <h2 className="h3">Verify your identity to request a viewing</h2>
          </div>
          <p className="muted">
            We check who you are before you meet a landlord — that protection
            runs both ways, and it is why landlords accept our terms. It takes
            a minute and costs nothing.
          </p>
          <p>
            <Link href="/account/identity" className="btn btn-primary">
              Verify my identity
            </Link>
          </p>
        </section>
      ) : null}

      {/* ── tenancy ─────────────────────────────────────────────────── */}
      <section className="stack">
        <div className="row-between">
          <h2 className="h2">Your tenancy</h2>
          {deals.length > 0 ? (
            <Link href="/account/deals" className="btn btn-ghost btn-sm">
              All lettings →
            </Link>
          ) : null}
        </div>

        {live.length === 0 ? (
          <Empty
            title="No tenancy in progress"
            action={
              <Link href="/properties" className="btn btn-secondary">
                Browse verified homes
              </Link>
            }
          >
            Once you have viewed a property and want it, your agreement,
            escrow and move-in all appear here.
          </Empty>
        ) : (
          <ul className="list">
            {live.map((deal) => (
              <li key={deal.id}>
                <Link href={`/account/deals/${deal.id}`} className="list-item">
                  <span className="stack-sm" style={{ minWidth: '16rem' }}>
                    <span className="card-title">
                      {deal.listing.bedrooms}-bed {deal.listing.propertyType} in{' '}
                      {deal.listing.neighbourhoodName}
                    </span>
                    <span className="muted" style={{ fontSize: '0.9375rem' }}>
                      {dealHeadline(deal.status, 'tenant')}
                    </span>
                  </span>
                  <span className="row" style={{ gap: '0.75rem' }}>
                    <span className="num">
                      {shillings(
                        deal.monthlyRentSnapshot ?? deal.listing.monthlyRent,
                      )}
                    </span>
                    <Status tone={statusTone(deal.status)}>
                      {deal.status.replace(/_/g, ' ')}
                    </Status>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── viewings ────────────────────────────────────────────────── */}
      <section className="stack">
        <div className="row-between">
          <h2 className="h2">Viewings</h2>
          {viewings.length > 0 ? (
            <Link href="/account/viewings" className="btn btn-ghost btn-sm">
              All viewings →
            </Link>
          ) : null}
        </div>

        {upcoming.length === 0 ? (
          <Empty
            title="Nothing booked"
            action={
              <Link href="/properties" className="btn btn-secondary">
                Find a home to view
              </Link>
            }
          >
            When you request a viewing, our operations desk assigns a field
            officer to meet you at the property.
          </Empty>
        ) : (
          <ul className="list">
            {upcoming.map((v) => (
              <li key={v.id} className="list-item">
                <span className="stack-sm" style={{ minWidth: '16rem' }}>
                  <span className="card-title">
                    {v.listing.neighbourhoodName} · {v.listing.bedrooms} bed
                  </span>
                  <span className="muted" style={{ fontSize: '0.9375rem' }}>
                    {v.listing.landmarkText}
                  </span>
                  <span className="faint" style={{ fontSize: '0.875rem' }}>
                    {/* Written server-side, so there is one place that knows
                        what each viewing status means to the person waiting. */}
                    {v.whatHappensNext}
                  </span>
                </span>
                <span className="stack-sm" style={{ textAlign: 'right' }}>
                  <StatusPill status={v.status} />
                  <span className="faint" style={{ fontSize: '0.875rem' }}>
                    {when(v.scheduledFor)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
