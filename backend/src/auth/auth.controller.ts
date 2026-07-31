import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { Public } from './public.decorator';
import { Roles } from './roles.decorator';
import { Caller } from './caller.decorator';
import type { AuthenticatedCaller } from './auth.service';
import {
  LoginDto,
  ProvisionStaffDto,
  RefreshDto,
  RegisterDto,
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

  /** Staff accounts are provisioned by an existing admin, never self-served. */
  @Roles('admin')
  @Post('staff')
  async provisionStaff(@Body() dto: ProvisionStaffDto) {
    return this.auth.provisionStaff(dto);
  }
}
