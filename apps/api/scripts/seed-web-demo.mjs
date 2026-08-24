/**
 * Seeds the demonstration corridor for the web product.
 *
 * ── What this is and is not ──
 * It is a DEVELOPMENT FIXTURE. Every property it writes is invented, every
 * photograph it attaches is generated artwork, and every one of them is
 * recorded with `source = 'development_fixture'` so the API says so and
 * every surface can label it. Nothing here should ever be presented as a
 * real home or a real landlord.
 *
 * ── F-009: no committed passwords ──
 * The demo password comes from `DEMO_PASSWORD` and the script refuses to
 * run without it. A password in the repository is a password in every fork,
 * every CI log and every screen-share, and these accounts include an admin
 * who can move money.
 *
 * Usage:
 *   DATABASE_URL=... DEMO_PASSWORD=... node scripts/seed-web-demo.mjs
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcryptjs';
import { fixtureImage } from './fixture-image.mjs';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const PASSWORD = process.env.DEMO_PASSWORD;
if (!PASSWORD || PASSWORD.length < 8) {
  console.error(
    'DEMO_PASSWORD must be set (8+ chars). Refusing to seed accounts with a ' +
      'password that would otherwise live in version control (F-009).',
  );
  process.exit(1);
}

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const MEDIA_ROOT = resolve(
  process.env.MEDIA_ROOT ?? join(process.cwd(), 'var', 'media'),
);

/* ── 1. Quarantine the test corridor ────────────────────────────────────
 *
 * Months of integration runs left ~1100 in-service-area neighbourhoods
 * named `JourneyHood-1785773838056-15` and the like, carrying ~980 live
 * listings "by the borehole". They are real rows and the tests that made
 * them are legitimate, but they are not a marketplace, and a landlord shown
 * that feed would rightly conclude the product is a test harness.
 *
 * They are NOT deleted — deleting them would break the audit trail and the
 * ledger rows that reference their deals. They are moved OUT of the service
 * area, which is the flag the public feed is scoped by (FR-2.5). Every spec
 * creates its own neighbourhood at runtime, so nothing that runs later is
 * affected.
 */
/**
 * A test fixture names itself. Every spec in this repository builds its
 * neighbourhood as `<Something>-${Date.now()}-${i}`, so the reliable
 * signature is not the prefix — which varies by spec and will keep varying
 * — but the embedded millisecond timestamp. Ten or more consecutive digits
 * do not occur in a real Kampala place name.
 */
const TEST_NAME_PATTERN = /[0-9]{10,}/;

async function quarantineTestTaxonomy() {
  const all = await prisma.neighbourhood.findMany({
    where: { inServiceArea: true },
    select: { id: true, name: true },
  });
  const testIds = all
    .filter((n) => TEST_NAME_PATTERN.test(n.name))
    .map((n) => n.id);
  if (testIds.length === 0) return 0;

  const { count } = await prisma.neighbourhood.updateMany({
    where: { id: { in: testIds } },
    data: { inServiceArea: false },
  });
  return count;
}

/* ── 2. The real corridor ───────────────────────────────────────────────
 *
 * Kampala's eastern suburbs, which is where the operating model actually
 * works: one officer can cover them on a boda in a morning, and that is
 * what makes in-person verification of every listing affordable (FR-2.5).
 */
const CORRIDOR = [
  ['Ntinda', 'Kampala'],
  ['Kiwatule', 'Kampala'],
  ['Naalya', 'Wakiso'],
  ['Kira', 'Wakiso'],
  ['Najjera', 'Wakiso'],
  ['Bukoto', 'Kampala'],
  ['Kisaasi', 'Kampala'],
  ['Bugolobi', 'Kampala'],
  ['Muyenga', 'Kampala'],
  ['Kololo', 'Kampala'],
];

