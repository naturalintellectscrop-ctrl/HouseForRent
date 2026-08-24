import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  api,
  ApiError,
  type DealStates,
  type LaunchGate,
  type Reconciliation,
} from '@/lib/api';
import { currentRole } from '@/lib/session';
import { BarList, Empty, StatusDot, when } from '@/app/ui';

/**
 * FR-10.3 / FR-10.4 — the operations overview.
 *
 * ── On form ──
 * The launch gate is a single ratio against a limit, so it is a HERO FIGURE
 * plus a METER — not a chart, and emphatically not a two-slice pie. The
 * deal-state distribution has eleven classes that all carry meaning, which
 * is past the point where more colours help: it renders as a one-hue
 * magnitude bar list that doubles as a table. Reconciliation is three
 * headline numbers, so it is a KPI row.
 *
 * ── On what this page decides ──
 * Nothing. `gateMet`, `shortfall` and `isReconciled` all arrive computed
 * from the server. The console picks a colour from them; it never derives
 * them. A dashboard that decided locally whether the launch gate was met
 * would be a second implementation of a business rule.
 */
export default async function OpsPage() {
  const role = await currentRole();

  let gate: LaunchGate;
  try {
    gate = await api<LaunchGate>('/v1/admin/launch-gate');
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) redirect('/login');
    throw err;
  }

  // Admin-only reads. A field officer legitimately reaches this page for the
  // launch gate, so their 403 on these is expected, not an error.
  let reconciliation: Reconciliation | null = null;
  let deals: DealStates | null = null;
  if (role === 'admin') {
    [reconciliation, deals] = await Promise.all([
      api<Reconciliation>('/v1/admin/reconciliation'),
      api<DealStates>('/v1/admin/deals'),
    ]);
  }

  const pct = Math.min(100, Math.round((gate.qualifying / gate.gate) * 100));

  return (
    <>
      <h1>Operations</h1>
      <p className="lede">
        Live inventory against the launch gate, and the state of the books.
        Every figure here is computed server-side.
      </p>

      {/* ── FR-10.3: the one number this view leads with ── */}
      <h2>Launch gate</h2>
      <p className="hero">
        {gate.qualifying}{' '}
        <span className="hero-unit">of {gate.gate} listings</span>
      </p>

      <div
        className="meter"
        role="img"
        aria-label={`${gate.qualifying} of ${gate.gate} listings qualify, ${pct} percent`}
      >
        <div
          className={`meter-fill${gate.gateMet ? '' : ' is-short'}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      <p className="muted">
        {gate.gateMet ? (
          <StatusDot tone="good" label="Gate met." />
        ) : (
          <StatusDot
            tone="warning"
            label={`${gate.shortfall} more needed to meet the gate.`}
          />
        )}
      </p>

      <div className="kpis">
        <div className="kpi">
          <p className="kpi-label">Qualifying now</p>
          <p className="kpi-value">{gate.qualifying}</p>
        </div>
        <div className="kpi">
          <p className="kpi-label">Excluded as stale</p>
          <p className="kpi-value">{gate.staleExcluded}</p>
        </div>
        <div className="kpi">
          <p className="kpi-label">Freshness window</p>
          <p className="kpi-value">
            {gate.freshnessWindowDays}
            <span className="hero-unit"> days</span>
          </p>
        </div>
      </div>

      <p className="muted">
        Qualifying means live, verified, in-corridor <em>and</em> confirmed
        within the freshness window. Stale inventory is counted separately
        rather than hidden — {gate.staleExcluded} listings one field visit
        away from qualifying is a different problem from not having them.
      </p>

      <p>
        <Link href="/ops/queue" className="btn btn-secondary">
          Verification queue
        </Link>{' '}
        {/* Dispatch is admin-only server-side; the link is shown to staff
            because hiding it is presentation, and the page itself renders
            the backend's 403 as an explanation rather than a stack trace. */}
        <Link href="/ops/dispatch" className="btn btn-secondary">
          Dispatch queue
        </Link>
      </p>

      {/* ── FR-10.4: admin-only ── */}
      {reconciliation && (
        <>
          <h2>Reconciliation</h2>
          <div className="kpis">
            <div className="kpi">
              <p className="kpi-label">Ledger vs custodian</p>
              <p className="kpi-value kpi-state">
                {reconciliation.latest.isReconciled ? (
                  <StatusDot tone="good" label="Agrees" />
                ) : (
                  <StatusDot tone="critical" label="Diverged" />
                )}
              </p>
            </div>
            <div className="kpi">
              <p className="kpi-label">Ledger internally</p>
              <p className="kpi-value kpi-state">
                {reconciliation.internallyConsistent ? (
                  <StatusDot tone="good" label="Balances" />
                ) : (
                  <StatusDot tone="critical" label="Unbalanced" />
                )}
              </p>
            </div>
            <div className="kpi">
              <p className="kpi-label">Last checked</p>
              <p className="kpi-value kpi-state">
                {when(reconciliation.latest.runAt)}
              </p>
            </div>
          </div>
          <p className="muted">
            These are two different failures. Disagreeing with the custodian
            is an actionable divergence; the ledger disagreeing with{' '}
            <em>itself</em> is a defect.
          </p>
          <p>
            <Link href="/ops/reconciliation" className="btn btn-secondary">
              Reconciliation detail
            </Link>
          </p>
        </>
      )}

      {deals && (
        <>
          <h2>Deals by state</h2>
          {deals.total === 0 ? (
            <Empty title="No deals yet.">
              A deal opens when an officer records an introduction, so this
              stays empty until visits start closing as conducted.
            </Empty>
          ) : (
            <>
              <BarList
                rows={Object.entries(deals.distribution)
                  .map(([label, value]) => ({ label, value }))
                  .sort((a, b) => b.value - a.value)}
              />
              <p className="muted">{deals.total} deals in total.</p>
            </>
          )}
          {/* A distribution is a shape, not a queue. The list is where a
              settlement or a refund actually gets performed (F-007). */}
          <p>
            <Link href="/ops/deals" className="btn btn-secondary">
              Open the deal queue
            </Link>
          </p>
        </>
      )}
    </>
  );
}
