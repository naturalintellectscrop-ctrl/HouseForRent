'use server';

import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { API_BASE, ApiError, apiPublic, REFRESH_COOKIE } from '@/lib/api';
import { clearSession, setSession, type Role } from '@/lib/session';

/**
 * `ActionState` is a TYPE, so it is erased and re-exporting it from a
 * `'use server'` file is safe. A runtime value would not be — see
 * `./state.ts`.
 */
export type { ActionState as FormState } from './state';
import type { ActionState } from './state';

/**
 * Server Actions are reachable by direct POST, not only through this UI, so
 * every one of them must stand on its own. The real defence is that the
 * BACKEND authorises every call (NFR-1) — these actions hold no privilege
 * of their own and simply forward the caller's session.
 */
export async function loginAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const primaryPhone = String(formData.get('primaryPhone') ?? '').trim();
  const password = String(formData.get('password') ?? '');

  if (!primaryPhone || !password) {
    return { error: 'Enter your phone number and password.' };
  }

  let role: Role;
  try {
    const tokens = await apiPublic<{
      accessToken: string;
      refreshToken: string;
    }>('/v1/auth/login', { primaryPhone, password });

    // The access token carries only `sub` — the backend re-reads role and
    // party from the database on every request, so a role change or
    // suspension takes effect immediately rather than lingering until the
    // token expires. We therefore ASK the server who we are rather than
    // decoding a claim that deliberately is not there.
    const me = await meWithToken(tokens.accessToken);
    role = me.role;
    await setSession({ ...tokens, role });
  } catch (err) {
    if (err instanceof ApiError) {
      // The backend compares against a dummy hash for a missing account, so
      // a wrong number and a wrong password are indistinguishable. Saying
      // more here would undo that.
      return {
        error:
          err.status === 401
            ? 'Those credentials were not accepted.'
            : err.message,
        code: err.code,
      };
    }
    return {
      error:
        'Could not reach the House For Rent API. Check the connection and try again.',
    };
  }

  // Staff-only surface. A tenant or lister with valid credentials is not
  // wrong about their password — they are simply in the wrong place.
  if (role !== 'foo' && role !== 'admin') {
    await clearSession();
    return {
      error:
        'This console is for field officers and admins. Your account is not one.',
    };
  }

  redirect('/');
}

export async function logoutAction() {
  const jar = await cookies();
  const refreshToken = jar.get(REFRESH_COOKIE)?.value;

  if (refreshToken) {
    // Revoke server-side too, so the refresh token cannot be replayed even
    // if it was captured. Clearing the cookie alone would only forget it.
    try {
      await apiPublic('/v1/auth/logout', { refreshToken });
    } catch {
      // A failed revoke must not strand the officer in a signed-in shell.
    }
  }

  await clearSession();
  redirect('/login');
}

/**
 * Asks the backend who the freshly-issued token belongs to.
 *
 * Used only at login, before the session cookie exists — every later call
 * goes through `api()`, which reads the cookie. The role it returns drives
 * which links render and nothing else; the backend re-authorises every
 * request regardless of what this console believes (NFR-1).
 */
async function meWithToken(
  accessToken: string,
): Promise<{ partyId: string; role: Role }> {
  const res = await fetch(`${API_BASE}/v1/auth/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new ApiError(res.status, 'ME_FAILED', 'could not resolve the caller');
  }
  return (await res.json()) as { partyId: string; role: Role };
}
