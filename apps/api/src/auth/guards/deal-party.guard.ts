import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedRequest } from './jwt-auth.guard';
import { REQUIRES_DEAL_PARTY } from '../deal-party.decorator';

/**
 * Enforces that the caller is a party to THIS deal (API Spec §7.4).
 *
 * Being a tenant is not enough; being *this deal's* tenant is required.
 * Without this, any authenticated tenant could fund or confirm move-in on
 * a stranger's deal — the role matrix alone would permit it.
 *
 * ── Why 404 and not 403 ──
 * A 403 confirms the deal exists, which lets an attacker enumerate real
 * deal IDs by probing. Non-parties receive exactly what they would receive
 * for an ID that was never issued. 403 is reserved for role failures, where
 * the caller legitimately knows the endpoint exists but may not use it.
 */
@Injectable()
export class DealPartyGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<boolean>(
      REQUIRES_DEAL_PARTY,
      [context.getHandler(), context.getClass()],
    );
    if (!required) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const caller = request.caller;
    const params = request.params as Record<string, string> | undefined;
    const dealId = params?.dealId ?? params?.id;

    if (!caller || !dealId) {
      throw new NotFoundException({ code: 'NOT_FOUND' });
    }

    // Admin and FOO act on behalf of the company across all deals; their
    // reach is already bounded by the role matrix.
    if (caller.role === 'admin' || caller.role === 'foo') {
      return true;
    }

    const deal = await this.prisma.deal.findUnique({
      where: { id: dealId },
      select: { tenantPartyId: true, landlordPartyId: true },
    });

    const isParty =
      deal !== null &&
      (deal.tenantPartyId === caller.partyId ||
        deal.landlordPartyId === caller.partyId);

    if (!isParty) {
      throw new NotFoundException({ code: 'NOT_FOUND' });
    }

    return true;
  }
}