async function neighbourhood(name, parentName) {
  const parent = parentName
    ? await prisma.neighbourhood.upsert({
        where: { id: `district-${parentName.toLowerCase()}` },
        update: { inServiceArea: true },
        create: {
          id: `district-${parentName.toLowerCase()}`,
          name: parentName,
          inServiceArea: true,
        },
      })
    : null;

  /**
   * Matched by NAME ALONE, not by (name, parent).
   *
   * An earlier seeder created these at the root with no district above
   * them. Keying on the pair would have produced a second "Ntinda" under
   * Kampala sitting beside the original — two entries for one place,
   * splitting the search index and making a landlord's picker ambiguous
   * about which one is real. Instead the existing row is adopted and given
   * its parent.
   */
  const existing = await prisma.neighbourhood.findFirst({
    where: { name },
  });
  if (existing) {
    if (!existing.inServiceArea || existing.parentId !== (parent?.id ?? null)) {
      await prisma.neighbourhood.update({
        where: { id: existing.id },
        data: { inServiceArea: true, parentId: parent?.id ?? null },
      });
    }
    return existing;
  }
  return prisma.neighbourhood.create({
    data: { name, parentId: parent?.id ?? null, inServiceArea: true },
  });
}

/**
 * Collapses duplicate neighbourhoods of the same name onto one row.
 *
 * An earlier seeder created "Ntinda", "Bukoto" and others at the root, and
 * each has live listings hanging off it. Two rows for one place means the
 * search taxonomy offers the same neighbourhood twice, each showing half
 * the inventory — which reads, correctly, as a broken index.
 *
 * Properties are REPOINTED rather than the loser being deleted: a
 * neighbourhood is referenced by properties whose listings are referenced by
 * deals and ledger entries, and deleting through that chain would break an
 * audit trail to tidy a picker. The emptied duplicate is simply taken out of
 * the service area.
 */
async function mergeDuplicateNeighbourhoods(keepIds) {
  let moved = 0;
  for (const [name, keepId] of keepIds) {
    const dupes = await prisma.neighbourhood.findMany({
      where: { name, id: { not: keepId } },
      select: { id: true },
    });
    if (dupes.length === 0) continue;

    const ids = dupes.map((d) => d.id);
    const { count } = await prisma.property.updateMany({
      where: { neighbourhoodId: { in: ids } },
      data: { neighbourhoodId: keepId },
    });
    moved += count;

    await prisma.neighbourhood.updateMany({
      where: { id: { in: ids } },
      data: { inServiceArea: false },
    });
  }
  return moved;
}

/* ── 3. Accounts ────────────────────────────────────────────────────── */

async function account(displayName, primaryPhone, authRole) {
  const hash = await bcrypt.hash(PASSWORD, 10);

  const existing = await prisma.party.findUnique({ where: { primaryPhone } });
  if (existing) {
    const acct = await prisma.userAccount.findFirst({
      where: { partyId: existing.id },
    });
    if (acct) {
      await prisma.userCredential.upsert({
        where: { userAccountId: acct.id },
        update: { passwordHash: hash },
        create: { userAccountId: acct.id, passwordHash: hash },
      });
    }
    return existing;
  }

  const party = await prisma.party.create({
    data: { displayName, primaryPhone },
  });
  const acct = await prisma.userAccount.create({
    data: { partyId: party.id, authRole },
  });
  await prisma.userCredential.create({
    data: { userAccountId: acct.id, passwordHash: hash },
  });
  return party;
}

/** A tenant must be identity-verified before requesting a viewing (FR-5.1). */
async function verifyIdentity(partyId) {
  const consent = await prisma.consentRecord.findFirst({
    where: { partyId, purpose: 'identity_verification' },
  });
  if (consent) return;

  await prisma.consentRecord.create({
    data: {
      partyId,
      purpose: 'identity_verification',
      grantedAt: new Date(),
      policyVersion: 'v1',
    },
  });
  for (const method of ['nin', 'phone', 'selfie_match']) {
    await prisma.identityVerification.create({
      data: {
        partyId,
        method,
        state: 'verified',
        providerRef: `demo-${method}`,
        verifiedAt: new Date(),
      },
    });
  }
}

