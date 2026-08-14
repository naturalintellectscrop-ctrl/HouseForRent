import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { Public } from './public.decorator';
import { Roles } from './roles.decorator';
import { Caller } from './caller.decorator';
import type { AuthenticatedCaller } from './auth.service';
import {
  ChangePasswordDto,
  EmptyBodyDto,
  LoginDto,
  ProvisionStaffDto,
  RefreshDto,
  RegisterDto,
  RequestPasswordResetDto,
  ResetPasswordDto,
} from './dto/auth.dto';

@Controller('v1/auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('register')
  async register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  async refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(@Body() dto: RefreshDto) {
    await this.auth.logout(dto.refreshToken);
  }

  /**
   * Who the caller is, resolved server-side from the session.
   *
   * The access token carries only `sub`; role and party are re-read from the
   * database on every request so a role change or suspension takes effect
   * immediately. That is the right design, but it leaves a client with no
   * way to know its own role — which it needs, not to authorise anything,
   * but to render the correct surface. This closes that gap.
   *
   * Deliberately NOT role-gated: it discloses only what the caller already
   * proved by authenticating, and confers no privilege. It cannot be used to
   * learn about anyone else.
   */
  @Get('me')
  async me(@Caller() caller: AuthenticatedCaller) {
    return {
      partyId: caller.partyId,
      role: caller.role,
      userAccountId: caller.userAccountId,
    };
  }

  /* ── Password reset ───────────────────────────────────────────────── */

  /**
   * Requests a reset token. Public, and ALWAYS reports success.
   *
   * An unknown phone number gets the same response as a known one —
   * reporting "no such account" would turn this into a free membership
   * oracle, the same enumeration leak the login timing defence closes.
   *
   * V1 returns the token in the response because no SMS provider is
   * contracted yet (SSOT §8). That is a deliberate, temporary shape, not a
   * design: `deliveryPending` names it so, and it must be removed the day a
   * provider exists — a reset token in an HTTP response is a reset token
   * anyone who can see the response can use.
   */
  @Public()
  @Post('password-reset/request')
  @HttpCode(202)
  async requestPasswordReset(@Body() dto: RequestPasswordResetDto) {
    const { token } = await this.auth.requestPasswordReset(dto.primaryPhone);
    return {
      accepted: true,
      message:
        'If that number has an account, a reset code has been issued for it.',
      deliveryPending: true,
      devToken: process.env.NODE_ENV === 'production' ? undefined : token,
    };
  }

  /** Consumes a reset token. Revokes every session on success. */
  @Public()
  @Post('password-reset/confirm')
  @HttpCode(204)
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.auth.resetPassword({
      token: dto.token,
      newPassword: dto.newPassword,
    });
  }

  /** Changing a known password. Requires the current one. */
  @Post('password')
  @HttpCode(204)
  async changePassword(
    @Caller() caller: AuthenticatedCaller,
    @Body() dto: ChangePasswordDto,
  ) {
    await this.auth.changePassword({
      userAccountId: caller.userAccountId,
      currentPassword: dto.currentPassword,
      newPassword: dto.newPassword,
    });
  }

  /* ── Devices ──────────────────────────────────────────────────────── */

  /** The caller's own live sessions — one per signed-in device. */
  @Get('sessions')
  async sessions(@Caller() caller: AuthenticatedCaller) {
    return this.auth.activeSessions(caller.userAccountId);
  }

  /**
   * Signs out everywhere. Scoped to the CALLER's own account from the
   * session — an endpoint taking an account id would let any authenticated
   * user sign out anyone else.
   */
  @Post('logout-all')
  @HttpCode(200)
  async logoutEverywhere(
    @Caller() caller: AuthenticatedCaller,
    // Declared, and required to be empty: a body naming another account
    // must be REFUSED rather than silently ignored, or a caller could
    // reasonably believe they had signed that person out.
    @Body() _body: EmptyBodyDto,
  ) {
    return this.auth.logoutEverywhere(caller.userAccountId);
  }

  /** Staff accounts are provisioned by an existing admin, never self-served. */
  @Roles('admin')
  @Post('staff')
  async provisionStaff(@Body() dto: ProvisionStaffDto) {
    return this.auth.provisionStaff(dto);
  }
}
