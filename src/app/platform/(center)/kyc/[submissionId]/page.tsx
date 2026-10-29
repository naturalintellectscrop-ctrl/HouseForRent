import Link from 'next/link';
import { loadPlatformData } from '../../data';
import { MediaImage } from '@/app/media-image';
import { KycDecisionControl } from './decision-control';

export const metadata = {
  title: 'Review verification application',
  robots: { index: false, follow: false },
};

/**
 * One landlord verification application, the whole record: who applied,
 * what they submitted (documents render through the authorized media route
 * under THIS reviewer's session), what they declared, which terms version
 * they accepted, and the append-only trail of what reviewers decided.
 *
 * ── The three decisions stay three decisions ──
 * Identity, ownership/authority and payout are decided independently, each
 * with a required reason, each recorded with reviewer + timestamp. No
 * decision here activates an account, verifies a property, publishes a
 * listing, or switches payouts on — those belong to their own gates.
 */

interface ReviewRow {
  id: string;
  submittedAt: string;
  updatedAt: string;
  party: { id: string; displayName: string; primaryPhone: string; status: string; createdAt: string };
  legalName: string;
  idDocumentType: string;
  ageConfirmed: boolean;
  relationship: string;
  property: { id: string; landmarkText: string; neighbourhood: string | null } | null;
  titleParticulars: string | null;
  authorityExplanation: string | null;
  propertyPhotos: string[];
  evidence: {
    idFrontMediaId: string | null;
    idBackMediaId: string | null;
    selfieMediaId: string | null;
    ownershipEvidenceMediaId: string | null;
  };
  payout: {
    recipientName: string | null;
    method: string | null;
    destination: string | null;
    state: string;
    reviewNote: string | null;
  };
  declarations: Record<string, boolean>;
  termsVersion: string;
  identityState: string;
  identityReviewNote: string | null;
  authorityState: string;
  authorityReviewNote: string | null;
  lastReviewedAt: string | null;
  lastReviewedByPartyId: string | null;
}

interface ReviewAudit {
  id: string;
  eventType: string;
  actorName: string;
  payload: Record<string, unknown> | null;
  occurredAt: string;
}

const STATE_LABEL: Record<string, string> = {
  pending: 'awaiting review',
  more_info: 'information requested',
  approved: 'approved',
  rejected: 'rejected',
};

const PILL: Record<string, string> = {
  pending: 'plat-pill plat-pill-warn',
  more_info: 'plat-pill plat-pill-warn',
  approved: 'plat-pill plat-pill-ok',
  rejected: 'plat-pill plat-pill-danger',
};

const DECLARATION_LABEL: Record<string, string> = {
  identityAccurate: 'Identity information is accurate',
  relationshipHonest: 'Relationship with the property disclosed honestly',
  authorityDisclosed: 'Authority declared (or disclosed as subject to review)',
  accuracyOngoing: 'Will keep listing details accurate',
  agreeTerms: 'Agrees to the platform terms and privacy notice',
};

function Evidence({ id, label }: { id: string | null; label: string }) {
  if (!id) {
    return (
      <div className="plat-evidence">
        <div className="plat-evidence-media" aria-hidden="true" />
        <div className="plat-evidence-label">{label} · not submitted</div>
      </div>
    );
  }
  return (
    <div className="plat-evidence">
      <div className="plat-evidence-media">
        {/* Authorized read: the reviewer's session cookie authorizes this
            media request; the route re-checks it server-side. */}
        <MediaImage src={`/api/v1/media/${id}?variant=detail`} alt={label} eager />
      </div>
      <div className="plat-evidence-label">{label}</div>
    </div>
  );
}

