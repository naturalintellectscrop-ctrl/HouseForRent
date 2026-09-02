import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { verifySupabaseToken } from '../supabase-admin';
import { Request } from 'express';
import { AuthService, AuthenticatedCaller } from '../auth.service';
import { IS_PUBLIC } from '../public.decorator';

export interface AuthenticatedRequest extends Request {
  caller?: AuthenticatedCaller;
}

/**
 * Authenticates every request and attaches the caller.
 *
 * Registered GLOBALLY, so an endpoint is protected by default and must
 * opt out explicitly via `@Public()`. The opposite arrangement — guard
 * per controller — fails open: a new controller written without the
 * decorator is silently unauthenticated, and nothing in the test suite
 * would notice.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly auth: AuthService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.headers.authorization;

    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('missing bearer token');
    }

    const user = await verifySupabaseToken(header.slice(7));
    if (!user) throw new UnauthorizedException('invalid or expired token');

    // Role and party are re-read from the application database.
    const caller = await this.auth.resolveCaller({ sub: user.id });
    if (!caller) {
      throw new UnauthorizedException('account not active');
    }

    request.caller = caller;
    return true;
  }
}
