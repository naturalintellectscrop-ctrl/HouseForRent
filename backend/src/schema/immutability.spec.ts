import { PrismaClient } from '@prisma/client';
import { createTestPrismaClient } from '../prisma/test-client';

/**
 * Proves DB-level immutability (Data_Model.md §12 rule 3) for every 🔒 table:
 * an UPDATE or DELETE on an already-written row is rejected by Postgres
 * itself (a BEFORE UPDATE OR DELETE trigger, see
 * prisma/migrations/20260727150100_immutable_tables), not merely by service-
 * layer discipline. Each case writes a row via a raw INSERT (bypassing any
 * service that doesn't exist yet at Stage 0) and then attempts a raw
 * UPDATE/DELETE against the same row — proving the constraint holds even for
 * writers that go around the application entirely.
 */
describe('DB-level immutability of 🔒 tables', () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = createTestPrismaClient();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function expectRejected(op: () => Promise<unknown>) {
    await expect(op()).rejects.toThrow();
  }

  test('consent_record: UPDATE and DELETE are rejected', async () => {
    const party = await prisma.party.create({
      data: { displayName: 'Consent Party', primaryPhone: `+2560${Date.now()}c` },
    });
    const row = await prisma.consentRecord.create({
      data: {
        partyId: party.id,
        purpose: 'identity_verification',
        grantedAt: new Date(),
        policyVersion: 'v1',
      },
    });

    await expectRejected(() =>
      prisma.$executeRawUnsafe(
        `UPDATE "consent_record" SET purpose = 'changed' WHERE id = $1`,
        row.id,
      ),
    );
    await expectRejected(() =>
      prisma.$executeRawUnsafe(`DELETE FROM "consent_record" WHERE id = $1`, row.id),
    );
  });

  test('config_version: UPDATE and DELETE are rejected', async () => {
    const party = await prisma.party.create({
      data: { displayName: 'Config Admin', primaryPhone: `+2560${Date.now()}g` },
    });
    const param = await prisma.configParameter.create({
      data: { key: `test_param_${Date.now()}`, valueType: 'int' },
    });
    const row = await prisma.configVersion.create({
      data: {
        parameterId: param.id,
        value: 7,
        effectiveFrom: new Date(),
        createdByPartyId: party.id,
      },
    });

    await expectRejected(() =>
      prisma.$executeRawUnsafe(
        `UPDATE "config_version" SET value = '99' WHERE id = $1`,
        row.id,
      ),
    );
    await expectRejected(() =>
      prisma.$executeRawUnsafe(`DELETE FROM "config_version" WHERE id = $1`, row.id),
    );
  });

  test('commission_rate_version: UPDATE and DELETE are rejected', async () => {
    const party = await prisma.party.create({
      data: { displayName: 'Rate Admin', primaryPhone: `+2560${Date.now()}r` },
    });
    const row = await prisma.commissionRateVersion.create({
      data: {
        rateBpOfMonth: 10000,
        effectiveFrom: new Date(),
        createdByPartyId: party.id,
      },
    });

    await expectRejected(() =>
      prisma.$executeRawUnsafe(
        `UPDATE "commission_rate_version" SET rate_bp_of_month = 5000 WHERE id = $1`,
        row.id,
      ),
    );
    await expectRejected(() =>
      prisma.$executeRawUnsafe(
        `DELETE FROM "commission_rate_version" WHERE id = $1`,
        row.id,
      ),
    );
  });

  test('introduction_record: UPDATE and DELETE are rejected', async () => {
    const tenant = await prisma.party.create({
      data: { displayName: 'Tenant', primaryPhone: `+2560${Date.now()}t` },
    });
    const landlord = await prisma.party.create({
      data: { displayName: 'Landlord', primaryPhone: `+2560${Date.now()}l` },
    });
    const foo = await prisma.party.create({
      data: { displayName: 'FOO', primaryPhone: `+2560${Date.now()}f` },
    });
    const neighbourhood = await prisma.neighbourhood.create({
      data: { name: `Ntinda-${Date.now()}` },
    });
    const property = await prisma.property.create({
      data: {
        ownerPartyId: landlord.id,
        propertyType: 'apartment',
        bedrooms: 2,
        bathrooms: 1,
        furnished: 'unfurnished',
        neighbourhoodId: neighbourhood.id,
        landmarkText: 'near the roundabout',
      },
    });
    const listing = await prisma.listing.create({
      data: {
        propertyId: property.id,
        monthlyRent: 1_000_000n,
        requiredMonthsUpfront: 3,
        depositAmount: 1_000_000n,
      },
    });
    const viewing = await prisma.viewing.create({
      data: {
        listingId: listing.id,
        tenantPartyId: tenant.id,
        conductedByPartyId: foo.id,
        scheduledFor: new Date(),
        status: 'conducted',
      },
    });
    const row = await prisma.introductionRecord.create({
      data: {
        viewingId: viewing.id,
        tenantPartyId: tenant.id,
        listingId: listing.id,
        landlordPartyId: landlord.id,
        fooPartyId: foo.id,
        introducedAt: new Date(),
      },
    });

    await expectRejected(() =>
      prisma.$executeRawUnsafe(
        `UPDATE "introduction_record" SET introduced_at = now() WHERE id = $1`,
        row.id,
      ),
    );
    await expectRejected(() =>
      prisma.$executeRawUnsafe(
        `DELETE FROM "introduction_record" WHERE id = $1`,
        row.id,
      ),
    );
  });

  test('deal_transition: UPDATE and DELETE are rejected', async () => {
    const tenant = await prisma.party.create({
      data: { displayName: 'Deal Tenant', primaryPhone: `+2560${Date.now()}dt` },
    });
    const landlord = await prisma.party.create({
      data: { displayName: 'Deal Landlord', primaryPhone: `+2560${Date.now()}dl` },
    });
    const neighbourhood = await prisma.neighbourhood.create({
      data: { name: `Kiwatule-${Date.now()}` },
    });
    const property = await prisma.property.create({
      data: {
        ownerPartyId: landlord.id,
        propertyType: 'house',
        bedrooms: 3,
        bathrooms: 2,
        furnished: 'furnished',
        neighbourhoodId: neighbourhood.id,
        landmarkText: 'blue gate',
      },
    });
    const listing = await prisma.listing.create({
      data: {
        propertyId: property.id,
        monthlyRent: 1_500_000n,
        requiredMonthsUpfront: 6,
        depositAmount: 1_500_000n,
      },
    });
    const deal = await prisma.deal.create({
      data: {
        listingId: listing.id,
        tenantPartyId: tenant.id,
        landlordPartyId: landlord.id,
      },
    });
    const row = await prisma.dealTransition.create({
      data: {
        dealId: deal.id,
        fromStatus: 'created',
        toStatus: 'tenant_matched',
        actorPartyId: landlord.id,
        occurredAt: new Date(),
      },
    });

    await expectRejected(() =>
      prisma.$executeRawUnsafe(
        `UPDATE "deal_transition" SET to_status = 'closed' WHERE id = $1`,
        row.id,
      ),
    );
    await expectRejected(() =>
      prisma.$executeRawUnsafe(`DELETE FROM "deal_transition" WHERE id = $1`, row.id),
    );
  });

  test('ledger_entry: UPDATE and DELETE are rejected', async () => {
    const account = await prisma.ledgerAccount.create({
      data: { accountType: 'escrow_liability' },
    });
    const row = await prisma.ledgerEntry.create({
      data: {
        postingId: crypto.randomUUID(),
        accountId: account.id,
        direction: 'credit',
        amount: 1_000_000n,
        occurredAt: new Date(),
      },
    });

    await expectRejected(() =>
      prisma.$executeRawUnsafe(
        `UPDATE "ledger_entry" SET amount = 1 WHERE id = $1`,
        row.id,
      ),
    );
    await expectRejected(() =>
      prisma.$executeRawUnsafe(`DELETE FROM "ledger_entry" WHERE id = $1`, row.id),
    );
  });

  test('psp_instruction: UPDATE and DELETE are rejected', async () => {
    const tenant = await prisma.party.create({
      data: { displayName: 'PSP Tenant', primaryPhone: `+2560${Date.now()}pt` },
    });
    const landlord = await prisma.party.create({
      data: { displayName: 'PSP Landlord', primaryPhone: `+2560${Date.now()}pl` },
    });
    const neighbourhood = await prisma.neighbourhood.create({
      data: { name: `Kisaasi-${Date.now()}` },
    });
    const property = await prisma.property.create({
      data: {
        ownerPartyId: landlord.id,
        propertyType: 'apartment',
        bedrooms: 1,
        bathrooms: 1,
        furnished: 'semi_furnished',
        neighbourhoodId: neighbourhood.id,
        landmarkText: 'opposite the clinic',
      },
    });
    const listing = await prisma.listing.create({
      data: {
        propertyId: property.id,
        monthlyRent: 800_000n,
        requiredMonthsUpfront: 3,
        depositAmount: 800_000n,
      },
    });
    const deal = await prisma.deal.create({
      data: {
        listingId: listing.id,
        tenantPartyId: tenant.id,
        landlordPartyId: landlord.id,
      },
    });
    const row = await prisma.pspInstruction.create({
      data: {
        dealId: deal.id,
        kind: 'collect',
        amount: 2_400_000n,
        idempotencyKey: crypto.randomUUID(),
      },
    });

    await expectRejected(() =>
      prisma.$executeRawUnsafe(
        `UPDATE "psp_instruction" SET state = 'succeeded' WHERE id = $1`,
        row.id,
      ),
    );
    await expectRejected(() =>
      prisma.$executeRawUnsafe(`DELETE FROM "psp_instruction" WHERE id = $1`, row.id),
    );
  });

  test('listing_agreement: UPDATE and DELETE are rejected', async () => {
    const landlord = await prisma.party.create({
      data: { displayName: 'Agreement Landlord', primaryPhone: `+2560${Date.now()}al` },
    });
    const neighbourhood = await prisma.neighbourhood.create({
      data: { name: `Kyanja-${Date.now()}` },
    });
    const property = await prisma.property.create({
      data: {
        ownerPartyId: landlord.id,
        propertyType: 'house',
        bedrooms: 4,
        bathrooms: 3,
        furnished: 'unfurnished',
        neighbourhoodId: neighbourhood.id,
        landmarkText: 'red roof, end of the road',
      },
    });
    const listing = await prisma.listing.create({
      data: {
        propertyId: property.id,
        monthlyRent: 2_000_000n,
        requiredMonthsUpfront: 12,
        depositAmount: 2_000_000n,
      },
    });
    const rateVersion = await prisma.commissionRateVersion.create({
      data: {
        rateBpOfMonth: 10000,
        effectiveFrom: new Date(),
        createdByPartyId: landlord.id,
      },
    });
    const row = await prisma.listingAgreement.create({
      data: {
        listingId: listing.id,
        listerPartyId: landlord.id,
        commissionRateVersionId: rateVersion.id,
        monthlyRentAtSigning: 2_000_000n,
        circumventionClauseVersion: 'v1',
        accepted: true,
        acceptedAt: new Date(),
      },
    });

    await expectRejected(() =>
      prisma.$executeRawUnsafe(
        `UPDATE "listing_agreement" SET accepted = false WHERE id = $1`,
        row.id,
      ),
    );
    await expectRejected(() =>
      prisma.$executeRawUnsafe(`DELETE FROM "listing_agreement" WHERE id = $1`, row.id),
    );
  });

  test('audit_event: UPDATE and DELETE are rejected', async () => {
    const actor = await prisma.party.create({
      data: { displayName: 'Audit Actor', primaryPhone: `+2560${Date.now()}aa` },
    });
    const row = await prisma.auditEvent.create({
      data: {
        eventType: 'ledger.posting',
        actorPartyId: actor.id,
        occurredAt: new Date(),
      },
    });

    await expectRejected(() =>
      prisma.$executeRawUnsafe(
        `UPDATE "audit_event" SET event_type = 'changed' WHERE id = $1`,
        row.id,
      ),
    );
    await expectRejected(() =>
      prisma.$executeRawUnsafe(`DELETE FROM "audit_event" WHERE id = $1`, row.id),
    );
  });

  test('session (NOT immutable — control case): UPDATE and DELETE both succeed', async () => {
    const party = await prisma.party.create({
      data: { displayName: 'Session Party', primaryPhone: `+2560${Date.now()}sp` },
    });
    const account = await prisma.userAccount.create({
      data: { partyId: party.id, authRole: 'tenant' },
    });
    const row = await prisma.session.create({
      data: {
        userAccountId: account.id,
        refreshTokenHash: 'hash',
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });

    await expect(
      prisma.session.update({
        where: { id: row.id },
        data: { revokedAt: new Date() },
      }),
    ).resolves.toBeDefined();

    await expect(
      prisma.session.delete({ where: { id: row.id } }),
    ).resolves.toBeDefined();
  });
});
