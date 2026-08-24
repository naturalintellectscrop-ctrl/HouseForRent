import Link from 'next/link';
import { Icon } from '@/app/ui';

export const metadata = {
  title: 'How it works',
  description:
    'Verification, viewings, escrow and move-in — how a House For Rent tenancy actually happens, step by step.',
};

/**
 * The process, in plain language.
 *
 * ── Why this page is long ──
 * The product asks a tenant to send several million shillings to a company
 * before they have keys. That is a large ask, and the answer to it is not a
 * reassuring adjective — it is telling them exactly what happens to the
 * money, who holds it, when it moves, and what happens if it goes wrong.
 * Every claim below corresponds to something the system actually enforces.
 */
export default function HowItWorksPage() {
  return (
    <>
      <section className="section">
        <div className="page">
          <div className="stack" style={{ maxWidth: '44rem' }}>
            <p className="eyebrow">How it works</p>
            <h1 className="display">
              What happens between finding a home and getting the keys.
            </h1>
            <p className="lede">
              Renting in Kampala usually means paying several months upfront to
              someone you have just met, for a property you may have seen once.
              This is how we make that safe — and what we do, in order, at each
              stage.
            </p>
          </div>
        </div>
      </section>

      <section className="section section-sunk">
        <div className="page stack-lg">
          <h2 className="h1">Before a listing reaches you</h2>

          <ol className="steps">
            <li>
              <h3 className="h3">A landlord submits the property</h3>
              <p>
                They give us the neighbourhood, a landmark, the size of the
                property, and the terms — rent, deposit, and how many months
                are payable upfront. A street address is optional; we describe
                location the way people here actually do.
              </p>
            </li>
            <li>
              <h3 className="h3">A field officer goes to see it</h3>
              <p>
                One of our officers visits the property in person. They file a
                structured report — condition, whether it matches what the
                landlord described, and whether it is genuinely available — and
                photograph it. This is not a phone call.
              </p>
            </li>
            <li>
              <h3 className="h3">The landlord signs a written agreement</h3>
              <p>
                Before the listing can go public, the landlord accepts our terms
                in writing, including the commission rate and the clause about
                going around us. The rate is recorded against that agreement at
                the moment they sign, so a later change cannot alter what they
                agreed to.
              </p>
            </li>
            <li>
              <h3 className="h3">Only then does it appear in search</h3>
              <p>
                A listing goes live only if all of those are true: verified in
                person, inside an area we actually cover, and with a signed
                agreement. If any one is missing, it stays off the site.
              </p>
            </li>
          </ol>
        </div>
      </section>

      <section className="section">
        <div className="page stack-lg">
          <h2 className="h1">Your side of it</h2>

          <ol className="steps">
            <li>
              <h3 className="h3">Search without an account</h3>
              <p>
                Browsing is free and requires nothing from you. Every listing
                shows when we last confirmed it was still available; once that
                goes stale, it drops out of search rather than sending you on a
                wasted trip.
              </p>
            </li>
            <li>
              <h3 className="h3">Create an account and verify who you are</h3>
              <p>
                Before you can request a viewing we verify your identity. This
                is the same protection the landlord gets — they are letting to
                someone we have checked, which is a large part of why they
                accept our terms.
              </p>
            </li>
            <li>
              <h3 className="h3">Request a viewing</h3>
              <p>
                You ask for a time. Our operations desk assigns a field officer
                and confirms the slot. The officer meets you at the property —
                you are not sent an address and left to it.
              </p>
            </li>
            <li>
              <h3 className="h3">The introduction is recorded</h3>
              <p>
                When the viewing happens, we record that we introduced you to
                this landlord for this property. That record is what makes the
                rest of the process — and the guarantee below — possible.
              </p>
            </li>
            <li>
              <h3 className="h3">Terms are agreed in writing</h3>
              <p>
                If you want the property, the agreement is drawn up with the
                figures from the listing you saw. The amount you are asked for
                is calculated by us from those published terms, not typed in by
                anyone.
              </p>
            </li>
            <li>
              <h3 className="h3">You pay House For Rent, not the landlord</h3>
              <p>
                Your rent and deposit go into escrow with us. The landlord does
                not receive them at this point, and cannot.
              </p>
            </li>
            <li>
              <h3 className="h3">You move in, and confirm it</h3>
              <p>
                Once you have moved in and confirmed it, the money is released
                to the landlord and our commission is taken from that
                settlement. If the move-in does not happen, the money comes back
                to you.
              </p>
            </li>
          </ol>
        </div>
      </section>

      <section className="section section-sunk">
        <div className="page">
          <div className="stack-lg" style={{ maxWidth: '44rem' }}>
            <h2 className="h1">Questions people actually ask</h2>

            <div className="stack-lg">
              <div className="stack-sm">
                <h3 className="h3">What does this cost me?</h3>
                <p className="muted">
                  Nothing. Tenants are not charged to search, to view, or to
                  rent. We are paid one commission by the landlord, once, and
                  only when a tenancy actually begins.
                </p>
              </div>

              <div className="stack-sm">
                <h3 className="h3">Who is holding my money?</h3>
                <p className="muted">
                  House For Rent, in escrow, recorded against your specific
                  tenancy. Every movement of it is written to a double-entry
                  ledger — money into escrow, money out to the landlord, money
                  back to you — and the balances are reconciled. It is not
                  passed to the landlord and then chased back.
                </p>
              </div>

              <div className="stack-sm">
                <h3 className="h3">What if I never move in?</h3>
                <p className="muted">
                  The escrow is refunded. Release to the landlord happens on
                  move-in and not before, which is the entire reason the money
                  sits with us in between.
                </p>
              </div>

              <div className="stack-sm">
                <h3 className="h3">
                  Can I just deal with the landlord directly?
                </h3>
                <p className="muted">
                  The landlord&rsquo;s agreement with us includes a clause about
                  completing a tenancy outside the platform with a tenant we
                  introduced. We keep a record of every introduction we make,
                  which is what makes that clause meaningful rather than
                  decorative. It protects the officer who did the work and it
                  keeps the service free for you.
                </p>
              </div>

              <div className="stack-sm">
                <h3 className="h3">Why are there so few listings?</h3>
                <p className="muted">
                  Because a person has to physically go to each one. We would
                  rather show you a short list of homes somebody stood inside
                  than a long list nobody has checked. The corridor grows as
                  officers cover it.
                </p>
              </div>
            </div>

            <div className="row">
              <Link href="/properties" className="btn btn-primary btn-lg">
                Browse verified homes
              </Link>
              <Link href="/for-landlords" className="btn btn-secondary btn-lg">
                <Icon.building size={16} />
                I have a property to let
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
