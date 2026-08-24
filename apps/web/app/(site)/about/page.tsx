import Link from 'next/link';

export const metadata = {
  title: 'About',
  description:
    'House For Rent is operated by Natural Intellects Ltd in Kampala. Why we verify every property in person, and what that costs us.',
};

/**
 * ── What is not on this page ──
 * No founding date we have not checked, no headcount, no funding, no
 * "trusted by thousands", no photographs of a team. Every one of those is
 * easy to write and impossible for a reader to verify, and a page whose job
 * is to establish trust cannot afford a single sentence that turns out to be
 * decoration. What is here is the operating model, which is true by
 * construction: it is what the software actually does.
 */
export default function AboutPage() {
  return (
    <>
      <section className="section-lg">
        <div className="page">
          <div className="stack" style={{ maxWidth: '44rem' }}>
            <p className="eyebrow">About</p>
            <h1 className="display">
              We would rather list ten homes we have seen than a thousand we
              have not.
            </h1>
            <p className="lede">
              House For Rent is a residential rental marketplace operated by
              Natural Intellects Ltd in Kampala. It exists because the ordinary
              way of renting here asks a tenant to trust a stranger with several
              months of income, and asks a landlord to hand keys to someone they
              met once.
            </p>
          </div>
        </div>
      </section>

      <section className="section">
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
              </section>

              <section className="stack">
                <h2 className="h2">What this costs us, honestly</h2>
                <div className="prose">
                  <p>
                    Verification does not scale the way a listings database
                    does. Every property on this site cost an officer a journey,
                    and that is why we operate in a defined corridor rather than
                    claiming national coverage — an officer has to be able to
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
    </>
  );
}
