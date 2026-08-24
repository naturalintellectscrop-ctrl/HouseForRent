import Link from 'next/link';
import { Brand, Icon } from '@/app/ui';
import { currentRole, homeFor, isSignedIn } from '@/lib/session';
import { logoutAction } from '@/app/actions/auth';

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
 * The session-dependent half is resolved SERVER-side from the role cookie.
 * That cookie decides which links render and nothing else — the API
 * re-authorises every request regardless of what it says (NFR-1).
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
              <form action={logoutAction}>
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
                <form action={logoutAction}>
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
  return (
    <footer className="site-foot">
      <div className="page">
        <div className="foot-grid">
          <div>
            <Brand />
            <p className="muted" style={{ marginTop: '0.75rem', maxWidth: '22rem' }}>
              A rental marketplace where every home is visited and confirmed by
              one of our field officers before it reaches you.
            </p>
          </div>

          <div className="foot-col">
            <h3>Tenants</h3>
            <Link href="/properties">Browse homes</Link>
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

        <p className="foot-legal">
          House For Rent is operated by Natural Intellects Ltd, Kampala,
          Uganda. Tenants are never charged a fee to search, view or rent
          through this platform.
        </p>
      </div>
    </footer>
  );
}
