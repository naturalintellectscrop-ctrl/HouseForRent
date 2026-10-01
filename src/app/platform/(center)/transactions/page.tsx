import { db } from '@/lib/db';
import { DegradedPanel, SectionCard, loadPlatformData, fmtUGX, humanize } from '../data';

/**
 * Money movement at platform level. The ledger is the single financial
 * truth (double-entry, immutable postings); PSP instructions are the
 * boundary to the payment provider. This surface reports both honestly -
 * including the note that an instruction's CURRENT state is derived from
 * its event log, not from the (deliberately frozen) instruction row.
 */
export default async function PlatformTransactionsPage() {
  const result = await loadPlatformData(async () => {
    const [instructionKinds, ledgerEntries, ledgerAccounts, recentInstructions] =
      await Promise.all([
        db.pspInstruction.groupBy({ by: ['kind'], _count: { _all: true } }),
        db.ledgerEntry.count(),
        db.ledgerAccount.count(),
        db.pspInstruction.findMany({
          take: 10,
          orderBy: { createdAt: 'desc' },
          include: {
            deal: { select: { status: true } },
            _count: { select: { events: true } },
          },
        }),
      ]);
    return { instructionKinds, ledgerEntries, ledgerAccounts, recentInstructions };
  });

  if (!result.ok) {
    return <DegradedPanel title="Transactions overview unavailable" />;
  }
  const { instructionKinds, ledgerEntries, ledgerAccounts, recentInstructions } = result.data;

  return (
    <div className="stack-lg">
      <header className="stack-sm">
        <h1 className="h1">Transactions</h1>
        <p className="muted">
          Escrow, commission and settlement across the whole platform - the
          immutable ledger and the payment-provider boundary.
        </p>
      </header>

      <div className="plat-stats">
        <div className="plat-stat">
          <span className="plat-stat-value">{ledgerEntries.toLocaleString('en-UG')}</span>
          <span className="plat-stat-label">Immutable ledger postings</span>
        </div>
        <div className="plat-stat">
          <span className="plat-stat-value">{ledgerAccounts.toLocaleString('en-UG')}</span>
          <span className="plat-stat-label">Ledger accounts opened</span>
        </div>
        <div className="plat-stat">
          <span className="plat-stat-value">
            {instructionKinds.reduce((s, k) => s + k._count._all, 0).toLocaleString('en-UG')}
          </span>
          <span className="plat-stat-label">PSP instructions issued</span>
        </div>
      </div>

      <div className="plat-grid-2">
        <SectionCard title="Instructions by kind">
          <ul className="plat-kv">
            {instructionKinds.length === 0 ? <li className="muted">None yet.</li> : null}
            {instructionKinds.map((k) => (
              <li key={k.kind}>
                <span>{humanize(k.kind)}</span>
                <strong>{k._count._all}</strong>
              </li>
            ))}
          </ul>
        </SectionCard>

        <SectionCard title="What this surface does not show (yet)">
          <p className="muted">
            Instruction lifecycle states are derived from append-only event
            rows, and reconciliations run against the PSP balance. Those views
            live in the staff console today; platform-level reconciliation
            reporting lands with the payout-dispatch milestone.
          </p>
        </SectionCard>
      </div>

      <SectionCard title="Most recent PSP instructions">
        <div className="plat-table-wrap">
          <table className="plat-table">
            <thead>
              <tr>
                <th scope="col">Issued</th>
                <th scope="col">Kind</th>
                <th scope="col">Amount</th>
                <th scope="col">Deal status</th>
                <th scope="col">Lifecycle events</th>
              </tr>
            </thead>
            <tbody>
              {recentInstructions.length === 0 ? (
                <tr>
                  <td colSpan={5} className="muted">
                    No instructions yet - nothing has moved through escrow.
                  </td>
                </tr>
              ) : null}
              {recentInstructions.map((i) => (
                <tr key={i.id}>
                  <td>{i.createdAt.toISOString().replace('T', ' ').slice(0, 16)} UTC</td>
                  <td>{humanize(i.kind)}</td>
                  <td>{fmtUGX(i.amount)}</td>
                  <td>{humanize(i.deal.status)}</td>
                  <td>{i._count.events}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}
