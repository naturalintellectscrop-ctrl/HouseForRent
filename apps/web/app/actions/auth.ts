'use server';

import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { API_BASE, ApiError, apiPublic, REFRESH_COOKIE } from '@/lib/api';
import { clearSession, homeFor, setSession, type Role } from '@/lib/session';
import { createClient as createSupabaseClient } from '@/lib/supabase/server';

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
  const next = String(formData.get('next') ?? '').trim();

  if (!primaryPhone || !password) {
    return { error: 'Enter your phone number and password.' };
  }

  let role: Role;
  try {
    const supabase = await createSupabaseClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      phone: primaryPhone,
      password,
    });
    if (error || !data.session) {
      throw new ApiError(401, 'INVALID_CREDENTIALS', 'invalid credentials');
    }
    const me = await meWithToken(data.session.access_token);
    role = me.role;
    await setSession({
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      role,
    });
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
        'Could not reach the House For Rent service. Check your connection and try again.',
    };
  }

  /**
   * ── Why `next` is validated rather than trusted ──
   * It arrives from a query string, which anyone can write. An unchecked
   * redirect target is an open redirect: a link that looks like it goes to
   * this site, signs the person in, and lands them on somebody else's page
   * wearing our chrome. Only same-site paths are honoured.
   */
  const safeNext =
    next.startsWith('/') && !next.startsWith('//') ? next : null;

  redirect(safeNext ?? homeFor(role));
}

/**
 * Self-service registration. Only `tenant` and `lister` exist here — staff
 * are provisioned through `POST /v1/auth/staff` by an admin, and the
 * backend's own DTO refuses any other value regardless of what this sends.
 */
export async function registerAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const displayName = String(formData.get('displayName') ?? '').trim();
  const primaryPhone = String(formData.get('primaryPhone') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const roleRaw = String(formData.get('role') ?? '');
  const next = String(formData.get('next') ?? '').trim();

  if (displayName.length < 2) {
    return { error: 'Enter the name you would like us to use.' };
  }
  if (primaryPhone.length < 9) {
    return { error: 'Enter your phone number, including the country code.' };
  }
  if (password.length < 8) {
    return { error: 'Choose a password of at least 8 characters.' };
  }
  if (roleRaw !== 'tenant' && roleRaw !== 'lister') {
    return { error: 'Choose whether you are looking for a home or letting one.' };
  }
  const role: Role = roleRaw;

  try {
    await apiPublic('/v1/auth/register', {
      displayName,
      primaryPhone,
      password,
      role,
    });

    const tokens = await apiPublic<{
      accessToken: string;
      refreshToken: string;
    }>('/v1/auth/login', { primaryPhone, password });
    const me = await meWithToken(tokens.accessToken);
    await setSession({ ...tokens, role: me.role });
  } catch (err) {
    if (err instanceof ApiError) {
      return {
        error:
          err.status === 409
            ? 'An account already exists for that number. Sign in instead.'
            : err.message,
        code: err.code,
      };
    }
    return {
      error:
        'Could not reach the House For Rent service. Check your connection and try again.',
    };
  }

  const safeNext =
    next.startsWith('/') && !next.startsWith('//') ? next : null;
  redirect(safeNext ?? homeFor(role));
}

export async function logoutAction() {
  const supabase = await createSupabaseClient();
  await supabase.auth.signOut();
  const jar = await cookies();
  const refreshToken = jar.get(REFRESH_COOKIE)?.value;

  if (refreshToken) {
    // Revoke server-side too, so the refresh token cannot be replayed even
    // if it was captured. Clearing the cookie alone would only forget it.
    try {
      await apiPublic('/v1/auth/logout', { refreshToken });
    } catch {
      // A failed revoke must not strand the person in a signed-in shell.
    }
  }

  await clearSession();
  redirect('/');
}

/**
 * Asks the backend who the freshly-issued token belongs to.
 *
 * Used only at sign-in, before the session cookie exists — every later call
 * goes through `api()`, which reads the cookie. The role it returns drives
 * which links render and nothing else; the backend re-authorises every
 * request regardless of what this app believes (NFR-1).
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
