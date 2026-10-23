import Link from 'next/link';
import { PasswordForm } from '../../password-form';

export const metadata = { title: 'Security' };

/**
 * Account security (landlord surface).
 *
 * Same form, same rules, same API call as the tenant's /account/security -
 * a landlord's credentials protect money-direction authority, so this page
 * matters at least as much on this side. The warning line is written for
 * the fraud attempt landlords actually face: a "tenant" asking to pay
 * outside the platform before any deal exists.
 */
export default function LandlordSecurityPage() {
  return (
    <div className="stack-lg">
      <div>
        <h1 className="h1">Security</h1>
        <p className="lede">
          Change your password. When you do, every other device signed in to
          this account is signed out - the one you are using stays signed in.
        </p>
      </div>

      <section className="card stack" style={{ maxWidth: '34rem' }}>
        <h2 className="h3">Change your password</h2>
        <PasswordForm />
      </section>

      <section className="card stack" style={{ maxWidth: '34rem' }}>
        <h2 className="h3">A note on payments to you</h2>
        <ul className="trust-list" style={{ marginTop: '0.4rem' }}>
          <li>
            <span>
              We never ask you to pay anything to list a property or to be
              verified. Our one commission is deducted when a tenancy is
              settled - never collected up front.
            </span>
          </li>
          <li>
            <span>
              If a &quot;tenant&quot; offers to pay you directly to skip the
              agreement, that offer is the exact risk our process exists to
              remove. Report it to your field officer or the operations desk.
            </span>
          </li>
        </ul>
      </section>

      <p>
        <Link href="/for-landlords" className="btn btn-ghost btn-sm">
          How we work with landlords →
        </Link>
      </p>
    </div>
  );
}
