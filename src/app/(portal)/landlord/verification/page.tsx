import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { Empty, Icon } from '@/app/ui';
import { currentSession } from '@/lib/session';
import { listOwnPropertyOptions } from '@/server/kyc';
import { KycApplication } from './application-form';
import { KycStatusCard } from './status-card';

export const metadata = { title: 'Landlord verification' };

/** The status shape the in-process resolver for /v1/landlord/kyc returns. */
export interface KycStatusView {
  storeReady: boolean;
  terms: {
    currentVersion: string;
    accepted: { version: string; acceptedAt: string } | null;
    history: Array<{ version: string; acceptedAt: string }>;
    current: boolean;
  };
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
  } | null;
  history: Array<{
    id: string;
    submittedAt: string;
    identityState: string;
    authorityState: string;
    payoutState: string;
  }>;
}

/**
 * Landlord onboarding verification — the one surface that walks a landlord
 * through the three reviews the platform actually runs on them:
 *
 *   1. the landlord onboarding terms (read + accept, versioned),
 *   2. the application (identity documents, ownership/authority, payout
 *      details, accountability declarations),
 *   3. the recorded review outcomes (identity / authority / payout, each
 *      independently decided by a human reviewer, with reasons).
 *
 * The page renders state; the API and the service decide it. A section a
 * reviewer sent back (more_info) can be resubmitted; decided sections are
 * history, not inputs.
 */
export default async function LandlordVerificationPage() {
  const session = await currentSession();
  if (!session) return <Empty title="Sign in to continue." />;

  let status: KycStatusView;
  try {
    status = await api<KycStatusView>('/v1/landlord/kyc');
  } catch (err) {
    if (err instanceof ApiError && err.status === 403) {
      return (
        <Empty title="Landlord verification is a landlord surface.">
          Your account is not a landlord account.
        </Empty>
      );
    }
    throw err;
  }
  const properties = await listOwnPropertyOptions(session.partyId).catch(() => []);

  return (
    <div className="stack-lg" style={{ maxWidth: '52rem' }}>
      <header className="stack-sm">
        <h1 className="h1">Landlord verification</h1>
        <p className="lede">
          Before your listings can go far, we review who you are, your
          relationship with the property you want to advertise, and — where
          payouts become possible — the account details for it. Three
          reviews, decided separately by our team, with reasons recorded.
        </p>
      </header>

      {!status.terms.current ? (
        <div className="card stack">
          <div className="card-head">
            <span className="card-title">Step 1 — the onboarding terms</span>
            <span className="badge badge-warn">required first</span>
          </div>
          <p className="muted">
            Read the landlord onboarding terms and accept the current
            version. The acceptance is recorded against your account
            (version + timestamp) and is checked server-side when you
            submit your application — a ticked box never decides it.
          </p>
          <p style={{ margin: 0 }}>
            <Link href="/landlord/terms" className="btn btn-primary">
              Read the onboarding terms
            </Link>
          </p>
        </div>
      ) : (
        <div className="card" style={{ padding: '0.9rem 1.1rem' }}>
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <span>
              <span className="badge badge-ok">
                <Icon.check size={12} /> Onboarding terms accepted
              </span>{' '}
              <span className="faint" style={{ fontSize: '0.8125rem' }}>
                version <span className="mono">{status.terms.currentVersion}</span>
              </span>
            </span>
            <Link href="/landlord/terms" className="btn btn-ghost btn-sm">
              Read them again
            </Link>
          </div>
        </div>
      )}

      {!status.storeReady ? (
        <div className="notice notice-info">
          <strong>Being rolled out.</strong> The verification application
          store is not provisioned in this environment yet, so new
          applications are paused. The onboarding terms above still work,
          and nothing you have accepted is lost — check back shortly.
        </div>
      ) : null}

      {status.storeReady && status.application ? (
        <KycStatusCard application={status.application} termsCurrent={status.terms.current} />
      ) : status.storeReady && status.terms.current ? (
        <KycApplication
          mode="create"
          properties={properties}
          termsVersion={status.terms.currentVersion}
        />
      ) : null}

      {status.history.length > 1 ? (
        <div className="card">
          <div className="card-head">
            <span className="card-title">Earlier applications</span>
            <span className="muted">{status.history.length - 1}</span>
          </div>
          <ul className="list">
            {status.history.slice(1).map((h) => (
              <li key={h.id} className="list-item">
                <span>
                  <strong>Application</strong>{' '}
                  <span className="faint" style={{ fontSize: '0.8125rem' }}>
                    submitted{' '}
                    {new Date(h.submittedAt).toLocaleDateString('en-GB', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </span>
                </span>
                <span className="badge">
                  {h.identityState.replace('_', ' ')} · {h.authorityState.replace('_', ' ')}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
