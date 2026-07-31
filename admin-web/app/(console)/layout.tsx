import Link from 'next/link';
import { requireStaff } from '@/lib/session';
import { logoutAction } from '../actions/auth';

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
  // Read but not branched on: both `foo` and `admin` see the same links in
  // this slice. Kept so the gate's return value is used deliberately rather
  // than discarded, and so a future admin-only link has an obvious home.
  await requireStaff();

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <Link href="/" className="brand">
            House For Rent <span>· Field Console</span>
          </Link>
          <nav>
            <Link href="/">Today</Link>
            <Link href="/introductions">Evidence</Link>
            <form action={logoutAction}>
              <button type="submit">Sign out</button>
            </form>
          </nav>
        </div>
      </header>
      <main className="shell">{children}</main>
    </>
  );
}
