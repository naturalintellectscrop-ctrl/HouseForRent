import Link from 'next/link';
import { api } from '@/lib/api';
import { Icon, onDay } from '@/app/ui';
import { AcceptTermsControl } from './accept-control';

export const metadata = { title: 'Landlord onboarding terms' };

/**
 * The landlord onboarding terms — the readable instrument a landlord
 * accepts before their verification application can be submitted.
 *
 * ── The honesty rules ──
 * It describes what the platform ACTUALLY does and does not do (the same
 * register the public /terms page holds), covers the eleven onboarding
 * topics, and never promises a protection the product, the provider, or
 * the legal arrangements do not support. Where a question is still with
 * counsel, the page says so. This is a product implementation draft, not
 * legal advice and not a substitute for counsel review.
 */
export default async function LandlordTermsPage() {
  const terms = await api<{
    currentVersion: string;
    accepted: { version: string; acceptedAt: string } | null;
    history: Array<{ version: string; acceptedAt: string }>;
    current: boolean;
  }>('/v1/landlord/terms').catch(() => null);

  return (
    <div className="stack-lg" style={{ maxWidth: '46rem' }}>
      <header className="stack-sm">
        <h1 className="h1">Landlord onboarding terms</h1>
        <p className="lede">
          These terms cover what listing on House For Rent involves: what we
          do, what we never guarantee, what verification means, and how your
          information is handled. Please read them before accepting — the
          acceptance is recorded against your account with a version and a
          timestamp.
        </p>
        <p className="muted">
          Version <span className="mono">{terms?.currentVersion ?? 'landlord-onboarding-2026-10-29'}</span>{' '}
          · part of the platform-wide <Link href="/terms">Terms of Service</Link>{' '}
          and <Link href="/privacy">Privacy Policy</Link>, which continue to apply.
        </p>
      </header>

      <div className="card stack-sm">
        <h2 className="h3">1. Our role, and what we do not guarantee</h2>
        <p className="muted">
          House For Rent (operated by Natural Intellects Ltd, Kampala) is a
          marketplace and a verification layer. We list rental homes our
          field officers have visited, we mediate viewings, and we record
          dealings that happen through the platform. We are not a landlord,
          not a letting agent of record, and not a party to any tenancy. We
          do not guarantee that a tenant will care for a home, that a
          landlord will honour an agreement, or that any listing will let.
        </p>
      </div>

      <div className="card stack-sm">
        <h2 className="h3">2. Listing accuracy</h2>
        <p className="muted">
          You are responsible for the accuracy of what you list: location,
          rent, property details, photographs, and availability. Our field
          officers check listings against what you submit, and availability
          decays with time — keep your listing current, and tell us promptly
          about material changes (price, availability, condition). Listings
          that fail verification are not published until they are corrected.
        </p>
      </div>

      <div className="card stack-sm">
        <h2 className="h3">3. Ownership and authority</h2>
        <p className="muted">
          Only list a property you own, or market one you have real
          authority to let. If you are a broker, agent, or another person
          associated with the property, say so plainly in your verification
          application — a broker or associated person is never recorded as
          the property owner. A listing marketed for someone else cannot go
          live until the authority behind it has been verified (a per-
          property mandate). Misstating your relationship with a property
          is grounds for suspension.
        </p>
      </div>

      <div className="card stack-sm">
        <h2 className="h3">4. What verification means here</h2>
        <p className="muted">
          You may be asked to submit identity documents (such as a National
          ID and a self-photograph), property documents, and photographs.
          Our team reviews what you submit. Approval means a human reviewed
          the documents you provided and found them consistent with your
          application — it is not an independent investigation, not a
          government check, and not a guarantee of your identity or your
          title. A property&rsquo;s &ldquo;verified&rdquo; label means our
          officer visited it — it is about the property, not about you.
        </p>
      </div>

      <div className="card stack-sm">
        <h2 className="h3">5. Field operations and viewings</h2>
        <p className="muted">
          Our officers visit properties to verify condition, accuracy and
          availability, and they conduct viewings with prospective tenants.
          You agree to cooperate with reasonable scheduling for visits and
          viewings, to provide access or arrange it, and to keep the
          property&rsquo;s state consistent with what we last recorded.
        </p>
      </div>

      <div className="card stack-sm">
        <h2 className="h3">6. Payments and payouts</h2>
        <p className="muted">
          Where the parties use the platform&rsquo;s escrow flow, deposits
          are collected through our payment provider (mobile money via
          Nylon Pay) and recorded in an append-only ledger; settlement and
          refunds follow the deal&rsquo;s recorded terms. Commission on
          completed deals is billed at the rate in force when the deal was
          struck. Payouts to landlords are only possible after your payout
          details have been reviewed, and real-money movement additionally
          depends on our payment provider arrangements — until those are in
          place, no payout is promised, and no surface will tell you
          otherwise. We never need — and never ask for — your mobile-money
          PIN or bank password.
        </p>
      </div>

      <div className="card stack-sm">
        <h2 className="h3">7. Prohibited behaviour</h2>
        <ul className="muted">
          <li>Fraudulent, misleading, or impersonating activity of any kind.</li>
          <li>Listing a property you have no authority to advertise.</li>
          <li>Photographs that are not of the property, or other people&rsquo;s photographs presented as your own.</li>
          <li>Documents that are not yours or not genuine.</li>
          <li>Using the platform to harass or to harvest other people&rsquo;s information.</li>
          <li>Completing a letting off-platform to avoid the introduction record.</li>
        </ul>
      </div>

      <div className="card stack-sm">
        <h2 className="h3">8. Privacy and your documents</h2>
        <p className="muted">
          Identity documents, self-photographs, contact details and payout
          details are collected for one purpose: reviewing your application
          and operating your listings. They are stored in private storage,
          reachable only by the team that reviews them, never shown to
          tenants or published. We keep the minimum the workflow needs,
          records of your acceptances and our decisions are kept as
          append-only audit records, and evidence you submit while an
          application is still open can be removed by you. Retention of
          decided evidence is being settled with counsel; until then,
          decided applications&rsquo; documents are retained (not deleted
          quietly) so the record of a review stays reviewable. See
          the <Link href="/privacy">Privacy Policy</Link>.
        </p>
      </div>

      <div className="card stack-sm">
        <h2 className="h3">9. Suspension and termination</h2>
        <p className="muted">
          Accounts and listings can be suspended or withdrawn where these
          terms are breached, a document fails review, or a dispute is
          open. Where a decision takes an account down, we record it and
          its reason; you can contact us to have it reviewed. You can stop
          using the platform at any time; records of dealings that
          completed are retained as described in the Privacy Policy.
        </p>
      </div>

      <div className="card stack-sm">
        <h2 className="h3">10. Complaints and disputes</h2>
        <p className="muted">
          Raise anything with us first — through the contact details on
          the <Link href="/contact">contact page</Link> or your account
          team. We keep audit records of decisions, which is what lets a
          complaint be reviewed against what actually happened. These
          terms are governed by the laws of Uganda.
        </p>
      </div>

      <div className="card stack-sm">
        <h2 className="h3">11. Changes to these terms</h2>
        <p className="muted">
          When these terms materially change, the version changes with
          them. Your acceptance of each version is recorded separately and
          never overwritten; if a new version needs your acceptance, we
          will ask before the workflows that depend on it continue.
        </p>
      </div>

      <div className="notice notice-info">
        <strong>Open legal question.</strong> Like the platform-wide terms,
        this onboarding instrument is a product implementation draft
        awaiting counsel review (see the open questions on{' '}
        <Link href="/terms">/terms</Link>). Nothing here is legal advice.
      </div>

      {terms && !terms.current ? (
        <div className="card stack">
          <h2 className="h3">Acceptance</h2>
          <p className="muted">
            By accepting, you confirm you have read this version
            {' '}(<span className="mono">{terms.currentVersion}</span>), and
            the declarations you will make in your application. Acceptance
            is recorded against your account with a timestamp and is
            required before a verification application can be submitted.
          </p>
          <AcceptTermsControl currentVersion={terms.currentVersion} />
        </div>
      ) : null}

      {terms && terms.history.length > 0 ? (
        <div className="card">
          <div className="card-head">
            <span className="card-title">Your acceptance record</span>
          </div>
          <dl className="terms">
            {terms.history.map((h) => (
              <div className="terms-row" key={`${h.version}-${h.acceptedAt}`}>
                <dt>
                  <span className="mono">{h.version}</span>
                </dt>
                <dd>
                  {h.version === terms.currentVersion ? (
                    <span className="badge badge-ok">
                      <Icon.check size={12} /> current
                    </span>
                  ) : (
                    <span className="badge">superseded</span>
                  )}{' '}
                  accepted {onDay(h.acceptedAt)}
                </dd>
              </div>
            ))}
          </dl>
          <p className="faint" style={{ fontSize: '0.8125rem', marginBottom: 0 }}>
            Historical acceptances are kept as they were recorded — a new
            version never rewrites them.
          </p>
        </div>
      ) : null}

      <p>
        <Link href="/landlord/verification" className="btn btn-secondary btn-sm">
          {terms?.current ? 'Continue to verification' : 'Back to verification'}
        </Link>
      </p>
    </div>
  );
}
