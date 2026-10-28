import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { resolveSession, homeFor } from '@/server/auth';
import { AppShell } from '@/app/app-shell';
import type { ShellNavGroup } from '@/app/app-shell-nav';

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
 * The forest sidebar variant of the shared app shell: same geometry as the
 * portal, deep-forest fill, every token still from the one palette.
 * Normal user navigation is not polluted with platform links.
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

  // The approvals nav entry carries the live pending count - the one
  // figure on the chrome that is a workload, not a decoration. A dead
  // database degrades to a plain label (the page itself handles its own
  // degraded state; the chrome must not break because of it).
  let pendingApplications: number | null = null;
  try {
    pendingApplications = await db.party.count({ where: { status: 'pending_verification' } });
  } catch {
    pendingApplications = null;
  }

  const platform: ShellNavGroup = {
    label: 'Platform',
    items: [
      { href: '/platform', label: 'Overview', icon: 'chart' },
      { href: '/platform/approvals', label: 'Approvals', icon: 'users', count: pendingApplications },
      { href: '/platform/users', label: 'Users', icon: 'user' },
      { href: '/platform/listings', label: 'Listings', icon: 'home' },
      { href: '/platform/transactions', label: 'Transactions', icon: 'coins' },
      { href: '/platform/system', label: 'System', icon: 'gear' },
    ],
  };

  const staffing: ShellNavGroup = {
    label: 'Staffing',
    items: [
      { href: '/ops', label: 'Staff console', icon: 'eye' },
      { href: '/ops/audit', label: 'Audit trail', icon: 'pulse' },
    ],
  };

  return (
    <AppShell
      variant="forest"
      brandSub="Platform Control"
      brandHref="/platform"
      nav={[platform, staffing]}
      who={{ name: session.displayName, role: 'Platform owner' }}
      footer={
        <div className="shell-foot-note page">
          <p>
            Platform Control Center · operated by Natural Intellects Ltd,
            Kampala. Every action taken here is attributable to your account in
            the audit trail.
          </p>
        </div>
      }
    >
      {children}
    </AppShell>
  );
}
