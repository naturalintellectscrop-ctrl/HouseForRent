import Link from 'next/link';
import { adminPartyDetail, PartyNotFoundError } from '@/server/ops';
import { DegradedPanel, humanize, loadPlatformData, roleLabel } from '../../data';
import { IdentityCheckControl } from '@/app/ops/users/[partyId]/identity-check';
import { ApproveApplicationControl } from './approve-control';
import { RejectApplicationControl } from './reject-control';

export const metadata = {
  title: 'Review application',
  robots: { index: false, follow: false },
};

/**
 * One account application, and the two decisions the platform can take.
 *
 * ── Two decisions, one evidence tool ──
 * Approval is the platform's recorded decision to activate (reviewer,
 * moment and optional basis on the trail). The operations-run identity
 * check stays available as the stronger EVIDENCE for that decision - the
 * same outcome logic the applicant runs on themselves - and a verified
 * result also activates. Rejection is the recorded counterpart - a
 * required reason on the audit trail - because the status vocabulary
 * could always express it but nothing could record it.
 *
 * ── What each decision does and does not grant (stated, not implied) ──
 * An activation makes the PERSON an active platform account. It does not
 * verify any property, does not approve or publish any listing (that is
 * the field-officer publish gate), and does not grant staff privileges.
 * The controls below say so where the reviewer acts.
 */
