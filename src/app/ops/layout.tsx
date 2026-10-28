import type { Metadata } from 'next';
import { AppShell } from '@/app/app-shell';
import type { ShellNavGroup } from '@/app/app-shell-nav';
import { SiteFooter } from '@/app/site-chrome';
import { requireStaff } from '@/lib/session';

/*
 * The staff console is internal tooling on live operational data - the
 * entire group stays out of every search index.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * The operations console shell.
 *
 * ── A different register, the same product ──
 * This is the one surface deliberately styled for density rather than
 * generosity: an officer standing in a stairwell wants rows and fields, not
 * whitespace (Technical Architecture §7). It shares every design token with
 * the public site - the tighter measure and smaller type are the only
 * divergence, and the frame is the same app shell the portal uses.
 *
 * ── The queue links are IN the nav now ──
 * The verification queue and the reconciliation report used to be reachable
 * only through buttons buried inside other pages (route inventory finding,
 * 2026-10 design round). Hiding a screen an admin needs daily behind another
 * screen is how work gets missed; both now sit in the console group.
 *
 * `requireStaff()` here is a convenience gate, not the security boundary -
 * the backend refuses a non-staff caller regardless (NFR-1, API Spec §4.3).
 * It only spares someone a confusing 403 page.
 */
export default async function OpsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireStaff();
  const role = session.role;

  const fieldWork: ShellNavGroup = {
    label: 'Field work',
    items: [
      { href: '/ops/today', label: 'Today', icon: 'calendar' },
      { href: '/ops', label: 'Launch gate', icon: 'shield' },
      { href: '/ops/queue', label: 'Verification queue', icon: 'list' },
      { href: '/ops/introductions', label: 'Evidence', icon: 'doc' },
    ],
  };

  const adminConsole: ShellNavGroup = {
    label: 'Console',
    items: [
      { href: '/ops/dispatch', label: 'Dispatch', icon: 'pin' },
      { href: '/ops/deals', label: 'Deals', icon: 'swap' },
      { href: '/ops/mandates', label: 'Mandates', icon: 'doc' },
      { href: '/ops/areas', label: 'Areas', icon: 'eye' },
      { href: '/ops/users', label: 'Users', icon: 'users' },
      { href: '/ops/config', label: 'Config', icon: 'gear' },
      { href: '/ops/audit', label: 'Audit', icon: 'pulse' },
      { href: '/ops/reconciliation', label: 'Reconciliation', icon: 'coins' },
    ],
  };

  const exit: ShellNavGroup = {
    label: 'Elsewhere',
    items: [
      { href: '/', label: 'Public site', icon: 'home' },
      ...(role === 'admin'
        ? [{ href: '/platform', label: 'Platform center', icon: 'shield' as const }]
        : []),
    ],
  };

  return (
    <AppShell
      brandSub="Operations"
      brandHref="/ops"
      nav={[fieldWork, ...(role === 'admin' ? [adminConsole] : []), exit]}
      who={{
        name: session.displayName,
        role: role === 'admin' ? 'Administrator' : 'Field officer',
      }}
      footer={<SiteFooter />}
    >
      {children}
    </AppShell>
  );
}
