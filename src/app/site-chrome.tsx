import Link from 'next/link';
import { Brand, CONTACT, Icon, TAGLINE } from '@/app/ui';
import { isSignedIn, currentRole, homeFor } from '@/lib/session';

const NAV = [
  { href: '/properties', label: 'Find a home' },
  { href: '/for-landlords', label: 'For landlords' },
  { href: '/how-it-works', label: 'How it works' },
  { href: '/about', label: 'About' },
];

/**
 * The public header.
 *
 * ── Why the small-screen menu is a `<details>` ──
 * No state, no hydration, no JavaScript. It works before the bundle
 * downloads, which on a phone connection in Kampala is the only moment that
 * decides whether someone stays (NFR-5). A React-controlled drawer would be
 * the conventional choice and would be broken for the first two seconds of
 * every cold visit.
 *
 * The session-dependent half is resolved SERVER-side from the real session
 * row. That decides which links render and nothing else - the services
 * re-authorise every request regardless (NFR-1).
 */
export async function SiteHeader() {
  const signedIn = await isSignedIn();
  const role = await currentRole();
  const home = role ? homeFor(role) : '/account';

  return (
    <header className="site-head">
      <div className="page site-head-inner">
        <Brand />

        <nav className="site-nav" aria-label="Main">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href}>
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="site-actions" style={{ display: 'none' }} />

        {/* Desktop actions */}
        <div className="site-actions site-actions-desktop">
          {signedIn ? (
            <>
              <Link href={home} className="btn btn-ghost btn-sm">
                <Icon.user size={16} />
                My account
              </Link>
              <form action="/api/v1/auth/logout" method="post">
                <button type="submit" className="btn btn-secondary btn-sm">
                  Sign out
                </button>
              </form>
            </>
          ) : (
            <>
              <Link href="/login" className="btn btn-ghost btn-sm">
                Sign in
              </Link>
              <Link href="/register" className="btn btn-primary btn-sm">
                Create an account
              </Link>
            </>
          )}
        </div>

        <details className="menu">
          <summary aria-label="Menu">
            <Icon.menu />
          </summary>
          <div className="menu-panel page">
            {NAV.map((item) => (
              <Link key={item.href} href={item.href}>
                {item.label}
              </Link>
            ))}
            <hr />
            {signedIn ? (
              <>
                <Link href={home}>My account</Link>
                <form action="/api/v1/auth/logout" method="post">
                  <button type="submit" className="btn btn-secondary btn-block">
                    Sign out
                  </button>
                </form>
              </>
            ) : (
              <>
                <Link href="/login">Sign in</Link>
                <Link href="/register" className="btn btn-primary btn-block">
                  Create an account
                </Link>
              </>
            )}
          </div>
        </details>
      </div>
    </header>
  );
}

export function SiteFooter() {
  const socials = [
    { label: 'WhatsApp', icon: Icon.whatsapp },
    { label: 'Facebook', icon: Icon.facebook },
    { label: 'Instagram', icon: Icon.instagram },
    { label: 'X', icon: Icon.xSocial },
    { label: 'TikTok', icon: Icon.tiktok },
    { label: 'YouTube', icon: Icon.youtube },
  ];

  return (
    <footer className="site-foot">
      <div className="page">
        <div className="foot-grid">
          <div>
            <Brand />
            {/* The tagline, exactly as painted on the logo, with the red rule
                it sits between there - the one place the logo's red has a
                genuine job in the interface. */}
            <p className="brand-tagline">{TAGLINE}</p>
            <p className="muted" style={{ marginTop: '0.75rem', maxWidth: '22rem' }}>
              A rental marketplace where every home is visited and confirmed by
              one of our field officers before it reaches you.
            </p>
            {/* Real channels, answered by people. Email opens a compose
                window; numbers dial directly; the WhatsApp links pre-open a
                chat - no forms that post nowhere. */}
            <div className="foot-contact">
              <a href={`mailto:${CONTACT.email}`} className="foot-contact-row">
                <Icon.mail size={15} />
                {CONTACT.email}
              </a>
              {CONTACT.phones.map((phone) => (
                <span key={phone.tel} className="foot-contact-row">
                  <Icon.phone size={15} />
                  <a href={`tel:${phone.tel}`}>{phone.display}</a>
                  <a
                    href={`https://wa.me/${phone.tel.replace('+', '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`WhatsApp ${phone.display}`}
                  >
                    <Icon.whatsapp size={15} />
                    <span className="sr-only">WhatsApp {phone.display}</span>
                  </a>
                </span>
              ))}
            </div>
          </div>

          <div className="foot-col">
            <h3>Tenants</h3>
            <Link href="/properties">Browse homes</Link>
            <Link href="/areas">Areas we cover</Link>
            <Link href="/how-it-works">How it works</Link>
            <Link href="/register?role=tenant">Create an account</Link>
          </div>

          <div className="foot-col">
            <h3>Landlords</h3>
            <Link href="/for-landlords">List a property</Link>
            <Link href="/for-landlords#commission">Our commission</Link>
            <Link href="/register?role=lister">Create an account</Link>
          </div>

          <div className="foot-col">
            <h3>Company</h3>
            <Link href="/about">About us</Link>
            <Link href="/contact">Contact</Link>
            <Link href="/ops">Staff console</Link>
          </div>
        </div>

        {/* Social placeholders: the handles are not live yet, so these are
            deliberately NOT links - an icon that navigates nowhere is a dead
            end. They render as inert marks with their name exposed to screen
            readers, and become real links the day the profiles exist. */}
        <div className="foot-social" aria-label="Social media (coming soon)">
          {socials.map((social) => (
            <span
              key={social.label}
              className="social-logo"
              role="img"
              aria-label={`${social.label} - coming soon`}
              title={`${social.label} - coming soon`}
            >
              {social.icon({ size: 18 })}
            </span>
          ))}
        </div>

        <p className="foot-legal">
          House For Rent is operated by Natural Intellects Ltd, Kampala,
          Uganda. Tenants are never charged a fee to search, view or rent
          through this platform.
        </p>
      </div>
    </footer>
  );
}
