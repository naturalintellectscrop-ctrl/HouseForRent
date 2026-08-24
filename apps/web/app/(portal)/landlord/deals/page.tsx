import Link from 'next/link';
import { api } from '@/lib/api';
import { dealHeadline, statusTone, type PartyDeal } from '@/lib/portal';
import { Empty, onDay, shillings, Status } from '@/app/ui';

export const metadata = { title: 'Your lettings' };

export default async function LandlordDealsPage() {
  const deals = await api<PartyDeal[]>('/v1/deals');

  return (
    <div className="stack-lg">
      <div>
        <h1 className="h1">Your lettings</h1>
        <p className="lede">
          Every tenancy we have arranged for your properties, and where the
          money has got to on each.
        </p>
      </div>

      {deals.length === 0 ? (
        <Empty
          title="No lettings yet"
          action={
            <Link href="/landlord" className="btn btn-secondary">
              Back to your properties
            </Link>
          }
        >
          A letting appears here once a tenant has viewed one of your
          properties and wants it.
        </Empty>
      ) : (
        <ul className="list">
          {deals.map((deal) => (
            <li key={deal.id}>
              <Link href={`/landlord/deals/${deal.id}`} className="list-item">
                <span
                  className="stack-sm"
                  style={{ minWidth: '18rem', flex: 1 }}
                >
                  <span className="row" style={{ gap: '0.5rem' }}>
                    <Status tone={statusTone(deal.status)}>
                      {deal.status.replace(/_/g, ' ')}
                    </Status>
                    <span className="faint" style={{ fontSize: '0.875rem' }}>
                      Opened {onDay(deal.createdAt)}
                    </span>
                  </span>
                  <span className="card-title">
                    {deal.listing.neighbourhoodName} · {deal.counterpartyName}
                  </span>
                  <span className="muted" style={{ fontSize: '0.9375rem' }}>
                    {dealHeadline(deal.status, 'landlord')}
                  </span>
                </span>
                <span className="stack-sm" style={{ textAlign: 'right' }}>
                  <span className="num" style={{ fontWeight: 600 }}>
                    {shillings(
                      deal.monthlyRentSnapshot ?? deal.listing.monthlyRent,
                    )}
                  </span>
                  {deal.commissionAmount ? (
                    <span className="faint" style={{ fontSize: '0.8125rem' }}>
                      commission {shillings(deal.commissionAmount)}
                    </span>
                  ) : null}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
