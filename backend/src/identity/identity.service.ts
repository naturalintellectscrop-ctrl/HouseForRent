import { Inject, Injectable } from '@nestjs/common';
import { IdentityMethod } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { IDENTITY_PROVIDER } from './interfaces/identity-provider.interface';
import type { IdentityProvider } from './interfaces/identity-provider.interface';

/** The three methods required for a party to be considered identity-verified (FR-1.2). */
const REQUIRED_METHODS: IdentityMethod[] = ['nin', 'phone', 'selfie_match'];

@Injectable()
export class IdentityService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(IDENTITY_PROVIDER) private readonly identityProvider: IdentityProvider,
  ) {}

  /**
   * Records consent for a purpose, with timestamp and retention metadata
   * (DPA 2019, FR-1.4). Consent rows are append-only (consent_record is 🔒);
   * withdrawal is recorded as a new row, never an edit — that is the
   * caller's responsibility (a separate `recordConsent` call with purpose
   * 'consent_withdrawal'), not modelled as a distinct method here since the
   * mechanics are identical.
   */
  async recordConsent(params: {
    partyId: string;
    purpose: string;
    retentionUntil?: Date;
    policyVersion: string;
  }) {
    return this.prisma.consentRecord.create({
      data: {
        partyId: params.partyId,
        purpose: params.purpose,
        grantedAt: new Date(),
        retentionUntil: params.retentionUntil,
        policyVersion: params.policyVersion,
      },
    });
  }

  /**
   * Submits a NIN for verification. Requires prior consent for
   * 'identity_verification' to exist (FR-1.2, FR-1.4) — this is the
   * data-minimisation boundary: no raw NIN is ever persisted, only the
   * provider's opaque ref and the resulting state.
   */
  async verifyNin(partyId: string, nin: string) {
    await this.assertConsent(partyId, 'identity_verification');
    const result = await this.identityProvider.verifyNin(nin);
    return this.prisma.identityVerification.create({
      data: {
        partyId,
        method: 'nin',
        state: result.verified ? 'verified' : 'failed',
        providerRef: result.providerRef,
        verifiedAt: result.verified ? new Date() : null,
      },
    });
  }

  async verifyPhone(partyId: string, phone: string) {
    await this.assertConsent(partyId, 'identity_verification');
    const result = await this.identityProvider.verifyPhone(phone);
    return this.prisma.identityVerification.create({
      data: {
        partyId,
        method: 'phone',
        state: result.verified ? 'verified' : 'failed',
        providerRef: result.providerRef,
        verifiedAt: result.verified ? new Date() : null,
      },
    });
  }

  async verifySelfieMatch(partyId: string, selfieRef: string, idPhotoRef: string) {
    await this.assertConsent(partyId, 'identity_verification');
    const result = await this.identityProvider.verifySelfieMatch(selfieRef, idPhotoRef);
    return this.prisma.identityVerification.create({
      data: {
        partyId,
        method: 'selfie_match',
        state: result.verified ? 'verified' : 'failed',
        providerRef: result.providerRef,
        verifiedAt: result.verified ? new Date() : null,
      },
    });
  }

  /**
   * A party is identity-verified when it has a 'verified' row for EACH
   * required method, using the latest attempt per method (Data_Model.md
   * §2.5 design note — state is per-method, not a single boolean, so a
   * failed-then-retried method resolves to its most recent state).
   */
  async isIdentityVerified(partyId: string): Promise<boolean> {
    const latestPerMethod = await Promise.all(
      REQUIRED_METHODS.map((method) =>
        this.prisma.identityVerification.findFirst({
          where: { partyId, method },
          orderBy: { createdAt: 'desc' },
        }),
      ),
    );
    return latestPerMethod.every((row) => row?.state === 'verified');
  }

  private async assertConsent(partyId: string, purpose: string) {
    const consent = await this.prisma.consentRecord.findFirst({
      where: { partyId, purpose },
    });
    if (!consent) {
      throw new Error(
        `cannot verify identity for party ${partyId}: no consent recorded for purpose "${purpose}"`,
      );
    }
  }
}
