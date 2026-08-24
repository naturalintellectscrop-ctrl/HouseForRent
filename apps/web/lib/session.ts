import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ACCESS_COOKIE, REFRESH_COOKIE, ROLE_COOKIE } from './api';

export type Role = 'tenant' | 'lister' | 'foo' | 'admin';

/**
 * ── Why httpOnly cookies and not localStorage ──
 * A token in localStorage is readable by any script the page ever runs. An
 * httpOnly cookie is not, and the token is attached to backend calls
 * server-side (see lib/api.ts), so it never enters the client bundle at
 * all. For a product that authorises field evidence and moves escrow, that
 * difference is the whole security posture.
 */
export async function setSession(params: {
  accessToken: string;
  refreshToken: string;
  role: Role;
}) {
  const jar = await cookies();
  const secure = process.env.NODE_ENV === 'production';

  jar.set(ACCESS_COOKIE, params.accessToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    // Matches the backend's 15-minute access-token TTL.
    maxAge: 15 * 60,
  });
  jar.set(REFRESH_COOKIE, params.refreshToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: 30 * 24 * 60 * 60,
  });
  // Role is NOT httpOnly: it drives nothing but which links render. The
  // server re-checks the real role on every request, so tampering with this
  // cookie changes the menu and nothing else.
  jar.set(ROLE_COOKIE, params.role, {
    httpOnly: false,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: 30 * 24 * 60 * 60,
  });
}

export async function clearSession() {
  const jar = await cookies();
  for (const name of [ACCESS_COOKIE, REFRESH_COOKIE, ROLE_COOKIE]) {
    jar.delete(name);
  }
}

export async function currentRole(): Promise<Role | null> {
  return ((await cookies()).get(ROLE_COOKIE)?.value as Role) ?? null;
}

/** True when a session cookie is present. Says nothing about validity. */
export async function isSignedIn(): Promise<boolean> {
  return Boolean((await cookies()).get(ACCESS_COOKIE));
}

/** Where each role belongs after signing in. */
export function homeFor(role: Role): string {
  switch (role) {
    case 'lister':
      return '/landlord';
    case 'foo':
      return '/ops/today';
    case 'admin':
      return '/ops';
    default:
      return '/account';
  }
}

/**
 * Gate for a signed-in surface.
 *
 * ── This is a CONVENIENCE, not the security boundary ──
 * The backend refuses a caller of the wrong role regardless of what this
 * returns (NFR-1, API Spec §4.3); this only spares someone a confusing 403
 * page and sends them somewhere useful. Treating it as the real check would
 * be exactly the client-side-authorisation mistake the architecture forbids
 * — the role it reads comes from a cookie the browser can rewrite.
 */
export async function requireRole(
  allowed: readonly Role[],
  opts: { returnTo?: string } = {},
): Promise<Role> {
  const jar = await cookies();
  if (!jar.get(ACCESS_COOKIE)) {
    const next = opts.returnTo
      ? `?next=${encodeURIComponent(opts.returnTo)}`
      : '';
    redirect(`/login${next}`);
  }
  const role = (jar.get(ROLE_COOKIE)?.value as Role) ?? null;
  if (!role || !allowed.includes(role)) {
    // Sent to their own surface rather than to an error: someone who
    // followed a landlord link while signed in as a tenant has not done
    // anything wrong.
    redirect(role ? homeFor(role) : '/login');
  }
  return role;
}

/** Staff surfaces: field officers and admins. */
export async function requireStaff(): Promise<Role> {
  return requireRole(['foo', 'admin']);
}
