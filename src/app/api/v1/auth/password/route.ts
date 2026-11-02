import { NextRequest, NextResponse } from 'next/server';
import { changePassword, InvalidCurrentPasswordError, PasswordPolicyError } from '@/server/auth';
import { passwordChangeRateLimit } from '@/server/rate-limit';
import { ApiError, readJson, requireSession, requireString, route } from '@/server/http';

/**
 * POST /api/v1/auth/password - change the signed-in account's password.
 *
 * The service owns every rule: the current password is re-verified (so a
 * stolen cookie cannot replace credentials), the new one meets the same
 * 8-character policy registration enforces, all OTHER sessions are revoked
 * in the same transaction, and the change is written to the audit trail.
 *
 * `INVALID_CURRENT_PASSWORD` is a 403, not a 401: the SESSION is fine, the
 * person typing may not be who the cookie says. A 401 here would log a
 * legitimate user out of the page they are looking at for no better reason
 * than a typo - and a locked-out user cannot retry.
 *
 * P-11: rate limited per ACCOUNT (the session holder's party id) and per IP.
 * Every attempt here re-verifies the current password, so repeated failures
 * are exactly credential guessing under a (possibly stolen) session - the
 * account-level window binds regardless of which address the attempts come
 * from. A successful change counts too; ten per hour is far past any
 * legitimate use.
 */
export const POST = route(async (req: NextRequest) => {
  const session = await requireSession();
  const body = await readJson(req);
  const currentPassword = requireString(body, 'currentPassword');
  const newPassword = requireString(body, 'newPassword');

  // Rate limit before any credential work - the current-password check is
  // bcrypt-slow, and the throttle must answer before that cost is paid.
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown';
  const verdict = await passwordChangeRateLimit({ ip, partyId: session.partyId });
  if (!verdict.ok) {
    throw new ApiError(
      429,
      'TOO_MANY_ATTEMPTS',
      `Too many password attempts. Try again in about ${Math.max(1, Math.ceil(verdict.retryAfterSeconds / 60))} minute(s).`,
    );
  }

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
