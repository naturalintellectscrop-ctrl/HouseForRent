#!/usr/bin/env node
/**
 * QA tool: set one lister account's tier.
 *
 * ── Why this exists ──
 * The mandate flow (SSOT Decision 8) only applies to listers whose tier is
 * not `property_owner`, and there is no admin surface to set a tier yet
 * (registration always creates a property owner). This script exists so QA
 * rounds can exercise the broker/management-company journeys against the
 * sandbox demo database.
 *
 * ── The F-009 rule ──
 * Refuses to run without QA_PASSWORD in the environment, exactly like
 * qa-reset-password.mjs and seed-demo.mjs: a script that can change
 * accounts must never run by accident. It also refuses to touch the two
 * named demo landlords — those identities are the demo's backbone.
 *
 * Usage: QA_PASSWORD=… node scripts/qa-set-lister-tier.mjs <phone> <tier>
 */
import { PrismaClient } from '@prisma/client';
import { assertSandboxDatabase } from './production-guard.mjs';

const QA_PASSWORD = process.env.QA_PASSWORD;
if (!QA_PASSWORD) {
  console.error('Refusing to run without QA_PASSWORD (F-009).');
  process.exit(1);
}
assertSandboxDatabase('scripts/qa-set-lister-tier.mjs');

const [phone, tier] = process.argv.slice(2);
const TIERS = ['property_owner', 'broker_agent', 'property_mgmt_company'];

if (!phone || !tier || !TIERS.includes(tier)) {
  console.error(`Usage: QA_PASSWORD=… node scripts/qa-set-lister-tier.mjs <phone> <tier>\nTiers: ${TIERS.join(', ')}`);
  process.exit(1);
}

const PROTECTED = ['+256700100001', '+256700100002'];
if (PROTECTED.includes(phone)) {
  console.error(`Refusing to change the tier of a named demo landlord (${phone}). Register a QA account instead.`);
  process.exit(1);
}

const db = new PrismaClient();

const party = await db.party.findUnique({
  where: { primaryPhone: phone },
  include: { account: true, listerProfile: true },
});
if (!party) {
  console.error(`No account for ${phone}. Register it through the real signup flow first.`);
  await db.$disconnect();
  process.exit(1);
}
if (party.account?.role !== 'lister') {
  console.error(`${phone} is a ${party.account?.role ?? 'roleless'}, not a lister.`);
  await db.$disconnect();
  process.exit(1);
}

const profile = await db.listerProfile.upsert({
  where: { partyId: party.id },
  update: { tier },
  create: { partyId: party.id, tier },
});

console.log(`OK: ${party.displayName} (${phone}) tier is now ${profile.tier}`);
await db.$disconnect();