export default async function KycReviewPage(props: { params: Promise<{ submissionId: string }> }) {
  const { submissionId } = await props.params;
  const result = await loadPlatformData(async () => {
    const { adminKycDetail } = await import('@/server/kyc');
    return adminKycDetail(submissionId);
  });

  if (!result.ok) {
    return (
      <div className="stack-lg">
        <h1 className="h1">Review application</h1>
        <div className="plat-degraded card">
          <h2 className="h2">Application unavailable</h2>
          <p className="muted">
            The platform database could not be reached, so this application
            cannot be reviewed right now. Nothing was lost — retry from the
            queue once connectivity returns.
          </p>
        </div>
        <p>
          <Link href="/platform/kyc">← Back to the verification queue</Link>
        </p>
      </div>
    );
  }

  const row = result.data.row as unknown as ReviewRow;
  const audit = result.data.audit as unknown as ReviewAudit[];

  const isOtherDocument = row.idDocumentType === 'other_document';

  return (
    <div className="stack-lg">
      <p className="plat-crumb">
        <Link href="/platform/kyc">Landlord verification</Link> / {row.party.displayName}
      </p>

      <header className="plat-review-head">
        <div className="stack-sm">
          <h1 className="h1">{row.legalName}</h1>
          <p className="muted">
            {row.party.displayName} · {row.party.primaryPhone} · applied{' '}
            {new Date(row.submittedAt).toISOString().slice(0, 10)} ·{' '}
            declared {row.relationship.replace(/_/g, ' ')}
          </p>
        </div>
        <span className={`plat-pill ${row.party.status === 'active' ? 'plat-pill-ok' : 'plat-pill-warn'}`}>
          account {row.party.status.replace(/_/g, ' ')}
        </span>
      </header>

      {isOtherDocument ? (
        <div className="card plat-section" style={{ borderLeft: '4px solid var(--accent-strong, #0a402b)' }}>
          <h2 className="h2">Owner review requested</h2>
          <p className="muted" style={{ marginBottom: 0 }}>
            The applicant chose the <strong>non-standard document path</strong>{' '}
            (they cannot hold a Ugandan National ID). This is the documented
            exception — the application is not auto-rejected, and it is not
            auto-approved either. Decide it the same way as any other, with
            the reason recorded.
          </p>
        </div>
      ) : null}

      <section className="card plat-section">
        <div className="plat-section-head">
          <h2 className="h2">Identity — documents submitted</h2>
          <span className={PILL[row.identityState]}>{STATE_LABEL[row.identityState]}</span>
        </div>
        <div className="plat-evidence-grid">
          <Evidence id={row.evidence.idFrontMediaId} label="National ID — front" />
          <Evidence id={row.evidence.idBackMediaId} label="National ID — back" />
          <Evidence id={row.evidence.selfieMediaId} label="Self-photograph" />
        </div>
        <ul className="plat-kv">
          <li>
            <span>Legal name on application</span>
            <strong>{row.legalName}</strong>
          </li>
          <li>
            <span>Account name</span>
            <strong>{row.party.displayName}</strong>
          </li>
          <li>
            <span>Phone (account)</span>
            <strong>{row.party.primaryPhone}</strong>
          </li>
          <li>
            <span>Phone verification</span>
            <strong>not verifiable — no SMS channel is configured; the number is the account&rsquo;s sign-in identity</strong>
          </li>
          <li>
            <span>Age eligibility</span>
            <strong>{row.ageConfirmed ? 'declared 18+ (a claim, not a check)' : 'not declared'}</strong>
          </li>
          <li>
            <span>Document path</span>
            <strong>{isOtherDocument ? 'other document (owner review)' : 'Ugandan National ID'}</strong>
          </li>
        </ul>
        {row.identityReviewNote ? (
          <p className="muted plat-feed-note">
            <strong>Last reviewer note:</strong> {row.identityReviewNote}
          </p>
        ) : null}
        <KycDecisionControl submissionId={row.id} section="identity" currentState={row.identityState} />
      </section>

      <section className="card plat-section">
        <div className="plat-section-head">
          <h2 className="h2">Ownership &amp; authority — what they declared</h2>
          <span className={PILL[row.authorityState]}>{STATE_LABEL[row.authorityState]}</span>
        </div>
        <div className="plat-evidence-grid">
          <Evidence id={row.evidence.ownershipEvidenceMediaId} label="Title / ownership evidence" />
          {row.propertyPhotos.length > 0
            ? row.propertyPhotos.map((id) => (
                <Evidence key={id} id={id} label="Property photograph" />
              ))
            : null}
        </div>
        <ul className="plat-kv">
          <li>
            <span>Declared relationship</span>
            <strong>{row.relationship.replace(/_/g, ' ')}</strong>
          </li>
          <li>
            <span>Linked property</span>
            <strong>
              {row.property
                ? `${row.property.landmarkText}${row.property.neighbourhood ? ` · ${row.property.neighbourhood}` : ''}`
                : 'none cited'}
            </strong>
          </li>
          <li>
            <span>Title particulars</span>
            <strong>{row.titleParticulars ?? '—'}</strong>
          </li>
          <li>
            <span>Authority explanation</span>
            <strong>{row.authorityExplanation ?? '—'}</strong>
          </li>
        </ul>
        <p className="muted plat-feed-note" style={{ marginBottom: 0 }}>
          A document upload is not a title confirmation. Approving this
          section records that a person reviewed the declared relationship
          and evidence — it never records the applicant as the property
          owner, and a broker/associated person&rsquo;s listing still needs
          its verified per-property mandate before publication.
        </p>
        {row.authorityReviewNote ? (
          <p className="muted plat-feed-note">
            <strong>Last reviewer note:</strong> {row.authorityReviewNote}
          </p>
        ) : null}
        <KycDecisionControl submissionId={row.id} section="authority" currentState={row.authorityState} />
      </section>

      <section className="card plat-section">
        <div className="plat-section-head">
          <h2 className="h2">Payout details</h2>
          <span className={PILL[row.payout.state]}>{STATE_LABEL[row.payout.state]}</span>
        </div>
        {row.payout.method ? (
          <ul className="plat-kv">
            <li>
              <span>Method</span>
              <strong>{row.payout.method === 'mobile_money' ? 'Mobile money' : row.payout.method}</strong>
            </li>
            <li>
              <span>Recipient</span>
              <strong>{row.payout.recipientName}</strong>
            </li>
            <li>
              <span>Destination</span>
              <strong className="mono">{row.payout.destination}</strong>
            </li>
          </ul>
        ) : (
          <p className="muted" style={{ margin: 0 }}>
            No payout details submitted.
          </p>
        )}
        <p className="muted plat-feed-note" style={{ marginBottom: 0 }}>
          Verifying the details is not switching payouts on: real-money
          movement stays disabled until the NylonPay merchant arrangement
          (standing external blocker) closes.
        </p>
        {row.payout.reviewNote ? (
          <p className="muted plat-feed-note">
            <strong>Last reviewer note:</strong> {row.payout.reviewNote}
          </p>
        ) : null}
        {row.payout.method ? (
          <KycDecisionControl submissionId={row.id} section="payout" currentState={row.payout.state} />
        ) : null}
      </section>

      <section className="card plat-section">
        <div className="plat-section-head">
          <h2 className="h2">Declarations &amp; terms</h2>
        </div>
        <ul className="plat-kv">
          {Object.entries(DECLARATION_LABEL).map(([key, label]) => (
            <li key={key}>
              <span>{label}</span>
              <strong>{row.declarations?.[key] === true ? 'yes' : '—'}</strong>
            </li>
          ))}
          <li>
            <span>Terms version accepted</span>
            <strong>
              <span className="mono">{row.termsVersion}</span>
            </strong>
          </li>
        </ul>
      </section>

      <section className="card plat-section">
        <div className="plat-section-head">
          <h2 className="h2">Decision trail</h2>
          <span className="muted">{audit.length} events</span>
        </div>
        {audit.length === 0 ? (
          <p className="muted">Nothing recorded yet.</p>
        ) : (
          <ul className="plat-feed">
            {audit.map((event) => {
              const detail = event.payload
                ? (event.payload as Record<string, unknown>)
                : {};
              const reason = typeof detail.reason === 'string' ? detail.reason : null;
              const section = typeof detail.section === 'string' ? detail.section : null;
              const decision = typeof detail.decision === 'string' ? detail.decision : null;
              return (
                <li key={event.id}>
                  <span className="plat-feed-when">
                    {event.occurredAt.replace('T', ' ').slice(0, 16)} UTC
                  </span>
                  <span className="plat-feed-what">
                    <strong>{event.actorName}</strong> · {event.eventType.replace(/_/g, ' ')}
                    {section ? ` (${section})` : ''}
                    {decision ? ` — ${decision.replace(/_/g, ' ')}` : ''}
                    {reason ? ` — “${reason}”` : ''}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
