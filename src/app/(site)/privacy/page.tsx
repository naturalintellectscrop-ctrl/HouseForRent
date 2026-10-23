import Link from 'next/link';
import { PageIntro } from '@/app/ui';
import { pageMetadata } from '@/lib/seo';
import { CONTACT } from '@/app/ui';

export const metadata = pageMetadata({
  title: 'Privacy Policy — House For Rent',
  description:
    'What House For Rent collects, what we deliberately do not collect, who can see it, and how long it is kept. Operated by Natural Intellects Ltd.',
  path: '/privacy',
});

/*
 * Every factual claim in this page is checked against the running system
 * (schema + server code), not against intentions. Two honesty rules govern
 * the text: identity verification is described as what it is (a structural
 * self-declaration check, provider still a sandbox mock), and every legal
 * question Natural Intellects has not yet settled with counsel is printed
 * as an open question instead of being papered over.
 */

function OpenQuestion({ children }: { children: React.ReactNode }) {
  return (
    <p className="alert alert-note">
      <strong>Open legal question — not yet settled with counsel:</strong>{' '}
      {children}
    </p>
  );
}

export default function PrivacyPage() {
  return (
    <section className="section-lg">
      <div className="page stack-md">
        <PageIntro title="Privacy Policy">
          <p className="lede">
            This policy describes what House For Rent — operated by Natural
            Intellects Ltd, Kampala, Uganda — does with personal data. It is
            written from the system as it actually runs. Where a question has
            not yet been reviewed by a lawyer, we say so on the page rather
            than implying otherwise.
          </p>
          <p className="muted">
            Last updated: October 2026. Questions and requests:{' '}
            <a href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a>.
          </p>
        </PageIntro>

        <h2>1. What we collect</h2>
        <div className="table-scroll">
          <table className="plat-table">
          <thead>
            <tr>
              <th>Category</th>
              <th>Exactly what</th>
              <th>Why it exists</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Account</td>
              <td>
                A display name, your phone number (your sign-in identity), an
                optional e-mail (only where an account was provisioned by us),
                a bcrypt password hash, and sign-in session records that can
                be revoked.
              </td>
              <td>
                Operating your account. The phone number is the identity
                primitive the product was designed around; no e-mail is
                collected at self-service registration.
              </td>
            </tr>
            <tr>
              <td>Identity submissions</td>
              <td>
                The ID method you select, the state of the check
                (pending/verified/failed), and an opaque reference derived
                from your ID number. The ID number itself is not stored — the
                code reduces it to a truncated hash before anything is
                written.
              </td>
              <td>
                A baseline against fraud: a tenant asking for a viewing must
                be a real, traceable person (data minimisation: the state and
                a reference persist, not the number).
              </td>
            </tr>
            <tr>
              <td>Listings &amp; properties</td>
              <td>
                Property details you supply, photographs (each labelled with
                its source — taken by our field officer, or supplied by the
                lister), and neighbourhood data.
              </td>
              <td>
                The marketplace itself. Photography provenance is the
                product: tenants are entitled to know which images were taken
                in the room by our staff.
              </td>
            </tr>
            <tr>
              <td>Viewing records</td>
              <td>
                The timestamped linkage of tenant ↔ property ↔ lister ↔ field
                officer for each visit, plus the officer&rsquo;s structured
                report (condition, accuracy, availability).
              </td>
              <td>
                This record is the evidence that a real introduction
                happened. It protects the commission the business is owed and
                protects tenants from fake listings.
              </td>
            </tr>
            <tr>
              <td>Money records</td>
              <td>
                Deal terms, escrow ledger entries, and payment instructions
                with our payment provider (mobile-money collection via Nylon
                Pay). We never see or store your mobile-money PIN or card
                data.
              </td>
              <td>
                Deposits are held and released through an auditable,
                append-only ledger. Financial records are kept intact on
                purpose.
              </td>
            </tr>
            <tr>
              <td>Security log</td>
              <td>
                An append-only audit trail of security-relevant events
                (sign-ins, failed sign-ins against staff accounts, publication
                and payment events), with the acting account and time.
              </td>
              <td>
                Detecting and proving abuse; resolving disputes about who did
                what.
              </td>
            </tr>
          </tbody>
          </table>
        </div>

        <h2>2. What we deliberately do not collect</h2>
        <ul>
          <li>
            No payslips, bank statements, or employment documents — identity
            only (product decision, V1).
          </li>
          <li>
            No government ID number in plaintext — the check stores an opaque
            reference, not the number.
          </li>
          <li>
            No e-mail address at self-service registration; a phone number is
            enough to reach you.
          </li>
          <li>
            No advertising or analytics trackers, and no third-party
            advertising cookies of any kind.
          </li>
          <li>
            Landlords do not receive a tenant&rsquo;s phone number — our
            field officer mediates contact. That is data minimisation by
            design, not an oversight.
          </li>
        </ul>

        <h2>3. About “verified” — read this part</h2>
        <p>
          <strong>Properties</strong> are verified in the strong sense: a
          House For Rent field officer physically visits the property, takes
          the photographs (labelled <em>field_officer</em>), and files a
          structured report. That label is earned on the ground.
        </p>
        <p>
          <strong>People</strong> are NOT independently verified today. The
          identity check compares what you type against structural rules of a
          Ugandan National ID number and the name on your account; the
          verification provider is still a sandbox mock, and every surface
          that shows the result says so. A “verified” badge on an account
          therefore means <em>self-declared information passed structural
          checks</em> — nothing more. We will restate this plainly when a
          real provider is integrated.
        </p>

        <h2>4. Who can see what</h2>
        <ul>
          <li>
            <strong>You</strong> — your own account, viewings, deals, saved
            homes, and verification state.
          </li>
          <li>
            <strong>The lister/landlord of a property</strong> — their own
            properties, listings, deals, and the progress of viewings on
            them. Not your phone number and not your documents.
          </li>
          <li>
            <strong>Field Operations Officers</strong> (our staff) — the
            viewings assigned to them and the properties they verify, through
            a separate staff console. Their access is re-authorised
            server-side on every request.
          </li>
          <li>
            <strong>Platform operations (Natural Intellects)</strong> —
            administrative consoles over accounts, listings, transactions and
            the audit trail, used to run dispatch, verify mandates and
            resolve disputes.
          </li>
          <li>
            <strong>Our payment provider</strong> — the name and phone number
            needed to collect a payment you initiated, plus the amount.
            Nothing beyond the payment&rsquo;s needs.
          </li>
        </ul>
        <p>
          Photographs on a <em>live</em> listing are public by definition —
          that is their purpose. Everything else (visit imagery before
          publication, mandate evidence documents) is served only through an
          authorized, access-controlled route and never from a public storage
          URL.
        </p>

        <h2>5. How long we keep things</h2>
        <ul>
          <li>
            <strong>Sessions</strong> — expire on schedule and can be revoked
            individually (sign out everywhere).
          </li>
          <li>
            <strong>Financial, deal, consent and audit records</strong> —
            retained indefinitely in append-only form. They are the evidence
            the platform and its users may need years later in a dispute;
            they are never edited or quietly removed.
          </li>
          <li>
            <strong>Accounts</strong> — can be suspended (reversible) or
            archived (sign-in disabled, data retained for audit), which is
            the current answer to a deletion request for anything that
            touches evidence.
          </li>
        </ul>
        <OpenQuestion>
          Uganda&rsquo;s Data Protection and Privacy Act, 2019 gives data
          subjects erasure and access rights; our evidence tables are
          append-only by design. The exact reconciliation — what can be
          erased, what must be retained, and the manual process for a subject
          access request — has not yet been reviewed by counsel. No automated
          erasure exists today; requests are handled by contacting us.
        </OpenQuestion>

        <h2>6. Security measures in place</h2>
        <ul>
          <li>Passwords stored only as bcrypt hashes.</li>
          <li>
            Sign-in sessions carried in an httpOnly cookie; every session row
            is revocable; a password change revokes other sessions.
          </li>
          <li>
            Rate limiting on sign-in attempts; failed attempts against staff
            accounts are recorded in the audit trail.
          </li>
          <li>
            Media files live in a private storage bucket and are served only
            through an access-controlled route — there is no public URL to
            guess.
          </li>
          <li>
            Money state changes only through signature-verified payment
            webhooks and an append-only ledger — the browser never gets the
            final say on what happened financially.
          </li>
          <li>
            Transport security (HTTPS/HSTS) enforced by the hosting platform,
            with clickjacking, MIME-sniffing and referrer protections set on
            every response.
          </li>
        </ul>

        <h2>7. Your rights and how to use them</h2>
        <p>
          You can ask for a copy of your data, ask for corrections, ask us to
          suspend or archive your account, or withdraw a consent you have
          given (withdrawal is recorded as a new fact, not an edit of
          history). Reach us at{' '}
          <a href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a> — we respond
          to verified requests from the account holder.
        </p>
        <OpenQuestion>
          Response timelines and the exact identity-proofing steps for a
          subject access request (how do we know the requester is really you,
          when our own identity provider is still a mock?) have not been
          settled with counsel. In the meantime we verify requests by the
          account&rsquo;s phone number.
        </OpenQuestion>

        <h2>8. Changes to this policy</h2>
        <p>
          When this policy changes materially, the version note at the top
          updates and the change is announced on this page before it takes
          effect. Consent records reference the policy version that applied
          when consent was given.
        </p>

        <p className="muted">
          See also our <Link href="/terms">Terms of Service</Link> and{' '}
          <Link href="/about">about page</Link>.
        </p>
      </div>
    </section>
  );
}
