import Link from 'next/link';
import { redirect } from 'next/navigation';
import { api, ApiError, type DealStates } from '@/lib/api';
import { AdminOnly, BarList, Empty, ShortId, shillings, when } from '@/app/ui';

/**
 * The deal queue (F-007).
 *
 * ── Why the distribution alone was not enough ──
 * This page used to show only a count per status. "3 deals at
 * commission_earned" tells an operator that three landlords are waiting to
 * be paid and gives them no way to reach any of them — which is how a
 * settlement queue becomes invisible work rather than a list someone can
 * clear.
 *
 * The bar list is kept because the SHAPE is genuinely useful at a glance
 * (a pile-up at `escrow_funded` is a different problem from a pile-up at
 * `commission_earned`). The rows underneath are what make it actionable.
 */
export default async function DealsPage(props: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await props.searchParams;

  let states: DealStates;
  try {
    states = await api<DealStates>(
      status ? `/v1/admin/deals?status=${encodeURIComponent(status)}` : '/v1/admin/deals',
    );
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.status === 401) redirect('/login');
      if (err.status === 403) return <AdminOnly what="Deal operations" />;
      // An unknown status in the query is the server's call to reject, not
      // this page's to pre-empt.
      if (err.status === 400) {
        return (
          <>
            <h1>Deals</h1>
            <p className="alert alert-error" role="alert">
              That is not a deal status. <Link href="/ops/deals">Show all deals</Link>.
            </p>
          </>
        );
      }
    }
    throw err;
  }

  const bars = Object.entries(states.distribution)
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);

  return (
    <>
      <h1>Deals</h1>
      <p className="lede">
        {states.total} deals. Newest activity first; the hundred most recently
        changed are listed.
      </p>

      {bars.length > 0 && <BarList rows={bars} />}

      <form method="get" className="filter-form">
        <label htmlFor="status">Show only</label>
        <select id="status" name="status" defaultValue={status ?? ''}>
          <option value="">every status</option>
          {Object.keys(states.distribution)
            .sort()
            .map((key) => (
              <option key={key} value={key}>
                {key.replace(/_/g, ' ')}
              </option>
            ))}
        </select>
        <button type="submit" className="btn-secondary">
          Filter
        </button>
      </form>

      {states.rows.length === 0 ? (
        <Empty
          title="No deals to show."
          action={
            <Link href="/ops/dispatch" className="btn btn-secondary">
              Dispatch queue
            </Link>
          }
        >
          A deal is opened by the field officer who made the introduction,
          from the visit page. If viewings are being conducted and no deals
          are appearing, that step is being missed.
        </Empty>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th scope="col">Deal</th>
                <th scope="col">Status</th>
                <th scope="col">Neighbourhood</th>
                <th scope="col">Tenant</th>
                <th scope="col">Landlord</th>
                <th scope="col">Rent</th>
                <th scope="col">Commission</th>
                <th scope="col">Last change</th>
              </tr>
            </thead>
            <tbody>
              {states.rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <Link href={`/ops/deals/${row.id}`}>
                      <ShortId value={row.id} />
                    </Link>
                  </td>
                  <td>{row.status.replace(/_/g, ' ')}</td>
                  <td>{row.neighbourhood}</td>
                  <td>{row.tenantName}</td>
                  <td>{row.landlordName}</td>
                  <td>{shillings(row.monthlyRent)}</td>
                  <td>
                    {row.commissionAmount
                      ? shillings(row.commissionAmount)
                      : '—'}
                  </td>
                  <td>{when(row.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="muted">
        Open a deal to see its ledger position and the transitions the server
        currently permits. This console holds no copy of the deal state
        machine — it renders the server&rsquo;s answer.
      </p>
    </>
  );
}
