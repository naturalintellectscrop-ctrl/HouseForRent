import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedRequest } from './jwt-auth.guard';
import { REQUIRES_ASSIGNED_FOO } from '../assigned-foo.decorator';

/**
 * Enforces the ¹ footnote of API Spec §4.3 — "must be the assigned FOO".
 *
 * Holding the `foo` role is not enough. Conducting a viewing writes an
 * immutable introduction record naming an officer as having been present;
 * filing a field report asserts a first-hand observation. Both are evidence,
 * and evidence signed by an officer who was never dispatched is worse than
 * no evidence at all. So the check is identity-of-officer, not role.
 *
 * ── Why 403 here, but 404 in DealPartyGuard ──
 * The deal guard returns 404 to stop OUTSIDERS (tenants, listers) probing
 * for real deal IDs. Every caller who reaches this guard is already staff
 * with legitimate system-wide visibility, so concealing that a viewing
 * exists buys no security and costs a dispatched officer a baffling error.
 * A 403 naming the reason is both safe and operationally honest.
 *
 * Admin bypasses: §4.3 gives admin an unqualified ✅ on these rows.
 */
@Injectable()
export class AssignedFooGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<boolean>(
      REQUIRES_ASSIGNED_FOO,
      [context.getHandler(), context.getClass()],
    );
    if (!required) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const caller = request.caller;
    const params = request.params as Record<string, string> | undefined;
    const viewingId = params?.viewingId ?? params?.id;

    if (!caller || !viewingId) {
      throw new NotFoundException({ code: 'NOT_FOUND' });
    }

    if (caller.role === 'admin') {
      return true;
    }

    const viewing = await this.prisma.viewing.findUnique({
      where: { id: viewingId },
      select: { conductedByPartyId: true },
    });

    if (!viewing) {
      throw new NotFoundException({ code: 'NOT_FOUND' });
    }

    if (viewing.conductedByPartyId !== caller.partyId) {
      throw new ForbiddenException({
        code: 'NOT_ASSIGNED_FOO',
        message:
          'only the field officer assigned to this viewing may act on it ' +
          '(API Spec §4.3)',
      });
    }

    return true;
  }
}
