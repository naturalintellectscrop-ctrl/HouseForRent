import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { PartyStatus } from '@prisma/client';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';
import {
  ACCOUNT_STATUS_POLICY,
  BLOCKED_STATUSES,
  canSignIn,
} from './account-status';

/**
 * Auth hardening: account states, password reset, device sessions.
 *
 * The defect this suite exists for: `party.status` was a column NOTHING
 * READ. A suspended party signed in exactly like an active one, so ops had
 * a control that did nothing and no test would have noticed — the column
 * looked like enforcement while being decoration.
 */
describe('Auth hardening', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let auth: AuthService;

  const PASSWORD = 'correct-horse-battery';
  let seq = 0;
  function phone(tag: string) {
    seq += 1;
    return `+2569${String(Date.now()).slice(-8)}${seq}${tag}`.slice(0, 19);
  }

  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = moduleRef.get(PrismaService);
    auth = moduleRef.get(AuthService);
  });

  afterAll(async () => {
    await app.close();
  });

  /** A registered tenant, in whichever state the test needs. */
  async function tenant(status: PartyStatus = 'active') {
    const primaryPhone = phone('t');
    const created = await auth.register({
      displayName: 'Hardening Tenant',
      primaryPhone,
      password: PASSWORD,
      role: 'tenant',
    });
    await prisma.party.update({
      where: { id: created.partyId },
      data: { status },
    });
    return { ...created, primaryPhone };
  }

  // ── Account states ──────────────────────────────────────────────────

  describe('account states are ENFORCED, not merely stored', () => {
    test('an ACTIVE party signs in', async () => {
      const { primaryPhone } = await tenant('active');
      await http()
        .post('/v1/auth/login')
        .send({ primaryPhone, password: PASSWORD })
        .expect(200);
    });

    test('a PENDING_VERIFICATION party CAN sign in', async () => {
      // Verification happens inside the app; blocking sign-in until
      // verified would make verification unreachable.
      const { primaryPhone } = await tenant('pending_verification');
      await http()
        .post('/v1/auth/login')
        .send({ primaryPhone, password: PASSWORD })
        .expect(200);
    });

    for (const status of ['suspended', 'disabled', 'archived', 'closed'] as const) {
      test(`a ${status.toUpperCase()} party is refused, WITH THE CORRECT PASSWORD`, async () => {
        const { primaryPhone } = await tenant(status);
        const res = await http()
          .post('/v1/auth/login')
          .send({ primaryPhone, password: PASSWORD });

        expect(res.status).toBe(403);
        expect(res.body.error?.code).toBe('ACCOUNT_NOT_ACTIVE');
      });
    }

    test('a blocked party gets 401 (not 403) for a WRONG password', async () => {
      // Status is checked AFTER the password on purpose: checking it first
      // would let anyone probe which numbers are suspended without knowing
      // a password, which is the enumeration leak the dummy-hash
      // comparison in login() exists to close.
      const { primaryPhone } = await tenant('suspended');
      const res = await http()
        .post('/v1/auth/login')
        .send({ primaryPhone, password: 'wrong-password-entirely' });

      expect(res.status).toBe(401);
      expect(res.body.error?.code).not.toBe('ACCOUNT_NOT_ACTIVE');
    });

    test('suspending AFTER sign-in kills the live access token', async () => {
      const { primaryPhone, partyId } = await tenant('active');
      const login = await http()
        .post('/v1/auth/login')
        .send({ primaryPhone, password: PASSWORD })
        .expect(200);
      const token = login.body.accessToken as string;

      await http()
        .get('/v1/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      await prisma.party.update({
        where: { id: partyId },
        data: { status: 'suspended' },
      });

      // Role and party are re-read on EVERY request, so suspension takes
      // effect immediately rather than when the 15-minute token expires.
      await http()
        .get('/v1/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(401);
    });

    test('suspending AFTER sign-in also blocks REFRESH', async () => {
      // Otherwise a 30-day refresh window is 30 days of access granted
      // before the suspension.
      const { primaryPhone, partyId } = await tenant('active');
      const login = await http()
        .post('/v1/auth/login')
        .send({ primaryPhone, password: PASSWORD })
        .expect(200);

      await prisma.party.update({
        where: { id: partyId },
        data: { status: 'suspended' },
      });

      const res = await http()
        .post('/v1/auth/refresh')
        .send({ refreshToken: login.body.refreshToken });

      expect(res.status).toBe(403);
      expect(res.body.error?.code).toBe('ACCOUNT_NOT_ACTIVE');
    });

    test('the policy classifies EVERY status — a new one cannot be forgotten', () => {
      // The record is keyed on the full enum, so adding a status without
      // deciding whether it may sign in is a compile error. This asserts
      // the runtime shape matches.
      for (const status of Object.values(PartyStatus)) {
        expect(ACCOUNT_STATUS_POLICY[status]).toBeDefined();
        expect(typeof ACCOUNT_STATUS_POLICY[status].canSignIn).toBe('boolean');
      }
    });

    test('every blocked status carries a reason to show the user', () => {
      for (const status of BLOCKED_STATUSES) {
        expect(canSignIn(status)).toBe(false);
        expect(ACCOUNT_STATUS_POLICY[status].refusalReason).toBeTruthy();
      }
    });
  });

  // ── Last login ──────────────────────────────────────────────────────

  describe('last login', () => {
    test('is null before the first sign-in, and set after', async () => {
      const { primaryPhone, userAccountId } = await tenant('active');

      const before = await prisma.userAccount.findUniqueOrThrow({
        where: { id: userAccountId },
      });
      expect(before.lastLoginAt).toBeNull();

      await http()
        .post('/v1/auth/login')
        .send({ primaryPhone, password: PASSWORD })
        .expect(200);

      const after = await prisma.userAccount.findUniqueOrThrow({
        where: { id: userAccountId },
      });
      expect(after.lastLoginAt).toBeInstanceOf(Date);
    });

    test('a FAILED sign-in does not record a login', async () => {
      const { primaryPhone, userAccountId } = await tenant('active');
      await http()
        .post('/v1/auth/login')
        .send({ primaryPhone, password: 'wrong' })
        .expect(401);

      const account = await prisma.userAccount.findUniqueOrThrow({
        where: { id: userAccountId },
      });
      expect(account.lastLoginAt).toBeNull();
    });
  });

  // ── Password reset ──────────────────────────────────────────────────

  describe('password reset', () => {
    test('an UNKNOWN number gets the same answer as a known one', async () => {
      // Otherwise this endpoint is a free membership oracle.
      const known = await tenant('active');
      const a = await http()
        .post('/v1/auth/password-reset/request')
        .send({ primaryPhone: known.primaryPhone })
        .expect(202);
      const b = await http()
        .post('/v1/auth/password-reset/request')
        .send({ primaryPhone: phone('nobody') })
        .expect(202);

      expect(a.body.accepted).toBe(true);
      expect(b.body.accepted).toBe(true);
      expect(a.body.message).toBe(b.body.message);
    });

    test('a valid token sets a new password, and the old one stops working', async () => {
      const { primaryPhone } = await tenant('active');
      const { token } = await auth.requestPasswordReset(primaryPhone);

      await http()
        .post('/v1/auth/password-reset/confirm')
        .send({ token, newPassword: 'a-brand-new-password' })
        .expect(204);

      await http()
        .post('/v1/auth/login')
        .send({ primaryPhone, password: PASSWORD })
        .expect(401);
      await http()
        .post('/v1/auth/login')
        .send({ primaryPhone, password: 'a-brand-new-password' })
        .expect(200);
    });

    test('a token is SINGLE USE', async () => {
      const { primaryPhone } = await tenant('active');
      const { token } = await auth.requestPasswordReset(primaryPhone);

      await http()
        .post('/v1/auth/password-reset/confirm')
        .send({ token, newPassword: 'first-new-password' })
        .expect(204);
      await http()
        .post('/v1/auth/password-reset/confirm')
        .send({ token, newPassword: 'second-new-password' })
        .expect(401);
    });

    test('an EXPIRED token is refused', async () => {
      const { primaryPhone, userAccountId } = await tenant('active');
      const { token } = await auth.requestPasswordReset(primaryPhone);

      await prisma.passwordResetToken.updateMany({
        where: { userAccountId },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });

      await http()
        .post('/v1/auth/password-reset/confirm')
        .send({ token, newPassword: 'too-late-for-this' })
        .expect(401);
    });

    test('a garbage token is refused', async () => {
      await http()
        .post('/v1/auth/password-reset/confirm')
        .send({ token: 'not-a-real-token', newPassword: 'whatever-goes-here' })
        .expect(401);
    });

    test('the token is stored HASHED, never in the clear', async () => {
      const { primaryPhone, userAccountId } = await tenant('active');
      const { token } = await auth.requestPasswordReset(primaryPhone);

      const row = await prisma.passwordResetToken.findFirstOrThrow({
        where: { userAccountId },
      });
      // A database disclosure must not hand over account takeover.
      expect(row.tokenHash).not.toBe(token);
      expect(row.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    });

    test('RESETTING REVOKES EVERY SESSION', async () => {
      // A reset is usually a response to compromise. Leaving sessions alive
      // would reset the password while the attacker stays signed in — the
      // one outcome the user believed they had prevented.
      const { primaryPhone } = await tenant('active');
      const first = await http()
        .post('/v1/auth/login')
        .send({ primaryPhone, password: PASSWORD })
        .expect(200);
      const second = await http()
        .post('/v1/auth/login')
        .send({ primaryPhone, password: PASSWORD })
        .expect(200);

      const { token } = await auth.requestPasswordReset(primaryPhone);
      await http()
        .post('/v1/auth/password-reset/confirm')
        .send({ token, newPassword: 'compromise-response' })
        .expect(204);

      for (const login of [first, second]) {
        await http()
          .post('/v1/auth/refresh')
          .send({ refreshToken: login.body.refreshToken })
          .expect(401);
      }
    });

    test('a reset cannot set a password weaker than registration allows', async () => {
      const { primaryPhone } = await tenant('active');
      const { token } = await auth.requestPasswordReset(primaryPhone);

      await http()
        .post('/v1/auth/password-reset/confirm')
        .send({ token, newPassword: 'short' })
        .expect(400);
    });

    test('a BLOCKED account cannot request a reset', async () => {
      const { primaryPhone } = await tenant('suspended');
      const { token } = await auth.requestPasswordReset(primaryPhone);
      // Same outward answer as an unknown number; no token is issued.
      expect(token).toBeNull();
    });
  });

  // ── Change password ─────────────────────────────────────────────────

  describe('change password', () => {
    test('requires the CURRENT password', async () => {
      const { primaryPhone } = await tenant('active');
      const login = await http()
        .post('/v1/auth/login')
        .send({ primaryPhone, password: PASSWORD })
        .expect(200);

      await http()
        .post('/v1/auth/password')
        .set('Authorization', `Bearer ${login.body.accessToken}`)
        .send({ currentPassword: 'not-it', newPassword: 'a-new-password-x' })
        .expect(401);
    });

    test('succeeds with it, and revokes other sessions', async () => {
      const { primaryPhone } = await tenant('active');
      const a = await http()
        .post('/v1/auth/login')
        .send({ primaryPhone, password: PASSWORD })
        .expect(200);
      const b = await http()
        .post('/v1/auth/login')
        .send({ primaryPhone, password: PASSWORD })
        .expect(200);

      await http()
        .post('/v1/auth/password')
        .set('Authorization', `Bearer ${a.body.accessToken}`)
        .send({ currentPassword: PASSWORD, newPassword: 'a-new-password-x' })
        .expect(204);

      await http()
        .post('/v1/auth/refresh')
        .send({ refreshToken: b.body.refreshToken })
        .expect(401);
      await http()
        .post('/v1/auth/login')
        .send({ primaryPhone, password: 'a-new-password-x' })
        .expect(200);
    });

    test('is not reachable unauthenticated', async () => {
      await http()
        .post('/v1/auth/password')
        .send({ currentPassword: 'x', newPassword: 'yyyyyyyy' })
        .expect(401);
    });
  });

  // ── Devices ─────────────────────────────────────────────────────────

  describe('multiple devices', () => {
    test('each sign-in is its own session', async () => {
      const { primaryPhone } = await tenant('active');
      await http()
        .post('/v1/auth/login')
        .send({ primaryPhone, password: PASSWORD })
        .expect(200);
      const second = await http()
        .post('/v1/auth/login')
        .send({ primaryPhone, password: PASSWORD })
        .expect(200);

      const res = await http()
        .get('/v1/auth/sessions')
        .set('Authorization', `Bearer ${second.body.accessToken}`)
        .expect(200);

      expect(res.body.length).toBe(2);
    });

    test('the session list NEVER returns the token hash', async () => {
      const { primaryPhone } = await tenant('active');
      const login = await http()
        .post('/v1/auth/login')
        .send({ primaryPhone, password: PASSWORD })
        .expect(200);

      const res = await http()
        .get('/v1/auth/sessions')
        .set('Authorization', `Bearer ${login.body.accessToken}`)
        .expect(200);

      const body = JSON.stringify(res.body);
      expect(body).not.toContain('refreshTokenHash');
      expect(body).not.toContain('tokenHash');
    });

    test('LOGOUT EVERYWHERE revokes all of them, and reports how many', async () => {
      const { primaryPhone } = await tenant('active');
      const a = await http()
        .post('/v1/auth/login')
        .send({ primaryPhone, password: PASSWORD })
        .expect(200);
      const b = await http()
        .post('/v1/auth/login')
        .send({ primaryPhone, password: PASSWORD })
        .expect(200);
      const c = await http()
        .post('/v1/auth/login')
        .send({ primaryPhone, password: PASSWORD })
        .expect(200);

      const res = await http()
        .post('/v1/auth/logout-all')
        .set('Authorization', `Bearer ${c.body.accessToken}`)
        .expect(200);

      // The count is what tells a user something is wrong — "3 devices"
      // when they own one phone is the signal that matters.
      expect(res.body.revoked).toBe(3);

      for (const login of [a, b, c]) {
        await http()
          .post('/v1/auth/refresh')
          .send({ refreshToken: login.body.refreshToken })
          .expect(401);
      }
    });

    test('logout-all is scoped to the CALLER — it cannot sign out anyone else', async () => {
      const victim = await tenant('active');
      const attacker = await tenant('active');

      const victimLogin = await http()
        .post('/v1/auth/login')
        .send({ primaryPhone: victim.primaryPhone, password: PASSWORD })
        .expect(200);
      const attackerLogin = await http()
        .post('/v1/auth/login')
        .send({ primaryPhone: attacker.primaryPhone, password: PASSWORD })
        .expect(200);

      // No account id is accepted, so there is nothing to point elsewhere.
      await http()
        .post('/v1/auth/logout-all')
        .set('Authorization', `Bearer ${attackerLogin.body.accessToken}`)
        .send({ userAccountId: victim.userAccountId })
        .expect(400);

      // The victim's session is untouched.
      await http()
        .post('/v1/auth/refresh')
        .send({ refreshToken: victimLogin.body.refreshToken })
        .expect(200);
    });
  });
});
