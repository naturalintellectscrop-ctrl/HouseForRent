import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthRole } from '@prisma/client';
import { AuthenticatedRequest } from './jwt-auth.guard';
import { REQUIRED_ROLES } from '../roles.decorator';

/**
 * Enforces the authorisation matrix (API Spec §4, NFR-1).
 *
 * Registered globally alongside JwtAuthGuard. Reads the role from the
 * server-resolved caller, never from the request — the whole point is that
 * the client cannot influence this decision.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<AuthRole[] | undefined>(
      REQUIRED_ROLES,
      [context.getHandler(), context.getClass()],
    );

    if (!required || required.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const caller = request.caller;

    if (!caller || !required.includes(caller.role)) {
      throw new ForbiddenException({
        code: 'FORBIDDEN_ROLE',
        message: `role "${caller?.role ?? 'none'}" may not perform this action`,
      });
    }

    return true;
  }
}
