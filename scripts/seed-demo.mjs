/**
 * House For Rent — the demo corridor seed (sandbox port of seed-web-demo.mjs).
 *
 * HONESTY RULES (non-negotiable, from the repo's CLAUDE.md §5):
 *  - Refuses to run without DEMO_PASSWORD (F-009: never a committed password).
 *  - Every property photograph it mints is GENERATED ARTWORK, stored with
 *    source='development_fixture', and the image itself is labelled
 *    "DEMO IMAGE". No route can mint that source; no surface presents it
 *    as verified photography.
 *  - Names and phone numbers are clearly demo (+256 700 100 0xx range).
 *  - The ledger walk uses the real service functions, so the demo books are
 *    produced by exactly the code a user journey runs.
 *
 * Run: DEMO_PASSWORD=… bun scripts/seed-demo.mjs
 */
import { PrismaClient } from '@prisma/client';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scryptSync, randomBytes } from 'node:crypto';

const prisma = new PrismaClient();
const __dirname = dirname(fileURLToPath(import.meta.url));
const MEDIA_ROOT = process.env.MEDIA_ROOT ?? join(__dirname, '..', 'media');

const DEMO_PASSWORD = process.env.DEMO_PASSWORD;
if (!DEMO_PASSWORD) {
  console.error('Refusing to seed without DEMO_PASSWORD — these accounts include an admin (F-009).');
  process.exit(1);
}

function hash(password) {
  const salt = randomBytes(16).toString('hex');
  const derived = scryptSync(password, salt, 32);
  return `scrypt$${salt}$${derived.toString('hex')}`;
}