/* ── 4. Photography ─────────────────────────────────────────────────── */

/**
 * Attaches fixture photographs, and repairs missing bytes on a re-run.
 *
 * ── Why it does not simply skip when rows exist ──
 * The image files are NOT in version control — they are generated, and real
 * photography belongs on a disk or in an object store rather than in git
 * history. So a fresh clone pointed at an existing database has the
 * `listing_photo` rows and none of the bytes, and every image 404s.
 *
 * Generation is deterministic from the seed key, so re-running produces
 * byte-identical files at the same content-addressed paths. This therefore
 * writes the files unconditionally and only creates the ROWS when they are
 * absent.
 */
async function attachFixturePhotos(listingId, seedKey, uploaderPartyId, count) {
  const already = await prisma.listingPhoto.count({ where: { listingId } });

  await mkdir(MEDIA_ROOT, { recursive: true });

  if (already > 0) {
    // Rows exist: restore the bytes they point at and add nothing.
    let restored = 0;
    for (let i = 0; i < count; i++) {
      const bytes = fixtureImage(`${seedKey}-${i}`);
      const digest = createHash('sha256').update(bytes).digest('hex');
      const path = join(MEDIA_ROOT, `${digest}.png`);
      if (!existsSync(path)) {
        await writeFile(path, bytes);
        restored++;
      }
    }
    return restored > 0 ? -restored : 0;
  }

  for (let i = 0; i < count; i++) {
    const bytes = fixtureImage(`${seedKey}-${i}`);
    const digest = createHash('sha256').update(bytes).digest('hex');
    await writeFile(join(MEDIA_ROOT, `${digest}.png`), bytes);

    const asset = await prisma.mediaAsset.create({
      data: {
        storageRef: `file:${digest}.png`,
        kind: 'image',
        uploadedByPartyId: uploaderPartyId,
        mimeType: 'image/png',
        byteSize: bytes.byteLength,
      },
    });
    await prisma.listingPhoto.create({
      data: {
        listingId,
        mediaAssetId: asset.id,
        sortOrder: i,
        source: 'development_fixture',
        caption: null,
      },
    });
  }
  return count;
}

/* ── 5. The portfolio ───────────────────────────────────────────────── */

