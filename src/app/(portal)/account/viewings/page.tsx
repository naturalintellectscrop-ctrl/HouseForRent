import Link from 'next/link';
import { api } from '@/lib/api';
import type { TenantViewing } from '@/lib/portal';
import { Empty, shillings, StatusPill, when } from '@/app/ui';

export const metadata = { title: 'Your viewings' };

export default async function ViewingsPage({
  searchParams,
}: {
  searchParams: Promise<{ requested?: string }>;
}) {
  const { requested } = await searchParams;
  const viewings = await api<TenantViewing[]>('/v1/viewings/mine');

  return (
    <div className="stack-lg">
      <div>
        <h1 className="h1">Your viewings</h1>
        <p className="lede">
          Every property visit you have asked for, and where each one has got
          to.
        </p>
      </div>

      {requested ? (
        <p className="notice notice-ok" role="status">
          Request sent. Our operations desk will assign a field officer and
          confirm the time with you.
        </p>
      ) : null}

      {viewings.length === 0 ? (
        <Empty
          title="You have not requested a viewing yet"
          action={
            <Link href="/properties" className="btn btn-primary">
              Browse verified homes
            </Link>
          }
        >
          Find a property you like and ask for a time. An officer will meet you
          there.
        </Empty>
      ) : (
        <ul className="list">
          {viewings.map((v) => (
            <li key={v.id} className="list-item">
              <span className="stack-sm" style={{ minWidth: '18rem', flex: 1 }}>
                <span className="row" style={{ gap: '0.5rem' }}>
                  <StatusPill status={v.status} />
                  <span className="faint" style={{ fontSize: '0.875rem' }}>
                    {when(v.scheduledFor)}
                  </span>
                </span>
                <Link
                  href={`/properties/${v.listingId}`}
                  className="card-title"
                  style={{ textDecoration: 'none' }}
                >
                  {v.listing.bedrooms}-bed {v.listing.propertyType} in{' '}
                  {v.listing.neighbourhoodName}
                </Link>
                <span className="muted" style={{ fontSize: '0.9375rem' }}>
                  {v.listing.landmarkText}
                </span>
                {/*
                  The sentence comes from the server, which is the only place
                  that knows what each viewing status means to the person
                  waiting on it.
                */}
                <span className="faint" style={{ fontSize: '0.875rem' }}>
                  {v.whatHappensNext}
                </span>
              </span>
              <span className="num" style={{ fontWeight: 580 }}>
                {shillings(v.listing.monthlyRent)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