/** Deterministic, obviously-artificial room artwork labelled as a fixture. */
function fixtureSvg({ label, hue, kind }) {
  const h1 = hue;
  const h2 = (hue + 40) % 360;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="560" viewBox="0 0 800 560" role="img" aria-label="${label}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="hsl(${h1} 22% 88%)"/>
      <stop offset="1" stop-color="hsl(${h2} 18% 74%)"/>
    </linearGradient>
  </defs>
  <rect width="800" height="560" fill="url(#g)"/>
  <g stroke="hsl(${h1} 20% 40%)" stroke-width="3" fill="none" opacity="0.7">
    <rect x="120" y="150" width="220" height="150" rx="6"/>
    <rect x="440" y="180" width="200" height="120" rx="6"/>
    <path d="M120 380h560M200 380v60M600 380v60"/>
  </g>
  <g font-family="ui-sans-serif, system-ui, sans-serif" fill="hsl(${h1} 25% 24%)">
    <text x="400" y="470" text-anchor="middle" font-size="26" font-weight="700" letter-spacing="2">DEMO IMAGE</text>
    <text x="400" y="502" text-anchor="middle" font-size="15" opacity="0.85">${label} — development fixture, not a real photograph</text>
    <text x="400" y="120" text-anchor="middle" font-size="17" opacity="0.7">${kind}</text>
  </g>
</svg>`;
}

const ROOMS = [
  { kind: 'Living room', hue: 150 },
  { kind: 'Bedroom', hue: 210 },
  { kind: 'Kitchen', hue: 30 },
  { kind: 'Bathroom', hue: 190 },
  { kind: 'Exterior', hue: 100 },
];

async function main() {
  console.log('Seeding the House For Rent demo corridor…');
  mkdirSync(MEDIA_ROOT, { recursive: true });

  // ── config ────────────────────────────────────────────────────────────
  await prisma.configParameter.upsert({
    where: { key: 'freshness_window_days' },
    update: { value: '14' },
    create: { key: 'freshness_window_days', value: '14', valueType: 'int' },
  });
  await prisma.configParameter.upsert({
    where: { key: 'launch_gate_listings' },
    update: { value: '12' },
    create: { key: 'launch_gate_listings', value: '12', valueType: 'int' },
  });

  const rate =
    (await prisma.commissionRateVersion.findFirst({ orderBy: { effectiveFrom: 'desc' } })) ??
    (await prisma.commissionRateVersion.create({
      data: { rateBp: 3000, effectiveFrom: new Date('2026-01-01') }, // 30% of one month's rent
    }));

  // ── neighbourhoods (Decision 2: one contiguous corridor) ──────────────
  const areas = [
    { name: 'Ntinda', district: 'Kampala', inServiceArea: true, latitude: 0.3524, longitude: 32.6169 },
    { name: 'Kira', district: 'Wakiso', inServiceArea: true, latitude: 0.3936, longitude: 32.6303 },
    { name: 'Bugolobi', district: 'Kampala', inServiceArea: true, latitude: 0.3244, longitude: 32.6028 },
    { name: 'Naalya', district: 'Wakiso', inServiceArea: true, latitude: 0.3689, longitude: 32.6414 },
    { name: 'Mukono', district: 'Mukono', inServiceArea: false, latitude: 0.3533, longitude: 32.7553 },
  ];
  const nb = {};
  for (const a of areas) {
    nb[a.name] =
      (await prisma.neighbourhood.findFirst({ where: { name: a.name } })) ??
      (await prisma.neighbourhood.create({ data: a }));
  }

  // ── accounts (clearly demo numbers) ───────────────────────────────────
  async function account(displayName, phone, role, status = 'active', verified = false) {
    let party = await prisma.party.findUnique({ where: { primaryPhone: phone } });
    if (!party) {
      party = await prisma.party.create({ data: { displayName, primaryPhone: phone, status } });
      const acc = await prisma.userAccount.create({ data: { partyId: party.id, role, status } });
      await prisma.userCredential.create({ data: { userAccountId: acc.id, passwordHash: hash(DEMO_PASSWORD) } });
      if (role === 'lister') {
        await prisma.listerProfile.create({ data: { partyId: party.id, tier: 'property_owner' } });
      }
    }
    if (verified) {
      const existing = await prisma.identityVerification.findFirst({ where: { partyId: party.id, state: 'verified' } });
      if (!existing) {
        await prisma.identityVerification.create({
          data: { partyId: party.id, method: 'nin', state: 'verified', reference: 'demo-verified', verifiedAt: new Date() },
        });
      }
    }
    return party;
  }

  const landlord = await account('Sarah Nabukenya', '+256700100001', 'lister', 'active', true);
  const landlord2 = await account('David Okello', '+256700100002', 'lister', 'active', true);
  const tenant = await account('Grace Achieng', '+256700100010', 'tenant', 'active', true);
  const tenant2 = await account('Peter Mugisha', '+256700100011', 'tenant', 'active', true);
  await account('Joan Kembabazi', '+256700100012', 'tenant', 'pending_verification', false);
  const foo = await account('Michael Wasswa', '+256700100020', 'foo');
  const admin = await account('Operations Desk', '+256700100030', 'admin');

  // ── fixture photography (source=development_fixture, labelled on-image) ──
  async function fixturePhoto(listingId, position, kind, hue, label) {
    const svg = fixtureSvg({ label, hue, kind });
    const name = `${listingId.slice(0, 8)}-${position}.svg`;
    writeFileSync(join(MEDIA_ROOT, name), svg);
    const asset = await prisma.mediaAsset.create({
      data: { kind: 'image', filename: name, mime: 'image/svg+xml', byteSize: svg.length, source: 'development_fixture' },
    });
    await prisma.listingPhoto.create({ data: { listingId, mediaAssetId: asset.id, position } });
  }

  // ── properties & listings ─────────────────────────────────────────────
  async function listing(owner, area, data, photos) {
    const existing = await prisma.listing.findFirst({
      where: { property: { ownerPartyId: owner.id, landmarkText: data.landmarkText } },
    });
    if (existing) return existing;
    const property = await prisma.property.create({
      data: {
        ownerPartyId: owner.id,
        propertyType: data.propertyType,
        bedrooms: data.bedrooms,
        bathrooms: data.bathrooms,
        furnished: data.furnished,
        neighbourhoodId: nb[area].id,
        landmarkText: data.landmarkText,
      },
    });
    const listingRow = await prisma.listing.create({
      data: {
        propertyId: property.id,
        monthlyRent: BigInt(data.monthlyRent),
        requiredMonthsUpfront: data.months,
        depositAmount: BigInt(data.deposit),
        descriptionText: data.descriptionText,
        publicationState: data.publicationState ?? 'awaiting_verification',
        verificationState: data.verified ? 'verified' : 'unverified',
        availabilityStatus: 'available',
        availabilityConfirmedAt: data.confirmed ?? null,
      },
    });
    if (data.publicationState === 'live') {
      await prisma.listingAgreement.create({
        data: {
          listingId: listingRow.id,
          listerPartyId: owner.id,
          commissionRateVersionId: rate.id,
          monthlyRentAtSigning: BigInt(data.monthlyRent),
          accepted: true,
          acceptedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
        },
      });
    } else {
      await prisma.listingAgreement.create({
        data: {
          listingId: listingRow.id,
          listerPartyId: owner.id,
          commissionRateVersionId: rate.id,
          monthlyRentAtSigning: BigInt(data.monthlyRent),
        },
      });
    }
    let pos = 0;
    for (const p of photos ?? []) {
      await fixturePhoto(listingRow.id, pos++, p.kind, p.hue, `${data.propertyType} in ${area}`);
    }
    return listingRow;
  }

  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;

  const live1 = await listing(landlord, 'Ntinda', {
    propertyType: 'apartment', bedrooms: 2, bathrooms: 2, furnished: 'semi_furnished',
    landmarkText: '300 m off Kiwatule Road, opposite the green water tank',
    descriptionText: 'Two-bedroom apartment on the second floor of a small block of six. Solar water heating, borehole backup, and a shared courtyard that gets the evening shade. Rent quoted monthly; two months upfront and one month deposit.',
    monthlyRent: 1200000, months: 2, deposit: 1200000, verified: true,
    publicationState: 'live', confirmed: new Date(now - 2 * day),
  }, [ROOMS[0], ROOMS[1], ROOMS[2]]);

  const live2 = await listing(landlord, 'Kira', {
    propertyType: 'house', bedrooms: 3, bathrooms: 2, furnished: 'unfurnished',
    landmarkText: 'Bulindo, second turn after Kira Town Council offices',
    descriptionText: 'Standalone three-bedroom house with its own compound and a mature mango tree the landlord will defend with his life. Tarmac road to within 400 m. Two months upfront, one month deposit.',
    monthlyRent: 1800000, months: 2, deposit: 1800000, verified: true,
    publicationState: 'live', confirmed: new Date(now - 4 * day),
  }, [ROOMS[4], ROOMS[0], ROOMS[1]]);

  const live3 = await listing(landlord2, 'Bugolobi', {
    propertyType: 'apartment', bedrooms: 1, bathrooms: 1, furnished: 'furnished',
    landmarkText: 'Luthuli Avenue rise, behind the old laundry',
    descriptionText: 'One-bedroom, fully furnished, walking distance to the offices along Luthuli. Water tanked, power rarely out. Suited to one person or a couple. One month upfront and one month deposit.',
    monthlyRent: 950000, months: 1, deposit: 950000, verified: true,
    publicationState: 'live', confirmed: new Date(now - 1 * day),
  }, [ROOMS[0], ROOMS[1]]);

  const live4 = await listing(landlord2, 'Naalya', {
    propertyType: 'room', bedrooms: 1, bathrooms: 1, furnished: 'semi_furnished',
    landmarkText: 'Naalya shopping centre, 200 m towards Kyinikizo',
    descriptionText: 'Self-contained single room in a well-kept compound of five. Shared cooking area, own bathroom. The landlord lives on site and keeps the place squared away.',
    monthlyRent: 450000, months: 2, deposit: 450000, verified: true,
    publicationState: 'live', confirmed: new Date(now - 6 * day),
  }, [ROOMS[1], ROOMS[3]]);

  const stale = await listing(landlord, 'Ntinda', {
    propertyType: 'house', bedrooms: 4, bathrooms: 3, furnished: 'unfurnished',
    landmarkText: 'Ntinda–Kigowa road, behind the church on the hill',
    descriptionText: 'Four-bedroom family house with servants quarters. Verified some weeks ago; availability not re-confirmed since, so it is out of search until an officer looks in again.',
    monthlyRent: 3500000, months: 2, deposit: 3500000, verified: true,
    publicationState: 'live', confirmed: new Date(now - 30 * day),
  }, [ROOMS[4], ROOMS[0]]);

  await listing(landlord2, 'Naalya', {
    propertyType: 'apartment', bedrooms: 2, bathrooms: 2, furnished: 'unfurnished',
    landmarkText: 'Naalya phase 4, next to the primary school gate',
    descriptionText: 'New two-bedroom, still awaiting its field visit. It will not appear in search until an officer has stood inside it.',
    monthlyRent: 1100000, months: 2, deposit: 1100000, verified: false,
    publicationState: 'awaiting_verification',
  }, []);

  await listing(landlord, 'Mukono', {
    propertyType: 'house', bedrooms: 3, bathrooms: 2, furnished: 'unfurnished',
    landmarkText: 'Mukono town, near the university junction',
    descriptionText: 'Outside the launch corridor: Mukono is not in the service area yet, so this listing cannot publish regardless of verification.',
    monthlyRent: 800000, months: 2, deposit: 800000, verified: false,
    publicationState: 'draft',
  }, []);
  void stale;

  // ── viewings across the dispatch lifecycle ────────────────────────────
  // Idempotent by (listing, tenant, status) — not by scheduledFor, which
  // moves relative to "now" on every run.
  async function ensureViewing(where) {
    const found = await prisma.viewing.findFirst({
      where: { listingId: where.listingId, tenantPartyId: where.tenantPartyId, status: where.status },
    });
    return found ?? (await prisma.viewing.create({ data: where }));
  }

  // 1. requested — waiting in the dispatch queue
  await ensureViewing({
    listingId: live1.id, tenantPartyId: tenant2.id,
    scheduledFor: new Date(now + 2 * day), status: 'requested',
  });

  // 2. scheduled — assigned to the officer
  await ensureViewing({
    listingId: live3.id, tenantPartyId: tenant2.id, conductedByPartyId: foo.id,
    scheduledFor: new Date(now + 1 * day), status: 'scheduled',
  });

  // 3. conducted — field report + introduction record (immutable evidence)
  const conducted = await prisma.viewing.findFirst({
    where: { listingId: live4.id, tenantPartyId: tenant.id, status: 'conducted' },
  });
  if (!conducted) {
    const v = await prisma.viewing.create({
      data: {
        listingId: live4.id, tenantPartyId: tenant.id, conductedByPartyId: foo.id,
        scheduledFor: new Date(now - 3 * day), status: 'requested',
      },
    });
    await prisma.fieldReport.create({
      data: {
        viewingId: v.id, fooPartyId: foo.id,
        conditionRating: 'good', matchesListing: true, isAvailable: true,
        issuesText: 'Cooking area window latch loose; landlord agreed to replace before move-in.',
        timingNote: 'Arrived 14:05; tenant on time; landlord met us on site.',
        mediaAssetIds: JSON.stringify([]),
        reportedAt: new Date(now - 3 * day),
      },
    });
    await prisma.viewing.update({ where: { id: v.id }, data: { status: 'conducted' } });
    await prisma.introductionRecord.create({
      data: {
        viewingId: v.id, tenantPartyId: tenant.id, listingId: live4.id,
        landlordPartyId: landlord2.id, fooPartyId: foo.id, introducedAt: new Date(now - 3 * day),
      },
    });
  }

  // ── deals walked through the real service path (ledger produced by the
  //    same code a user journey runs — see worklog §seed) ─────────────────
  const deals = await import('../src/server/deals.ts');
  const seededDeal = async (listingId, tenantParty) => {
    const intro = await prisma.introductionRecord.findFirst({
      where: { listingId, tenantPartyId: tenantParty.id },
      orderBy: { introducedAt: 'desc' },
    });
    if (!intro) return null;
    const existing = await prisma.deal.findFirst({ where: { introductionRecordId: intro.id } });
    if (existing) return existing;
    return deals.createFromIntroduction({ introductionRecordId: intro.id, actorPartyId: foo.id, actorRole: 'foo' });
  };

  // Deal A: walked all the way to closed — the books show a complete let.
  const dealA = await seededDeal(live4.id, tenant);
  if (dealA && dealA.status === 'created') {
    await deals.matchTenant({ dealId: dealA.id, actorPartyId: foo.id });
    await deals.signAgreement({ dealId: dealA.id, actorPartyId: landlord2.id });
    await deals.fundEscrow({ dealId: dealA.id, actorPartyId: tenant.id });
    await deals.confirmMoveIn({ dealId: dealA.id, actorPartyId: tenant.id });
    await deals.earnCommission({ dealId: dealA.id, actorPartyId: admin.id });
    await deals.settle({ dealId: dealA.id, actorPartyId: admin.id });
    await deals.close({ dealId: dealA.id, actorPartyId: admin.id });
    await prisma.listing.update({ where: { id: live4.id }, data: { publicationState: 'rented', availabilityStatus: 'unavailable' } });
  }

  // Deal B: funded, waiting on the tenant's move-in confirmation.
  const introB = await prisma.introductionRecord.findFirst({
    where: { listingId: live1.id, tenantPartyId: tenant.id },
  });
  if (!introB) {
    const v = await prisma.viewing.create({
      data: {
        listingId: live1.id, tenantPartyId: tenant.id, conductedByPartyId: foo.id,
        scheduledFor: new Date(now - 1 * day), status: 'conducted',
      },
    });
    await prisma.fieldReport.create({
      data: {
        viewingId: v.id, fooPartyId: foo.id,
        conditionRating: 'excellent', matchesListing: true, isAvailable: true,
        timingNote: 'Evening visit; lights and water checked on site.',
        mediaAssetIds: JSON.stringify([]),
        reportedAt: new Date(now - 1 * day),
      },
    });
    await prisma.introductionRecord.create({
      data: {
        viewingId: v.id, tenantPartyId: tenant.id, listingId: live1.id,
        landlordPartyId: landlord.id, fooPartyId: foo.id, introducedAt: new Date(now - 1 * day),
      },
    });
  }
  const dealB = await seededDeal(live1.id, tenant);
  if (dealB && dealB.status === 'created') {
    await deals.matchTenant({ dealId: dealB.id, actorPartyId: foo.id });
    await deals.signAgreement({ dealId: dealB.id, actorPartyId: landlord.id });
    await deals.fundEscrow({ dealId: dealB.id, actorPartyId: tenant.id });
  }

  // ── audit row for the seed itself ─────────────────────────────────────
  await prisma.auditEvent.create({
    data: {
      actorPartyId: admin.id,
      actorRole: 'admin',
      action: 'demo_corridor_seeded',
      entityType: 'system',
      entityId: 'seed',
      detail: JSON.stringify({ note: 'sandbox demo data — all photography is labelled development fixtures' }),
    },
  });

  const counts = {
    neighbourhoods: await prisma.neighbourhood.count(),
    listings: await prisma.listing.count(),
    live: await prisma.listing.count({ where: { publicationState: 'live' } }),
    viewings: await prisma.viewing.count(),
    deals: await prisma.deal.count(),
  };
  console.log('Seed complete:', counts);
  console.log('Demo accounts (password = DEMO_PASSWORD):');
  console.log('  landlord  +256700100001  (+256700100002)');
  console.log('  tenant    +256700100010  (verified) · +256700100011 · +256700100012 (unverified)');
  console.log('  officer   +256700100020');
  console.log('  admin     +256700100030');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
