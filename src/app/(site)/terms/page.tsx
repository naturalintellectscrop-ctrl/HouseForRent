import Link from 'next/link';
import { PageIntro } from '@/app/ui';
import { pageMetadata } from '@/lib/seo';
import { CONTACT } from '@/app/ui';

export const metadata = pageMetadata({
  title: 'Terms of Service — House For Rent',
  description:
    'The terms of using House For Rent: accounts, roles, fees, verification labels, the escrow deal flow, and the limits of our role. Operated by Natural Intellects Ltd.',
  path: '/terms',
});

/*
 * Honesty rules for this page: describe the rules the software actually
 * enforces (publish gates, the viewing state machine, escrow via verified
 * webhooks, append-only records); never describe the sandbox mock identity
 * provider as real verification; and print every question counsel has not
 * yet settled as an open question, visibly.
 */

function OpenQuestion({ children }: { children: React.ReactNode }) {
  return (
    <p className="alert alert-note">
      <strong>Open legal question — not yet settled with counsel:</strong>{' '}
      {children}
    </p>
  );
}

export default function TermsPage() {
  return (
    <section className="section-lg">
      <div className="page stack-md">
        <PageIntro title="Terms of Service">
          <p className="lede">
            These terms govern your use of House For Rent, a residential
            rental marketplace operated by Natural Intellects Ltd, Kampala,
            Uganda. They are written to match what the platform actually
            does. Where a legal question has not yet been reviewed by a
            lawyer, the page says so.
          </p>
          <p className="muted">
            Last updated: October 2026. Contact:{' '}
            <a href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a> ·{' '}
            {CONTACT.phones[0].display}.
          </p>
        </PageIntro>

        <h2>1. The service, in one paragraph</h2>
        <p>
          House For Rent lists rental properties that our field staff have
          physically visited and photographed. Tenants browse free, request
          viewings, and are shown homes by our officers. When a visit leads
          to a letting, the platform records the introduction, documents the
          deal, and — where the parties use it — holds the deposit in an
          auditable escrow ledger until the deal&rsquo;s terms are met. We
          are a marketplace and a verification layer. We are not a landlord,
          a letting agent of record, or a party to your tenancy agreement.
        </p>

        <h2>2. Accounts and roles</h2>
        <ul>
          <li>
            An account is created with a phone number and password. You are
            responsible for what happens through your account; tell us
            immediately if you lose control of the phone number your account
            is keyed to.
          </li>
          <li>
            <strong>Tenants</strong> search, save homes, request viewings,
            and pay through the deal flow. Searching, viewing and renting
            through the platform is free for tenants — always.
          </li>
          <li>
            <strong>Listers</strong> (property owners, or brokers/agents with
            a verified mandate from the owner) publish properties and accept
            deals. A broker or property-management listing cannot go live
            unless a verified mandate exists for it — the software enforces
            this, not just this sentence.
          </li>
          <li>
            <strong>Field Operations Officers</strong> are our staff. They
            are not created by self-service registration and are not party to
            these terms through the public site.
          </li>
        </ul>
        <OpenQuestion>
          A minimum-age requirement (and how it would be enforced given the
          identity provider is still a structural self-declaration check) has
          not been settled with counsel. Today the practical requirement is a
          national ID number capable of passing the structural check.
        </OpenQuestion>

        <h2>3. What “verified” means here — and what it does not</h2>
        <p>
          A property marked verified has been visited by a House For Rent
          field officer, whose photographs are labelled as such and whose
          structured report (condition, accuracy, availability) is on file.
          Freshness decays: availability is only as current as the last
          visit, and the listing shows that date.
        </p>
        <p>
          <strong>People are not independently verified.</strong> Account
          identity checks are self-declared information passed through
          structural validation (the provider is still a sandbox mock and
          every surface says so). We make no representation that another user
          is who they claim to be. Meet officers and counterparties through
          the platform&rsquo;s mediated flow — it exists for your protection.
        </p>
        <p>
          We do not guarantee that a listed property is suitable, that a
          landlord will honour a tenancy, or that a tenant will care for a
          home. Verification reduces the risk of fiction, not the risk of
          life.
        </p>

        <h2>4. Fees and the deal flow</h2>
        <ul>
          <li>
            Tenants pay nothing to House For Rent for search, viewings, or
            renting.
          </li>
          <li>
            Listers pay a commission on completed deals at the rate published
            on this site at the time of the deal. The commission rate is
            versioned — a deal is billed at the rate in force when it was
            struck, not whatever applies later.
          </li>
          <li>
            Where the parties use escrow, the deposit is collected through
            our payment provider (mobile money via Nylon Pay) and recorded in
            an append-only ledger. Money is only ever booked on a
            signature-verified confirmation from the payment provider — not
            because a browser reported success. Settlement and refunds follow
            the deal&rsquo;s recorded terms.
          </li>
        </ul>
        <OpenQuestion>
          The precise escrow release conditions, dispute windows, and the
          treatment of partial settlements have not yet been reviewed by
          counsel. Until they are, escrow is available only on deals whose
          written agreement records those terms explicitly.
        </OpenQuestion>

        <h2>5. The introduction record and circumvention</h2>
        <p>
          Every mediated viewing creates a timestamped record linking tenant,
          property, lister and officer. This record is the evidence that an
          introduction happened, and it persists whether or not a deal is
          opened on the platform. Using information obtained through a
          mediated viewing to complete the same letting off-platform — before
          or after the visit, with the same parties — is a breach of these
          terms and an obligation to pay the commission that would have been
          due. The record is the fact we rely on.
        </p>

        <h2>6. Acceptable use</h2>
        <ul>
          <li>List only properties you own or are mandated to let.</li>
          <li>
            Never misrepresent a property, its availability, or its price.
            The field visit exists to catch this, and listings that fail it
            are struck.
          </li>
          <li>
            Do not use the platform to harass, defraud, or harvest other
            people&rsquo;s information; do not attempt to access accounts,
            data or systems that are not yours.
          </li>
          <li>
            Do not upload imagery that is not of the property, and do not
            upload other people&rsquo;s photographs as your own — provenance
            labels exist so tenants can tell the difference, and mislabelling
            breaks that.
          </li>
        </ul>

        <h2>7. Suspension and termination</h2>
        <p>
          We can suspend an account (reversible) or disable it where these
          terms are breached, a listing fails verification, or a payment
          dispute is open. Published listings can be withdrawn by their
          owner; deals already in flight are settled per their recorded
          terms. You can stop using the service at any time; evidence
          records of completed dealings are retained as described in the{' '}
          <Link href="/privacy">Privacy Policy</Link>.
        </p>

        <h2>8. Availability and limits of liability</h2>
        <p>
          The service is provided “as is”. We work hard to keep it correct
          and available, but we do not promise it will be uninterrupted or
          error-free, and maintenance happens. To the fullest extent Ugandan
          law allows, Natural Intellects Ltd is not liable for indirect or
          consequential loss arising from use of the platform. Nothing here
          limits liability that cannot be limited by law.
        </p>
        <OpenQuestion>
          The liability cap (and whether consumer-protection statutes imply
          terms that cannot be excluded) has not been reviewed by counsel.
          The escrow ledger&rsquo;s own records are authoritative for money
          movements.
        </OpenQuestion>

        <h2>9. Governing law and changes</h2>
        <p>
          These terms are governed by the laws of Uganda. Disputes will
          first be addressed through good-faith discussion via the contact
          details on this page. We may update these terms; material changes
          are announced on this page before taking effect, and the version
          date at the top always reflects the current text.
        </p>
        <OpenQuestion>
          The choice of dispute forum (courts vs. arbitration venue and seat)
          has not been settled with counsel.
        </OpenQuestion>

        <p className="muted">
          See also our <Link href="/privacy">Privacy Policy</Link>,{' '}
          <Link href="/how-it-works">how the platform works</Link>, and{' '}
          <Link href="/for-landlords">terms for landlords</Link>.
        </p>
      </div>
    </section>
  );
}
