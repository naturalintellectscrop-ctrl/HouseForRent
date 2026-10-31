import Link from 'next/link';
import { db } from '@/lib/db';
import { resolveSession } from '@/server/auth';
import {
  DegradedPanel,
  PlatPageHead,
  SectionCard,
  humanize,
  loadPlatformData,
  roleLabel,
} from '../data';
import {
  PlatformMotionSwitch,
  PlatformThemeSwitch,
} from '@/app/platform/platform-theme';
import { StaffProvisionControl } from './staff-provision-control';
import { StaffAccessControl } from './staff-access-control';

/**
 * Console settings - the owner's own surface, plus the platform's access
 * control.
 *
 * ── Two kinds of setting live here, honestly labelled ──
 * Appearance and motion are preferences of THIS browser (localStorage on
 * this device) - a console register is a per-operator working condition,
 * not a platform fact. Team & access is different in kind: provisioning
 * and suspending staff changes who can act on the platform, writes to
 * the server, and lands on the audit trail with your identity attached.
 * The roles themselves are the platform's existing vocabulary - nothing
 * on this page invents a new privilege.
 */
export default async function PlatformSettingsPage() {
  const session = await resolveSession();

  const staffResult = await loadPlatformData(() =>
    db.userAccount.findMany({
      where: { authRole: { in: ['foo', 'admin'] } },
      include: {
        party: { select: { id: true, displayName: true, primaryPhone: true, status: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
  );

  return (
    <div className="stack-lg">
      <PlatPageHead
        eyebrow="Your console"
        title="Settings"
        lede="How this console looks on this device - and who can work beside you. Appearance is a per-browser preference; team & access changes the platform and is audited."
      />

      <SectionCard title="Team & access" eyebrow="Who can act">
        <p className="muted" style={{ marginTop: 0 }}>
          Staff are never self-served: only here creates them. An{' '}
          <strong>administrator</strong> holds the full platform register -
          this console, approvals, listings, transactions and money. A{' '}
          <strong>field officer</strong> works the field register - viewings,
          introductions and field evidence - and cannot decide money or
          applications. Every permission on the platform flows from one of
          these two roles plus the account-status policy.
        </p>
        <StaffProvisionControl />
        {staffResult.ok ? (
          <div className="plat-table-wrap" style={{ marginTop: '1rem' }}>
            <table className="plat-table">
              <thead>
                <tr>
                  <th scope="col">Staff</th>
                  <th scope="col">Role</th>
                  <th scope="col">Status</th>
                  <th scope="col" className="is-num">Last sign-in</th>
                  <th scope="col">
                    <span className="sr-only">Access</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {staffResult.data.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="muted">
                      No staff accounts yet - provision the first one above.
                    </td>
                  </tr>
                ) : null}
                {staffResult.data.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <span className="plat-table-main">
                        <span className="plat-name">{a.party.displayName}</span>
                        <span className="plat-sub">{a.party.primaryPhone}</span>
                      </span>
                    </td>
                    <td>{roleLabel(a.authRole)}</td>
                    <td>
                      {a.party.status === 'active' ? (
                        <span className="plat-pill plat-pill-ok">active</span>
                      ) : (
                        <span className="plat-pill plat-pill-warn">{humanize(a.party.status)}</span>
                      )}
                    </td>
                    <td className="is-num plat-table-muted">
                      {a.lastLoginAt
                        ? a.lastLoginAt.toISOString().replace('T', ' ').slice(0, 16) + ' UTC'
                        : 'never'}
                    </td>
                    <td>
                      <StaffAccessControl
                        partyId={a.party.id}
                        status={a.party.status}
                        isSelf={session ? a.party.id === session.partyId : false}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <DegradedPanel title="Staff roster unavailable" />
        )}
        <p className="muted plat-feed-note" style={{ marginBottom: 0 }}>
          Suspending a staff account revokes their live sessions immediately
          and is refused for your own account and for the last active
          administrator. Every provisioning and access change is on the{' '}
          <Link href="/ops/audit">audit trail</Link> with your identity.
        </p>
      </SectionCard>

      <div className="plat-grid-2">
        <SectionCard title="Appearance" eyebrow="Theme · this browser">
          <PlatformThemeSwitch />
          <p className="muted plat-feed-note">
            <strong>Light</strong> is the working register on the sage canvas.
            <strong> Dark</strong> is the night console - the same layout on
            deep forest ink, for late reviews. <strong>System</strong> follows
            this device&rsquo;s own light/dark setting and keeps following it
            while the console is open.
          </p>
        </SectionCard>

        <SectionCard title="Motion" eyebrow="Accessibility · this browser">
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
        <SectionCard title="Session & credentials" eyebrow="Accountability">
          <p className="prose">
            Signed in as <strong>{session?.displayName ?? 'operator'}</strong>{' '}
            <span className="muted">({roleLabel(session?.role ?? 'admin')})</span>.
          </p>
          <ul className="plat-kv">
            <li>
              <span>Password minimum</span>
              <strong>8 characters</strong>
            </li>
            <li>
              <span>Idle auto-logout</span>
              <strong>1 hour</strong>
            </li>
            <li>
              <span>Sessions on suspension</span>
              <strong>revoked immediately</strong>
            </li>
          </ul>
          <p className="muted plat-feed-note">
            Signing out revokes the session server-side - the button in the
            sidebar, not a preference here.
          </p>
        </SectionCard>

        <SectionCard title="Scope of these settings" eyebrow="What they touch">
          <p className="prose">
            Theme and motion apply to the control center on this browser only.
            Team &amp; access changes platform state: it is recorded on the
            audit trail like every other decision made here.
          </p>
          <p className="muted plat-feed-note">
            Operational configuration (commission rate, config parameters)
            lives in <strong>System</strong> and stays versioned there. The
            public site, the tenant and landlord portals and the staff console
            keep their own registers.
          </p>
        </SectionCard>
      </div>
    </div>
  );
}
