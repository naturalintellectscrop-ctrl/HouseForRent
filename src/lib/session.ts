/**
 * Session helpers for server components - resolve the REAL session, not a
 * cookie assertion.
 *
 * The role returned here comes from the session row in the database, not
 * from anything the browser wrote. It drives which links render; the API
 * and services re-authorise every request regardless (NFR-1).
 */
import { redirect } from 'next/navigation';
import { resolveSession, homeFor, type ResolvedSession } from '@/server/auth';
import type { AuthRole } from '@/server/domain';

export type Role = AuthRole;
export { homeFor };
export type { ResolvedSession };

export async function currentRole(): Promise<Role | null> {
  const session = await resolveSession();
  return session?.role ?? null;
}

/** True when a valid session resolves. */
export async function isSignedIn(): Promise<boolean> {
  return (await resolveSession()) !== null;
}

/** The resolved caller, or null. */
export async function currentSession(): Promise<ResolvedSession | null> {
  return resolveSession();
}

/**
 * Gate for a signed-in surface.
 *
 * ── This is a CONVENIENCE, not the security boundary ──
 * The services refuse a caller of the wrong role regardless of what this
 * returns; this only spares someone a confusing 403 page and sends them
 * somewhere useful.
 */
export async function requireRole(
  allowed: readonly Role[],
  opts: { returnTo?: string } = {},
): Promise<ResolvedSession> {
  const session = await resolveSession();
  if (!session) {
    const next = opts.returnTo ? `?next=${encodeURIComponent(opts.returnTo)}` : '';
    redirect(`/login${next}`);
  }
  if (!allowed.includes(session.role)) {
    // Sent to their own surface rather than to an error: someone who
    // followed a landlord link while signed in as a tenant has not done
    // anything wrong.
    redirect(homeFor(session.role));
  }
  return session;
}

/** Staff surfaces: field officers and admins. */
export async function requireStaff(): Promise<ResolvedSession> {
  return requireRole(['foo', 'admin']);
}