export default async function ReviewApplicationPage(props: {
  params: Promise<{ partyId: string }>;
}) {
  const { partyId } = await props.params;
  const result = await loadPlatformData(() => adminPartyDetail(partyId));

  if (!result.ok) {
    return (
      <div className="stack-lg">
        <h1 className="h1">Review application</h1>
        <DegradedPanel title="Account unavailable" />
        <p className="muted">
          If the account should exist, find it again from the{' '}
          <Link href="/platform/approvals">applications queue</Link>.
        </p>
      </div>
    );
  }
  const detail = result.data;
  const { party, identity } = detail;

  if (detail.role !== 'tenant' && detail.role !== 'lister') {
    return (
      <div className="stack-lg">
        <header className="stack-sm">
          <h1 className="h1">{party.displayName}</h1>
          <p className="muted">
            This is a provisioned staff account ({roleLabel(detail.role)}).
            Staff are never applications - they are created by an
            administrator through the authorized provisioning route.
          </p>
        </header>
        <p>
          <Link href="/platform/approvals">← Back to applications</Link>
        </p>
      </div>
    );
  }

  const isPending = detail.accountStatus === 'pending_verification';
  const isRejected =
    detail.accountStatus === 'suspended' &&
    detail.audit.some((a) => a.action === 'account_application_rejected');
  const isApproved = detail.accountStatus === 'active';
  const approvedEvent = detail.audit.find((a) => a.action === 'account_application_approved');
  const rejectedEvent = detail.audit.find((a) => a.action === 'account_application_rejected');

  return (
    <div className="stack-lg">
      <p className="plat-crumb">
        <Link href="/platform/approvals">Applications</Link> / {party.displayName}
      </p>

      <header className="plat-review-head">
        <div className="stack-sm">
          <h1 className="h1">{party.displayName}</h1>
          <p className="muted">
            {roleLabel(detail.role)} application · {party.primaryPhone}
            {detail.listerTier ? ` · ${humanize(detail.listerTier)}` : ''} ·
            applied {party.createdAt.toISOString().slice(0, 10)}
          </p>
        </div>
        <span
          className={`plat-pill ${
            isPending ? 'plat-pill-warn' : detail.accountStatus === 'active' ? 'plat-pill-ok' : 'plat-pill-danger'
          }`}
        >
          {isRejected ? 'Application rejected' : humanize(detail.accountStatus)}
        </span>
      </header>

      {isApproved || isRejected ? (
        <div className="card plat-section">
          <h2 className="h2">Decision recorded</h2>
          {isApproved ? (
            approvedEvent ? (
              <p key={approvedEvent.id} className="muted" style={{ margin: 0 }}>
                Approved by <strong>{approvedEvent.actorName}</strong> on{' '}
                {approvedEvent.createdAt.toISOString().replace('T', ' ').slice(0, 16)} UTC
                {approvedEvent.detail && typeof approvedEvent.detail.note === 'string'
                  ? ` - “${approvedEvent.detail.note}”`
                  : ''}
                . The account is active.
              </p>
            ) : (
              <p className="muted" style={{ margin: 0 }}>
                The account is active - activated by a passing identity check.
              </p>
            )
          ) : rejectedEvent ? (
            <p key={rejectedEvent.id} className="muted" style={{ margin: 0 }}>
              Rejected by <strong>{rejectedEvent.actorName}</strong> on{' '}
              {rejectedEvent.createdAt.toISOString().replace('T', ' ').slice(0, 16)} UTC
              {rejectedEvent.detail && typeof rejectedEvent.detail.reason === 'string'
                ? ` - “${rejectedEvent.detail.reason}”`
                : ''}
              .
            </p>
          ) : null}
          <p className="muted plat-feed-note" style={{ marginBottom: 0 }}>
            {isRejected
              ? 'The account is refused at sign-in by the account-status policy. No further decisions are available on a rejected application.'
              : 'The person can sign in and use the platform. Property verification, listing publication and payouts keep their own gates.'}
          </p>
        </div>
      ) : null}

      <div className="plat-grid-2">
        <section className="card plat-section">
          <div className="plat-section-head">
            <h2 className="h2">Application</h2>
          </div>
          <ul className="plat-kv">
            <li>
              <span>Account status</span>
              <strong>{humanize(detail.accountStatus)}</strong>
            </li>
            <li>
              <span>Role</span>
              <strong>{roleLabel(detail.role)}</strong>
            </li>
            {detail.listerTier ? (
              <li>
                <span>Lister tier</span>
                <strong>{humanize(detail.listerTier)}</strong>
              </li>
            ) : null}
            <li>
              <span>Applied</span>
              <strong>{party.createdAt.toISOString().replace('T', ' ').slice(0, 16)} UTC</strong>
            </li>
            <li>
              <span>Last sign-in</span>
              <strong>
                {detail.lastLoginAt
                  ? `${detail.lastLoginAt.toISOString().replace('T', ' ').slice(0, 16)} UTC`
                  : 'never'}
              </strong>
            </li>
          </ul>
        </section>

        <section className="card plat-section">
          <div className="plat-section-head">
            <h2 className="h2">Identity</h2>
          </div>
          <ul className="plat-kv">
            <li>
              <span>Latest state</span>
              <strong>
                {identity.state === null ? 'no attempt yet' : humanize(identity.state)}
              </strong>
            </li>
            <li>
              <span>Method</span>
              <strong>{identity.method ? humanize(identity.method) : '—'}</strong>
            </li>
            <li>
              <span>Attempts recorded</span>
              <strong>{identity.attempts}</strong>
            </li>
            <li>
              <span>Provider</span>
              <strong>{identity.provider ?? '—'}</strong>
            </li>
          </ul>
          <p className="muted plat-feed-note" style={{ marginBottom: 0 }}>
            The identity provider is the sandbox mock: it checks the NIN&rsquo;s
            structure and the name match, and it says so. It is not a live
            national-register query.
          </p>
        </section>
      </div>

      {isPending ? (
        <>
          <div className="plat-decide-grid">
            <section className="card plat-section plat-decide">
              <div className="plat-section-head">
                <h2 className="h2">Approve - activate the account</h2>
              </div>
              <p className="muted" style={{ marginTop: 0 }}>
                The platform&rsquo;s decision: this person is verified to
                your satisfaction and welcome. Their account goes active
                immediately, and the decision - with you as the reviewer,
                and an optional note on your basis - is recorded on the
                trail below.
              </p>
              <ul className="plat-scope-list">
                <li className="is-grant">
                  <strong>Grants:</strong> an active platform account.
                </li>
                <li className="is-limit">
                  <strong>Does not:</strong> verify any property, publish any
                  listing (field-officer gate), or grant staff access.
                </li>
              </ul>
              <ApproveApplicationControl partyId={party.id} displayName={party.displayName} />
            </section>

            <section className="card plat-section plat-decide">
              <div className="plat-section-head">
                <h2 className="h2">Reject the application</h2>
              </div>
              <RejectApplicationControl partyId={party.id} displayName={party.displayName} />
            </section>
          </div>

          <section className="card plat-section">
            <div className="plat-section-head">
              <h2 className="h2">Stronger evidence (optional) - run the identity check</h2>
            </div>
            <p className="muted" style={{ marginTop: 0 }}>
              The same sandbox check the applicant runs on themselves: the
              NIN&rsquo;s structure, and whether the name matches this
              account. A verified result also activates a still-pending
              account - use it when you want the check itself on the trail,
              not only the decision.
            </p>
            <IdentityCheckControl
              partyId={party.id}
              displayName={party.displayName}
              currentState={identity.state}
            />
          </section>
        </>
      ) : !isRejected ? (
        <p className="muted">
          This account has already been decided - it is{' '}
          {humanize(detail.accountStatus)}. Identity checks remain available
          on the <Link href={`/ops/users/${party.id}`}>staff account page</Link>{' '}
          for the phone-support path.
        </p>
      ) : null}

      {detail.properties.length > 0 ? (
        <section className="card plat-section">
          <div className="plat-section-head">
            <h2 className="h2">Properties already held</h2>
          </div>
          <ul className="plat-kv">
            {detail.properties.slice(0, 5).map((p) => (
              <li key={p.id}>
                <span>
                  {p.label} · {p.neighbourhood}
                </span>
                <strong>{p.listingCount} listing{p.listingCount === 1 ? '' : 's'}</strong>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="card plat-section">
        <div className="plat-section-head">
          <h2 className="h2">Account trail</h2>
        </div>
        {detail.audit.length === 0 ? (
          <p className="muted">Nothing recorded yet.</p>
        ) : (
          <ul className="plat-feed">
            {detail.audit.map((event) => (
              <li key={event.id}>
                <span className="plat-feed-when">
                  {event.createdAt.toISOString().replace('T', ' ').slice(0, 16)} UTC
                </span>
                <span className="plat-feed-what">
                  <strong>{event.actorName}</strong> · {humanize(event.action)}
                  {event.action === 'account_application_rejected' &&
                  event.detail &&
                  typeof event.detail.reason === 'string'
                    ? ` - “${event.detail.reason}”`
                    : ''}
                  {event.action === 'account_application_approved' &&
                  event.detail &&
                  typeof event.detail.note === 'string'
                    ? ` - “${event.detail.note}”`
                    : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
