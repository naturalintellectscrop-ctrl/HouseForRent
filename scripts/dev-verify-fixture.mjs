#!/usr/bin/env node
/**
 * local-verify-fixture — the round-56 local verification dataset.
 *
 * The demo seed (scripts/seed-demo.mjs) drifted behind two schema rounds
 * (config versioning, neighbourhood parents, media storage refs). Rather
 * than revive all of it in one jump, this script creates the MINIMUM data
 * this round's fixes need, on the disposable local PGlite stack only:
 *
 *   1. A verified lister      (+256 700 100 901) — upload-path sessions.
 *   2. A pending tenant       (+256 700 100 902) — the approvals queue.
 *   3. One LIVE listing with two photos whose DB rows exist but whose
 *      bytes exist nowhere (storageRef names objects that were never
 *      stored) — the exact shape of the round-56 production loss, so the
 *      honest "Photograph unavailable" fallback can be verified against
 *      reality rather than against a mock.
 *   4. One DRAFT listing owned by the same lister — the target for the
 *      upload → restart → serve durability drill (Supabase adapter).
 *
 * Honesty rules (same as seed-demo):
 *   - Refuses to run without LOCAL_FIXTURE_PASSWORD (F-009).
 *   - Refuses a production DATABASE_URL (the guard below).
 *   - Every name/phone is clearly fixture (+256 700 100 9xx); the landmark
 *     text is prefixed "FIXTURE" so no surface can mistake it for inventory.
 *   - Writes rows directly; it never fakes an audit event.
 *
 * Run: (set -a; . ./.env; set +a; LOCAL_FIXTURE_PASSWORD=… node scripts/dev-verify-fixture.mjs)
 */
import { PrismaClient } from '@prisma/client';
import { assertSandboxDatabase } from './production-guard.mjs';
import bcrypt from 'bcryptjs';

assertSandboxDatabase('scripts/dev-verify-fixture.mjs');

const PASSWORD = process.env.LOCAL_FIXTURE_PASSWORD;
if (!PASSWORD || PASSWORD.length < 8) {
  console.error('Refusing without LOCAL_FIXTURE_PASSWORD (min 8 chars; local accounts only).');
  process.exit(1);
}

const prisma = new PrismaClient();

function hash(password) {
  // bcrypt cost 10 - the exact scheme verifyPassword() compares with
  // (the scrypt format the old demo seed used predates the auth round).
  return bcrypt.hashSync(password, 10);
}

async function account(displayName, phone, role, status, opts = {}) {
  let party = await prisma.party.findUnique({
    where: { primaryPhone: phone },
    include: { userAccounts: true },
  });
  if (!party) {
    party = await prisma.party.create({
      data: { displayName, primaryPhone: phone, status, authRole: role },
    });
  }
  // Heal a half-created party from an earlier failed run: the account row
  // is what every read path requires (adminPartyDetail throws without it).
  let acc = party.userAccounts[0];
  if (!acc) {
    acc = await prisma.userAccount.create({ data: { partyId: party.id, authRole: role } });
  }
  const hasCredential = await prisma.userCredential.findUnique({
    where: { userAccountId: acc.id },
  });
  if (!hasCredential) {
    await prisma.userCredential.create({
      data: { userAccountId: acc.id, passwordHash: hash(PASSWORD) },
    });
  } else if (!hasCredential.passwordHash.startsWith('$2')) {
    // Heal the pre-bcrypt format: a hash verifyPassword can never match.
    await prisma.userCredential.update({
      where: { userAccountId: acc.id },
      data: { passwordHash: hash(PASSWORD) },
    });
  }
  if (opts.verified) {
    const existing = await prisma.identityVerification.findFirst({
      where: { partyId: party.id, state: 'verified' },
    });
    if (!existing) {
      await prisma.identityVerification.create({
        data: { partyId: party.id, method: 'nin', state: 'verified', providerRef: 'local-fixture', verifiedAt: new Date() },
      });
    }
  }
  if (role === 'lister') {
    const existingProfile = await prisma.listerProfile.findUnique({ where: { partyId: party.id } });
    if (!existingProfile) {
      await prisma.listerProfile.create({ data: { partyId: party.id, tier: opts.tier ?? 'property_owner' } });
    }
  }
  return party;
}

