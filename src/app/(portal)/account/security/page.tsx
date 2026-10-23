import { PasswordForm } from '../../password-form';

export const metadata = { title: 'Security' };

/**
 * Account security (tenant surface).
 *
 * Deliberately small. The only security action this product actually
 * offers today is changing the password, and the page says exactly what
 * that does - including the part most products hide until it surprises
 * someone: other signed-in devices are logged out.
 *
 * The "no payment methods here" line is honesty, not filler: a tenant who
 * is hunting for where their card is stored (because every other site
 * stores one) deserves the plain answer that there is nothing to find.
 */
export default function SecurityPage() {
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
        <h2 className="h3">A note on your details</h2>
        <ul className="trust-list" style={{ marginTop: '0.4rem' }}>
          <li>
            <span>
              House For Rent never asks for your card or bank details to search,
              view or rent. Money moves only inside a deal, through the
              agreement, never by phone call or WhatsApp.
            </span>
          </li>
          <li>
            <span>
              If someone contacts you claiming to be us and asks for a payment
              outside the platform, that is not us. Tell the field officer on
              your visit, or report it to our operations desk.
            </span>
          </li>
        </ul>
      </section>
    </div>
  );
}
