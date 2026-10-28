import Link from 'next/link';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { resolveSession, homeFor } from '@/server/auth';

export const metadata: Metadata = {
  // The control center is internal tooling on live platform data: out of
  // every search index, same as the ops console.
  robots: { index: false, follow: false },
};

/**
 * The Platform Control Center shell - the owner's register.
 *
 * ── THE GUARD ──
 * `requireRole(['admin'])` in spirit, written out because the redirect
 * targets differ from the public surfaces: an anonymous visitor goes to the
 * ordinary public sign-in (the same door every account uses - there is no
 * separate operator sign-in surface to discover), and any authenticated
 * NON-platform role goes to its OWN home (a tenant who followed a link has
 * done nothing wrong; a field officer belongs in the ops console). After
 * that sign-in the server-resolved role does the routing: homeFor('admin')
 * is /platform, so the platform owner lands back here without ever typing
 * a URL. This layout is a convenience gate, not the security boundary - it
 * spares people confusing errors, while every API and service behind it
 * re-authorises the caller regardless (NFR-1).
 *
 * ── STEALTH (owner directive) ──
 * The existence of a platform-level surface is not advertised: no link from
 * the public site, no dedicated login page, no "/platform" reference in any
 * user-visible URL. Users should never learn this area exists. Signing in
 * with platform credentials on the ordinary sign-in page IS the entry.
 *
 * ── A different register, the same product ──
 * Dark chrome and a control-center nav, sharing every token with the rest of
 * the app. Normal user navigation is not polluted with platform links, and
 * this nav does not render tenant/landlord surfaces except an explicit exit.
 */
export default async function PlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await resolveSession();
  if (!session) {
    // The one and only door: the public sign-in. The role the server
    // resolves after it decides where the account lands.
    redirect('/login');
  }
  if (session.role !== 'admin') {
    redirect(homeFor(session.role));
  }

  const nav = [
    { href: '/platform', label: 'Overview' },
    { href: '/platform/users', label: 'Users' },
    { href: '/platform/listings', label: 'Listings' },
    { href: '/platform/transactions', label: 'Transactions' },
    { href: '/platform/system', label: 'System' },
  ];

  return (
    <div className="plat-shell">
      <header className="plat-head">
        <div className="page plat-head-inner">
          <Link href="/platform" className="plat-brand">
            <img src="/logo.png" alt="" width={34} height={34} className="plat-brand-mark" />
            <span>
              <span className="plat-brand-name">Platform Control</span>
              <span className="plat-brand-sub">House For Rent · Natural Intellects Ltd</span>
            </span>
          </Link>

          <nav className="plat-nav" aria-label="Platform control">
            {nav.map((item) => (
              <Link key={item.href} href={item.href}>
                {item.label}
              </Link>
            ))}
            <span className="plat-nav-sep" aria-hidden="true" />
            <a href="/ops">Staff console</a>
            <a href="/ops/audit">Audit trail</a>
          </nav>

          <div className="plat-who">
            <span className="plat-who-id">
              <span className="plat-who-name">{session.displayName}</span>
              <span className="plat-who-role">Platform owner</span>
            </span>
            <form action="/api/v1/auth/logout" method="post">
              <button type="submit" className="plat-signout">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <main id="main" className="plat-main">
        {children}
      </main>

      <footer className="plat-foot">
        <div className="page plat-foot-inner">
          <p>
            Platform Control Center · operated by Natural Intellects Ltd, Kampala.
            Every action taken here is attributable to your account in the audit
            trail.
          </p>
          <a href="/">Public site ↗</a>
        </div>
      </footer>
    </div>
  );
}