async function main() {
  const lister = await account('Local Fixture Lister', '+256700100901', 'lister', 'active', { verified: true });
  const applicant = await account('Local Fixture Applicant', '+256700100902', 'tenant', 'pending_verification');

  const naalya = await prisma.neighbourhood.findFirst({ where: { name: 'Naalya' } });
  if (!naalya) throw new Error('Naalya not seeded — run scripts/dev-local-stack.mjs first.');

  // ── the live listing with lost bytes (mirrors the production loss) ──
  const lostLandmark = 'FIXTURE lost-bytes house, Naalya';
  let live = await prisma.listing.findFirst({
    where: { property: { landmarkText: lostLandmark } },
    include: { property: true },
  });
  if (!live) {
    const property = await prisma.property.create({
      data: {
        ownerPartyId: lister.id,
        propertyType: 'house',
        bedrooms: 3,
        bathrooms: 2,
        furnished: 'semi_furnished',
        neighbourhoodId: naalya.id,
        landmarkText: lostLandmark,
      },
    });
    live = await prisma.listing.create({
      data: {
        propertyId: property.id,
        monthlyRent: 1_200_000n,
        requiredMonthsUpfront: 2,
        depositAmount: 1_200_000n,
        descriptionText:
          'LOCAL FIXTURE: this listing exists to verify the honest missing-photograph state. Its photo rows name objects that were never stored, exactly like the round-56 production rows.',
        publicationState: 'live',
        verificationState: 'verified',
        availabilityStatus: 'available',
        availabilityConfirmedAt: new Date(),
      },
    });
    for (let i = 0; i < 2; i += 1) {
      const assetId = crypto.randomUUID();
      const base = `listings/${live.id}/${assetId}`;
      await prisma.mediaAsset.create({
        data: {
          id: assetId,
          storageRef: `${base}/original.jpg`,
          kind: 'image',
          uploadedByPartyId: lister.id,
          mimeType: 'image/jpeg',
          byteSize: 150_000,
        },
      });
      for (const [variant, w, h] of [['thumb', 360, 206], ['card', 760, 434], ['detail', 1344, 768]]) {
        await prisma.mediaVariant.create({
          data: {
            mediaAssetId: assetId,
            variant,
            storageRef: `${base}/${variant}.webp`,
            mimeType: 'image/webp',
            width: w,
            height: h,
            byteSize: 40_000,
            processingStatus: 'ready',
          },
        });
      }
      await prisma.listingPhoto.create({
        data: {
          listingId: live.id,
          mediaAssetId: assetId,
          sortOrder: i + 1,
          caption: 'Local fixture — original bytes unavailable',
          source: 'lister',
        },
      });
    }
  }

  // ── the draft listing the upload drill targets ──
  const draftLandmark = 'FIXTURE upload-drill apartment, Naalya';
  let draft = await prisma.listing.findFirst({
    where: { property: { landmarkText: draftLandmark } },
    include: { property: true },
  });
  if (!draft) {
    const property = await prisma.property.create({
      data: {
        ownerPartyId: lister.id,
        propertyType: 'apartment',
        bedrooms: 2,
        bathrooms: 1,
        furnished: 'unfurnished',
        neighbourhoodId: naalya.id,
        landmarkText: draftLandmark,
      },
    });
    draft = await prisma.listing.create({
      data: {
        propertyId: property.id,
        monthlyRent: 900_000n,
        requiredMonthsUpfront: 1,
        depositAmount: 900_000n,
        descriptionText: 'LOCAL FIXTURE: target listing for the media durability drill.',
        publicationState: 'draft',
      },
    });
  }

  console.log('Local verification fixture ready:');
  console.log(`  lister sign-in : +256700100901 / (LOCAL_FIXTURE_PASSWORD)`);
  console.log(`  live listing   : ${live.id}  (2 photos, bytes genuinely absent)`);
  console.log(`  draft listing  : ${draft.id} (upload-drill target)`);
  console.log(`  pending tenant : ${applicant.id} (approvals queue)`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
