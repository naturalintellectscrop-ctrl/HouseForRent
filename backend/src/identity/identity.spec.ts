import { Test } from '@nestjs/testing';
import { IdentityModule } from './identity.module';
import { IdentityService } from './identity.service';
import { MandateService } from './mandate.service';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Stage 1 acceptance tests (FR-1.2, FR-1.3, FR-1.4, FR-3.2, FR-3.3):
 *   - identity verification and mandate verification are independent;
 *   - a broker/mgmt listing without a verified mandate cannot publish;
 *   - consent is recorded with purpose + timestamp before verification;
 *   - the external IdentityProvider is behind a mockable interface.
 */
describe('Identity & Verification (Stage 1)', () => {
  let identity: IdentityService;
  let mandate: MandateService;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PrismaModule, IdentityModule],
    }).compile();

    identity = moduleRef.get(IdentityService);
    mandate = moduleRef.get(MandateService);
    prisma = moduleRef.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function makeParty(label: string) {
    return prisma.party.create({
      data: { displayName: label, primaryPhone: `+2567${Date.now()}${Math.floor(Math.random() * 1000)}` },
    });
  }

  test('consent is recorded with purpose, timestamp, and policy version before verification is allowed', async () => {
    const party = await makeParty('Consent Check');

    await expect(identity.verifyNin(party.id, '1234567890')).rejects.toThrow(
      /no consent recorded/,
    );

    const consent = await identity.recordConsent({
      partyId: party.id,
      purpose: 'identity_verification',
      policyVersion: 'v1',
    });

    expect(consent.purpose).toBe('identity_verification');
    expect(consent.grantedAt).toBeInstanceOf(Date);
    expect(consent.policyVersion).toBe('v1');

    // now verification is allowed
    await expect(identity.verifyNin(party.id, '1234567890')).resolves.toBeDefined();
  });

  test('a party is identity-verified only once ALL three methods (nin, phone, selfie_match) are verified', async () => {
    const party = await makeParty('Three Factor');
    await identity.recordConsent({
      partyId: party.id,
      purpose: 'identity_verification',
      policyVersion: 'v1',
    });

    expect(await identity.isIdentityVerified(party.id)).toBe(false);

    await identity.verifyNin(party.id, '1234567890');
    expect(await identity.isIdentityVerified(party.id)).toBe(false);

    await identity.verifyPhone(party.id, '+256700000001');
    expect(await identity.isIdentityVerified(party.id)).toBe(false);

    await identity.verifySelfieMatch(party.id, 'selfie-ref', 'id-photo-ref');
    expect(await identity.isIdentityVerified(party.id)).toBe(true);
  });

  test('the mock IdentityProvider surfaces failure deterministically (no hardcoded always-pass)', async () => {
    const party = await makeParty('Failing Nin');
    await identity.recordConsent({
      partyId: party.id,
      purpose: 'identity_verification',
      policyVersion: 'v1',
    });

    const result = await identity.verifyNin(party.id, 'bad-nin-fail');
    expect(result.state).toBe('failed');
    expect(await identity.isIdentityVerified(party.id)).toBe(false);
  });

  test('no plaintext NIN is stored: only state and an opaque providerRef persist', async () => {
    const party = await makeParty('No Plaintext');
    await identity.recordConsent({
      partyId: party.id,
      purpose: 'identity_verification',
      policyVersion: 'v1',
    });

    const rawNin = '9988776655-super-secret';
    const result = await identity.verifyNin(party.id, rawNin);

    expect(result.providerRef).not.toContain(rawNin);
    expect(JSON.stringify(result)).not.toContain(rawNin);
  });

  test('identity verification and mandate verification are independent: a party can be fully identity-verified with zero mandates', async () => {
    const lister = await makeParty('Verified No Mandate');
    await identity.recordConsent({
      partyId: lister.id,
      purpose: 'identity_verification',
      policyVersion: 'v1',
    });
    await identity.verifyNin(lister.id, '1111111111');
    await identity.verifyPhone(lister.id, '+256700000002');
    await identity.verifySelfieMatch(lister.id, 'selfie', 'idphoto');

    expect(await identity.isIdentityVerified(lister.id)).toBe(true);

    const neighbourhood = await prisma.neighbourhood.create({
      data: { name: `Najjera-${Date.now()}` },
    });
    const property = await prisma.property.create({
      data: {
        ownerPartyId: lister.id,
        propertyType: 'apartment',
        bedrooms: 2,
        bathrooms: 1,
        furnished: 'furnished',
        neighbourhoodId: neighbourhood.id,
        landmarkText: 'near the market',
      },
    });

    // identity-verified, but zero mandates for this property
    expect(await mandate.hasVerifiedMandate(lister.id, property.id)).toBe(false);
  });

  test('the inverse also holds: a lister can have a verified mandate while NOT identity-verified', async () => {
    const lister = await makeParty('Mandate No Identity');
    // no consent, no identity verification at all for this party

    const neighbourhood = await prisma.neighbourhood.create({
      data: { name: `Kira-${Date.now()}` },
    });
    const property = await prisma.property.create({
      data: {
        ownerPartyId: lister.id,
        propertyType: 'house',
        bedrooms: 3,
        bathrooms: 2,
        furnished: 'unfurnished',
        neighbourhoodId: neighbourhood.id,
        landmarkText: 'blue gate near the well',
      },
    });

    const submitted = await mandate.submitMandate({
      listerPartyId: lister.id,
      propertyId: property.id,
    });
    const admin = await makeParty('Admin Verifier');
    await mandate.decideMandate({
      mandateId: submitted.id,
      verifiedByPartyId: admin.id,
      approve: true,
    });

    expect(await mandate.hasVerifiedMandate(lister.id, property.id)).toBe(true);
    expect(await identity.isIdentityVerified(lister.id)).toBe(false);
  });

  test('mandate is per-property, not per-lister: a verified mandate on property A does not cover property B', async () => {
    const broker = await makeParty('Two Property Broker');
    const neighbourhood = await prisma.neighbourhood.create({
      data: { name: `Kisaasi-${Date.now()}` },
    });
    const propertyA = await prisma.property.create({
      data: {
        ownerPartyId: broker.id,
        propertyType: 'apartment',
        bedrooms: 1,
        bathrooms: 1,
        furnished: 'semi_furnished',
        neighbourhoodId: neighbourhood.id,
        landmarkText: 'property A landmark',
      },
    });
    const propertyB = await prisma.property.create({
      data: {
        ownerPartyId: broker.id,
        propertyType: 'apartment',
        bedrooms: 1,
        bathrooms: 1,
        furnished: 'semi_furnished',
        neighbourhoodId: neighbourhood.id,
        landmarkText: 'property B landmark',
      },
    });

    const submitted = await mandate.submitMandate({
      listerPartyId: broker.id,
      propertyId: propertyA.id,
    });
    const admin = await makeParty('Admin Verifier B');
    await mandate.decideMandate({
      mandateId: submitted.id,
      verifiedByPartyId: admin.id,
      approve: true,
    });

    expect(await mandate.hasVerifiedMandate(broker.id, propertyA.id)).toBe(true);
    expect(await mandate.hasVerifiedMandate(broker.id, propertyB.id)).toBe(false);
  });

  describe('canPublish — the domain-level publish enforcement primitive (FR-3.2)', () => {
    test('property_owner CAN publish without any mandate row', async () => {
      const owner = await makeParty('Owner Publisher');
      const neighbourhood = await prisma.neighbourhood.create({
        data: { name: `Ntinda-${Date.now()}` },
      });
      const property = await prisma.property.create({
        data: {
          ownerPartyId: owner.id,
          propertyType: 'house',
          bedrooms: 4,
          bathrooms: 3,
          furnished: 'furnished',
          neighbourhoodId: neighbourhood.id,
          landmarkText: 'behind the church',
        },
      });

      const canPublish = await mandate.canPublish({
        listerTier: 'property_owner',
        listerPartyId: owner.id,
        propertyId: property.id,
      });
      expect(canPublish).toBe(true);
    });

    test('broker_agent WITHOUT a verified mandate CANNOT publish', async () => {
      const broker = await makeParty('Unmandated Broker');
      const neighbourhood = await prisma.neighbourhood.create({
        data: { name: `Kyanja-${Date.now()}` },
      });
      const property = await prisma.property.create({
        data: {
          ownerPartyId: broker.id,
          propertyType: 'apartment',
          bedrooms: 2,
          bathrooms: 2,
          furnished: 'unfurnished',
          neighbourhoodId: neighbourhood.id,
          landmarkText: 'green gate',
        },
      });

      const canPublish = await mandate.canPublish({
        listerTier: 'broker_agent',
        listerPartyId: broker.id,
        propertyId: property.id,
      });
      expect(canPublish).toBe(false);
    });

    test('broker_agent WITH a verified mandate for that exact property CAN publish', async () => {
      const broker = await makeParty('Mandated Broker');
      const neighbourhood = await prisma.neighbourhood.create({
        data: { name: `Najjera-${Date.now()}` },
      });
      const property = await prisma.property.create({
        data: {
          ownerPartyId: broker.id,
          propertyType: 'apartment',
          bedrooms: 2,
          bathrooms: 2,
          furnished: 'unfurnished',
          neighbourhoodId: neighbourhood.id,
          landmarkText: 'yellow gate',
        },
      });
      const submitted = await mandate.submitMandate({
        listerPartyId: broker.id,
        propertyId: property.id,
      });
      const admin = await makeParty('Admin Verifier C');
      await mandate.decideMandate({
        mandateId: submitted.id,
        verifiedByPartyId: admin.id,
        approve: true,
      });

      const canPublish = await mandate.canPublish({
        listerTier: 'broker_agent',
        listerPartyId: broker.id,
        propertyId: property.id,
      });
      expect(canPublish).toBe(true);
    });

    test('property_mgmt_company WITH a REJECTED mandate CANNOT publish', async () => {
      const mgmtCo = await makeParty('Rejected Mgmt Co');
      const neighbourhood = await prisma.neighbourhood.create({
        data: { name: `Kiwatule-${Date.now()}` },
      });
      const property = await prisma.property.create({
        data: {
          ownerPartyId: mgmtCo.id,
          propertyType: 'apartment',
          bedrooms: 3,
          bathrooms: 2,
          furnished: 'furnished',
          neighbourhoodId: neighbourhood.id,
          landmarkText: 'white gate',
        },
      });
      const submitted = await mandate.submitMandate({
        listerPartyId: mgmtCo.id,
        propertyId: property.id,
      });
      const admin = await makeParty('Admin Verifier D');
      await mandate.decideMandate({
        mandateId: submitted.id,
        verifiedByPartyId: admin.id,
        approve: false,
      });

      const canPublish = await mandate.canPublish({
        listerTier: 'property_mgmt_company',
        listerPartyId: mgmtCo.id,
        propertyId: property.id,
      });
      expect(canPublish).toBe(false);
    });
  });
});
