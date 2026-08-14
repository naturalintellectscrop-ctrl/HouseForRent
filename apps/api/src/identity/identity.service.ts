import { Inject, Injectable } from '@nestjs/common';
import { IdentityMethod } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { IDENTITY_PROVIDER } from './interfaces/identity-provider.interface';
import type { IdentityProvider } from './interfaces/identity-provider.interface';
import { AuditService } from '../audit/audit.service';

/** The three methods required for a party to be considered identity-verified (FR-1.2). */
const REQUIRED_METHODS: IdentityMethod[] = ['nin', 'phone', 'selfie_match'];

@Injectable()
export class IdentityService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(IDENTITY_PROVIDER) private readonly identityProvider: IdentityProvider,
    private readonly audit: AuditService,
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
    return this.prisma.$transaction(async (tx) => {
      const consent = await tx.consentRecord.create({
        data: {
          partyId: params.partyId,
          purpose: params.purpose,
          grantedAt: new Date(),
          retentionUntil: params.retentionUntil,
          policyVersion: params.policyVersion,
        },
      });

      // NFR-2 names consent explicitly. The payload carries the purpose and
      // retention metadata a DPA 2019 request would ask for — and no
      // personal data, which is the point of logging that consent was given
      // rather than what it was given about.
      await this.audit.record(
        {
          eventType: 'consent_recorded',
          actorPartyId: params.partyId,
          subjectRef: consent.id,
          payload: {
            purpose: params.purpose,
            policyVersion: params.policyVersion,
            retentionUntil: params.retentionUntil?.toISOString() ?? null,
          },
          occurredAt: consent.grantedAt,
        },
        tx,
      );

      return consent;
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
    return this.persistVerification(partyId, 'nin', result);
  }

  async verifyPhone(partyId: string, phone: string) {
    await this.assertConsent(partyId, 'identity_verification');
    const result = await this.identityProvider.verifyPhone(phone);
    return this.persistVerification(partyId, 'phone', result);
  }

  async verifySelfieMatch(partyId: string, selfieRef: string, idPhotoRef: string) {
    await this.assertConsent(partyId, 'identity_verification');
    const result = await this.identityProvider.verifySelfieMatch(selfieRef, idPhotoRef);
    return this.persistVerification(partyId, 'selfie_match', result);
  }

  /**
   * The one write path for a verification attempt, so the NFR-2 audit
   * cannot be attached to two of the three methods and forgotten on the
   * third.
   *
   * The audit payload carries the METHOD and the OUTCOME — never the NIN,
   * the phone number or the selfie reference. What is auditable is that a
   * check happened and how it resolved; the inputs are precisely what
   * data-minimisation says not to keep (NFR-3, DPA 2019). `AuditService`
   * independently rejects a payload carrying any of them.
   */
  private async persistVerification(
    partyId: string,
    method: IdentityMethod,
    result: { verified: boolean; providerRef: string },
  ) {
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.identityVerification.create({
        data: {
          partyId,
          method,
          state: result.verified ? 'verified' : 'failed',
          providerRef: result.providerRef,
          verifiedAt: result.verified ? new Date() : null,
        },
      });

      await this.audit.record(
        {
          eventType: 'identity_verified',
          actorPartyId: partyId,
          subjectRef: row.id,
          payload: {
            method,
            state: row.state,
            providerRef: result.providerRef,
          },
          occurredAt: row.createdAt,
        },
        tx,
      );

      return row;
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
