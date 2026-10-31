import { resolveSession } from '@/server/auth';
import { PlatPageHead, SectionCard } from '../data';
import {
  PlatformMotionSwitch,
  PlatformThemeSwitch,
} from '@/app/platform/platform-theme';

/**
 * Console settings - the owner's own surface.
 *
 * Honest scope: everything here is a preference of THIS browser (the
 * appearance choice lives in localStorage on this device), because a
 * console register is a per-operator working condition, not a platform
 * fact. Nothing here changes what the platform stores, who can act, or
 * what the audit trail records - the accountability copy stays true.
 */
export default async function PlatformSettingsPage() {
  const session = await resolveSession();

  return (
    <div className="stack-lg">
      <PlatPageHead
        eyebrow="Your console"
        title="Settings"
        lede="How this console looks and moves on this device. Preferences are per-browser by design - a register is a working condition of the operator, not a platform fact."
      />

      <div className="plat-grid-2">
        <SectionCard title="Appearance" eyebrow="Theme">
          <PlatformThemeSwitch />
          <p className="muted plat-feed-note">
            <strong>Light</strong> is the working register on the sage canvas.
            <strong> Dark</strong> is the night console - the same layout on
            deep forest ink, for late reviews. <strong>System</strong> follows
            this device&rsquo;s own light/dark setting and keeps following it
            while the console is open.
          </p>
        </SectionCard>

        <SectionCard title="Motion" eyebrow="Accessibility">
          <PlatformMotionSwitch />
          <p className="muted plat-feed-note">
            The console&rsquo;s entrance stagger and hover transitions are
            decoration; reduced motion turns them off and keeps every function.
            Your device&rsquo;s own reduce-motion setting is always honoured,
            whichever way this switch sits.
          </p>
        </SectionCard>
      </div>

      <div className="plat-grid-2">
        <SectionCard title="Session" eyebrow="Accountability">
          <p className="prose">
            Signed in as <strong>{session?.displayName ?? 'operator'}</strong>{' '}
            <span className="muted">({session?.role ?? 'admin'})</span>.
          </p>
          <p className="muted plat-feed-note">
            Every action taken in this console is attributable to your account
            in the audit trail. Signing out revokes the session server-side -
            the button in the sidebar, not a preference here.
          </p>
        </SectionCard>

        <SectionCard title="Scope of these settings" eyebrow="What they touch">
          <p className="prose">
            Theme and motion apply to the control center on this browser only.
            The public site, the tenant and landlord portals and the staff
            console keep their own registers.
          </p>
          <p className="muted plat-feed-note">
            No server state, no platform configuration and no financial
            behaviour is reachable from this page - operational configuration
            lives in <strong>System</strong> and is versioned there.
          </p>
        </SectionCard>
      </div>
    </div>
  );
}
