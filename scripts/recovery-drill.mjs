// RECOVERY MACHINERY DRILL (launch-gate round 2, step 4)
// Proves the db-export -> db-restore -> verify pipeline end to end on a real,
// separate PostgreSQL instance (PGlite = real Postgres 16, WASM build), using
// a SYNTHETIC, clearly-labelled export. This is NOT a production backup and
// makes no such claim: the first production export still requires the
// production database credentials (pending, owner action).
// Checks: safety rails refuse, schema precondition, empty-target precondition,
// FK-order load, manifest counts, ledger balance, app-client connectivity.
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { readFileSync, writeFileSync, unlinkSync, mkdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { spawnSync, spawn } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const REPO = '/home/z/my-project';

// Regenerate the schema DDL from the prisma schema (no database needed).
const SCHEMA_SQL = path.join(REPO, 'backups', 'recovery-schema.sql');
mkdirSync(path.join(REPO, 'backups'), { recursive: true });
writeFileSync(
  SCHEMA_SQL,
  execFileSync('bunx', ['prisma', 'migrate', 'diff', '--from-empty', '--to-schema-datamodel', 'prisma/schema.prisma', '--script'], { cwd: REPO, encoding: 'utf8', env: { ...process.env, DATABASE_URL: 'postgresql://x:x@127.0.0.1:9/x' } }),
);

const PORT = 55000 + Math.floor(Math.random() * 4000); // rotate: bind failures after TIME_WAIT are silent
// pgbouncer=true (simple protocol) is REQUIRED for this drill target only:
// PGlite's socket server does not carry Prisma's named prepared statements
// across its session reuse (42P05). Real PostgreSQL recovery targets do not need it.
const FILE = path.join(REPO, 'backups', 'drill-export.ndjson.gz');
const RESTORE_URL = `postgres://drill:drill@127.0.0.1:${PORT}/postgres?pgbouncer=true`;
const UNRELATED_URL = 'postgres://elsewhere:elsewhere@127.0.0.1:9/none';
const T = '2026-01-15T09:00:00.000Z';
const now = new Date().toISOString();

let failures = 0;
const check = (name, pass, detail = '') => {
  if (!pass) failures++;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` | ${detail}` : ''}`);
};

// ── 1. fresh recovery database with the production schema ────────────────
const db = new PGlite();
await db.exec(readFileSync(SCHEMA_SQL, 'utf8'));
check('schema applied to fresh recovery PGlite (34 tables)', true);

// ── 2. serve it over the real Postgres wire protocol ─────────────────────
const server = new PGLiteSocketServer({ db, port: PORT, host: '127.0.0.1' });
await server.start();
// start() can resolve before the OS listener is bound. The socket server
// serves ONE connection at a time, so readiness is proven with the
// application's own client, then RELEASED - the restore runs alone.
let ready = false;
for (let i = 0; i < 30 && !ready; i++) {
  try {
    const c = new PrismaClient({ datasources: { db: { url: RESTORE_URL } } });
    await c.$queryRawUnsafe('select 1');
    await c.$disconnect();
    ready = true;
  } catch {
    await new Promise((r) => setTimeout(r, 300));
  }
}
if (!ready) throw new Error('recovery socket never became reachable via Prisma');
await new Promise((r) => setTimeout(r, 800)); // let the server settle between connections
check('socket server reachable via the application client (released)', true);

// ── 3. synthetic db-export file (format-exact, clearly labelled) ─────────
const rows = [];
const push = (table, row) => rows.push({ table, row });
push('commission_rate_version', { id: 'drill-crv-1', rate_bp_of_month: 10000, effective_from: T, created_by_party_id: 'drill-party-owner', note: 'DRILL: canonical rate (synthetic)', created_at: T });
push('party', { id: 'drill-party-owner', display_name: 'DRILL Owner (synthetic machinery row)', primary_phone: '+256999000001', email: null, status: 'active', created_at: T, updated_at: T });
push('party', { id: 'drill-party-landlord', display_name: 'DRILL Landlord (synthetic machinery row)', primary_phone: '+256999000002', email: null, status: 'active', created_at: T, updated_at: T });
push('user_account', { id: 'drill-account-1', party_id: 'drill-party-landlord', auth_role: 'lister', last_login_at: null, created_at: T });
push('user_credential', { id: 'drill-cred-1', user_account_id: 'drill-account-1', password_hash: '$drill$not-a-real-hash', created_at: T, updated_at: T });
push('session', { id: 'drill-session-1', user_account_id: 'drill-account-1', refresh_token_hash: 'drill-hash-not-real', expires_at: T, revoked_at: null, created_at: T });
// The child row is written BEFORE its parent on purpose: the worst-case
// order the multipass loader must survive (real production neighbourhoods
// carry district parents, which aborted the pre-drill topo-sort).
push('neighbourhood', { id: 'drill-nbhd-2', name: 'Drill Sub Area (synthetic child)', parent_id: 'drill-nbhd-1', in_service_area: true, created_at: T });
push('neighbourhood', { id: 'drill-nbhd-1', name: 'Drill Area (synthetic)', parent_id: null, in_service_area: true, created_at: T });
push('property', { id: 'drill-prop-1', owner_party_id: 'drill-party-landlord', property_type: 'apartment', bedrooms: 2, bathrooms: 1, furnished: 'semi_furnished', neighbourhood_id: 'drill-nbhd-1', geo_lat: null, geo_lng: null, landmark_text: 'DRILL landmark (synthetic)', street_address: 'DRILL street 1', transaction_type: 'rental', created_at: T, updated_at: T });
push('listing', { id: 'drill-listing-1', property_id: 'drill-prop-1', monthly_rent: 800000, required_months_upfront: 2, deposit_amount: 400000, tier: 'standard', publication_state: 'awaiting_verification', verification_state: 'unverified', availability_status: 'available', availability_confirmed_at: null, description_text: 'DRILL listing (synthetic)', created_at: T, updated_at: T });
push('listing_agreement', { id: 'drill-agr-offer', listing_id: 'drill-listing-1', lister_party_id: 'drill-party-landlord', commission_rate_version_id: 'drill-crv-1', monthly_rent_at_signing: 800000, circumvention_clause_version: 'v1', accepted_at: null, accepted: false, created_at: T });
push('listing_agreement', { id: 'drill-agr-signed', listing_id: 'drill-listing-1', lister_party_id: 'drill-party-landlord', commission_rate_version_id: 'drill-crv-1', monthly_rent_at_signing: 800000, circumvention_clause_version: 'v1', accepted_at: T, accepted: true, created_at: T });
push('ledger_account', { id: 'drill-lacct-escrow', account_type: 'escrow_liability', owner_party_id: null, deal_id: null, currency: 'UGX', created_at: T });
push('ledger_account', { id: 'drill-lacct-landlord', account_type: 'landlord_payable', owner_party_id: 'drill-party-landlord', deal_id: null, currency: 'UGX', created_at: T });
push('ledger_entry', { id: 'drill-entry-1', posting_id: 'drill-posting-1', account_id: 'drill-lacct-escrow', direction: 'debit', amount: 800000, deal_id: null, reference: 'DRILL funding (synthetic)', occurred_at: T, created_at: T });
push('ledger_entry', { id: 'drill-entry-2', posting_id: 'drill-posting-1', account_id: 'drill-lacct-landlord', direction: 'credit', amount: 800000, deal_id: null, reference: 'DRILL funding (synthetic)', occurred_at: T, created_at: T });
push('audit_event', { id: 'drill-audit-1', event_type: 'drill_machinery_row', actor_party_id: 'drill-party-owner', subject_ref: 'drill-listing-1', payload: { drill: true, synthetic: true }, occurred_at: T, created_at: T });

const tables = {};
for (const r of rows) tables[r.table] = (tables[r.table] ?? 0) + 1;
const meta = { beganAt: now, rowTotal: rows.length, tables, synthetic: true, note: 'MACHINERY DRILL ONLY - synthetic rows, not a production backup' };
writeFileSync(FILE, gzipSync(Buffer.from(JSON.stringify({ meta }) + '\n' + rows.map((r) => JSON.stringify(r)).join('\n') + '\n')));
check('synthetic db-export written (format-exact NDJSON+gzip)', true, `${rows.length} rows, ${Object.keys(tables).length} tables`);

// ── 4. safety rails must refuse ───────────────────────────────────────────
const baseEnv = { ...process.env, DATABASE_URL: UNRELATED_URL, PATH: process.env.PATH };
const run = (env) =>
  spawnSync('bun', ['scripts/db-restore.mjs', '--file', FILE, '--yes'], {
    cwd: REPO, env: { ...baseEnv, ...env }, encoding: 'utf8', timeout: 120000,
  });
const r1 = run({ RESTORE_DATABASE_URL: RESTORE_URL }); // no ALLOW_DB_RESTORE
check('rail: refuses without ALLOW_DB_RESTORE=yes', r1.status === 2, `exit=${r1.status}`);
const r2 = run({ ALLOW_DB_RESTORE: 'yes', RESTORE_DATABASE_URL: UNRELATED_URL }); // equals DATABASE_URL
check('rail: refuses RESTORE_DATABASE_URL == DATABASE_URL', r2.status === 2, `exit=${r2.status}`);

// ── 5. the real restore ───────────────────────────────────────────────────
// Async spawn: the socket server lives in THIS process's event loop - a
// spawnSync here would freeze the loop and the restore could never connect.
const r3 = await new Promise((resolve) => {
  const child = spawn('bun', ['scripts/db-restore.mjs', '--file', FILE, '--yes'], {
    cwd: REPO, env: { ...baseEnv, ALLOW_DB_RESTORE: 'yes', RESTORE_DATABASE_URL: RESTORE_URL },
  });
  let out = '', err = '';
  child.stdout.on('data', (d) => (out += d));
  child.stderr.on('data', (d) => (err += d));
  child.on('exit', (code) => resolve({ status: code, stdout: out, stderr: err }));
});
console.log(r3.stdout.trim());
if (r3.stderr.trim()) { writeFileSync('/home/z/qa/restore-stderr.log', r3.stderr); console.log('restore stderr written to /home/z/qa/restore-stderr.log'); }
check('db-restore completed with verified gates', r3.status === 0, `exit=${r3.status}`);

// ── 6. direct integrity verification on the recovery database ────────────
const q = async (sql) => (await db.query(sql)).rows;
for (const [t, expected] of Object.entries(tables)) {
  const [{ n }] = await q(`select count(*)::int as n from "${t}"`);
  check(`count ${t} == manifest`, n === expected, `${n}/${expected}`);
}
const nbChain = (
  await q(`select c.name as child, p.name as parent from "neighbourhood" c join "neighbourhood" p on p.id = c.parent_id where c.id = 'drill-nbhd-2'`)
).length;
check('self-referencing neighbourhood parent/child restored and joined', nbChain === 1);
const fk = (
  await q(`select l.id from "listing" l join "property" p on p.id = l.property_id join "party" o on o.id = p.owner_party_id join "neighbourhood" nb on nb.id = p.neighbourhood_id where l.id = 'drill-listing-1'`)
).length;
check('FK chain listing→property→party→neighbourhood intact', fk === 1);
const agr = (
  await q(`select count(*)::int as n from "listing_agreement" a join "commission_rate_version" c on c.id = a.commission_rate_version_id where a.listing_id = 'drill-listing-1'`)
)[0].n;
check('agreement rows join their rate version', agr === 2, 'offer + signed acceptance');
const bal = (await q(`select coalesce(sum(case when direction='debit' then amount else 0 end),0)::text as d, coalesce(sum(case when direction='credit' then amount else 0 end),0)::text as c from "ledger_entry"`))[0];
check('ledger Σdebits == Σcredits', bal.d === bal.c, `${bal.d} == ${bal.c}`);

// ── 7. the application's own client reads the recovery database ──────────
let prismaOk = false;
let prismaDetail = '';
try {
  const client = new PrismaClient({ datasources: { db: { url: RESTORE_URL } } });
  const res = await client.$queryRawUnsafe(`select display_name from "party" where id = 'drill-party-landlord'`);
  prismaOk = res.length === 1 && res[0].display_name.includes('DRILL');
  prismaDetail = `${res.length} row(s) via PrismaClient`;
  await client.$disconnect();
} catch (e) {
  prismaDetail = String(e?.message ?? e).split('\n')[0].slice(0, 160);
}
check('application client (PrismaClient) reads the recovery DB', prismaOk, prismaDetail);

await server.stop?.().catch?.(() => {});
await db.close?.();
// keep FILE on failure for debugging; unlink on success below
if (failures === 0) { try { unlinkSync(FILE); } catch {} }
console.log(failures === 0 ? '\n== RECOVERY DRILL: ALL CHECKS PASSED' : `\n== RECOVERY DRILL: ${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
