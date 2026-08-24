import { redirect } from 'next/navigation';
import { api, ApiError, type Reconciliation } from '@/lib/api';
import { AdminOnly, Empty, shillings, StatusDot, when } from '@/app/ui';

/**
 * FR-10.4 — ledger ↔ custodian reconciliation.
 *
 * Two independent signals, presented as two, because they fail for
 * different reasons and need different responses:
 *
 *   - the ledger disagreeing with the CUSTODIAN is a real divergence —
 *     money moved somewhere our books do not reflect, or vice versa;
 *   - the ledger disagreeing with ITSELF (a posting that does not balance)
 *     is a defect in our own code.
 *
 * Collapsing them into one "healthy" light would make the second
 * indistinguishable from the first, and the second is the one that means
 * the books cannot be trusted at all.
 *
 * Loading this page RUNS a fresh check server-side — reconciliation status
 * that could be stale is worse than none, because it invites confidence.
 */
export default async function ReconciliationPage() {
  let data: Reconciliation;
  try {
    data = await api<Reconciliation>('/v1/admin/reconciliation');
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.status === 401) redirect('/login');
      if (err.status === 403) return <AdminOnly what="Reconciliation" />;
    }
    throw err;
  }

  const { latest, history, internallyConsistent } = data;
  const drift = BigInt(latest.ledgerBalance) - BigInt(latest.pspBalance);

  return (
    <>
      <h1>Reconciliation</h1>
      <p className="lede">
        Checked fresh on load, at {when(latest.runAt)}.
      </p>

      {!internallyConsistent && (
        <p className="alert alert-error" role="alert">
          <strong>The ledger does not balance internally.</strong> At least
          one posting&rsquo;s debits and credits differ. This is a defect in
          our own books, not a custodian disagreement — treat every figure
          below as unreliable until it is resolved.
        </p>
      )}

      <div className="kpis">
        <div className="kpi">
          <p className="kpi-label">Ledger balance</p>
          <p className="kpi-value">{shillings(latest.ledgerBalance)}</p>
        </div>
        <div className="kpi">
          <p className="kpi-label">Custodian balance</p>
          <p className="kpi-value">{shillings(latest.pspBalance)}</p>
        </div>
        <div className="kpi">
          <p className="kpi-label">Difference</p>
          <p className="kpi-value">
            {drift === 0n ? 'None' : shillings(drift.toString())}
          </p>
        </div>
      </div>

      <p>
        {latest.isReconciled ? (
          <StatusDot tone="good" label="Ledger and custodian agree." />
        ) : (
          <StatusDot
            tone="critical"
            label="Ledger and custodian DISAGREE — investigate before settling."
          />
        )}
      </p>

      {latest.discrepancyNote && (
        <p className="alert alert-error">{latest.discrepancyNote}</p>
      )}

      <p className="muted">
        The ledger is authoritative. A custodian mismatch is surfaced here,
        never silently absorbed, and never resolved by adjusting a posting —
        corrections are new reversing entries.
      </p>

      <h2>Recent checks</h2>
      {history.length === 0 ? (
        <Empty title="No prior checks recorded.">
          A row is written each time reconciliation runs. Until the first run
          completes there is no history to compare the current figures
          against.
        </Empty>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th scope="col">Run at</th>
                <th scope="col">Ledger</th>
                <th scope="col">Custodian</th>
                <th scope="col">Result</th>
              </tr>
            </thead>
            <tbody>
              {history.map((check) => (
                <tr key={check.id}>
                  <td>{when(check.runAt)}</td>
                  <td className="num">{check.ledgerBalance}</td>
                  <td className="num">{check.pspBalance}</td>
                  <td>
                    {check.isReconciled ? (
                      <StatusDot tone="good" label="agrees" />
                    ) : (
                      <StatusDot tone="critical" label="diverged" />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="muted">
        A single green reading says less than a pattern — an intermittent
        divergence is the one worth chasing.
      </p>
    </>
  );
}
