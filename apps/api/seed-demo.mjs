// Seeds a demo tenant, landlord and a few live listings so the mobile app
// has something real to render. Idempotent by phone number.
//
// Usage: DATABASE_URL=... node seed-demo.mjs
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcryptjs';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const PASSWORD = 'demo-pass-1234';

async function account(displayName, primaryPhone, authRole) {
  const existing = await prisma.party.findUnique({ where: { primaryPhone } });
  if (existing) return existing;
  const party = await prisma.party.create({ data: { displayName, primaryPhone } });
  const acct = await prisma.userAccount.create({
    data: { partyId: party.id, authRole },
  });
  await prisma.userCredential.create({
    data: {
      userAccountId: acct.id,
      passwordHash: await bcrypt.hash(PASSWORD, 10),
    },
  });
  return party;
}

const tenant = await account('Acen Grace', '+256700000801', 'tenant');
const landlord = await account('Okello James', '+256700000802', 'lister');
const foo = await account('Demo Officer', '+256700000803', 'foo');

// The tenant must be identity-verified to request a viewing (FR-5.1).
const consent = await prisma.consentRecord.findFirst({
  where: { partyId: tenant.id, purpose: 'identity_verification' },
});
if (!consent) {
  await prisma.consentRecord.create({
    data: {
      partyId: tenant.id,
      purpose: 'identity_verification',
      grantedAt: new Date(),
      policyVersion: 'v1',
    },
  });
  for (const method of ['nin', 'phone', 'selfie_match']) {
    await prisma.identityVerification.create({
      data: {
        partyId: tenant.id,
        method,
        state: 'verified',
        providerRef: `demo-${method}`,
        verifiedAt: new Date(),
      },
    });
  }
}

const rate = await prisma.commissionRateVersion.create({
  data: {
    rateBpOfMonth: 10000,
    effectiveFrom: new Date(Date.now() - 60_000),
    createdByPartyId: landlord.id,
  },
});

const HOMES = [
  ['Ntinda', 'past the blue kiosk on Kimera Road', 2, 1, 1_200_000n, 'furnished', 'apartment'],
  ['Kiwatule', 'behind the Shell station', 3, 2, 1_800_000n, 'semi_furnished', 'house'],
  ['Naalya', 'opposite the church, second gate', 1, 1, 650_000n, 'unfurnished', 'apartment'],
  ['Bukoto', 'next to the pharmacy on the corner', 2, 2, 1_500_000n, 'furnished', 'apartment'],
];

for (const [hood, landmark, beds, baths, rent, furnished, type] of HOMES) {
  const existing = await prisma.neighbourhood.findFirst({ where: { name: hood } });
  const neighbourhood =
    existing ??
    (await prisma.neighbourhood.create({
      data: { name: hood, inServiceArea: true },
    }));
  if (existing && !existing.inServiceArea) {
    await prisma.neighbourhood.update({
      where: { id: existing.id },
      data: { inServiceArea: true },
    });
  }

  const already = await prisma.property.findFirst({
    where: { ownerPartyId: landlord.id, landmarkText: landmark },
  });
  if (already) continue;

  const property = await prisma.property.create({
    data: {
      ownerPartyId: landlord.id,
      propertyType: type,
      bedrooms: beds,
      bathrooms: baths,
      furnished,
      neighbourhoodId: neighbourhood.id,
      landmarkText: landmark,
    },
  });

  const listing = await prisma.listing.create({
    data: {
      propertyId: property.id,
      monthlyRent: rent,
      requiredMonthsUpfront: 3,
      depositAmount: rent,
      descriptionText: `A ${beds}-bedroom ${type} in ${hood}, verified in person by one of our field officers.`,
      verificationState: 'verified',
      publicationState: 'live',
      availabilityStatus: 'available',
      availabilityConfirmedAt: new Date(),
    },
  });

  await prisma.listingAgreement.create({
    data: {
      listingId: listing.id,
      listerPartyId: landlord.id,
      commissionRateVersionId: rate.id,
      monthlyRentAtSigning: rent,
      circumventionClauseVersion: 'v1',
      accepted: true,
      acceptedAt: new Date(),
    },
  });

  // A conducted viewing so the detail screen has a real field report.
  const viewing = await prisma.viewing.create({
    data: {
      listingId: listing.id,
      tenantPartyId: tenant.id,
      conductedByPartyId: foo.id,
      scheduledFor: new Date(Date.now() - 3 * 86_400_000),
      status: 'scheduled',
    },
  });
  await prisma.fieldReport.create({
    data: {
      viewingId: viewing.id,
      fooPartyId: foo.id,
      conditionRating: beds > 2 ? 'excellent' : 'good',
      matchesListing: true,
      isAvailable: true,
      reportedAt: new Date(Date.now() - 3 * 86_400_000),
    },
  });
  await prisma.introductionRecord.create({
    data: {
      viewingId: viewing.id,
      tenantPartyId: tenant.id,
      listingId: listing.id,
      landlordPartyId: landlord.id,
      fooPartyId: foo.id,
      introducedAt: new Date(Date.now() - 3 * 86_400_000),
    },
  });
  await prisma.viewing.update({
    where: { id: viewing.id },
    data: { status: 'conducted' },
  });

  console.log(`seeded ${hood} — ${rent} UGX`);
}

console.log(`\ntenant:   +256700000801 / ${PASSWORD}`);
console.log(`landlord: +256700000802 / ${PASSWORD}`);

await prisma.$disconnect();
