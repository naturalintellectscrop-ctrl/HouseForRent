import Link from 'next/link';
import { Brand, Icon } from '@/app/ui';
import { SiteFooter } from '@/app/site-chrome';
import { currentRole, homeFor, requireRole } from '@/lib/session';

/*
 * The portal's link set lives here once. It used to exist twice (desktop
 * nav + mobile menu panel), which is how the two copies drift - a link
 * added to one and not the other is a bug the second role notices. The
 * admin variant is the tenant list minus the tenant-only pages.
 */
const LANDLORD_NAV = [
  { href: '/landlord', label: 'Portfolio' },
  { href: '/landlord/properties/new', label: 'Add a property' },
  { href: '/landlord/deals', label: 'Lettings' },
  { href: '/landlord/earnings', label: 'Earnings' },
  { href: '/landlord/security', label: 'Security' },
];

const TENANT_NAV = [
  { href: '/account', label: 'Overview' },
  { href: '/account/saved', label: 'Saved homes' },
  { href: '/account/viewings', label: 'Viewings' },
  { href: '/account/deals', label: 'My tenancy' },
  { href: '/account/security', label: 'Security' },
  { href: '/properties', label: 'Browse homes' },
];

const ADMIN_NAV = [
  { href: '/account', label: 'Overview' },
  { href: '/account/viewings', label: 'Viewings' },
  { href: '/account/deals', label: 'My tenancy' },
  { href: '/account/security', label: 'Security' },
  { href: '/properties', label: 'Browse homes' },
];

/**
 * The signed-in shell for tenants and landlords.
 *
 * Both roles share it because both are doing the same kind of thing -
 * following one transaction through its stages - and giving each its own
 * chrome would be two things to keep consistent for no gain. The nav
 * differs; nothing else does.
 *
 * `requireRole` here is a convenience gate. It reads a cookie the browser
 * can rewrite, and it is not the security boundary: every fetch this shell's
 * pages make is authorised server-side by the API against the real session
 * (NFR-1). Rewriting the cookie changes the menu and gets a 403 from
 * everything behind it.
 */
export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireRole(['tenant', 'lister', 'admin']);
  const role = await currentRole();
  const nav =
    role === 'lister' ? LANDLORD_NAV : role === 'admin' ? ADMIN_NAV : TENANT_NAV;

  return (
    <>
      <header className="site-head">
        <div className="page site-head-inner">
          <Brand
            sub={role === 'lister' ? 'Landlord' : 'My account'}
            href={role ? homeFor(role) : '/'}
          />
          <nav className="site-nav" aria-label="Account">
            {nav.map((item) => (
              <Link key={item.href} href={item.href}>
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="site-actions-desktop">
            {/* Sign-out is a plain HTML form to the API, which revokes the
                session server-side and clears the cookie - no JavaScript
                involved, and the token cannot be replayed. */}
            <form action="/api/v1/auth/logout" method="post">
              <button type="submit" className="btn btn-secondary btn-sm">
                Sign out
              </button>
            </form>
          </div>

          <details className="menu">
            <summary aria-label="Menu">
              <Icon.menu />
            </summary>
            <div className="menu-panel page">
              {nav.map((item) => (
                <Link key={item.href} href={item.href}>
                  {item.label}
                </Link>
              ))}
              <hr />
              <form action="/api/v1/auth/logout" method="post">
                <button type="submit" className="btn btn-secondary btn-block">
                  Sign out
                </button>
              </form>
            </div>
          </details>
        </div>
      </header>

      <main id="main" className="page section">
        {children}
      </main>

      {/* The portals end on the same ink the public site ends on. They are
          parts of one product; the footer is where that is cheapest and
          most visible to prove. Its links are public routes, so it is safe
          to render for any signed-in role. */}
      <SiteFooter />
    </>
  );
}
