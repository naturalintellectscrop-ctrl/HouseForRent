import Link from 'next/link';
import { requireStaff } from '@/lib/session';
import { logoutAction } from '../actions/auth';
import { Topbar } from '../ui';

/**
 * The console shell. `requireStaff()` here is a convenience gate, not the
 * security boundary — the backend refuses a non-staff caller regardless
 * (NFR-1, API Spec §4.3). It only spares an officer a confusing 403 page.
 */
export default async function ConsoleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const role = await requireStaff();

  return (
    <>
      <Topbar
        nav={
          <>
            <Link href="/">Today</Link>
            <Link href="/introductions">Evidence</Link>
            {/* Ops is FOO-reachable for the launch gate and the queue; the
                page itself only fetches the admin-only figures when the
                caller is an admin. Hiding a link is presentation, never
                access control — the backend refuses regardless. */}
            <Link href="/ops">Ops</Link>
            {role === 'admin' && <Link href="/ops/dispatch">Dispatch</Link>}
            {role === 'admin' && <Link href="/ops/deals">Deals</Link>}
            {role === 'admin' && <Link href="/ops/config">Config</Link>}
            {role === 'admin' && <Link href="/ops/audit">Audit</Link>}
            <form action={logoutAction}>
              <button type="submit">Sign out</button>
            </form>
          </>
        }
      />
      <main className="shell">{children}</main>
    </>
  );
}
