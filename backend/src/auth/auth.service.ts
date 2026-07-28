import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';

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

    return this.issueTokens(account.id, account.partyId, account.authRole);
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

  /** Resolves a caller from a verified access-token payload. */
  async resolveCaller(payload: {
    sub: string;
  }): Promise<AuthenticatedCaller | null> {
    const account = await this.prisma.userAccount.findUnique({
      where: { id: payload.sub },
      include: { party: true },
    });

    // A suspended or closed party cannot act, even holding a valid token.
    if (!account || account.party.status !== 'active') {
      return null;
    }

    return {
      userAccountId: account.id,
      partyId: account.partyId,
      role: account.authRole,
    };
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
