import { Brand, Icon } from '@/app/ui';
import { AppShellNav, type ShellNavGroup } from '@/app/app-shell-nav';
import { ShellDrawer } from '@/app/app-shell-drawer';

/** Initials for the identity disc - no photos are collected in V1, so
    initials are the honest identity mark. */
export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]!.toUpperCase())
    .join('');
}

/**
 * The signed-in app frame, shared by three registers.
 *
 * ── One frame, three identities ──
 * The reference direction keeps operating surfaces in a calm frame: a white
 * sidebar of grouped links on a pale sage canvas, one active item marked by
 * a solid green pill, content floating on white cards. The marketplace
 * keeps its top-navigation register (browsing is not operating); the
 * portal (tenant/landlord), the ops console and the platform center are
 * operating surfaces and all three render through THIS component:
 *
 *   variant="light"  portal + ops - white sidebar, green active pill
 *   variant="forest" platform center - deep-forest sidebar, lighter pill
 *
 * The sidebar content is server-rendered once and passed through the
 * drawer island; with JavaScript disabled the nav simply renders as the
 * fixed desktop column and the mobile burger does not appear.
 *
 * What this component deliberately does NOT do: authorise anything. Callers
 * have already gated the group; the API re-authorises every request the
 * pages make (NFR-1). It renders only the chrome.
 */
export function AppShell({
  variant = 'light',
  brandSub,
  brandHref,
  nav,
  who,
  topbar,
  footer,
  themeToggle,
  children,
}: {
  /** `light` = portal/ops; `forest` = platform control center. */
  variant?: 'light' | 'forest';
  brandSub: string;
  brandHref: string;
  nav: ShellNavGroup[];
  who: { name: string; role: string };
  /** Right side of the sticky topbar: page-context actions. */
  topbar?: React.ReactNode;
  /** Optional footer rail under the content (portal keeps the public one). */
  footer?: React.ReactNode;
  /** Optional appearance control beside the identity disc (the platform
      center passes its light/dark quick toggle; other registers keep the
      footer exactly as it was). */
  themeToggle?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className={variant === 'forest' ? 'shell shell--forest' : 'shell'}>
      <div className="shell-main">
        <header className="shell-topbar">
          <div className="shell-topbar-inner">
            <ShellDrawer variant={variant}>
              {/* The wrapper carries the sidebar's brand-row padding and
                  no-wrap rules (globals.css `.shell-side-brand`); the bare
                  link once rendered unpadded and its wrapped wordmark was
                  clipped off the viewport top on every shell surface. */}
              <div className="shell-side-brand">
                <Brand sub={brandSub} href={brandHref} />
              </div>
              <div className="shell-side-body">
                <AppShellNav groups={nav} />
              </div>
              <div className="shell-side-foot">
                <span className="avatar" aria-hidden="true">
                  {initialsOf(who.name)}
                </span>
                <span className="who">
                  <span className="who-name">{who.name}</span>
                  <span className="who-role">{who.role}</span>
                </span>
                {/* Sign-out is a plain HTML form to the API, which revokes
                    the session server-side and clears the cookie - no
                    JavaScript involved, and the token cannot be replayed.
                    The visible word matters: the icon-only control was not
                    being found (round-60 owner feedback), and on a phone
                    the sidebar only exists inside the drawer, where an
                    unlabelled glyph was effectively invisible. */}
                <div className="shell-side-foot-actions">
                  {themeToggle}
                  <form action="/api/v1/auth/logout" method="post">
                    <button type="submit" className="btn btn-ghost btn-sm">
                      <Icon.signout size={16} />
                      <span>Sign out</span>
                    </button>
                  </form>
                </div>
              </div>
            </ShellDrawer>
            <span className="shell-topbar-title">
              House For Rent · {brandSub}
            </span>
            <div className="shell-topbar-actions">{topbar}</div>
          </div>
        </header>

        <main id="main" className="shell-content">
          {children}
        </main>

        {footer ? <div className="shell-foot">{footer}</div> : null}
      </div>
    </div>
  );
}
