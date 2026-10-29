import Link from 'next/link';
import { KycApplication } from './application-form';

const STATE_LABEL: Record<string, string> = {
  pending: 'Awaiting review',
  more_info: 'More information requested',
  approved: 'Approved',
  rejected: 'Not approved',
};

const STATE_BADGE: Record<string, string> = {
  pending: 'badge',
  more_info: 'badge badge-warn',
  approved: 'badge badge-ok',
  rejected: 'badge badge-warn',
};

function Section({
  title,
  state,
  note,
  children,
}: {
  title: string;
  state: string;
  note: string | null;
  children?: React.ReactNode;
}) {
  return (
    <div className="card stack-sm">
      <div className="card-head">
        <span className="card-title">{title}</span>
        <span className={STATE_BADGE[state] ?? 'badge'}>{STATE_LABEL[state] ?? state}</span>
      </div>
      {note ? (
        <p className="alert alert-note" style={{ margin: 0 }}>
          <strong>Reviewer:</strong> {note}
        </p>
      ) : null}
      {children}
    </div>
  );
}

/**
 * The applicant's recorded review state, one card per section. A section
 * the reviewer sent back (more_info) offers an inline resubmission form —
 * decided sections render as history and offer nothing to edit, because
 * they are not inputs any more.
 */
export function KycStatusCard({
  application,
  termsCurrent,
}: {
  application: {
    id: string;
    submittedAt: string;
    updatedAt: string;
    legalName: string;
    idDocumentType: string;
    relationship: string;
    identityState: string;
    identityReviewNote: string | null;
    authorityState: string;
    authorityReviewNote: string | null;
    payoutState: string;
    payoutReviewNote: string | null;
    payoutProvided: boolean;
    isOpen: boolean;
    hasIdFront: boolean;
    hasIdBack: boolean;
    hasSelfie: boolean;
    hasOwnershipEvidence: boolean;
    propertyPhotoCount: number;
  };
  termsCurrent: boolean;
}) {
  const allDecided = !application.isOpen;

  return (
    <div className="stack">
      <div className="card" style={{ padding: '0.9rem 1.1rem' }}>
        <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
          <strong>
            Application submitted{' '}
            {new Date(application.submittedAt).toLocaleDateString('en-GB', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </strong>
          <span className="faint" style={{ fontSize: '0.8125rem' }}>
            {allDecided
              ? 'Every section has a recorded decision.'
              : 'Our team reviews each section; you will see decisions here.'}
          </span>
        </div>
      </div>

      <Section
        title="Identity review"
        state={application.identityState}
        note={application.identityReviewNote}
      >
        <p className="muted" style={{ margin: 0 }}>
          Legal name <strong>{application.legalName}</strong> ·{' '}
          {application.idDocumentType === 'national_id'
            ? 'Ugandan National ID path'
            : 'Non-standard document path (held for a manual review)'}{' '}
          · {[
            application.hasIdFront ? 'ID front' : null,
            application.hasIdBack ? 'ID back' : null,
            application.hasSelfie ? 'self-photograph' : null,
          ]
            .filter(Boolean)
            .join(', ')}
        </p>
        <p className="faint" style={{ fontSize: '0.8125rem', margin: 0 }}>
          A reviewer looks at the documents you submitted. This is a manual
          review, not an independent identity check.
        </p>
      </Section>

      <Section
        title="Ownership &amp; authority review"
        state={application.authorityState}
        note={application.authorityReviewNote}
      >
        <p className="muted" style={{ margin: 0 }}>
          Declared relationship: <strong>{application.relationship.replace(/_/g, ' ')}</strong>
          {application.hasOwnershipEvidence ? ' · title evidence attached' : ''}
          {application.propertyPhotoCount > 0
            ? ` · ${application.propertyPhotoCount} property photograph${application.propertyPhotoCount === 1 ? '' : 's'}`
            : ''}
        </p>
        <p className="faint" style={{ fontSize: '0.8125rem', margin: 0 }}>
          Your declared relationship stays what you declared it — a broker or
          associated person is never recorded as the property owner.
        </p>
      </Section>

      {application.payoutProvided ? (
        <Section
          title="Payout verification"
          state={application.payoutState}
          note={application.payoutReviewNote}
        >
          <p className="muted" style={{ margin: 0 }}>
            Mobile-money payout details submitted. Verification confirms the
            details only — real payouts stay switched off until the
            platform&rsquo;s payment-provider arrangements are complete.
          </p>
        </Section>
      ) : (
        <div className="card" style={{ padding: '0.9rem 1.1rem' }}>
          <p className="muted" style={{ margin: 0 }}>
            <strong>Payout details:</strong> not provided yet. Optional
            while payout processing is offline — you can add them when the
            platform&rsquo;s payment-provider arrangements are in place.
          </p>
        </div>
      )}

      {application.identityState === 'more_info' || application.authorityState === 'more_info' || application.payoutState === 'more_info' ? (
        termsCurrent ? (
          <KycApplication
            mode="resubmit"
            applicationId={application.id}
            termsVersion=""
            properties={[]}
          />
        ) : (
          <div className="notice notice-info">
            A new onboarding-terms version needs your acceptance before this
            application can be updated —{' '}
            <Link href="/landlord/terms">read and accept it</Link> first.
          </div>
        )
      ) : null}
    </div>
  );
}
