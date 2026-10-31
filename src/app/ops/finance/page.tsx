import Link from 'next/link';
import { redirect } from 'next/navigation';
import { api, ApiError, type FinanceOperations, type ProviderStatementRow } from '@/lib/api';
import { AdminOnly, Empty, Icon, shillings, when } from '@/app/ui';
import { RetryRefundControl } from './retry-refund-control';
import { ImportStatementControl } from './import-statement-control';

/**
 * The finance operations console (Phase 2) - the one screen a finance
 * administrator works from. It renders STATES, not promises:
 *
 *  - duplicate payments appear when the provider's own confirmations say
 *    one arrived twice, and stay visible until a provider-confirmed refund
 *    resolves them;
 *  - refund records show their REAL execution state (pending / confirmed /
 *    failed, with the provider instruction state beside them) - a refund
 *    never reads completed because somebody asked for it;
 *  - parked deals show what they wait on;
 *  - blocked payouts say WHY they are blocked;
 *  - provider statements show their classification verdicts - the provider
 *    side of reconciliation, kept separate from the internal check that
 *    /ops/reconciliation runs.
 *
 * Everything is read from the records. Nothing on this page is synthesised,
 * and nothing here can move money except through the existing state-machine
 * actions (the retry is the one new mutation, and it only re-arms a FAILED
 * payout - the completion still requires the provider).
 */
