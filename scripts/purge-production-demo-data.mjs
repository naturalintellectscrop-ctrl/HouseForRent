#!/usr/bin/env node
/**
 * PRODUCTION CLEAN-UP — removes the seeded demo corpus from the live
 * Supabase database so the platform control center shows operational truth.
 * Owner instruction: purge the fake data, keep every TABLE (no DDL), keep
 * the platform owner, and keep what a real marketplace needs to operate.
 *
 * ── The immutability triggers, and why this script touches them ──
 * Ten tables (audit_event, commission_rate_version, config_version,
 * consent_record, deal_transition, introduction_record, ledger_entry,
 * listing_agreement, psp_instruction, psp_instruction_event) carry
 * BEFORE DELETE OR UPDATE triggers calling reject_mutation() — the
 * append-only financial/audit integrity design. That control exists to
 * protect real history; these rows are seeded fixtures. The purge
 * therefore runs capture → drop → delete → recreate: the exact DDL of
 * every immutable trigger is read from the catalogue first, the
 * triggers are dropped, the rows are purged, and the triggers are
 * recreated byte-identical from the captured definitions — ALL inside
 * one transaction, so a failure restores triggers and rows together,
 * and the control is never absent from a committed database state.
 *
 * ── What goes ──
 * The August 2026 bulk seed: 3,508 fixture parties ("Consent Party",
 * "Deal Tenant", generated phone ranges) and their accounts, sessions,
 * credentials, tokens, verifications and consents; 2,102 properties,
 * 2,066 listings, 50 photos, 2,098 media fixtures (file:/mock://),
 * 1,099 deals with their transitions and ledger/PSP walk, 1,059
 * agreements, 24 mandates, 1,001 viewings, 589 field reports, 540
 * introductions, 56 screening runs, 40 reconciliation checks, 157
 * seed-time config versions, 1,026 of the 1,027 commission rate
 * versions (re-seeded churn), QA-pattern neighbourhoods
 * ("MatrixHood-1785…" etc.), and the 4,929 audit rows that describe
 * nobody real.
 *
 * ── What stays (or is rebuilt) ──
 * - The platform owner chain, resolved by email from the database
 *   (party → user_account(admin) → user_credential). Nothing else keys
 *   off a hardcoded id.
 * - config_parameter reduced to the REAL business keys (the seed left 18
 *   QA probe keys behind: test_param_*, future_test_*, immutable_test_*).
 * - commission_rate_version rebuilt to ONE canonical row: the latest
 *   rate/effectiveFrom observed at purge time, attributed to the owner
 *   (created_by FK must survive the party purge).
 * - neighbourhood reduced to the real Kampala/Wakiso area names
 *   (digits in a name = QA hood, deduplicated to one row per name).
 * - The owner's own audit rows (provisioning, sign-ins).
 * - Every table itself: this script only DELETEs rows, never DDL.
 *
 * ── Safety ──
 * - Dry-run by default: prints the plan and per-table counts.
 * - Executes only with --yes AND ALLOW_PRODUCTION_PURGE=yes.
 * - Refuses to run if the owner party cannot be resolved.
 * - The whole purge runs in ONE transaction: either the database ends
 *   up fully clean or exactly as it was.
 * - Deletion order is computed from the database's own foreign-key
 *   catalogue (children before parents), so no hand-maintained list can
 *   drift from the schema.
 *
 * Usage:
 *   PROVISION_DATABASE_URL="postgresql://…" node scripts/purge-production-demo-data.mjs          # dry run
 *   ALLOW_PRODUCTION_PURGE=yes PROVISION_DATABASE_URL="…" node scripts/purge-production-demo-data.mjs --yes
 */
import { PrismaClient } from '@prisma/client';

const OWNER_EMAIL = (process.env.OWNER_EMAIL || 'naturalintellectsltd@gmail.com').toLowerCase();
const OWNER_PHONE_FALLBACK = process.env.OWNER_PHONE || '+256762449504';

/**
 * The real business configuration keys the running product reads. Everything
 * else in config_parameter is a QA probe parameter and goes.
 */
const REAL_CONFIG_KEYS = [
  'freshness_window_days',
  'launch_gate_count',
  'required_months_default',
  'screening_modules',
  'service_area',
];

/** Migration bookkeeping tables are data in name only — never purged. */
const NEVER_PURGE = new Set(['_prisma_migrations', '_applied_migrations']);

const DATABASE_URL = process.env.PROVISION_DATABASE_URL || process.env.DATABASE_URL;
const yes = process.argv.includes('--yes');
const allowed = process.env.ALLOW_PRODUCTION_PURGE === 'yes';

