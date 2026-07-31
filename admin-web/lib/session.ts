import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ACCESS_COOKIE, REFRESH_COOKIE, ROLE_COOKIE } from './api';

export type Role = 'tenant' | 'lister' | 'foo' | 'admin';

/**
 * ── Why httpOnly cookies and not localStorage ──
 * A token in localStorage is readable by any script the page ever runs. An
 * httpOnly cookie is not, and the token is attached to backend calls
 * server-side (see lib/api.ts), so it never enters the client bundle at
 * all. For a console that authorises field evidence, that difference is the
 * whole security posture.
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

/**
 * Gate for every page in the console.
 *
 * This is a CONVENIENCE, not the security boundary. The backend refuses a
 * non-FOO caller regardless of what this returns (NFR-1, API Spec §4.3);
 * this only spares an officer a confusing 403 page. Treating it as the
 * real check would be exactly the client-side-authorisation mistake the
 * architecture forbids.
 */
export async function requireStaff(): Promise<Role> {
  const jar = await cookies();
  if (!jar.get(ACCESS_COOKIE)) {
    redirect('/login');
  }
  const role = (jar.get(ROLE_COOKIE)?.value as Role) ?? null;
  if (role !== 'foo' && role !== 'admin') {
    redirect('/login?reason=staff-only');
  }
  return role;
}
