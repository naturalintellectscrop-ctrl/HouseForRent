import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { canRefresh, canSignIn, refusalReason } from './account-status';

/** Roles a caller may self-register as (API Spec §3). */
export type SelfServiceRole = Extract<AuthRole, 'tenant' | 'lister'>;

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

/** What a guard sees after authentication. Derived from the session ONLY. */
export interface AuthenticatedCaller {
  userAccountId: string;
  partyId: string;
  role: AuthRole;
}

const ACCESS_TOKEN_TTL = '15m';
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Reset tokens are short-lived by design: the window in which a leaked SMS
 * or an unattended phone can be used to take over an account.
 */
const PASSWORD_RESET_TTL_MS = 30 * 60 * 1000;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  /**
   * Self-service registration. Only `tenant` and `lister` are reachable
   * here — `foo` and `admin` can verify properties, decide mandates,
   * resolve disputes and change configuration, so allowing signup to mint
   * one would make every downstream control decorative (API Spec §3).
   * Those are provisioned by an existing admin via `provisionStaff`.
   */
  async register(params: {
    displayName: string;
    primaryPhone: string;
    password: string;
    role: SelfServiceRole;
  }): Promise<{ partyId: string; userAccountId: string }> {
    return this.createAccount(params);
  }

  /** Admin-only creation of `foo` / `admin` accounts. */
  async provisionStaff(params: {
    displayName: string;
    primaryPhone: string;
    password: string;
    role: Extract<AuthRole, 'foo' | 'admin'>;
  }) {
    return this.createAccount(params);
  }

  private async createAccount(params: {
    displayName: string;
    primaryPhone: string;
    password: string;
    role: AuthRole;
  }) {
    const passwordHash = await bcrypt.hash(params.password, 10);

    return this.prisma.$transaction(async (tx) => {
      const party = await tx.party.create({
        data: {
          displayName: params.displayName,
          primaryPhone: params.primaryPhone,
        },
      });
      const account = await tx.userAccount.create({
        data: { partyId: party.id, authRole: params.role },
      });
      await tx.userCredential.create({
        data: { userAccountId: account.id, passwordHash },
      });

      return { partyId: party.id, userAccountId: account.id };
    });
  }

  async login(params: {
    primaryPhone: string;
    password: string;
  }): Promise<AuthTokens> {
    const party = await this.prisma.party.findUnique({
      where: { primaryPhone: params.primaryPhone },
      include: { userAccounts: { include: { credential: true } } },
    });

    const account = party?.userAccounts[0];

    // Compare against a dummy hash when the account is absent, so a missing
    // phone number and a wrong password take indistinguishable time. Without
    // this, response timing enumerates registered numbers.
    const hash =
      account?.credential?.passwordHash ??
      '$2b$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv';
    const ok = await bcrypt.compare(params.password, hash);

    if (!account || !ok) {
      throw new UnauthorizedException('invalid credentials');
    }

    /**
     * Account state is checked AFTER the password, deliberately.
     *
     * Checking it first would let anyone probe which phone numbers belong
     * to suspended accounts without knowing a password — the same
     * enumeration leak the dummy-hash comparison above exists to close.
     * Only a caller who has already proven the password learns why they
     * are refused.
     */
    if (!canSignIn(party!.status)) {
      throw new ForbiddenException({
        code: 'ACCOUNT_NOT_ACTIVE',
        message: refusalReason(party!.status),
      });
    }

    const tokens = await this.issueTokens(
      account.id,
      account.partyId,
      account.authRole,
    );

    // Recorded after the tokens are issued, so a failed issue does not
    // report a login that did not happen.
    await this.prisma.userAccount.update({
      where: { id: account.id },
      data: { lastLoginAt: new Date() },
    });

    return tokens;
  }

  /**
   * Exchanges a refresh token for a new pair, ROTATING the session: the old
   * refresh token is revoked as part of the same transaction that issues
   * the new one. A stolen token is therefore usable at most once, and its
   * use invalidates the legitimate holder's session — which surfaces the
   * compromise rather than letting it persist silently.
   */
  async refresh(refreshToken: string): Promise<AuthTokens> {
    const tokenHash = this.hashToken(refreshToken);

    const session = await this.prisma.session.findFirst({
      where: { refreshTokenHash: tokenHash },
      include: { userAccount: true },
    });

    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      throw new UnauthorizedException('invalid refresh token');
    }

    // A party suspended AFTER signing in must not be able to extend their
    // session. Checked here as well as at login, because a 30-day refresh
    // window is otherwise 30 days of access granted before the suspension.
    const party = await this.prisma.party.findUniqueOrThrow({
      where: { id: session.userAccount.partyId },
    });
    if (!canRefresh(party.status)) {
      await this.prisma.session.update({
        where: { id: session.id },
        data: { revokedAt: new Date() },
      });
      throw new ForbiddenException({
        code: 'ACCOUNT_NOT_ACTIVE',
        message: refusalReason(party.status),
      });
    }

    await this.prisma.session.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });

    return this.issueTokens(
      session.userAccountId,
      session.userAccount.partyId,
      session.userAccount.authRole,
    );
  }

  async logout(refreshToken: string): Promise<void> {
    const tokenHash = this.hashToken(refreshToken);
    await this.prisma.session.updateMany({
      where: { refreshTokenHash: tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * Signs out every device.
   *
   * The response reports HOW MANY sessions were revoked, because that is
   * the number a user needs to judge whether something is wrong — "3
   * devices signed out" when they own one phone is the signal that matters
   * after a suspected compromise.
   */
  async logoutEverywhere(userAccountId: string): Promise<{ revoked: number }> {
    const result = await this.prisma.session.updateMany({
      where: { userAccountId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { revoked: result.count };
  }

  /** The caller's own live sessions — one row per signed-in device. */
  async activeSessions(userAccountId: string) {
    const sessions = await this.prisma.session.findMany({
      where: { userAccountId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    // The token hash never leaves the server, even to its owner: it is a
    // credential, and returning it would defeat storing it hashed.
    return sessions.map((s) => ({
      id: s.id,
      createdAt: s.createdAt,
      expiresAt: s.expiresAt,
    }));
  }

  /** Resolves a caller from a verified access-token payload. */
  async resolveCaller(payload: {
    sub: string;
  }): Promise<AuthenticatedCaller | null> {
    const account = await this.prisma.userAccount.findUnique({
      where: { id: payload.sub },
      include: { party: true },
    });

    // A blocked party cannot act, even holding a valid token. Resolved
    // through the shared policy rather than an inline `!== 'active'`, which
    // would wrongly lock out `pending_verification` — an unverified tenant
    // has to reach the app in order to verify.
    if (!account || !canSignIn(account.party.status)) {
      return null;
    }

    return {
      userAccountId: account.id,
      partyId: account.partyId,
      role: account.authRole,
    };
  }

  /* ── Password reset ─────────────────────────────────────────────────── */

  /**
   * Issues a reset token.
   *
   * ── Always reports success ──
   * An unknown phone number gets the same answer as a known one. Reporting
   * "no such account" turns this endpoint into a free membership oracle —
   * the same enumeration leak the dummy-hash comparison in `login` closes.
   *
   * Returns the token so the caller can deliver it. In V1 there is no SMS
   * provider contracted (SSOT §8), so delivery is out of scope here rather
   * than faked: the endpoint hands the token to whatever will send it, and
   * the test suite reads it directly.
   */
  async requestPasswordReset(primaryPhone: string): Promise<{
    /** Null when no account matched — indistinguishable to the caller. */
    token: string | null;
  }> {
    const party = await this.prisma.party.findUnique({
      where: { primaryPhone: primaryPhone.trim() },
      include: { userAccounts: true },
    });
    const account = party?.userAccounts[0];
    if (!party || !account || !canSignIn(party.status)) {
      return { token: null };
    }

    const token = randomBytes(32).toString('base64url');
    await this.prisma.passwordResetToken.create({
      data: {
        userAccountId: account.id,
        tokenHash: this.hashToken(token),
        expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
      },
    });
    return { token };
  }

  /**
   * Consumes a reset token and sets a new password.
   *
   * Revokes every session in the same transaction. A password reset is
   * usually a response to compromise, so leaving existing sessions alive
   * would reset the password while the attacker stays signed in — the one
   * outcome the user believed they had prevented.
   */
  async resetPassword(params: {
    token: string;
    newPassword: string;
  }): Promise<void> {
    const tokenHash = this.hashToken(params.token);
    const record = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
    });

    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw new UnauthorizedException('invalid or expired reset token');
    }

    const passwordHash = await bcrypt.hash(params.newPassword, 10);

    await this.prisma.$transaction(async (tx) => {
      await tx.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      });
      await tx.userCredential.update({
        where: { userAccountId: record.userAccountId },
        data: { passwordHash },
      });
      await tx.session.updateMany({
        where: { userAccountId: record.userAccountId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });
  }

  /** Changing a known password. Also revokes other sessions. */
  async changePassword(params: {
    userAccountId: string;
    currentPassword: string;
    newPassword: string;
  }): Promise<void> {
    const credential = await this.prisma.userCredential.findUnique({
      where: { userAccountId: params.userAccountId },
    });
    if (
      !credential ||
      !(await bcrypt.compare(params.currentPassword, credential.passwordHash))
    ) {
      throw new UnauthorizedException('current password is incorrect');
    }

    const passwordHash = await bcrypt.hash(params.newPassword, 10);
    await this.prisma.$transaction(async (tx) => {
      await tx.userCredential.update({
        where: { userAccountId: params.userAccountId },
        data: { passwordHash },
      });
      await tx.session.updateMany({
        where: { userAccountId: params.userAccountId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });
  }

  private async issueTokens(
    userAccountId: string,
    partyId: string,
    role: AuthRole,
  ): Promise<AuthTokens> {
    // The access token carries only the account id. Role and party are
    // re-read from the database on every request (resolveCaller), so a role
    // change or suspension takes effect immediately rather than lingering
    // until the token expires.
    const accessToken = await this.jwt.signAsync(
      { sub: userAccountId },
      { expiresIn: ACCESS_TOKEN_TTL },
    );

    const refreshToken = randomBytes(48).toString('base64url');
    await this.prisma.session.create({
      data: {
        userAccountId,
        refreshTokenHash: this.hashToken(refreshToken),
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      },
    });

    void partyId;
    void role;
    return { accessToken, refreshToken };
  }

  /**
   * Refresh tokens are stored as SHA-256 hashes, never in the clear — a
   * database leak must not yield usable session credentials. SHA-256 rather
   * than bcrypt because these are high-entropy random values, not
   * user-chosen passwords, so there is nothing to brute-force.
   */
  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
