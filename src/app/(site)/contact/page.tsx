import Link from 'next/link';

export const metadata = {
  title: 'Contact',
  description: 'How to reach House For Rent in Kampala.',
};

/**
 * ── Why there is no contact form ──
 * A form that posts nowhere is worse than no form: it takes someone's
 * question, shows a success message, and silently discards it. There is no
 * messaging endpoint in this system yet, so this page routes people to the
 * channels that actually reach a human, and says plainly which ones those
 * are. When an enquiry endpoint exists, a form belongs here.
 */
export default function ContactPage() {
  return (
    <section className="section">
      <div className="page">
        <div className="detail-grid">
          <div className="stack-lg" style={{ maxWidth: '38rem' }}>
            <div className="stack">
              <p className="eyebrow">Contact</p>
              <h1 className="display">Talk to us.</h1>
              <p className="lede">
                Whether you have a property to let, a viewing you are trying to
                arrange, or a question about money that is sitting in escrow —
                a person will answer.
              </p>
            </div>

            <div className="stack-lg">
              <section className="stack-sm">
                <h2 className="h2">If you already have an account</h2>
                <p className="muted">
                  The fastest route is your own dashboard: viewings, deals and
                  their current state are all there, along with what happens
                  next at each stage.
                </p>
                <div className="row">
                  <Link href="/account" className="btn btn-secondary">
                    Tenant dashboard
                  </Link>
                  <Link href="/landlord" className="btn btn-secondary">
                    Landlord dashboard
                  </Link>
                </div>
              </section>

              <section className="stack-sm">
                <h2 className="h2">If you have a property to let</h2>
                <p className="muted">
                  Create a landlord account and add the property. Nothing is
                  charged, and nothing publishes until you have seen our
                  officer&rsquo;s report and accepted the agreement.
                </p>
                <div className="row">
                  <Link
                    href="/register?role=lister"
                    className="btn btn-primary"
                  >
                    List a property
                  </Link>
                  <Link href="/for-landlords" className="btn btn-secondary">
                    How it works for landlords
                  </Link>
                </div>
              </section>

              <section className="stack-sm">
                <h2 className="h2">Anything else</h2>
                <p className="muted">
                  We have not yet published a general enquiries address on this
                  site, and we would rather say so than print one that reaches
                  nobody. If you need to speak to us and have no account, the
                  registration above is the shortest path to a conversation.
                </p>
              </section>
            </div>
          </div>

          <aside className="detail-aside">
            <div className="card stack-sm">
              <h3 className="h3">House For Rent</h3>
              <p className="muted">
                Operated by Natural Intellects Ltd
                <br />
                Kampala, Uganda
              </p>
              <hr className="divider" style={{ margin: '0.75rem 0' }} />
              <h3 className="h3">Service area</h3>
              <p className="muted">
                Kampala and Wakiso, in a defined corridor. If your property is
                outside it, we will tell you rather than list it where nobody
                will visit.
              </p>
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}