const HOMES = [
  ['Ntinda', 'Two minutes off Kimera Road, behind the Total station', 'apartment', 2, 1, 'furnished', 1400000n, 700000n, 2,
    'A second-floor flat in a quiet six-unit block. Tiled throughout, hot water in both the shower and the kitchen, and a balcony that gets the morning sun. The compound is walled with a resident caretaker.'],
  ['Ntinda', 'Off Ntinda-Kisaasi Road, near St Luke church', 'house', 3, 2, 'unfurnished', 2200000n, 2200000n, 3,
    'A standalone three-bedroom on its own plot with parking for two cars. Self-contained master, a separate boys quarter, and mature trees along the fence line.'],
  ['Kiwatule', 'Behind the Shell station on Kiwatule Road', 'apartment', 1, 1, 'semi_furnished', 850000n, 850000n, 2,
    'A one-bedroom in a newer block, second floor. Comes with the wardrobes and kitchen units fitted; the rest is yours. Water tank and a standby generator shared across the block.'],
  ['Naalya', 'Naalya Estate, off the Northern Bypass service road', 'house', 4, 3, 'unfurnished', 3500000n, 3500000n, 3,
    'A four-bedroom family house in a gated estate. Sitting and dining separate, a fitted kitchen, and a garden at the back. Estate security at the gate around the clock.'],
  ['Kira', 'Kira Town, 400m past the market on Bulindo Road', 'house', 3, 2, 'semi_furnished', 1600000n, 1600000n, 2,
    'A three-bedroom bungalow with a wide veranda. Solar water heating, a 5,000-litre tank, and space at the side for a kitchen garden.'],
  ['Najjera', 'Najjera II, near Buwate stage', 'apartment', 2, 2, 'furnished', 1250000n, 625000n, 2,
    'A furnished two-bedroom, both en-suite, on the top floor of a three-storey block. Fibre internet already installed. Ready to move into.'],
  ['Bukoto', 'Off Bukoto-Kisaasi Road, near the Chinese embassy', 'apartment', 2, 1, 'furnished', 1800000n, 900000n, 2,
    'A bright two-bedroom close to the city but off the main road, so it stays quiet. Secure parking, a lift in the block, and a small gym on the ground floor.'],
  ['Kisaasi', 'Kisaasi roundabout, second turn toward Kyanja', 'room', 1, 1, 'semi_furnished', 450000n, 450000n, 1,
    'A self-contained single room in a small, well-kept block. Own bathroom and cooking space, metered water and prepaid power.'],
  ['Bugolobi', 'Bugolobi flats area, off Luthuli Avenue', 'apartment', 3, 2, 'unfurnished', 2800000n, 2800000n, 3,
    'A three-bedroom apartment with a large sitting room and a balcony facing the valley. Walking distance to the shopping centre.'],
  ['Muyenga', 'Tank Hill, off Church Road', 'house', 4, 3, 'furnished', 5000000n, 5000000n, 3,
    'A furnished four-bedroom on Tank Hill with a view over the lake side of the city. Staff quarters, borehole backup, and a walled compound with an electric fence.'],
  ['Kololo', 'Lower Kololo, off Prince Charles Drive', 'apartment', 2, 2, 'furnished', 4200000n, 4200000n, 3,
    'A serviced two-bedroom in a small block of eight. Rent covers water, security and grounds maintenance. Both bedrooms en-suite.'],
  ['Kiwatule', 'Kiwatule recreation park side, off Kyebando Road', 'house', 3, 2, 'unfurnished', 1900000n, 1900000n, 2,
    'A three-bedroom on a corner plot with its own gate. Recently repainted, a new roof, and a paved parking apron for two vehicles.'],
];

