import Link from 'next/link';
import { PageIntro } from '@/app/ui';

export const metadata = {
  title: 'About',
  description:
    'House For Rent is operated by Natural Intellects Ltd in Kampala. Why we verify every property in person, and what that costs us.',
};

/*
 * What is not on this page: no founding date we have not checked, no
 * headcount, no funding, no "trusted by thousands". The photography is
 * illustrative and captioned as such; the process it depicts is the one
 * the software actually enforces, which is what the page is for.
 */
export default function AboutPage() {
  return (
    <>
      <section className="section-lg">
        <div className="page">
          <PageIntro title="We would rather list ten homes we have seen than a thousand we have not.">
            <p className="lede">
              House For Rent is a residential rental marketplace operated by
              Natural Intellects Ltd in Kampala. It exists because the ordinary
              way of renting here asks a tenant to trust a stranger with several
              months of income, and asks a landlord to hand keys to someone they
              met once.
            </p>
          </PageIntro>
        </div>
      </section>

      <section className="section" style={{ paddingTop: 0 }}>
        <div className="page">
          <figure className="figure figure-wide">
            <div className="figure-frame">
              <img
                src="/site/about-area.jpg"
                alt="Rooftops and green hills across a Kampala residential corridor"
                loading="eager"
                decoding="async"
              />
            </div>
            <figcaption>
              Kampala and Wakiso: the corridor we cover, street by street. We
              work where an officer can reach a property and get back the same
              day.
            </figcaption>
          </figure>
        </div>
      </section>

      <section className="section" style={{ paddingTop: 0 }}>
        <div className="page">
          <div className="detail-grid">
            <div className="stack-lg">
              <section className="stack">
                <h2 className="h2">The problem we picked</h2>
                <div className="prose">
                  <p>
                    Rental listings in Kampala go stale within days and nobody
                    updates them. A tenant travels across town to a property
                    that was let a fortnight ago, or that never existed. A
                    landlord fields calls from people who do not turn up. Both
                    sides absorb the cost of the other side&rsquo;s missing
                    information.
                  </p>
                  <p>
                    The usual technology answer is a better search interface.
                    That does not help: the data underneath is wrong, and a
                    faster route to wrong data is not an improvement.
                  </p>
                </div>
              </section>

              <section className="stack">
                <h2 className="h2">What we do instead</h2>
                <div className="prose">
                  <p>
                    We send a person. A field operations officer visits every
                    property before it is published, photographs it, files a
                    structured report on its condition, and confirms with the
                    landlord that it is genuinely available. Nothing appears in
                    search without that visit.
                  </p>
                  <p>
                    Availability then carries a date. When a confirmation goes
                    stale, the listing leaves search rather than quietly
                    becoming a wasted trip. That is the opposite of what a
                    volume-driven marketplace wants, and it is the point.
                  </p>
                  <p>
                    We also hold the money. Rent and deposit sit in escrow with
                    us until the tenant confirms they have moved in, and only
                    then is the landlord paid and our commission taken. Both
                    sides are exposed to us rather than to each other, which is
                    a much smaller thing to ask.
                  </p>
                </div>
                <figure className="figure">
                  <div className="figure-frame">
                    <img
                      src="/site/officer-visit.jpg"
                      style={{ objectPosition: '62% center' }}
                      alt="A quiet residential street with gated compound homes in Ntinda, Kampala"
                      loading="lazy"
                      decoding="async"
                    />
                  </div>
                  <figcaption>
                    The visit every listing starts with happens on streets like
                    this one: the officer&rsquo;s photographs and report, not
                    the landlord&rsquo;s word.
                  </figcaption>
                </figure>
              </section>

              <section className="stack">
                <h2 className="h2">What this costs us, honestly</h2>
                <div className="prose">
                  <p>
                    Verification does not scale the way a listings database
                    does. Every property on this site cost an officer a journey,
                    and that is why we operate in a defined corridor rather than
                    claiming national coverage. An officer has to be able to
                    reach it and get back.
                  </p>
                  <p>
                    So the site will look thin next to platforms that publish
                    whatever they are sent. We think a short list somebody stood
                    inside is worth more than a long one nobody checked, and if
                    we are wrong about that there is no version of this business
                    worth building.
                  </p>
                </div>
              </section>
            </div>

            <aside className="detail-aside stack">
              <div className="card stack-sm">
                {/* The company's registered identity, from the original
                    artwork, not a redrawn approximation. */}
                <img
                  src="/brand/house-for-rent-logo.png"
                  alt="House For Rent: find your next home with ease."
                  width={160}
                  height={189}
                  style={{
                    width: '10rem',
                    height: 'auto',
                    alignSelf: 'center',
                  }}
                />
                <hr className="divider" style={{ margin: '0.75rem 0' }} />
                <h3 className="h3">Operated by</h3>
                <p className="muted">
                  Natural Intellects Ltd
                  <br />
                  Kampala, Uganda
                </p>
                <hr className="divider" style={{ margin: '0.75rem 0' }} />
                <h3 className="h3">Service area</h3>
                <p className="muted">
                  Kampala and Wakiso, in a defined corridor that grows as field
                  coverage does.
                </p>
                <hr className="divider" style={{ margin: '0.75rem 0' }} />
                <h3 className="h3">Tenant fees</h3>
                <p className="muted">
                  None. Searching, viewing and renting are free for tenants; we
                  are paid by the landlord, once, on a completed move-in.
                </p>
              </div>

              <div className="card stack-sm">
                <h3 className="h3">Questions?</h3>
                <p className="muted">
                  We would rather answer them before you list a property or
                  request a viewing.
                </p>
                <Link href="/contact" className="btn btn-secondary btn-block">
                  Contact us
                </Link>
              </div>
            </aside>
          </div>
        </div>
      </section>

      {/*
        The escrow path as one connected rail. Four states in order, because
        the sequence is the guarantee: the money never moves to step four
        before step three has happened.
      */}
      <section className="section section-sunk">
        <div className="page stack-lg">
          <div className="stack">
            <h2 className="h1">How the money moves</h2>
            <p className="prose" style={{ maxWidth: '44rem' }}>
              Rent and deposit never pass directly from tenant to landlord.
              They travel one road, in one direction, and every movement is
              written to a reconciled ledger.
            </p>
          </div>

          <ol className="money-rail">
            <li>
              <div>
                <h3>You pay House For Rent</h3>
                <p>
                  Rent and deposit, calculated from the published listing
                  terms. The figures are computed by the system, not typed in
                  by anyone.
                </p>
              </div>
            </li>
            <li>
              <div>
                <h3>We hold it in escrow</h3>
                <p>
                  Recorded against your specific tenancy in a double-entry
                  ledger. The landlord has not received it, and cannot.
                </p>
              </div>
            </li>
            <li>
              <div>
                <h3>You move in and confirm</h3>
                <p>
                  You collect the keys, settle in, and confirm the move-in
                  from your account. This confirmation is what releases the
                  money.
                </p>
              </div>
            </li>
            <li>
              <div>
                <h3>The landlord is paid</h3>
                <p>
                  The settlement reaches the landlord, and our one commission
                  is taken from it. If there is no move-in, the escrow is
                  refunded instead.
                </p>
              </div>
            </li>
          </ol>
        </div>
      </section>

      <section className="section">
        <div className="page">
          <div className="band">
            <img
              className="band-photo"
              src="/site/cta-band.jpg"
              alt=""
              aria-hidden="true"
              loading="lazy"
              decoding="async"
            />
            <div className="band-inner stack">
              <h2 className="h2" style={{ maxWidth: '22ch' }}>
                A short list somebody stood inside.
              </h2>
              <p style={{ maxWidth: '40rem' }}>
                Every home on this site was visited, photographed and
                confirmed by a field officer we employ. Start with the homes
                that are verified right now.
              </p>
              <div className="row">
                <Link href="/properties" className="btn btn-primary btn-lg">
                  Browse verified homes
                </Link>
                <Link href="/how-it-works" className="btn btn-secondary btn-lg">
                  How it works
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
