/**
 * Authentication — credentials, sessions, and the server-resolved caller.
 *
 * SANDBOX DIVERGENCE (recorded in worklog.md §D-1): the real repository
 * fronts this with Supabase Auth (commits 22a60e5, 44d1f6f) and the API
 * verifies the Supabase JWT. This working copy cannot reach a Supabase
 * project, so it runs the SAME session table design first-party: an opaque
 * random token in an httpOnly cookie, a SHA-256 hash in the `session` row,
 * server-side revocation on sign-out. Password hashing is scrypt from
 * node:crypto — no dependency, no committed secrets (F-009's rule holds:
 * nothing here ships a password).
 *
 * What is NOT diverged: identity comes from the session, never the body;
 * a missing account and a wrong password are indistinguishable (dummy-hash
 * compare); staff roles are never self-served; the role cookie drives
 * nothing but which links render.
 */
import { cookies } from 'next/headers';
import { cache } from 'react';
import { createHash, randomBytes, scrypt as _scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { db } from '@/lib/db';
import { maySignIn, type AuthRole } from './domain';

export { maySignIn };

const scrypt = promisify(_scrypt) as (
  password: string,
  salt: string,
  keylen: number,
) => Promise<Buffer>;

export const SESSION_COOKIE = 'hfr_session';
/** Mirrors the real deployment's 30-day refresh-token lifetime. */
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** A constant dummy hash so a missing account costs the same as a wrong one. */
const DUMMY_HASH =
  'scrypt$aaaaaaaaaaaaaaaa$' + '0'.repeat(64);

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const derived = await scrypt(password, salt, 32);
  return `scrypt$${salt}$${derived.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  const candidate = stored ?? DUMMY_HASH;
  const [algo, salt, hex] = candidate.split('$');
  if (algo !== 'scrypt' || !salt || !hex) return false;
  const derived = await scrypt(password, salt, 32);
  const expected = Buffer.from(hex, 'hex');
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export interface ResolvedSession {
  sessionId: string;
  partyId: string;
  displayName: string;
  phone: string;
  role: AuthRole;
  partyStatus: string;
  verificationState: string | null;
}

/**
 * Resolves the caller from the session cookie, or null. Server components
 * and route handlers both go through this — one implementation, and the
 * only one.
 */
export const resolveSession = cache(async (): Promise<ResolvedSession | null> => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const row = await db.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: {
      userAccount: {
        include: {
          party: {
            include: {
              identityVerifications: {
                orderBy: { createdAt: 'desc' },
                take: 1,
              },
            },
          },
        },
      },
    },
  });
  if (!row) return null;
  if (row.revokedAt) return null;
  if (row.expiresAt.getTime() < Date.now()) return null;

  const account = row.userAccount;
  const party = account.party;
  // An account blocked after the session was issued cannot act on it.
  if (!maySignIn(party.status, account.role as AuthRole)) return null;

  return {
    sessionId: row.id,
    partyId: party.id,
    displayName: party.displayName,
    phone: party.primaryPhone,
    role: account.role as AuthRole,
    partyStatus: party.status,
    verificationState: party.identityVerifications[0]?.state ?? null,
  };
});

/** Creates a session row and sets the cookie. Returns nothing. */
export async function issueSession(userAccountId: string): Promise<void> {
  const token = randomBytes(32).toString('hex');
  await db.session.create({
    data: {
      userAccountId,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    },
  });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_TTL_MS / 1000,
  });
}

/** Revokes the session server-side and clears the cookie. */
export async function revokeCurrentSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    await db.session.updateMany({
      where: { tokenHash: hashToken(token), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
  jar.delete(SESSION_COOKIE);
}

/* ── password change (QA round) ─────────────────────────────────────── */

export class InvalidCurrentPasswordError extends Error {
  constructor() {
    super('The current password was not accepted.');
  }
}

export class PasswordPolicyError extends Error {
  constructor(requirement: string) {
    super(requirement);
  }
}

/**
 * Change the signed-in account's password.
 *
 * ── Why the current password is required ──
 * A session cookie alone must not be able to replace credentials. On a
 * shared computer or a stolen laptop the attacker has the cookie but not
 * the secret; asking for the current password makes the change itself a
 * second factor. The comparison uses the same dummy-hash path as sign-in,
 * so timing reveals nothing about whether an account has a credential.
 *
 * ── Why every OTHER session dies ──
 * The usual reason to change a password is "someone else may have access".
 * Leaving other sessions alive would preserve exactly the access the user
 * is trying to close. The CURRENT session survives, so the person making
 * the change is not signed out mid-action — that asymmetry is deliberate.
 *
 * An audit row is written in the same transaction: a credential change is
 * exactly the kind of event the audit page exists for.
 */
export async function changePassword(
  session: ResolvedSession,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  if (newPassword.length < 8) {
    throw new PasswordPolicyError('Choose a password of at least 8 characters.');
  }
  if (newPassword === currentPassword) {
    throw new PasswordPolicyError('The new password must be different from the current one.');
  }

  const account = await db.userAccount.findUnique({
    where: { partyId: session.partyId },
    include: { credential: true },
  });
  if (!account) throw new InvalidCurrentPasswordError();

  const ok = await verifyPassword(currentPassword, account.credential?.passwordHash ?? null);
  if (!ok) throw new InvalidCurrentPasswordError();

  const nextHash = await hashPassword(newPassword);
  await db.$transaction([
    db.userCredential.update({
      where: { userAccountId: account.id },
      data: { passwordHash: nextHash },
    }),
    db.session.updateMany({
      where: { userAccountId: account.id, id: { not: session.sessionId }, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
    db.auditEvent.create({
      data: {
        actorPartyId: session.partyId,
        actorRole: session.role,
        action: 'password_changed',
        entityType: 'user_credential',
        entityId: account.id,
        detail: JSON.stringify({ otherSessionsRevoked: true }),
      },
    }),
  ]);
}

/** Where each role belongs after signing in. */
export function homeFor(role: AuthRole): string {
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