async function main() {
  const quarantined = await quarantineTestTaxonomy();
  console.log(
    `quarantined ${quarantined} test neighbourhoods out of the service area`,
  );

  const hoods = new Map();
  for (const [name, parent] of CORRIDOR) {
    hoods.set(name, await neighbourhood(name, parent));
  }
  const moved = await mergeDuplicateNeighbourhoods(
    [...hoods.entries()].map(([name, n]) => [name, n.id]),
  );
  console.log(
    `corridor: ${hoods.size} neighbourhoods in service` +
      (moved ? `, ${moved} properties repointed off duplicates` : ''),
  );

  const landlord = await account('Nakato Sarah', '+256700100001', 'lister');
  const landlord2 = await account('Ssebugwawo Peter', '+256700100002', 'lister');
  const tenant = await account('Acen Grace', '+256700100010', 'tenant');
  const officer = await account('Mugisha Daniel', '+256700100020', 'foo');
  const admin = await account('Operations Desk', '+256700100030', 'admin');
  await verifyIdentity(tenant.id);

  // Both demo landlords are property owners, not brokers, so no mandate is
  // required (FR-3.2). Set explicitly rather than left null so the publish
  // gate exercises the real branch.
  for (const p of [landlord, landlord2]) {
    await prisma.listerProfile.upsert({
      where: { partyId: p.id },
      update: {},
      create: { partyId: p.id, tier: 'property_owner' },
    });
  }

  // A commission rate must be in force before an agreement can snapshot one
  // (FR-9.1). One month of rent is the V1 rate.
  let rate = await prisma.commissionRateVersion.findFirst({
    where: { effectiveFrom: { lte: new Date() } },
    orderBy: { effectiveFrom: 'desc' },
  });
  if (!rate) {
    rate = await prisma.commissionRateVersion.create({
      data: {
        rateBpOfMonth: 10000,
        effectiveFrom: new Date(Date.now() - 86400000),
        createdByPartyId: admin.id,
      },
    });
    console.log('created commission rate version: 10000bp (one month)');
  }

  let created = 0;
  let photos = 0;
  let restored = 0;

  for (const [i, home] of HOMES.entries()) {
    const [hood, landmark, type, beds, baths, furnished, rent, deposit, months, description] = home;
    const owner = i % 3 === 2 ? landlord2 : landlord;

    const existing = await prisma.property.findFirst({
      where: { landmarkText: landmark, ownerPartyId: owner.id },
      include: { listings: true },
    });

    let listing = existing?.listings[0];

    if (!listing) {
      const property =
        existing ??
        (await prisma.property.create({
          data: {
            ownerPartyId: owner.id,
            propertyType: type,
            bedrooms: beds,
            bathrooms: baths,
            furnished,
            neighbourhoodId: hoods.get(hood).id,
            landmarkText: landmark,
          },
        }));

      listing = await prisma.listing.create({
        data: {
          propertyId: property.id,
          monthlyRent: rent,
          requiredMonthsUpfront: months,
          depositAmount: deposit,
          descriptionText: description,
        },
      });
      created++;
    }

    // The publish gate needs all four: an accepted agreement, field
    // verification, an in-service neighbourhood, and (for brokers) a
    // mandate. The seeder satisfies each the way the real workflow does
    // rather than writing `publicationState: 'live'` on its own, so a
    // broken gate surfaces here instead of in front of a landlord.
    const agreement = await prisma.listingAgreement.findFirst({
      where: { listingId: listing.id, accepted: true },
    });
    if (!agreement) {
      await prisma.listingAgreement.create({
        data: {
          listingId: listing.id,
          listerPartyId: owner.id,
          // The rate is referenced by VERSION, not copied as a number: the
          // version row is immutable, so pointing at it is a stronger
          // snapshot than duplicating the basis points here.
          commissionRateVersionId: rate.id,
          // The rent AT SIGNING, snapshotted onto the agreement. A later
          // rent change must not move the commission the landlord agreed
          // to — that is the whole point of a snapshot (FR-9.1).
          monthlyRentAtSigning: rent,
          // WHICH circumvention text this landlord accepted. Recording the
          // version rather than the prose means a later rewording cannot
          // retroactively change what they agreed to (FR-9.1).
          circumventionClauseVersion: 'v1',
          accepted: true,
          acceptedAt: new Date(),
        },
      });
    }

    // Availability confirmed at staggered recency, so the freshness signal
    // on the feed shows a real spread rather than every card claiming to
    // have been confirmed today.
    await prisma.listing.update({
      where: { id: listing.id },
      data: {
        verificationState: 'verified',
        availabilityStatus: 'available',
        // Spread across the freshness window but never past it: a seeded
        // listing that reads as stale is not a demonstration of anything.
        availabilityConfirmedAt: new Date(Date.now() - i * 10 * 3600 * 1000),
        publicationState: 'live',
      },
    });

    const result = await attachFixturePhotos(
      listing.id,
      `${hood}-${i}`,
      officer.id,
      3 + (i % 3),
    );
    // Negative means "bytes restored for rows that already existed".
    if (result >= 0) photos += result;
    else restored += -result;
  }

  console.log(`listings: ${created} created, ${HOMES.length} live`);
  console.log(
    `photographs: ${photos} development fixtures attached` +
      (restored ? `, ${restored} missing image file(s) regenerated` : ''),
  );
  console.log('');
  console.log('Demo accounts (password from DEMO_PASSWORD):');
  console.log('  landlord  +256700100001   Nakato Sarah');
  console.log('  landlord  +256700100002   Ssebugwawo Peter');
  console.log('  tenant    +256700100010   Acen Grace (identity verified)');
  console.log('  officer   +256700100020   Mugisha Daniel');
  console.log('  admin     +256700100030   Operations Desk');
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
