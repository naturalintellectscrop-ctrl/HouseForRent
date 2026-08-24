import Link from 'next/link';
import { api } from '@/lib/api';
import type { IdentityStatus } from '@/lib/portal';
import { Icon } from '@/app/ui';
import { IdentityForm } from './identity-form';

export const metadata = { title: 'Verify your identity' };

/**
 * Tenant identity verification (FR-1.2, FR-1.4).
 *
 * ── The page says what the system actually does ──
 * V1 runs a mock identity provider. This page therefore does not show a
 * government crest, does not say "checked against the national register",
 * and does not imply a check that has not happened. It says what it is. A
 * product that sells verification cannot be the thing that overstates its
 * own.
 */
export default async function IdentityPage() {
  const identity = await api<IdentityStatus>('/v1/identity/me');

  if (identity.identityVerified) {
    return (
      <div className="stack-lg" style={{ maxWidth: '38rem' }}>
        <div className="stack">
          <span className="badge badge-ok">
            <Icon.check size={12} />
            Verified
          </span>
          <h1 className="h1">Your identity is verified</h1>
          <p className="lede">
            You can request viewings. Landlords are told that you are
            identity-verified — never your personal details.
          </p>
        </div>

        <dl className="terms card">
          <div className="terms-row">
            <dt>Identity</dt>
            <dd>Verified</dd>
          </div>
          <div className="terms-row">
            <dt>Screening</dt>
            <dd>{identity.screeningState ?? 'Not yet run'}</dd>
          </div>
          <div className="terms-row">
            <dt>Consent recorded</dt>
            <dd>
              {identity.consentRecordedAt
                ? new Date(identity.consentRecordedAt).toLocaleDateString(
                    'en-GB',
                    { day: 'numeric', month: 'long', year: 'numeric' },
                  )
                : '—'}
            </dd>
          </div>
        </dl>

        <div className="row">
          <Link href="/properties" className="btn btn-primary">
            Find a home
          </Link>
          <Link href="/account" className="btn btn-secondary">
            Back to my account
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="stack-lg" style={{ maxWidth: '38rem' }}>
      <div className="stack">
        <h1 className="h1">Verify your identity</h1>
        <p className="lede">
          We verify every tenant before they meet a landlord. It is the same
          protection running in both directions, and it is a large part of why
          landlords accept our terms.
        </p>
      </div>

      <div className="notice notice-info">
        <strong>What this currently does.</strong> House For Rent is running a
        development identity provider, so this records your consent and your
        details and marks the checks complete. It is not yet a live query
        against the national register. We would rather tell you that than
        imply a check we have not made.
      </div>

      <IdentityForm />

      <div className="card stack-sm">
        <h2 className="h3">What we keep</h2>
        <p className="muted">
          Your National Identification Number is passed to the identity
          provider and is <strong>not stored</strong> by House For Rent — only
          the verification outcome and an opaque provider reference are kept.
          A landlord is told that you are verified, and never sees the number.
        </p>
      </div>
    </div>
  );
}