export default async function FinancePage() {
  let data: FinanceOperations;
  let statements: ProviderStatementRow[];
  try {
    data = await api<FinanceOperations>('/v1/admin/finance/operations');
    statements = await api<ProviderStatementRow[]>('/v1/admin/finance/provider-statements');
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.status === 401) redirect('/login');
      if (err.status === 403) return <AdminOnly what="Finance operations" />;
    }
    throw err;
  }

  const { overview, duplicates, refundRecords, pendingDeals, blockedPayouts, auditTail } = data;
  const unresolvedDuplicates = duplicates.filter((d) => !d.resolved);

  return (
    <>
      <h1>Finance operations</h1>
      <p className="lede">
        The books, the workflows that move money, and the provider's own
        reported truth - each kept separate, so no figure can borrow trust
        from another.
      </p>

      {/* ── integrity first: if this is red, nothing else is readable ── */}
      <section className="stack-sm">
        <h2 className="h3">Ledger integrity</h2>
        {overview.integrity.everyPostingBalances ? (
          <p className="notice notice-ok" role="status">
            Every posting balances.
          </p>
        ) : (
          <p className="notice notice-error" role="alert">
            <strong>At least one posting does not balance.</strong> Treat every figure below as unreliable
            until this is resolved - this is a defect in our own books, not a provider disagreement.
          </p>
        )}
      </section>

      {/* ── the money, classified ── */}
      <section className="stack-sm">
        <h2 className="h3">The books (internal ledger)</h2>
        <div className="kpis">
          <div className="kpi">
            <p className="kpi-label">Rent held</p>
            <p className="kpi-value">{shillings(overview.money.heldInCustody.rent)}</p>
          </div>
          <div className="kpi">
            <p className="kpi-label">Deposit held</p>
            <p className="kpi-value">{shillings(overview.money.heldInCustody.deposit)}</p>
          </div>
          <div className="kpi">
            <p className="kpi-label">Owed to landlords</p>
            <p className="kpi-value">{shillings(overview.money.owedToLandlord)}</p>
          </div>
          <div className="kpi">
            <p className="kpi-label">Commission earned</p>
            <p className="kpi-value">{shillings(overview.money.commissionEarned)}</p>
          </div>
          <div className="kpi">
            <p className="kpi-label">Provider fees borne by HFR</p>
            <p className="kpi-value">{shillings(overview.money.providerFeesBorneByHfr)}</p>
          </div>
        </div>
        <p className="muted">{overview.money.heldInCustody.note}</p>
      </section>

      {/* ── provider + custody honesty ── */}
      <section className="stack-sm">
        <h2 className="h3">Provider status</h2>
        <p>
          PSP mode: <span className="mono">{overview.provider.pspMode}</span> · Deposit custody:{' '}
          {overview.provider.depositCustodyConfirmed ? (
            <span className="badge badge-ok">confirmed</span>
          ) : (
            <span className="badge badge-warn">NOT verified</span>
          )}
        </p>
        {overview.provider.custodyNote ? <p className="notice notice-warn">{overview.provider.custodyNote}</p> : null}
        {overview.provider.payoutDispatchNote ? (
          <p className="notice notice-warn">{overview.provider.payoutDispatchNote}</p>
        ) : null}
      </section>

      {/* ── duplicate payments ── */}
      <section className="stack-sm">
        <h2 className="h3">Duplicate payments</h2>
        {duplicates.length === 0 ? (
          <Empty title="No duplicate collection confirmations.">
            A duplicate appears here when the provider's own webhook confirms a collection a second time
            for money already booked.
          </Empty>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th scope="col">Seen</th>
                  <th scope="col">Deal</th>
                  <th scope="col">Confirmed amount</th>
                  <th scope="col">Source payment</th>
                  <th scope="col">Resolution</th>
                </tr>
              </thead>
              <tbody>
                {duplicates.map((d) => (
                  <tr key={d.eventId}>
                    <td>{when(d.seenAt)}</td>
                    <td>
                      {d.dealId ? (
                        <Link href={`/ops/deals/${d.dealId}`} className="mono">
                          {d.dealId.slice(0, 8)}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="num">{d.confirmedAmount ? shillings(d.confirmedAmount) : '—'}</td>
                    <td className="mono">{d.instructionId?.slice(0, 8) ?? '—'}</td>
                    <td>
                      {d.resolutionState === 'resolved' ? (
                        <span className="badge badge-ok">resolved — {shillings(d.confirmedReturned)} confirmed returned</span>
                      ) : d.resolutionState === 'partially_resolved' ? (
                        <span className="badge badge-warn">
                          partially resolved — {shillings(d.confirmedReturned)} returned so far
                        </span>
                      ) : d.resolutionState === 'refund_in_progress' ? (
                        <span className="badge badge-warn">refund in progress</span>
                      ) : (
                        <span className="badge badge-danger">unresolved</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {unresolvedDuplicates.length > 0 ? (
          <p className="muted">
            Resolve a duplicate on the deal page through{' '}
            <strong>Record a duplicate-payment refund</strong> - the payout is instructed through the
            provider and completes only on their confirmation. The duplicate is never booked as rent or
            commission, and its return makes no ledger posting.
          </p>
        ) : null}
      </section>

      {/* ── refunds and their actual execution state ── */}
      <section className="stack-sm">
        <h2 className="h3">Refunds & their execution</h2>
        {refundRecords.length === 0 ? (
          <Empty title="No refund records yet.">Refunds appear here the moment they are instructed.</Empty>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th scope="col">Created</th>
                  <th scope="col">Deal</th>
                  <th scope="col">Kind</th>
                  <th scope="col">Amount</th>
                  <th scope="col">Record</th>
                  <th scope="col">Provider instruction</th>
                  <th scope="col">Action</th>
                </tr>
              </thead>
              <tbody>
                {refundRecords.map((r) => (
                  <tr key={r.id}>
                    <td>{when(r.createdAt)}</td>
                    <td>
                      <Link href={`/ops/deals/${r.dealId}`} className="mono">
                        {r.dealId.slice(0, 8)}
                      </Link>
                    </td>
                    <td>{r.kind.replace(/_/g, ' ')}</td>
                    <td className="num">{shillings(r.amount)}</td>
                    <td>
                      {r.state === 'confirmed' ? (
                        <span className="badge badge-ok">confirmed</span>
                      ) : r.state === 'failed' ? (
                        <span className="badge badge-danger" title={r.failureReason ?? undefined}>
                          failed
                        </span>
                      ) : (
                        <span className="badge badge-warn">pending</span>
                      )}
                    </td>
                    <td>
                      {r.instructionState ? (
                        <span className="mono">{r.instructionState}</span>
                      ) : (
                        <span className="muted">none</span>
                      )}
                    </td>
                    <td>
                      {r.state === 'failed' ? <RetryRefundControl recordId={r.id} /> : null}
                      {r.state === 'failed' && r.failureReason ? (
                        <span className="muted" style={{ display: 'block', fontSize: '0.75rem' }}>
                          {r.failureReason}
                        </span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="muted">
          A pending refund waits for the provider's own confirmation; retrying one is refused while it is
          still unanswered. A failed one moved nothing and can be retried - each retry issues a fresh
          instruction under a new idempotency key and is audited.
        </p>
      </section>

      {/* ── deals parked on a money wait ── */}
      <section className="stack-sm">
        <h2 className="h3">Deals waiting on money</h2>
        {pendingDeals.length === 0 ? (
          <Empty title="No deals parked on a payment, settlement, or refund.">
            Payment-, settlement- and refund-pending deals appear here with the instructions they wait on.
          </Empty>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th scope="col">Deal</th>
                  <th scope="col">Parties</th>
                  <th scope="col">Status</th>
                  <th scope="col">Instructions</th>
                  <th scope="col">Updated</th>
                </tr>
              </thead>
              <tbody>
                {pendingDeals.map((d) => (
                  <tr key={d.id}>
                    <td>
                      <Link href={`/ops/deals/${d.id}`} className="mono">
                        {d.id.slice(0, 8)}
                      </Link>
                    </td>
                    <td>
                      {d.tenantName} → {d.landlordName}
                    </td>
                    <td>
                      <span className="mono">{d.status}</span>
                    </td>
                    <td>
                      {d.instructions.length === 0
                        ? '—'
                        : d.instructions.map((i) => (
                            <span key={i.id} className="mono" style={{ display: 'block', fontSize: '0.75rem' }}>
                              {i.kind} {shillings(i.amount)} · {i.state}
                            </span>
                          ))}
                    </td>
                    <td>{when(d.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── blocked payouts ── */}
      <section className="stack-sm">
        <h2 className="h3">Blocked payouts</h2>
        {blockedPayouts.length === 0 ? (
          <Empty title="No blocked payouts.">
            {overview.psp.mode === 'live'
              ? 'Pending payouts in live mode are listed here with the reason they cannot proceed.'
              : 'The sandbox settles instantly, so nothing parks here; in live mode every undispatched payout would be listed with its reason.'}
          </Empty>
        ) : (
          <div className="stack-sm">
            {blockedPayouts.map((b) => (
              <div key={b.instructionId} className="card p-4 stack-sm">
                <p>
                  <span className="mono">{b.kind}</span> {shillings(b.amount)} · instruction{' '}
                  <span className="mono">{b.instructionId.slice(0, 8)}</span> · deal{' '}
                  <Link href={`/ops/deals/${b.dealId}`} className="mono">
                    {b.dealId.slice(0, 8)}
                  </Link>
                </p>
                <p className="notice notice-warn">{b.blockedReason}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── provider statements ── */}
      <section className="stack-sm">
        <h2 className="h3">Provider statements (imported)</h2>
        <p className="muted">
          The provider's own reported transactions, imported and classified line by line. The internal
          check in <Link href="/ops/reconciliation">Reconciliation</Link> compares our books to
          themselves; a statement is where an actual provider-reported truth lands. An import never
          changes the books.
        </p>
        <ImportStatementControl />
        {statements.length === 0 ? (
          <Empty title="No statements imported yet.">
            When a statement (or transaction report) is available, import it here - the rows are preserved
            and classified: matched, mismatched, duplicate, unexpected, unmatched.
          </Empty>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th scope="col">Imported</th>
                  <th scope="col">Provider</th>
                  <th scope="col">Rows</th>
                  <th scope="col">Matched</th>
                  <th scope="col">Exceptions</th>
                  <th scope="col">Note</th>
                </tr>
              </thead>
              <tbody>
                {statements.map((s) => (
                  <tr key={s.id}>
                    <td>{when(s.createdAt)}</td>
                    <td className="mono">{s.provider}</td>
                    <td className="num">{s.lineCount}</td>
                    <td className="num">{s.counts.matched ?? 0}</td>
                    <td>
                      {s.hasExceptions ? (
                        <span className="badge badge-warn">
                          {s.lineCount - (s.counts.matched ?? 0)} to review
                        </span>
                      ) : (
                        <span className="badge badge-ok">none</span>
                      )}
                    </td>
                    <td>{s.note ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── policy approvals still pending ── */}
      <section className="stack-sm">
        <h2 className="h3">Pending policy approvals</h2>
        <div className="stack-sm">
          {overview.pendingPolicyApprovals.map((p) => (
            <p key={p.key} className="notice">
              <strong>{p.question}</strong> — {p.status}
            </p>
          ))}
        </div>
      </section>

      {/* ── audit tail ── */}
      <section className="stack-sm">
        <h2 className="h3">Financial audit trail (recent)</h2>
        {auditTail.length === 0 ? (
          <Empty title="No financial events yet." />
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th scope="col">When</th>
                  <th scope="col">Event</th>
                  <th scope="col">Actor</th>
                  <th scope="col">Subject</th>
                </tr>
              </thead>
              <tbody>
                {auditTail.map((e) => (
                  <tr key={e.id}>
                    <td>{when(e.occurredAt)}</td>
                    <td>
                      <span className="mono">{e.eventType}</span>
                    </td>
                    <td>{e.actorName}</td>
                    <td className="mono">{e.subjectRef?.slice(0, 8) ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="muted">
          Full, immutable history lives in the audit log; this is the recent tail for orientation.
        </p>
      </section>

      <p className="muted" style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
        <Icon.shield size={14} /> Nothing on this page claims the provider's custody, balance, or
        confirmation beyond what the records literally hold.
      </p>
    </>
  );
}
