import Link from 'next/link';
import { Brand } from '@/app/ui';
import { currentRole, homeFor, requireRole } from '@/lib/session';
import { logoutAction } from '@/app/actions/auth';

/**
 * The signed-in shell for tenants and landlords.
 *
 * Both roles share it because both are doing the same kind of thing —
 * following one transaction through its stages — and giving each its own
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
  const isLandlord = role === 'lister';

  return (
    <>
      <header className="site-head">
        <div className="page site-head-inner">
          <Brand
            sub={isLandlord ? 'Landlord' : 'My account'}
            href={role ? homeFor(role) : '/'}
          />
          <nav className="site-nav" aria-label="Account">
            {isLandlord ? (
              <>
                <Link href="/landlord">Portfolio</Link>
                <Link href="/landlord/properties/new">Add a property</Link>
                <Link href="/landlord/deals">Lettings</Link>
              </>
            ) : (
              <>
                <Link href="/account">Overview</Link>
                <Link href="/account/viewings">Viewings</Link>
                <Link href="/account/deals">My tenancy</Link>
                <Link href="/properties">Browse homes</Link>
              </>
            )}
          </nav>
          <div className="site-actions-desktop">
            <form action={logoutAction}>
              <button type="submit" className="btn btn-secondary btn-sm">
                Sign out
              </button>
            </form>
          </div>

          <details className="menu">
            <summary aria-label="Menu">
              <svg
                width={22}
                height={22}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.6}
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="M4 7h16M4 12h16M4 17h16" />
              </svg>
            </summary>
            <div className="menu-panel page">
              {isLandlord ? (
                <>
                  <Link href="/landlord">Portfolio</Link>
                  <Link href="/landlord/properties/new">Add a property</Link>
                  <Link href="/landlord/deals">Lettings</Link>
                </>
              ) : (
                <>
                  <Link href="/account">Overview</Link>
                  <Link href="/account/viewings">Viewings</Link>
                  <Link href="/account/deals">My tenancy</Link>
                  <Link href="/properties">Browse homes</Link>
                </>
              )}
              <hr />
              <form action={logoutAction}>
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
    </>
  );
}
