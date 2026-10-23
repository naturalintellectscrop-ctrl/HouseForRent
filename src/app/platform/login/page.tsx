import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { resolveSession, homeFor } from '@/server/auth';
import { OperatorLoginForm } from './operator-login-form';

export const metadata: Metadata = {
  title: 'Platform operator sign-in',
  description: 'Entry point for the House For Rent platform control center.',
  // An operator entry point says nothing to a search engine and should say
  // it to nobody: out of every index.
  robots: { index: false, follow: false },
};

/**
 * The platform owner's entry point.
 *
 * ── What this page is NOT ──
 * It is not a second authentication system, not a secret URL that grants
 * anything, and not a bypass. It posts to the SAME /api/v1/auth/login, hits
 * the SAME user_account rows, credential store, session table and status
 * policy as the public sign-in. What makes it the owner's door is what the
 * SERVER decides afterwards: the control center behind it refuses every role
 * except `admin`, the platform-level role.
 *
 * ── Why it exists at all ──
 * Deliberateness. The owner should see, before any credential is typed, that
 * they are entering at platform level - a different register from the public
 * sign-in, with different consequences. A user who wanders in here loses
 * nothing: their credentials resolve to their own account and they are sent
 * to their own surface.
 */
export default async function PlatformLoginPage(props: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await props.searchParams;

  // Already authenticated? The session decides where this door leads - never
  // the URL. An operator goes straight in; anyone else goes to their own
  // surface (handled per the existing architecture: no duplicate identities).
  const session = await resolveSession();
  if (session) {
    redirect(session.role === 'admin' ? '/platform' : homeFor(session.role));
  }

  return (
    <div className="plat-login">
      <div className="plat-login-card stack-lg">
        <div className="stack-sm">
          <div className="plat-login-mark">
            <img src="/logo.png" alt="" width={44} height={44} />
          </div>
          <p className="plat-eyebrow">Natural Intellects Ltd</p>
          <h1 className="plat-login-title">Platform Control Center</h1>
          <p className="plat-login-sub">
            Operator sign-in. This surface operates the entire platform -
            users, listings, money movement and audit - not any single account
            inside it.
          </p>
        </div>

        <OperatorLoginForm next={next ?? null} />

        <p className="plat-login-note">
          Authorization is decided server-side from the account&rsquo;s
          platform role. Accounts without platform credentials are redirected
          to their own area. All sign-ins and failed attempts against this
          surface are written to the audit trail.
        </p>
      </div>
    </div>
  );
}
