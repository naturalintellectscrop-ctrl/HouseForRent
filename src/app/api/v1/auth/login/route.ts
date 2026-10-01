import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { issueSession, resolveSession, homeFor, verifyPassword, maySignIn } from '@/server/auth';
import { rateLimit } from '@/server/rate-limit';
import { ApiError, readJson, requireString, route } from '@/server/http';

/**
 * POST /api/v1/auth/login.
 *
 * ── One identity system, two identifiers ──
 * Accounts are keyed by `party.primary_phone` (unique). Task 39 added an
 * OPTIONAL `party.email` identifier additively, so a provisioned operator can
 * sign in with the company email while every self-service account keeps
 * signing in with a phone. An identifier containing '@' resolves as an email;
 * anything else resolves as a phone. Whichever path resolves, the SAME
 * account, credential store, session table and status policy apply - the
 * entry point grants nothing by itself.
 *
 * ── What a wrong number and a wrong password have in common ──
 * Both are indistinguishable (dummy-hash compare) - saying more would undo
 * that. Account status policy is enforced here: suspended/disabled/archived
 * accounts cannot sign in.
 *
 * ── Controls added in Task 39 ──
 * - Rate limiting: sliding windows per (IP + identifier) and per IP. Honest
 *   scope note: in-memory, so per-instance on a multi-instance deployment.
 * - Audit: successful sign-ins of every role are recorded ('signed_in'), and
 *   a wrong password against an EXISTING admin account is recorded
 *   ('signin_failed') - a targeted-attempt signal on the highest-value
 *   accounts. An attempt against a non-existent account has no actor row to
 *   attach an AuditEvent to, so it cannot be recorded here; that residual
 *   gap is visible only as timing, by design.
 */
export const POST = route(async (req: NextRequest) => {
  const body = await readJson(req);
  // `primaryPhone` is the legacy field name the public form still sends;
  // `identifier` is the operator-form name. Either carries phone or email.
  const identifier = requireString(
    body,
    typeof body.identifier === 'string' && body.identifier ? 'identifier' : 'primaryPhone',
  ).trim();
  const password = requireString(body, 'password');

  // Rate limit BEFORE any database work. The identifier is normalised to a
  // bounded key (email lowercased; phone digits only) so the limiter's Map
  // cannot be poisoned with unbounded keys.
  const isEmail = identifier.includes('@');
  const normalised = isEmail ? identifier.toLowerCase() : identifier.replace(/\D/g, '');
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown';
  const verdict = rateLimit({ ip, identifier: `${isEmail ? 'e' : 'p'}:${normalised}` });
  if (!verdict.ok) {
    throw new ApiError(
      429,
      'TOO_MANY_ATTEMPTS',
      `Too many sign-in attempts. Try again in about ${Math.max(1, Math.ceil(verdict.retryAfterSeconds / 60))} minute(s).`,
    );
  }

  const account = await findAccountByIdentifier(identifier, isEmail);

  const ok = await verifyPassword(password, account?.credential?.passwordHash ?? null);
  if (!account || !ok) {
    // A wrong password against a real ADMIN account is a targeted-attempt
    // signal worth one audit row. Actor = the impersonated account's party;
    // the payload carries no credential material and no identifier.
    if (account && account.authRole === 'admin') {
      await db.auditEvent
        .create({
          data: {
            actorPartyId: account.partyId,
            eventType: 'signin_failed',
            subjectRef: account.id,
            payload: { stage: 'password' },
            occurredAt: new Date(),
          },
        })
        .catch(() => undefined); // auditing must not mask the 401
    }
    throw new ApiError(401, 'INVALID_CREDENTIALS', 'Those credentials were not accepted.');
  }
  if (!maySignIn(account.party.status, account.authRole)) {
    throw new ApiError(403, 'ACCOUNT_BLOCKED', 'This account cannot sign in. Contact House For Rent support.');
  }

  await issueSession(account.id);
  const session = await resolveSession();
  await db.auditEvent
    .create({
      data: {
        actorPartyId: account.partyId,
        eventType: 'signed_in',
        subjectRef: account.id,
        payload: { role: account.authRole, via: isEmail ? 'email' : 'phone' },
        occurredAt: new Date(),
      },
    })
    .catch(() => undefined);

  return NextResponse.json({
    partyId: account.partyId,
    role: account.authRole,
    home: homeFor(session!.role),
  });
});

/**
 * Resolve the account for a phone OR email identifier.
 *
 * The email path is additive against a database that may briefly predate the
 * column (deploy ordering), so a lookup failure there falls back to the phone
 * path rather than 500-ing sign-in for everyone. Both paths are findFirst -
 * the production schema carries no unique constraint on user_account.party_id
 * (1:1 is semantic), and session/audit code already follows this shape.
 */
async function findAccountByIdentifier(identifier: string, isEmail: boolean) {
  const byPhone = () =>
    db.userAccount.findFirst({
      where: { party: { primaryPhone: identifier } },
      include: { party: true, credential: true },
    });

  if (!isEmail) return byPhone();

  try {
    const byEmail = await db.userAccount.findFirst({
      where: { party: { email: identifier.toLowerCase() } },
      include: { party: true, credential: true },
    });
    return byEmail ?? (await byPhone());
  } catch {
    // Column not present yet (or DB degraded): the phone path still works.
    return byPhone();
  }
}
