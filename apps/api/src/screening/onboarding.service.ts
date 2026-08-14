import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { IdentityService } from '../identity/identity.service';
import { ScreeningService } from './screening.service';

/** The DPA 2019 consent purpose a tenant grants at onboarding. */
export const TENANT_ONBOARDING_PURPOSE = 'identity_verification';

/**
 * Tenant onboarding (FR-1.2, FR-1.4, FR-6.3).
 *
 * ── What V1 collects, and what it deliberately does not ──
 * Collected: display name, phone, and identity verification state via the
 * three factors. NOT collected, anywhere: payslips, bank statements,
 * employment details, landlord references. Ability to pay is evidenced by
 * escrow funding (Decision 10, FR-6.3) — a tenant who has funded the
 * required months has proven capacity better than any forgeable document,
 * and collecting documents we do not need would be a DPA liability without
 * a corresponding benefit.
 *
 * Consent is captured BEFORE any verification is attempted, with purpose
 * and timestamp, and IdentityService independently refuses to verify
 * without it — so the ordering is enforced, not merely intended.
 */
@Injectable()
export class OnboardingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identity: IdentityService,
    private readonly screening: ScreeningService,
  ) {}

  /**
   * Creates the tenant party and records consent in one step, so a tenant
   * cannot exist in a state where verification has been attempted without
   * a consent record behind it.
   */
  async registerTenant(params: {
    displayName: string;
    primaryPhone: string;
    policyVersion: string;
    retentionUntil?: Date;
  }) {
    const party = await this.prisma.party.create({
      data: {
        displayName: params.displayName,
        primaryPhone: params.primaryPhone,
      },
    });

    await this.prisma.userAccount.create({
      data: { partyId: party.id, authRole: 'tenant' },
    });

    const consent = await this.identity.recordConsent({
      partyId: party.id,
      purpose: TENANT_ONBOARDING_PURPOSE,
      policyVersion: params.policyVersion,
      retentionUntil: params.retentionUntil,
    });

    return { party, consent };
  }

  /**
   * Submits the three identity factors. The raw NIN, phone and selfie
   * reference cross the IdentityProvider boundary and are never persisted —
   * only verification state and an opaque provider reference remain.
   */
  async submitIdentity(params: {
    tenantPartyId: string;
    nin: string;
    phone: string;
    selfieRef: string;
    idPhotoRef: string;
  }) {
    await this.identity.verifyNin(params.tenantPartyId, params.nin);
    await this.identity.verifyPhone(params.tenantPartyId, params.phone);
    await this.identity.verifySelfieMatch(
      params.tenantPartyId,
      params.selfieRef,
      params.idPhotoRef,
    );

    return this.identity.isIdentityVerified(params.tenantPartyId);
  }

  /**
   * Runs the configured screening pipeline. This call is the entire
   * tenant-flow touchpoint for screening — enabling a future module changes
   * what happens inside it without changing this method or its callers
   * (FR-6.2).
   */
  async screenTenant(params: { tenantPartyId: string; dealId?: string }) {
    return this.screening.runScreening(params);
  }

  /**
   * What a landlord-facing surface may see about a tenant: the screening
   * verdict and consent status. Deliberately returns no personal data
   * beyond the display name — the landlord's assurance is "government-
   * identified and escrow-funded", which needs no PII disclosure.
   */
  async tenantSummary(tenantPartyId: string) {
    const party = await this.prisma.party.findUniqueOrThrow({
      where: { id: tenantPartyId },
    });
    const run = await this.screening.latestRunForTenant(tenantPartyId);
    const consent = await this.prisma.consentRecord.findFirst({
      where: { partyId: tenantPartyId, purpose: TENANT_ONBOARDING_PURPOSE },
      orderBy: { grantedAt: 'desc' },
    });

    return {
      displayName: party.displayName,
      identityVerified: await this.identity.isIdentityVerified(tenantPartyId),
      screeningState: run?.overallState ?? null,
      screeningModulesRun: (run?.moduleSet as string[] | undefined) ?? [],
      consentRecordedAt: consent?.grantedAt ?? null,
      consentPolicyVersion: consent?.policyVersion ?? null,
      retentionUntil: consent?.retentionUntil ?? null,
    };
  }
}
