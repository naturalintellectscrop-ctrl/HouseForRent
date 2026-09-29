#!/usr/bin/env node
/**
 * Purges seeded demo/QA content from the sandbox database, on the owner's
 * instruction ("remove demo data"). One-shot, idempotent, and deliberately
 * ORDERED — SQLite foreign keys are enforced, so the deletion walks the
 * dependency graph bottom-up.
 *
 * ── What goes ──
 * Every piece of seeded CONTENT: properties, listings, photos, media assets
 * (all of them development fixtures), viewings, field reports, introduction
 * records, deals, ledger accounts/entries, PSP instructions, mandates,
 * agreements, saved listings, plus the three accounts whose names are
 * explicitly QA-labelled, the sessions, the reconciliation checks and the
 * audit trail of the demo rounds (that trail describes nothing else).
 *
 * ── What stays ──
 * The taxonomy (real Kampala/Wakiso neighbourhoods), business configuration
 * (config parameters + append-only config versions, commission rate
 * versions), and the seven seed OPERATOR accounts (admin, field officer,
 * two listers, three tenants) so the staff console, the portals and every
 * dashboard remain reachable and verifiable. Their names/phones are the
 * seed range (+256 700 100 0xx) — delete via real account management when
 * the operator says so, not here.
 *
 * Usage: node scripts/purge-demo-data.mjs [--yes]
 * Without --yes the script prints what it WOULD delete and exits.
 */
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();
const yes = process.argv.includes('--yes');

async function count(label, fn) {
  const n = await fn();
  console.log(`${String(n).padStart(6)}  ${label}`);
  return n;
}

/*
 * Dry-run COUNTS, never deletes: each counter gets its own countMany so the
 * preview cannot touch a row. The delete plan and this count plan must list
 * the same tables — they sit adjacent on purpose so drift is visible.
 */
const countPlan = [
  ['psp instruction events', () => db.pspInstructionEvent.count()],
  ['psp instructions', () => db.pspInstruction.count()],
  ['ledger entries', () => db.ledgerEntry.count()],
  ['ledger accounts', () => db.ledgerAccount.count()],
  ['deal transitions', () => db.dealTransition.count()],
  ['deals', () => db.deal.count()],
  ['saved listings', () => db.savedListing.count()],
  ['listing photos', () => db.listingPhoto.count()],
  ['field reports', () => db.fieldReport.count()],
  ['introduction records', () => db.introductionRecord.count()],
  ['viewings', () => db.viewing.count()],
  ['listing agreements', () => db.listingAgreement.count()],
  ['listings', () => db.listing.count()],
  ['property mandates', () => db.propertyMandate.count()],
  ['properties', () => db.property.count()],
  ['media assets (all development fixtures)', () => db.mediaAsset.count()],
  ['audit events (trail of the demo rounds)', () => db.auditEvent.count()],
  ['reconciliation checks', () => db.reconciliationCheck.count()],
  ['sessions', () => db.session.count()],
];

async function main() {
  console.log(yes ? 'PURGING (—yes given)\n' : 'DRY RUN (pass --yes to execute)\n');

  // Content, deepest dependencies first.
  const plan = [
    ['psp instruction events', () => db.pspInstructionEvent.deleteMany({})],
    ['psp instructions', () => db.pspInstruction.deleteMany({})],
    ['ledger entries', () => db.ledgerEntry.deleteMany({})],
    ['ledger accounts', () => db.ledgerAccount.deleteMany({})],
    ['deal transitions', () => db.dealTransition.deleteMany({})],
    ['deals', () => db.deal.deleteMany({})],
    ['saved listings', () => db.savedListing.deleteMany({})],
    ['listing photos', () => db.listingPhoto.deleteMany({})],
    ['field reports', () => db.fieldReport.deleteMany({})],
    ['introduction records', () => db.introductionRecord.deleteMany({})],
    ['viewings', () => db.viewing.deleteMany({})],
    ['listing agreements', () => db.listingAgreement.deleteMany({})],
    ['listings', () => db.listing.deleteMany({})],
    ['property mandates', () => db.propertyMandate.deleteMany({})],
    ['properties', () => db.property.deleteMany({})],
    ['media assets (all development fixtures)', () => db.mediaAsset.deleteMany({})],
    ['audit events (trail of the demo rounds)', () => db.auditEvent.deleteMany({})],
    ['reconciliation checks', () => db.reconciliationCheck.deleteMany({})],
    ['sessions', () => db.session.deleteMany({})],
  ];

  for (const [label, fn] of plan) {
    if (yes) {
      const r = await fn();
      console.log(`${String(r.count).padStart(6)}  deleted — ${label}`);
    }
  }

  if (!yes) {
    for (const [label, fn] of countPlan) {
      await count(label, fn);
    }
    console.log('\nDry run only — nothing was deleted.');
    await db.$disconnect();
    return;
  }

  // QA-labelled accounts (identity, credentials, party) — matched by name,
  // never by id guesswork.
  const qaAccounts = await db.userAccount.findMany({
    where: { party: { displayName: { startsWith: 'QA' } } },
    select: { id: true, partyId: true, party: { select: { displayName: true } } },
  });
  console.log(`\nQA accounts matched: ${qaAccounts.map((a) => a.party.displayName).join(', ') || '(none)'}`);

  if (yes) {
    for (const acc of qaAccounts) {
      await db.session.deleteMany({ where: { userAccountId: acc.id } });
      await db.userCredential.deleteMany({ where: { userAccountId: acc.id } });
      await db.userAccount.delete({ where: { id: acc.id } });
      await db.listerProfile.deleteMany({ where: { partyId: acc.partyId } });
      await db.identityVerification.deleteMany({ where: { partyId: acc.partyId } });
      await db.consentRecord.deleteMany({ where: { partyId: acc.partyId } });
      await db.party.delete({ where: { id: acc.partyId } });
      console.log(`       deleted account + party — ${acc.party.displayName}`);
    }
  }

  if (!yes) {
    console.log('\n(see counts above)');
    await db.$disconnect();
    return;
  }

  // Post-conditions: the operational floor that must remain.
  const after = {
    accounts: await db.userAccount.count(),
    parties: await db.party.count(),
    neighbourhoods: await db.neighbourhood.count(),
    configParameters: await db.configParameter.count(),
    commissionRateVersions: await db.commissionRateVersion.count(),
    listings: await db.listing.count(),
    properties: await db.property.count(),
    mediaAssets: await db.mediaAsset.count(),
    auditEvents: await db.auditEvent.count(),
  };
  console.log('\n=== AFTER ===');
  console.log(JSON.stringify(after, null, 2));

  const required = { accounts: 7, parties: 7, neighbourhoods: 5, listings: 0 };
  for (const [k, v] of Object.entries(required)) {
    if (after[k] !== v) {
      console.error(`POST-CONDITION FAILED: ${k} = ${after[k]}, expected ${v}`);
      process.exitCode = 1;
    }
  }
  console.log(process.exitCode ? 'POST-CONDITIONS FAILED' : 'Post-conditions OK.');
  await db.$disconnect();
}

main();
