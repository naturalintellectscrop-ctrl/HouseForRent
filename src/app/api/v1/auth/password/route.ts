import { NextRequest, NextResponse } from 'next/server';
import { changePassword, InvalidCurrentPasswordError, PasswordPolicyError } from '@/server/auth';
import { ApiError, readJson, requireSession, requireString, route } from '@/server/http';

/**
 * POST /api/v1/auth/password — change the signed-in account's password.
 *
 * The service owns every rule: the current password is re-verified (so a
 * stolen cookie cannot replace credentials), the new one meets the same
 * 8-character policy registration enforces, all OTHER sessions are revoked
 * in the same transaction, and the change is written to the audit trail.
 *
 * `INVALID_CURRENT_PASSWORD` is a 403, not a 401: the SESSION is fine, the
 * person typing may not be who the cookie says. A 401 here would log a
 * legitimate user out of the page they are looking at for no better reason
 * than a typo — and a locked-out user cannot retry.
 */
export const POST = route(async (req: NextRequest) => {
  const session = await requireSession();
  const body = await readJson(req);
  const currentPassword = requireString(body, 'currentPassword');
  const newPassword = requireString(body, 'newPassword');

  try {
    await changePassword(session, currentPassword, newPassword);
  } catch (err) {
    if (err instanceof InvalidCurrentPasswordError) {
      throw new ApiError(403, 'INVALID_CURRENT_PASSWORD', err.message);
    }
    if (err instanceof PasswordPolicyError) {
      throw new ApiError(422, 'PASSWORD_POLICY', err.message);
    }
    throw err;
  }

  return NextResponse.json({ ok: true, otherSessionsRevoked: true });
});

export const dynamic = 'force-dynamic';
