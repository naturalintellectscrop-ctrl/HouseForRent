import Link from 'next/link';
import type { DealDetail } from '@/lib/api';
import {
  DEAL_TRAIL,
  dealHeadline,
  statusTone,
  trailPosition,
} from '@/lib/portal';
import { Icon, onDay, shillings, Status, when } from '@/app/ui';
import { DealAction } from '@/app/ops/deals/[dealId]/deal-action';

/**
 * One deal, as one of its parties sees it.
 *
 * ── Why tenant and landlord share this component ──
 * They see the same deal, the same ledger position and the same progress.
 * What differs is `availableActions`, and that difference is decided by the
 * SERVER from the caller's role and party — not here. Two components would
 * have been two places to forget to render an action the server offered, or
 * to render one it did not.
 *
 * ── Nothing on this page is computed ──
 * Every figure comes from `financial`, which the API derives from the
 * ledger. Every action comes from `availableActions`, which the API derives
 * from the real transition graph and the real `@Roles()` decorators. This
 * file contains no arithmetic on money and no map from status to action;
 * the only status table it uses is a display ORDER for the progress trail,
 * which decides how far a marker sits along a line and nothing else.
 */
export function DealView({
  detail,
  side,
  backHref,
}: {
  detail: DealDetail;
  side: 'tenant' | 'landlord';
  backHref: string;
}) {
  const { deal, financial, availableActions, transitions } = detail;
  const position = trailPosition(deal.status);
  const derailed = position === -1;

  return (
    <div className="stack-lg">
      <p>
        <Link href={backHref} className="btn btn-ghost btn-sm">
          ← Back
        </Link>
      </p>

      <header className="stack-sm">
        <div className="row">
          <Status tone={statusTone(deal.status)}>
            {deal.status.replace(/_/g, ' ')}
          </Status>
          <span className="faint" style={{ fontSize: '0.875rem' }}>
            Opened {onDay(deal.createdAt)}
          </span>
        </div>
        <h1 className="h1">
          {detail.property.bedrooms}-bed {detail.property.propertyType} in{' '}
          {detail.property.neighbourhood}
        </h1>
        <p className="lede">{dealHeadline(deal.status, side)}</p>
      </header>

      <div className="detail-grid">
        <div className="stack-lg">
          {/* ── progress ─────────────────────────────────────────── */}
          <section className="stack">
            <h2 className="h2">Where this has got to</h2>
            {derailed ? (
              <p className="notice notice-warn">
                This letting is in the <strong>{deal.status.replace(/_/g, ' ')}</strong>{' '}
                state, which is outside the normal sequence. The history below
                records exactly how it got there.
              </p>
            ) : (
              <ol className="trail">
                {DEAL_TRAIL.map((step, i) => (
                  <li
                    key={step.status}
                    className={
                      i < position ? 'is-done' : i === position ? 'is-now' : ''
                    }
                  >
                    <div>
                      <span className="trail-title">{step.label}</span>
                      {i === position ? (
                        <span className="trail-note">
                          {' '}
                          — where you are now
                        </span>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>

          {/* ── actions the SERVER offers ────────────────────────── */}
          <section className="stack">
            <h2 className="h2">What you can do</h2>
            {availableActions.length === 0 ? (
              <p className="notice notice-info">
                {/* Deliberately not "you have no permissions": the honest
                    reading is usually that it is somebody else's turn. */}
                Nothing is waiting on you at this stage. We will tell you when
                it is your turn.
              </p>
            ) : (
              availableActions.map((action) => (
                <DealAction
                  key={action.action}
                  dealId={deal.id}
                  action={action}
                  amounts={{
                    heldInEscrow: financial.heldInEscrow,
                    commissionAmount: financial.commissionAmount,
                  }}
                />
              ))
            )}
          </section>

          {/* ── history ──────────────────────────────────────────── */}
          <section className="stack">
            <h2 className="h2">History</h2>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>When</th>
                    <th>From</th>
                    <th>To</th>
                    <th>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {transitions.map((t) => (
                    <tr key={t.id}>
                      <td className="num">{when(t.occurredAt)}</td>
                      <td>{t.fromStatus.replace(/_/g, ' ')}</td>
                      <td>{t.toStatus.replace(/_/g, ' ')}</td>
                      <td className="muted">{t.reason ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        {/* ── the money ──────────────────────────────────────────── */}
        <aside className="detail-aside stack">
          <div className="card stack">
            <h2 className="h3">The money</h2>
            <dl className="terms">
              <div className="terms-row">
                <dt>Agreed rent</dt>
                <dd className="num">
                  {financial.monthlyRentSnapshot
                    ? shillings(financial.monthlyRentSnapshot)
                    : 'not yet agreed'}
                </dd>
              </div>
              <div className="terms-row">
                <dt>Due at agreement</dt>
                <dd className="num">{shillings(financial.expectedUpfront)}</dd>
              </div>
              <div className="terms-row">
                <dt>Funded so far</dt>
                <dd className="num">{shillings(financial.funded)}</dd>
              </div>
              <div className="terms-row terms-total">
                <dt>Held in escrow now</dt>
                <dd className="num">{shillings(financial.heldInEscrow)}</dd>
              </div>
            </dl>

            <hr className="divider" style={{ margin: '0.5rem 0' }} />

            <dl className="terms">
              <div className="terms-row">
                <dt>Released to the landlord</dt>
                <dd className="num">
                  {shillings(financial.releasedToLandlord)}
                </dd>
              </div>
              <div className="terms-row">
                <dt>Refunded</dt>
                <dd className="num">{shillings(financial.refunded)}</dd>
              </div>
              <div className="terms-row">
                <dt>
                  {side === 'landlord'
                    ? 'Our commission'
                    : 'Commission (paid by the landlord)'}
                </dt>
                <dd className="num">
                  {financial.commissionAmount
                    ? shillings(financial.commissionAmount)
                    : '—'}
                </dd>
              </div>
            </dl>

            {/* Every figure above is server-derived from the ledger. */}
            <p className="hint">
              These figures come from the transaction ledger, not from this
              page. {side === 'tenant' ? 'You are never charged a fee.' : null}
            </p>
          </div>

          <div className="card stack-sm">
            <h2 className="h3">
              {side === 'tenant' ? 'Your landlord' : 'Your tenant'}
            </h2>
            <p className="muted">
              {side === 'tenant'
                ? detail.parties.landlord.displayName
                : detail.parties.tenant.displayName}
            </p>
            <p className="faint" style={{ fontSize: '0.875rem' }}>
              {detail.property.landmarkText}, {detail.property.neighbourhood}
            </p>
            <p>
              <Link
                href={`/properties/${deal.listingId}`}
                className="btn btn-secondary btn-sm"
              >
                View the property
              </Link>
            </p>
          </div>

          {side === 'tenant' ? (
            <div className="trust">
              <h3 className="row" style={{ gap: '0.4rem' }}>
                <Icon.lock size={16} />
                Your protection
              </h3>
              <ul className="trust-list">
                <li>
                  <Icon.check size={14} />
                  <span>
                    Your money is held by House For Rent, not the landlord.
                  </span>
                </li>
                <li>
                  <Icon.check size={14} />
                  <span>
                    It is released only after you confirm you have moved in.
                  </span>
                </li>
                <li>
                  <Icon.check size={14} />
                  <span>
                    If the move-in does not happen, it is refunded in full.
                  </span>
                </li>
              </ul>
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