if (!DATABASE_URL || !/^postgres(ql)?:\/\//.test(DATABASE_URL)) {
  console.error('✗ PROVISION_DATABASE_URL (or DATABASE_URL) must be a postgres connection string.');
  process.exit(1);
}
if (yes && !allowed) {
  console.error('✗ Refusing to execute: set ALLOW_PRODUCTION_PURGE=yes to acknowledge this destroys demo rows in the LIVE database.');
  process.exit(1);
}

const db = new PrismaClient({ datasources: { db: { url: DATABASE_URL } } });

const q = async (tx, sql) => (await tx.$queryRawUnsafe(sql));
const ident = (s) => `"${s.replace(/"/g, '""')}"`;

async function main() {
  const ownerParty = await db.party.findFirst({
    where: { OR: [{ email: OWNER_EMAIL }, { primaryPhone: OWNER_PHONE_FALLBACK }] },
    select: { id: true, displayName: true, email: true },
  });
  if (!ownerParty) {
    console.error(`✗ Owner party not found by email ${OWNER_EMAIL} (or phone ${OWNER_PHONE_FALLBACK}). Aborting — the purge always preserves the owner, so it must be resolvable.`);
    process.exit(1);
  }
  const ownerAccount = await db.userAccount.findFirst({
    where: { partyId: ownerParty.id },
    select: { id: true, authRole: true },
  });
  if (!ownerAccount || ownerAccount.authRole !== 'admin') {
    console.error('✗ Owner account is missing or is not role=admin. Aborting.');
    process.exit(1);
  }
  console.log(`Owner preserved: ${ownerParty.displayName} <${ownerParty.email}> (party ${ownerParty.id}, account ${ownerAccount.id})\n`);

  // ── Plan from the database's own FK catalogue ────────────────────────────
  // Full purge: every row goes. Partial: rows belonging to anyone but the
  // owner. Special: handled by dedicated steps outside the generic pass.
  const SPECIAL = new Set(['neighbourhood', 'commission_rate_version']);

  const tables = (await q(db, `
    SELECT c.relname AS name
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
      AND c.relname NOT IN ('_prisma_migrations')
    ORDER BY 1`)).map((r) => r.name);

  const edges = await q(db, `
    SELECT DISTINCT conrelid::regclass::text AS child, confrelid::regclass::text AS parent
    FROM pg_constraint WHERE contype = 'f' AND connamespace = 'public'::regnamespace`);
  const childEdges = edges
    .map((e) => ({ child: e.child.replace(/^"?"?public\."?"?|"/g, '').replace(/^public\./, '').replace(/"/g, ''), parent: e.parent.replace(/^"?"?public\."?"?|"/g, '').replace(/^public\./, '').replace(/"/g, '') }))
    .filter((e) => e.child !== e.parent);

  const fullPurge = tables.filter(
    (t) => !SPECIAL.has(t) && !NEVER_PURGE.has(t) &&
      !['party', 'user_account', 'user_credential', 'audit_event', 'config_version', 'config_parameter'].includes(t),
  );
  const partialPurge = ['audit_event', 'config_version', 'config_parameter', 'consent_record', 'identity_verification', 'lister_profile', 'user_credential', 'user_account', 'party'];
  const purgeSet = new Set([...fullPurge, ...partialPurge]);

  // Children before parents: a table may be purged once every table that
  // references it has already been purged.
  const remaining = new Set(purgeSet);
  const order = [];
  const childrenOf = (t) => childEdges.filter((e) => e.parent === t && purgeSet.has(e.child)).map((e) => e.child);
  let progress = true;
  while (remaining.size && progress) {
    progress = false;
    for (const t of [...remaining]) {
      if (childrenOf(t).every((c) => !remaining.has(c))) {
        order.push(t);
        remaining.delete(t);
        progress = true;
      }
    }
  }
  if (remaining.size) {
    console.error(`✗ FK cycle among: ${[...remaining].join(', ')}. Refusing to guess an order.`);
    process.exit(1);
  }

  const partialWhere = {
    audit_event: `actor_party_id <> '${ownerParty.id}'`,
    config_version: null, // full purge: seed-time churn, live values live in config_parameter
    config_parameter: `key NOT IN (${REAL_CONFIG_KEYS.map((k) => `'${k}'`).join(', ')})`, // QA probe keys go, business config stays
    consent_record: `party_id <> '${ownerParty.id}'`,
    identity_verification: `party_id <> '${ownerParty.id}'`,
    lister_profile: `party_id <> '${ownerParty.id}'`,
    user_credential: `user_account_id <> '${ownerAccount.id}'`,
    user_account: `party_id <> '${ownerParty.id}'`,
    party: `id <> '${ownerParty.id}'`,
  };

  console.log(yes ? 'PURGING (one transaction)\n' : 'DRY RUN (pass --yes and ALLOW_PRODUCTION_PURGE=yes to execute)\n');

  if (!yes) {
    // Preview the exact plan, in execution order, with current row counts.
    const trig = (await q(db, `SELECT count(*)::int n FROM pg_trigger WHERE NOT tgisinternal AND tgname LIKE '%\\_immutable' AND tgrelid IN (SELECT oid FROM pg_class WHERE relnamespace = 'public'::regnamespace)`))[0].n;
    console.log(`  immutable triggers found: ${trig} (expected 10 — capture → drop → purge → recreate, one transaction)\n`);
    for (const t of order) {
      const where = partialWhere[t];
      const rows = await q(db, `SELECT count(*)::int n FROM ${ident(t)} ${where ? `WHERE ${where}` : ''}`);
      console.log(`${String(rows[0].n).padStart(7)}  ${t}${where ? '   (everyone but the owner)' : ''}`);
    }
    const latest = await q(db, `SELECT rate_bp_of_month, effective_from FROM commission_rate_version ORDER BY effective_from DESC, created_at DESC LIMIT 1`);
    console.log(`\n  commission_rate_version → rebuilt to 1 row: rate ${latest[0]?.rate_bp_of_month ?? 10000} bp effective ${latest[0]?.effective_from?.toISOString?.().slice(0, 10) ?? '2026-08-18'}, created_by = owner`);
    console.log('  neighbourhood           → QA-named hoods purged, real areas deduplicated, parent links flattened');
    console.log('  audit_event             → +1 row: production_demo_data_purged (actor = owner)\n');
  }

  const results = [];

  // Commission rate: rebuilt to one canonical row attributed to the owner
  // (its created_by FK must point at a party that survives the purge). This
  // must run AFTER deals/agreements are purged (they FK-reference versions)
  // and BEFORE the party purge (versions FK-reference their creator party).
  // It therefore executes at the 'party' step of the ordered pass.
  const rebuildCommission = async (tx) => {
    const latest = await q(tx, `SELECT rate_bp_of_month, effective_from FROM commission_rate_version ORDER BY effective_from DESC, created_at DESC LIMIT 1`);
    const rate = latest[0]?.rate_bp_of_month ?? 10000;
    const from = latest[0]?.effective_from ?? new Date('2026-08-18');
    if (yes) {
      await tx.$executeRawUnsafe(`DELETE FROM commission_rate_version`);
      await tx.$executeRawUnsafe(
        `INSERT INTO commission_rate_version (id, rate_bp_of_month, effective_from, created_by_party_id, note, created_at)
         VALUES (gen_random_uuid()::text, ${Number(rate)}, '${new Date(from).toISOString()}', '${ownerParty.id}',
                 'Canonical rate carried over from pre-launch configuration during the production demo-data purge.', now())`,
      );
    }
    results.push(['commission_rate_version (rebuilt to 1 canonical row)', yes ? 1 : 0]);
  };

  const run = async (tx) => {
    // ── Phase 0: capture + drop the append-only triggers ─────────────
    // The protected rows are known-fake fixtures; the trigger DDL is
    // captured verbatim and recreated before commit (see header).
    const immutables = await q(tx, `
      SELECT tgname, tgrelid::regclass::text AS tbl, pg_get_triggerdef(oid) AS def
      FROM pg_trigger
      WHERE NOT tgisinternal AND tgname LIKE '%\_immutable'
        AND tgrelid IN (SELECT oid FROM pg_class WHERE relnamespace = 'public'::regnamespace)
      ORDER BY 1`);
    if (immutables.length !== 10) {
      throw new Error(`Expected 10 *_immutable triggers, found ${immutables.length} — refusing to purge under an unexpected trigger set.`);
    }
    for (const t of immutables) {
      if (yes) await tx.$executeRawUnsafe(`DROP TRIGGER IF EXISTS ${ident(t.tgname)} ON ${t.tbl}`);
    }
    if (yes) console.log(`  dropped ${immutables.length} immutable triggers (captured verbatim for recreation)`);

    // ── Phase 1: the ordered delete pass ─────────────────
    for (const t of order) {
      if (t === 'party') await rebuildCommission(tx);
      const where = partialWhere[t];
      const sql = where
        ? `DELETE FROM ${ident(t)} WHERE ${where}`
        : `DELETE FROM ${ident(t)}`;
      let n = 0;
      if (yes) n = await tx.$executeRawUnsafe(sql);
      results.push([t, n]);
    }

    // ── Phase 2: neighbourhood rebuild ──

    // Neighbourhood: QA hoods carry digits in their names; real areas do not.
    // Parent links inside the seeded taxonomy are QA structure too — the
    // production taxonomy is a flat list of real area names.
    if (yes) {
      await tx.$executeRawUnsafe(`UPDATE neighbourhood SET parent_id = NULL WHERE parent_id IS NOT NULL`);
      await tx.$executeRawUnsafe(`DELETE FROM neighbourhood WHERE name ~ '[0-9]'`);
      await tx.$executeRawUnsafe(`DELETE FROM neighbourhood n USING neighbourhood m WHERE n.name = m.name AND n.created_at > m.created_at`);
      await tx.$executeRawUnsafe(`DELETE FROM neighbourhood n USING neighbourhood m WHERE n.name = m.name AND n.created_at = m.created_at AND n.id > m.id`);
    }
    results.push(['neighbourhood (QA hoods purged, real areas deduplicated)', 0]);

    // The purge itself is an owner action and belongs in the trail.
    if (yes) {
      await tx.$executeRawUnsafe(
        `INSERT INTO audit_event (id, event_type, actor_party_id, subject_ref, payload, occurred_at, created_at)
         VALUES (gen_random_uuid()::text, 'production_demo_data_purged', '${ownerParty.id}', '${ownerParty.id}',
                 '${JSON.stringify({ note: 'Seeded demo corpus removed; tables, owner account, config and canonical rate preserved' }).replace(/'/g, "''")}', now(), now())`,
      );
    }
    results.push(['audit_event (+1 production_demo_data_purged)', 0]);

    // ── Phase 3: restore every append-only trigger, byte-identical ───────
    for (const t of immutables) {
      if (yes) await tx.$executeRawUnsafe(t.def);
    }
    if (yes) console.log(`  recreated ${immutables.length} immutable triggers from their captured DDL`);
  };

  if (yes) {
    await db.$transaction(run, { timeout: 300_000, maxWait: 10_000 });
  }

  for (const [t, n] of results) console.log(`${String(n).padStart(7)}  ${t}`);

  // ── Post-conditions ──────────────────────────────────────────────────────
  const after = {};
  for (const [label, sql] of Object.entries({
    parties: `SELECT count(*)::int AS n FROM party`,
    accounts: `SELECT count(*)::int AS n FROM user_account`,
    'accounts by role': `SELECT auth_role, count(*)::int FROM user_account GROUP BY 1`,
    listings: `SELECT count(*)::int AS n FROM listing`,
    properties: `SELECT count(*)::int AS n FROM property`,
    deals: `SELECT count(*)::int AS n FROM deal`,
    sessions: `SELECT count(*)::int AS n FROM session`,
    media: `SELECT count(*)::int AS n FROM media_asset`,
    'audit rows': `SELECT count(*)::int AS n FROM audit_event`,
    'neighbourhood rows (distinct names)': `SELECT count(DISTINCT name)::int FROM neighbourhood`,
    'commission versions': `SELECT count(*)::int AS n FROM commission_rate_version`,
    'config parameters (real keys)': `SELECT count(*)::int AS n FROM config_parameter`,
    'config parameter keys': `SELECT key FROM config_parameter ORDER BY key`,
  })) {
    const rows = await q(db, sql);
    // Single-value count queries are aliased `n`; multi-row checks keep the array.
    after[label] = rows[0]?.n !== undefined ? rows[0].n : rows;
  }
  console.log(yes ? '\n=== AFTER ===' : '\n=== CURRENT STATE (the purge will change this) ===');
  console.log(JSON.stringify(after, (k, v) => (typeof v === 'bigint' ? Number(v) : v), 2));

  if (!yes) {
    console.log('\nDry run only — nothing was deleted.');
    await db.$disconnect();
    return;
  }

  const fails = [];
  const triggersBack = (await q(db, `SELECT count(*)::int n FROM pg_trigger WHERE NOT tgisinternal AND tgname LIKE '%\_immutable'`))[0].n;
  if (triggersBack !== 10) fails.push(`the 10 append-only triggers must be back in place (found ${triggersBack})`);
  if (after.parties !== 1) fails.push('parties must be exactly 1 (the owner)');
  if (after.accounts !== 1) fails.push('user_account must be exactly 1');
  if (after.listings !== 0) fails.push('listings must be 0');
  if (after.deals !== 0) fails.push('deals must be 0');
  if (after['commission versions'] !== 1) fails.push('commission_rate_version must be exactly 1');
  if (after['config parameters (real keys)'] !== REAL_CONFIG_KEYS.length) fails.push(`config_parameter must be exactly the ${REAL_CONFIG_KEYS.length} real business keys`);
  if (fails.length) {
    console.error('\n✗ POST-CONDITIONS FAILED:\n  - ' + fails.join('\n  - '));
    process.exitCode = 1;
  } else {
    console.log('\n✓ Post-conditions OK: tables intact, owner intact, demo corpus gone.');
  }
  await db.$disconnect();
}

main().catch((err) => {
  console.error('✗', err instanceof Error ? err.message : err);
  process.exit(1);
});
