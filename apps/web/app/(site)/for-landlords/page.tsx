import Link from 'next/link';
import { apiGet } from '@/lib/api';
import { Icon } from '@/app/ui';

export const metadata = {
  title: 'For landlords',
  description:
    'List your property with House For Rent. We verify the property, verify the tenant, hold the money in escrow, and take one commission only when someone moves in.',
};

interface CommissionRate {
  rateBpOfMonth: number;
  effectiveFrom: string;
  versionId: string;
}

/**
 * Describes the rate in the way a landlord would say it out loud.
 *
 * 10000 basis points of one month is exactly one month's rent, which is how
 * this is actually quoted in Kampala; anything else is stated as a
 * percentage rather than forced into a phrase that would be wrong.
 */
function describeRate(bp: number): string {
  if (bp === 10000) return "one month's rent";
  if (bp % 100 === 0) return `${bp / 100}% of one month's rent`;
  return `${(bp / 100).toFixed(2)}% of one month's rent`;
}

/**
 * The landlord page.
 *
 * ── The commission figure is fetched, not typed ──
 * It comes from `GET /v1/commission-rate`, the same version an agreement
 * snapshots when a landlord signs. A rate written into this page's copy
 * would be a second copy of a commercial term, free to drift from the one
 * that actually binds — and the direction it drifts is always the one that
 * embarrasses us in front of the landlord reading it.
 */
export default async function ForLandlordsPage() {
  let rate: CommissionRate | null = null;
  try {
    rate = await apiGet<CommissionRate>('/v1/commission-rate', {
      revalidate: 300,
    });
  } catch {
    // If no rate is in force the page still stands — it simply does not
    // quote a number it cannot substantiate.
    rate = null;
  }

  return (
    <>
      <section className="section-lg">
        <div className="page">
          <div className="stack" style={{ maxWidth: '44rem' }}>
            <p className="eyebrow">For landlords</p>
            <h1 className="display">
              Let your property to a tenant we have already checked.
            </h1>
            <p className="lede">
              You do not pay us to list. You do not pay us monthly. We are paid
              once, {rate ? describeRate(rate.rateBpOfMonth) : 'a fixed share'},
              and only when a tenant has actually moved in.
            </p>
            <div className="row">
              <Link href="/register?role=lister" className="btn btn-primary btn-lg">
                List a property
              </Link>
              <Link href="/contact" className="btn btn-secondary btn-lg">
                Talk to someone first
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="section section-sunk">
        <div className="page stack-lg">
          <div>
            <p className="eyebrow">What you get</p>
            <h2 className="h1">The work we do before anyone views</h2>
          </div>

          <div className="promise-grid">
            <div className="stack-sm">
              <Icon.shield size={24} />
              <h3 className="h3">A verified tenant</h3>
              <p className="muted">
                Nobody can request a viewing of your property until we have
                verified their identity. You are not letting to a phone number.
              </p>
            </div>
            <div className="stack-sm">
              <Icon.camera size={24} />
              <h3 className="h3">Photography and a condition report</h3>
              <p className="muted">
                Our officer photographs the property and files a structured
                report on its condition. You see what a tenant sees.
              </p>
            </div>
            <div className="stack-sm">
              <Icon.user size={24} />
              <h3 className="h3">We run the viewings</h3>
              <p className="muted">
                An officer meets each tenant at the property. You do not spend
                your Saturdays waiting for people who do not arrive.
              </p>
            </div>
            <div className="stack-sm">
              <Icon.lock size={24} />
              <h3 className="h3">The money is collected before move-in</h3>
              <p className="muted">
                Rent and deposit are held in escrow by us and released to you on
                move-in. You are not chasing a first payment.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="section" id="commission">
        <div className="page">
          <div className="detail-grid">
            <div className="stack-lg">
              <div>
                <p className="eyebrow">Commission</p>
                <h2 className="h1">One payment, once, on success.</h2>
              </div>

              <div className="prose">
                <p>
                  There is no listing fee, no monthly fee, and nothing payable
                  up front. Our commission is charged a single time per
                  tenancy, and it is taken out of the settlement when the money
                  is released to you — so you never write us a cheque.
                </p>
                <p>
                  The rate is fixed against your agreement at the moment you
                  sign it. If we change our published rate afterwards, your
                  agreement is unaffected: the version you accepted is the
                  version that binds, and it is recorded.
                </p>
                <p>
                  If the tenancy does not complete — the tenant does not move
                  in, and the escrow is refunded — no commission is earned. We
                  are paid for a tenancy, not for an introduction.
                </p>
              </div>

              <h2 className="h2">Going around us</h2>
              <div className="prose">
                <p>
                  Your agreement includes a circumvention clause. Every
                  introduction we make is recorded — which tenant, which
                  property, which officer, on what date — so if a tenancy is
                  completed off-platform with a tenant we introduced, the
                  commission is still due.
                </p>
                <p>
                  This is not there to catch anyone out. It is there because the
                  officer who verified your property and ran the viewing was
                  paid to do it, and because it is the reason the service can be
                  free for tenants.
                </p>
              </div>
            </div>

            <aside className="detail-aside">
              <div className="card stack">
                <h3 className="h3">What you pay</h3>
                <dl className="terms">
                  <div className="terms-row">
                    <dt>To list a property</dt>
                    <dd>Nothing</dd>
                  </div>
                  <div className="terms-row">
                    <dt>For verification and photography</dt>
                    <dd>Nothing</dd>
                  </div>
                  <div className="terms-row">
                    <dt>Per viewing</dt>
                    <dd>Nothing</dd>
                  </div>
                  <div className="terms-row">
                    <dt>Monthly</dt>
                    <dd>Nothing</dd>
                  </div>
                  <div className="terms-row terms-total">
                    <dt>On a completed move-in</dt>
                    <dd>{rate ? describeRate(rate.rateBpOfMonth) : '—'}</dd>
                  </div>
                </dl>
                <p className="hint">
                  {rate
                    ? 'The rate currently in force. The version you sign is recorded against your agreement and does not change afterwards.'
                    : 'No published rate is currently in force. Speak to us before listing.'}
                </p>
                <Link
                  href="/register?role=lister"
                  className="btn btn-primary btn-block"
                >
                  List a property
                </Link>
              </div>
            </aside>
          </div>
        </div>
      </section>

      <section className="section section-sunk">
        <div className="page stack-lg">
          <div>
            <p className="eyebrow">Getting started</p>
            <h2 className="h1">Four steps to a live listing</h2>
          </div>

          <ol className="steps steps-across">
            <li>
              <h3 className="h3">Create an account</h3>
              <p>
                A name and a phone number. Two minutes, and nothing to pay.
              </p>
            </li>
            <li>
              <h3 className="h3">Describe the property</h3>
              <p>
                Neighbourhood, a landmark, size, and your terms. A street
                address is optional.
              </p>
            </li>
            <li>
              <h3 className="h3">We come and see it</h3>
              <p>
                A field officer visits, photographs it, and confirms it matches
                what you told us.
              </p>
            </li>
            <li>
              <h3 className="h3">Sign, and go live</h3>
              <p>
                Accept the agreement and the listing publishes. You track
                viewings and the deal from your dashboard.
              </p>
            </li>
          </ol>

          <div className="row">
            <Link href="/register?role=lister" className="btn btn-primary btn-lg">
              Start now
              <Icon.arrow size={16} />
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
