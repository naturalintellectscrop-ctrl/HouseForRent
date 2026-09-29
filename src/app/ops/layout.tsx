import Link from 'next/link';
import { requireStaff } from '@/lib/session';
import { Brand } from '@/app/ui';

/**
 * The operations console shell.
 *
 * ── A different register, the same product ──
 * This is the one surface deliberately styled for density rather than
 * generosity: an officer standing in a stairwell wants rows and fields, not
 * whitespace (Technical Architecture §7). It shares every design token with
 * the public site — the tighter measure and smaller type are the only
 * divergence.
 *
 * `requireStaff()` here is a convenience gate, not the security boundary —
 * the backend refuses a non-staff caller regardless (NFR-1, API Spec §4.3).
 * It only spares someone a confusing 403 page.
 *
 * SANDBOX ADAPTATION: the reference signed out through a server action. Here
 * the sign-out is a plain HTML form POST to /api/v1/auth/logout, which
 * revokes the session server-side and redirects — the same no-JavaScript
 * pattern the public site chrome uses.
 */
export default async function OpsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireStaff();
  const role = session.role;

  return (
    <div className="ops">
      <header className="ops-head">
        <div className="ops-head-inner">
          <Brand sub="Operations" href="/ops" />
          <nav className="ops-nav" aria-label="Operations">
            <Link href="/ops/today">Today</Link>
            <Link href="/ops/introductions">Evidence</Link>
            {/* Ops is FOO-reachable for the launch gate and the queue; the
                page itself only fetches the admin-only figures when the
                caller is an admin. Hiding a link is presentation, never
                access control — the backend refuses regardless. */}
            <Link href="/ops">Ops</Link>
            {role === 'admin' && <Link href="/ops/dispatch">Dispatch</Link>}
            {role === 'admin' && <Link href="/ops/deals">Deals</Link>}
            {role === 'admin' && <Link href="/ops/mandates">Mandates</Link>}
            {role === 'admin' && <Link href="/ops/areas">Areas</Link>}
            {role === 'admin' && <Link href="/ops/users">Users</Link>}
            {role === 'admin' && <Link href="/ops/config">Config</Link>}
            {role === 'admin' && <Link href="/ops/audit">Audit</Link>}
            <Link href="/">Site</Link>
            <form action="/api/v1/auth/logout" method="post">
              <button type="submit">Sign out</button>
            </form>
          </nav>
        </div>
      </header>
      <main id="main" className="ops-shell">
        {children}
      </main>
    </div>
  );
}
