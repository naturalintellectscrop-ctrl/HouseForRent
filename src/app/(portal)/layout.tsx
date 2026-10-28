import type { Metadata } from 'next';
import { AppShell } from '@/app/app-shell';
import type { ShellNavGroup } from '@/app/app-shell-nav';
import { SiteFooter } from '@/app/site-chrome';
import { currentRole, homeFor, requireRole } from '@/lib/session';

/*
 * Signed-in, per-user application state. No portal page has any business
 * in a search index - one directive here covers the whole group.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/*
 * The portal's link set lives here once, in the sidebar's groups. It used
 * to exist twice (desktop nav + mobile menu panel), which is how the two
 * copies drift - a link added to one and not the other is a bug the second
 * role notices. The admin variant is the tenant list minus the tenant-only
 * pages. Icons are drawn from the one in-house set (src/app/ui.tsx).
 */
const LANDLORD_NAV: ShellNavGroup[] = [
  {
    label: 'Manage',
    items: [
      { href: '/landlord', label: 'Portfolio', icon: 'home' },
      { href: '/landlord/properties/new', label: 'Add a property', icon: 'plus' },
      { href: '/landlord/deals', label: 'Lettings', icon: 'swap' },
      { href: '/landlord/earnings', label: 'Earnings', icon: 'coins' },
    ],
  },
  {
    label: 'Account',
    items: [
      { href: '/landlord/security', label: 'Security', icon: 'lock' },
      { href: '/properties', label: 'Browse homes', icon: 'search' },
    ],
  },
];

const TENANT_NAV: ShellNavGroup[] = [
  {
    label: 'Renting',
    items: [
      { href: '/account', label: 'Overview', icon: 'home' },
      { href: '/account/saved', label: 'Saved homes', icon: 'bookmark' },
      { href: '/account/viewings', label: 'Viewings', icon: 'calendar' },
      { href: '/account/deals', label: 'My tenancy', icon: 'key' },
    ],
  },
  {
    label: 'Account',
    items: [
      { href: '/account/security', label: 'Security', icon: 'lock' },
      { href: '/properties', label: 'Browse homes', icon: 'search' },
    ],
  },
];

const ADMIN_NAV: ShellNavGroup[] = [
  {
    label: 'Renting',
    items: [
      { href: '/account', label: 'Overview', icon: 'home' },
      { href: '/account/viewings', label: 'Viewings', icon: 'calendar' },
      { href: '/account/deals', label: 'My tenancy', icon: 'key' },
    ],
  },
  {
    label: 'Account',
    items: [
      { href: '/account/security', label: 'Security', icon: 'lock' },
      { href: '/properties', label: 'Browse homes', icon: 'search' },
    ],
  },
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
  const session = await requireRole(['tenant', 'lister', 'admin']);
  const role = await currentRole();
  const nav =
    role === 'lister' ? LANDLORD_NAV : role === 'admin' ? ADMIN_NAV : role === 'tenant' ? TENANT_NAV : ADMIN_NAV;

  const roleLabel =
    role === 'lister' ? 'Landlord' : role === 'admin' ? 'Admin' : 'Tenant';

  return (
    <AppShell
      brandSub={roleLabel === 'Landlord' ? 'Landlord' : 'My account'}
      brandHref={homeFor(session.role)}
      nav={nav}
      who={{
        name: session.displayName,
        role: roleLabel,
      }}
      footer={<SiteFooter />}
    >
      {children}
    </AppShell>
  );
}
