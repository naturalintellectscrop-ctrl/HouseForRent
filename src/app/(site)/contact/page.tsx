import Link from 'next/link';
import { CONTACT, Icon, PageIntro } from '@/app/ui';
import { pageMetadata } from '@/lib/seo';

export const metadata = pageMetadata({
  title: 'Contact House For Rent in Kampala',
  description:
    'Call, WhatsApp or email House For Rent in Kampala. A person answers.',
  path: '/contact',
  keywords: ['contact House For Rent', 'rental help Kampala', 'letting agent contact Uganda'],
});

/*
 * Why there is no contact form: a form that posts nowhere is worse than no
 * form. It takes someone's question, shows a success message, and silently
 * discards it. There is no messaging endpoint in this system yet, so this
 * page routes people to the channels that actually reach a human, the
 * company's own phone numbers (calls and WhatsApp) and its email. When an
 * enquiry endpoint exists, a form belongs here.
 */
export default function ContactPage() {
  return (
    <>
      <section className="section-lg">
        <div className="page">
          <PageIntro title="Talk to us.">
            <p className="lede">
              Whether you have a property to let, a viewing you are trying to
              arrange, or a question about money that is sitting in escrow,
              call, WhatsApp or email, and a person will answer.
            </p>
          </PageIntro>
        </div>
      </section>

      <section className="section" style={{ paddingTop: 0 }}>
        <div className="page">
          <div className="detail-grid">
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
                <h2 className="h2">Call, WhatsApp or email us</h2>
                <p className="muted">
                  Both numbers take calls and WhatsApp. If it is about money
                  already in escrow, have the phone number on your account
                  handy so we can find the deal quickly.
                </p>
                <div className="contact-channels">
                  {CONTACT.phones.map((phone) => (
                    <div key={phone.tel} className="contact-channel">
                      <span className="contact-channel-icon" aria-hidden="true">
                        <Icon.phone size={18} />
                      </span>
                      <div>
                        <a href={`tel:${phone.tel}`} className="contact-channel-main">
                          {phone.display}
                        </a>
                        <span className="muted" style={{ fontSize: '0.875rem' }}>
                          Call or{' '}
                          <a
                            href={`https://wa.me/${phone.tel.replace('+', '')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            WhatsApp
                          </a>
                        </span>
                      </div>
                    </div>
                  ))}
                  <div className="contact-channel">
                    <span className="contact-channel-icon" aria-hidden="true">
                      <Icon.mail size={18} />
                    </span>
                    <div>
                      <a href={`mailto:${CONTACT.email}`} className="contact-channel-main">
                        {CONTACT.email}
                      </a>
                      <span className="muted" style={{ fontSize: '0.875rem' }}>
                        Email: for documents and anything in writing
                      </span>
                    </div>
                  </div>
                </div>
              </section>
            </div>

            <aside className="detail-aside stack">
              <figure className="figure">
                <div className="figure-frame">
                  <img
                    src="/site/support.jpg"
                    alt="A smiling woman at a desk with a laptop, ready to help"
                    loading="lazy"
                    decoding="async"
                  />
                </div>
                <figcaption>
                  What we promise on this page, in person: a person answers,
                  not a phone menu.
                </figcaption>
              </figure>

              <div className="card stack-sm">
                <h3 className="h3">House For Rent</h3>
                <p className="muted">
                  Operated by Natural Intellects Ltd
                  <br />
                  Kampala, Uganda
                </p>
                <hr className="divider" style={{ margin: '0.75rem 0' }} />
                <h3 className="h3">Reach us directly</h3>
                <div className="stack-sm" style={{ marginTop: '0.5rem' }}>
                  {CONTACT.phones.map((phone) => (
                    <p key={phone.tel} className="muted" style={{ margin: 0 }}>
                      <a href={`tel:${phone.tel}`}>{phone.display}</a>
                      {' · '}
                      <a
                        href={`https://wa.me/${phone.tel.replace('+', '')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        WhatsApp
                      </a>
                    </p>
                  ))}
                  <p className="muted" style={{ margin: 0 }}>
                    <a href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a>
                  </p>
                </div>
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
    </>
  );
}
