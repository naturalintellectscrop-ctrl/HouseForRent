import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Authority/mandate verification — a lister's right to market a SPECIFIC
 * property (FR-3.2, FR-3.3). Deliberately separate from IdentityService:
 * identity answers "who is this party" and never touches property mandate;
 * mandate answers "may this party market this property" and never touches
 * identity state (Technical Architecture §4.1).
 */
@Injectable()
export class MandateService {
  constructor(private readonly prisma: PrismaService) {}

  /** Records a mandate claim for a (lister, property) pair, pending verification. */
  async submitMandate(params: {
    listerPartyId: string;
    propertyId: string;
    evidenceMediaId?: string;
  }) {
    return this.prisma.propertyMandate.create({
      data: {
        listerPartyId: params.listerPartyId,
        propertyId: params.propertyId,
        evidenceMediaId: params.evidenceMediaId,
      },
    });
  }

  /** An FOO/admin verifies (or rejects) a submitted mandate. */
  async decideMandate(params: {
    mandateId: string;
    verifiedByPartyId: string;
    approve: boolean;
  }) {
    return this.prisma.propertyMandate.update({
      where: { id: params.mandateId },
      data: {
        state: params.approve ? 'verified' : 'rejected',
        verifiedByPartyId: params.verifiedByPartyId,
        verifiedAt: new Date(),
      },
    });
  }

  /** Does this lister hold a verified mandate for this specific property? */
  async hasVerifiedMandate(listerPartyId: string, propertyId: string): Promise<boolean> {
    const mandate = await this.prisma.propertyMandate.findUnique({
      where: { listerPartyId_propertyId: { listerPartyId, propertyId } },
    });
    return mandate?.state === 'verified';
  }

  /**
   * The domain-level enforcement primitive (FR-3.2, "MUST be enforced at
   * the domain level"). Property Owner listings never require a mandate row
   * in V1 — their identity + ownership assertion suffices, subject to field
   * verification (FR-3.2 AC). Broker/Agent and Property Management Company
   * listers MUST hold a verified mandate for that exact property.
   *
   * The Listings module (Stage 5) calls this before allowing a listing to
   * transition to 'live' — this method is the check, not the transition
   * itself, which belongs to Listings.
   */
  async canPublish(params: {
    listerTier: 'property_owner' | 'broker_agent' | 'property_mgmt_company';
    listerPartyId: string;
    propertyId: string;
  }): Promise<boolean> {
    if (params.listerTier === 'property_owner') {
      return true;
    }
    return this.hasVerifiedMandate(params.listerPartyId, params.propertyId);
  }
}
