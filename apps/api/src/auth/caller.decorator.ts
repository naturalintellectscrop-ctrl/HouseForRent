import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthenticatedCaller } from './auth.service';
import { AuthenticatedRequest } from './guards/jwt-auth.guard';

/**
 * Injects the authenticated caller, resolved server-side from the session.
 *
 * This is the ONLY way a handler learns who is calling. No endpoint accepts
 * a party ID or role from a body or header — a client stating who it is
 * would make the authorisation matrix decorative (API Spec §3, §7.3).
 */
export const Caller = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedCaller => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.caller) {
      throw new Error('Caller requested on an unauthenticated route');
    }
    return request.caller;
  },
);
