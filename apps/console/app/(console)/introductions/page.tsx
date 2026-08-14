import Link from 'next/link';
import { redirect } from 'next/navigation';
import { api, ApiError, type IntroductionRecord } from '@/lib/api';
import { Empty, when } from '../../ui';

/**
 * FR-5.3 / FR-8.3 — introduction records as queryable circumvention
 * evidence.
 *
 * This is the surface the Stage 7 acceptance criterion "introduction records
 * are queryable" refers to. It reads `introduction_record` directly, which
 * is the point: the evidence exists precisely for the case where no deal was
 * ever created. A landlord and tenant who transacted around the platform
 * leave no deal row — but they leave this one.
 *
 * Staff-only, enforced by the backend. Exposing it to either counterparty
 * would tell a landlord which other tenants an officer introduced.
 */
export default async function IntroductionsPage(props: {
  searchParams: Promise<{
    tenantPartyId?: string;
    landlordPartyId?: string;
    listingId?: string;
  }>;
}) {
  const filters = await props.searchParams;
  const query = new URLSearchParams(
    Object.entries(filters).filter(([, v]) => v) as [string, string][],
  ).toString();

  let records: IntroductionRecord[];
  try {
    records = await api<IntroductionRecord[]>(
      `/v1/viewings/introductions${query ? `?${query}` : ''}`,
    );
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) redirect('/login');
    throw err;
  }

  return (
    <>
      <h1>Introduction evidence</h1>
      <p className="lede">
        Every conducted viewing leaves a timestamped tenant ↔ property ↔
        landlord ↔ officer link. These records are immutable and persist
        whether or not a deal followed.
      </p>

      <form method="get" className="card">
        <div className="field">
          <label htmlFor="tenantPartyId">Tenant party ID</label>
          <input
            id="tenantPartyId"
            name="tenantPartyId"
            type="text"
            defaultValue={filters.tenantPartyId ?? ''}
            placeholder="Leave blank for all"
            spellCheck={false}
          />
        </div>
        <div className="field">
          <label htmlFor="landlordPartyId">Landlord party ID</label>
          <input
            id="landlordPartyId"
            name="landlordPartyId"
            type="text"
            defaultValue={filters.landlordPartyId ?? ''}
            placeholder="Leave blank for all"
            spellCheck={false}
          />
        </div>
        <button type="submit" className="btn-secondary">
          Search
        </button>
      </form>

      {records.length === 0 ? (
        <Empty
          title={
            query
              ? 'No introduction records match those filters.'
              : 'No introduction records yet.'
          }
          action={
            query ? (
              <Link href="/introductions" className="btn btn-secondary">
                Clear filters
              </Link>
            ) : undefined
          }
        >
          {query
            ? 'Party IDs must match in full. A record is only created when an officer closes a visit as conducted, so a viewing that was cancelled or missed leaves none.'
            : 'A record is written each time an officer closes a visit as conducted. They will appear here as visits are completed.'}
        </Empty>
      ) : (
        records.map((record) => (
          <div key={record.id} className="card">
            <div className="card-head">
              <span className="card-title">{when(record.introducedAt)}</span>
            </div>
            <dl className="dl">
              <dt>Tenant</dt>
              <dd className="mono">{record.tenantPartyId}</dd>
              <dt>Landlord</dt>
              <dd className="mono">{record.landlordPartyId}</dd>
              <dt>Listing</dt>
              <dd className="mono">{record.listingId}</dd>
              <dt>Officer</dt>
              <dd className="mono">{record.fooPartyId}</dd>
            </dl>
          </div>
        ))
      )}
    </>
  );
}
