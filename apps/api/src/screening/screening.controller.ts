import { Body, Controller, Get, Post } from '@nestjs/common';
import { OnboardingService } from './onboarding.service';
import { IdentityService } from '../identity/identity.service';
import { Roles } from '../auth/roles.decorator';
import { Caller } from '../auth/caller.decorator';
import type { AuthenticatedCaller } from '../auth/auth.service';
import {
  RecordConsentDto,
  ScreenTenantDto,
  SubmitIdentityDto,
} from './dto/onboarding.dto';

/**
 * Tenant identity verification (closes F-017).
 *
 * ── Why this controller had to exist ──
 * `POST /v1/viewings` refuses a tenant who is not identity-verified (422
 * TENANT_NOT_VERIFIED), and that rule is correct: a landlord accepts our
 * terms partly because the person walking into their property has been
 * identified. But nothing in the API could MAKE a tenant verified. The
 * service methods existed, were tested, and were reachable only from spec
 * files and seed scripts writing to Prisma directly.
 *
 * The practical effect was that the tenant journey ended at registration for
 * every real user, while every test passed — the tests obtained through the
 * database a state no client could ever obtain (the F-011 pattern). A step
 * only a seed script can perform is not a step in the product.
 *
 * ── The subject is always the caller ──
 * Every endpoint here derives the tenant from the session. None accepts a
 * party id, so none can be pointed at somebody else.
 */
@Controller('v1/identity')
export class ScreeningController {
  constructor(
    private readonly onboarding: OnboardingService,
    private readonly identity: IdentityService,
  ) {}

  /**
   * Where the caller stands. Drives which step a client shows, and confers
   * nothing — it discloses only what the caller already proved by
   * authenticating.
   */
  @Get('me')
  async status(@Caller() caller: AuthenticatedCaller) {
    return {
      partyId: caller.partyId,
      ...(await this.onboarding.tenantSummary(caller.partyId)),
    };
  }

  /**
   * DPA 2019 consent, captured BEFORE any verification is attempted.
   *
   * `IdentityService` independently refuses to verify a party with no
   * consent record, so the ordering is enforced rather than merely
   * intended — a client cannot skip this step by calling the next one.
   */
  @Roles('tenant', 'admin')
  @Post('consent')
  async consent(
    @Caller() caller: AuthenticatedCaller,
    @Body() dto: RecordConsentDto,
  ) {
    const consent = await this.identity.recordConsent({
      partyId: caller.partyId,
      purpose: 'identity_verification',
      policyVersion: dto.policyVersion,
    });
    return {
      grantedAt: consent.grantedAt,
      purpose: consent.purpose,
      policyVersion: consent.policyVersion,
    };
  }

  /**
   * The three factors (FR-1.4). Returns only whether the party is now
   * verified — never the values submitted, which are not persisted.
   */
  @Roles('tenant', 'admin')
  @Post('verify')
  async verify(
    @Caller() caller: AuthenticatedCaller,
    @Body() dto: SubmitIdentityDto,
  ) {
    const verified = await this.onboarding.submitIdentity({
      tenantPartyId: caller.partyId,
      nin: dto.nin,
      phone: dto.phone,
      selfieRef: dto.selfieRef,
      idPhotoRef: dto.idPhotoRef,
    });
    return { identityVerified: verified };
  }

  /**
   * Runs the configured screening pipeline (FR-6.2). Which modules run is a
   * config value, not a request field — a caller cannot choose to be
   * screened by fewer of them.
   */
  @Roles('tenant', 'admin')
  @Post('screen')
  async screen(
    @Caller() caller: AuthenticatedCaller,
    @Body() dto: ScreenTenantDto,
  ) {
    return this.onboarding.screenTenant({
      tenantPartyId: caller.partyId,
      dealId: dto.dealId,
    });
  }
}
