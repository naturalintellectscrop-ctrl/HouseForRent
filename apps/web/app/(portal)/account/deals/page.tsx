import Link from 'next/link';
import { api } from '@/lib/api';
import { dealHeadline, statusTone, type PartyDeal } from '@/lib/portal';
import { Empty, onDay, shillings, Status } from '@/app/ui';

export const metadata = { title: 'Your tenancy' };

export default async function TenantDealsPage() {
  const deals = await api<PartyDeal[]>('/v1/deals');

  return (
    <div className="stack-lg">
      <div>
        <h1 className="h1">Your tenancy</h1>
        <p className="lede">
          Agreements, escrow and move-in — every letting you have been part
          of, and what is outstanding on each.
        </p>
      </div>

      {deals.length === 0 ? (
        <Empty
          title="Nothing here yet"
          action={
            <Link href="/properties" className="btn btn-primary">
              Browse verified homes
            </Link>
          }
        >
          A letting appears here after you have viewed a property and told us
          you want it.
        </Empty>
      ) : (
        <ul className="list">
          {deals.map((deal) => (
            <li key={deal.id}>
              <Link href={`/account/deals/${deal.id}`} className="list-item">
                <span className="stack-sm" style={{ minWidth: '18rem', flex: 1 }}>
                  <span className="row" style={{ gap: '0.5rem' }}>
                    <Status tone={statusTone(deal.status)}>
                      {deal.status.replace(/_/g, ' ')}
                    </Status>
                    <span className="faint" style={{ fontSize: '0.875rem' }}>
                      Opened {onDay(deal.createdAt)}
                    </span>
                  </span>
                  <span className="card-title">
                    {deal.listing.bedrooms}-bed {deal.listing.propertyType} in{' '}
                    {deal.listing.neighbourhoodName}
                  </span>
                  <span className="muted" style={{ fontSize: '0.9375rem' }}>
                    {dealHeadline(deal.status, 'tenant')}
                  </span>
                </span>
                <span className="stack-sm" style={{ textAlign: 'right' }}>
                  <span className="num" style={{ fontWeight: 600 }}>
                    {shillings(
                      deal.monthlyRentSnapshot ?? deal.listing.monthlyRent,
                    )}
                  </span>
                  <span className="faint" style={{ fontSize: '0.8125rem' }}>
                    {deal.monthlyRentSnapshot
                      ? 'agreed rent'
                      : 'listed rent — not yet agreed'}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
