import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { requireRole } from '@/lib/session';
import { dealHeadline, statusTone } from '@/lib/portal';
import { Empty, shillings, Status, TYPE_LABEL, when } from '@/app/ui';

export const metadata = { title: 'Earnings' };

interface EarningsDeal {
  dealId: string;
  status: string;
  updatedAt: string;
  bedrooms: number;
  propertyType: string;
  neighbourhoodName: string;
  landmarkText: string;
  monthlyRentSnapshot: string | null;
  commissionAmount: string | null;
  heldInEscrow: string;
  owedToLandlord: string;
  releasedToLandlord: string;
}

interface EarningsSummary {
  totals: {
    releasedToLandlord: string;
    heldInEscrow: string;
    owedToLandlord: string;
    commissionCharged: string;
  };
  deals: EarningsDeal[];
}

/**
 * The landlord's money page.
 *
 * ── Where every number comes from ──
 * The API aggregates the ledger - the same postings the reconciliation
 * check and the operations deal console read. This page performs no
 * arithmetic and holds no opinion about what a status means for money; a
 * deal whose status says "settled" shows whatever the ledger actually
 * says, which is the only version of "what have I been paid" that matters.
 *
 * ── What is deliberately absent ──
 * No projections ("you could earn X a year"), no averages across other
 * landlords, no benchmarks. Those would be invented statistics dressed as
 * information, and a landlord's first earnings page should read like a
 * bank statement, not a pitch.
 */
export default async function EarningsPage() {
  const session = await requireRole(['lister', 'admin']);

  // Admins have no landlord profile; the honest answer is a redirect to the
  // console that actually holds platform-wide financials, not an empty page
  // pretending they simply have no earnings.
  if (session.role === 'admin') {
    return (
      <div className="stack-lg">
        <div>
          <h1 className="h1">Earnings</h1>
        </div>
        <Empty
          title="Earnings belong to landlord accounts"
          action={
            <Link href="/ops" className="btn btn-secondary">
              Open the operations console
            </Link>
          }
        >
          Platform-wide financial position lives in the operations console.
          This page shows one landlord their own money.
        </Empty>
      </div>
    );
  }

  const summary = await api<EarningsSummary>('/v1/landlord/financials').catch((e) => {
    if (e instanceof ApiError) return null;
    throw e;
  });

  if (!summary) {
    return (
      <div className="stack-lg">
        <div>
          <h1 className="h1">Earnings</h1>
        </div>
        <Empty
          title="Could not load your figures"
          action={
            <Link href="/landlord" className="btn btn-secondary">
              Back to your portfolio
            </Link>
          }
        >
          Something went wrong on our side. Nothing has changed in your
          account - try again in a moment.
        </Empty>
      </div>
    );
  }

  const { totals, deals } = summary;

  return (
    <div className="stack-lg">
      <div>
        <h1 className="h1">Earnings</h1>
        <p className="lede">
          What has been paid to you, what is waiting, and what is still held -
          taken from our books, not from a status label.
        </p>
      </div>

      <div className="metrics">
        <div className="metric">
          <p className="metric-label">Paid to you</p>
          <p className="metric-value num">{shillings(totals.releasedToLandlord)}</p>
        </div>
        <div className="metric">
          <p className="metric-label">Waiting to be paid</p>
          <p className="metric-value num">{shillings(totals.owedToLandlord)}</p>
        </div>
        <div className="metric">
          <p className="metric-label">Held in escrow</p>
          <p className="metric-value num">{shillings(totals.heldInEscrow)}</p>
        </div>
        <div className="metric">
          <p className="metric-label">Commission charged</p>
          <p className="metric-value num">{shillings(totals.commissionCharged)}</p>
        </div>
      </div>

      <section className="stack">
        <h2 className="h2">Lettings</h2>
        {deals.length === 0 ? (
          <Empty
            title="No lettings yet"
            action={
              <Link href="/landlord" className="btn btn-secondary">
                Back to your portfolio
              </Link>
            }
          >
            When a tenant is introduced and a deal starts, its money trail
            appears here - held, released and paid, with the date on each step.
          </Empty>
        ) : (
          <ul className="list">
            {deals.map((d) => (
              <li key={d.dealId}>
                <Link href={`/landlord/deals/${d.dealId}`} className="list-item">
                  <span className="stack-sm" style={{ minWidth: '16rem', flex: 1 }}>
                    <span className="row" style={{ gap: '0.5rem' }}>
                      <Status tone={statusTone(d.status)}>{d.status.replace(/_/g, ' ')}</Status>
                    </span>
                    <strong>
                      {d.bedrooms}-bedroom{' '}
                      {(TYPE_LABEL[d.propertyType] ?? 'home').toLowerCase()} in{' '}
                      {d.neighbourhoodName}
                    </strong>
                    <span className="muted" style={{ fontSize: '0.875rem' }}>
                      {d.landmarkText} · updated {when(d.updatedAt)}
                    </span>
                    <span className="muted" style={{ fontSize: '0.875rem' }}>
                      {dealHeadline(d.status, 'landlord')}
                    </span>
                  </span>
                  <span
                    className="stack-sm"
                    style={{ textAlign: 'right', minWidth: '12rem' }}
                  >
                    <span className="muted" style={{ fontSize: '0.8125rem' }}>
                      Paid to you
                    </span>
                    <strong className="num">{shillings(d.releasedToLandlord)}</strong>
                    {d.heldInEscrow !== '0' ? (
                      <span className="muted num" style={{ fontSize: '0.8125rem' }}>
                        {shillings(d.heldInEscrow)} held
                      </span>
                    ) : null}
                    {d.owedToLandlord !== '0' ? (
                      <span className="muted num" style={{ fontSize: '0.8125rem' }}>
                        {shillings(d.owedToLandlord)} owed
                      </span>
                    ) : null}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card stack" style={{ maxWidth: '40rem' }}>
        <h2 className="h3">How money reaches you</h2>
        <p className="muted">
          The tenant&apos;s rent and deposit are held by House For Rent - not
          sent to you and not sent back - until the tenant confirms they have
          moved in. Only then is the money released, minus one commission that
          was agreed in your listing agreement before anything went live.
        </p>
        <p>
          <Link href="/for-landlords#commission" className="btn btn-ghost btn-sm">
            Read the commission terms →
          </Link>
        </p>
      </section>
    </div>
  );
}
