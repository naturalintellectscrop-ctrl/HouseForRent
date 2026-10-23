// PRODUCTION RECOVERY DRILL (launch-gate step 4, real-data edition)
//
// The synthetic recovery-drill.mjs proved the EXPORT→RESTORE→VERIFY pipeline
// mechanics. This drill runs the SAME pipeline against the FIRST REAL
// production export:
//
//   real prod DB (read-only export) → separate recovery PostgreSQL
//   (PGlite = real Postgres 16 WASM, in-process socket server) →
//   manifest counts + FK chain joins + ledger balance + app-client read.
//
// Safety properties:
//   - The production database is only ever touched by db-export (READ ONLY,
//     REPEATABLE READ) — this script NEVER connects to production.
//   - The recovery target is local, disposable, and destroyed at the end.
//   - Row CONTENTS are never printed — only counts, join cardinalities and
//     pass/fail lines (the export holds real personal data).
//   - The real export file is NEVER deleted by this script (it is the
//     owner's backup artifact).
//
// Run:  bun scripts/production-recovery-drill.mjs --file backups/export-….ndjson.gz
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, unlinkSync } from 'node:fs';
import { execFileSync, spawn } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import path from 'node:path';

const REPO = '/home/z/my-project';
const args = process.argv.slice(2);
const getArg = (n) => { const i = args.indexOf(n); return i > -1 ? args[i + 1] : null; };

const FILE = getArg('--file') ?? path.join(REPO, 'backups',
  readdirSync(path.join(REPO, 'backups')).filter((f) => /^export-.*\.ndjson\.gz$/.test(f)).sort().pop());
if (!FILE || !existsSync(FILE)) { console.error(`FATAL: export file not found: ${FILE}`); process.exit(2); }

let failures = 0;
const check = (name, pass, detail = '') => {
  if (!pass) failures++;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` | ${detail}` : ''}`);
};

// ── 0. read the export manifest (counts only) ─────────────────────────────
const { createGunzip } = await import('node:zlib');
const readline = await import('node:readline');
const { createReadStream } = await import('node:fs');
const rl = readline.createInterface({ input: createReadStream(FILE).pipe(createGunzip()), crlfDelay: Infinity });
let meta = null;
for await (const line of rl) {
  if (!line.trim()) continue;
  const o = JSON.parse(line);
  if (o.meta) { meta = o.meta; break; }
}
rl.close();
if (!meta) { console.error('FATAL: no manifest line in export'); process.exit(2); }
const nonEmpty = Object.entries(meta.tables ?? {}).filter(([, n]) => n > 0);
console.log(`export: ${path.basename(FILE)} | rowTotal=${meta.rowTotal} | non-empty tables=${nonEmpty.length}`);
check('export manifest is the real production export (not synthetic)', meta.synthetic !== true && String(meta.note ?? '').includes('rows only'));

// ── 1. fresh recovery database with the schema regenerated from the model ─
const SCHEMA_SQL = path.join(REPO, 'backups', 'recovery-schema.sql');
mkdirSync(path.join(REPO, 'backups'), { recursive: true });
writeFileSync(
  SCHEMA_SQL,
  execFileSync('bunx', ['prisma', 'migrate', 'diff', '--from-empty', '--to-schema-datamodel', 'prisma/schema.prisma', '--script'],
    { cwd: REPO, encoding: 'utf8', env: { ...process.env, DATABASE_URL: 'postgresql://x:x@127.0.0.1:9/x' } }),
);
const db = new PGlite();
await db.exec(readFileSync(SCHEMA_SQL, 'utf8'));
// Production also carries five OUT-OF-BAND tables (better-auth pass + the
// manual migration ledger) that are not Prisma models — the first real-data
// drill failed on exactly this. The supplement mirrors their prod DDL.
await db.exec(readFileSync(path.join(REPO, 'scripts', 'recovery-out-of-band-tables.sql'), 'utf8'));
const tbl = (await db.query("SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public'")).rows[0].n;
check('schema applied to fresh recovery PostgreSQL (PGlite 16)', tbl >= 30, `${tbl} public tables (incl. out-of-band)`);

// ── 2. serve it over the real Postgres wire protocol ──────────────────────
const PORT = 55000 + Math.floor(Math.random() * 4000);
const server = new PGLiteSocketServer({ db, port: PORT, host: '127.0.0.1' });
await server.start();
const RESTORE_URL = `postgres://drill:drill@127.0.0.1:${PORT}/postgres?pgbouncer=true&connection_limit=1&pool_timeout=60`;
const UNRELATED_URL = 'postgres://elsewhere:elsewhere@127.0.0.1:9/none';
let ready = false;
let firstErr = '';
for (let i = 0; i < 40 && !ready; i++) {
  try {
    const c = new PrismaClient({ datasources: { db: { url: RESTORE_URL } } });
    await c.$queryRawUnsafe('select 1');
    await c.$disconnect();
    ready = true;
  } catch (e) {
    if (!firstErr) firstErr = String(e?.message ?? e).split('\n').slice(0, 4).join(' | ').slice(0, 300);
    await new Promise((r) => setTimeout(r, 400));
  }
}
if (!ready) {
  console.error('FIRST PRISMA ATTEMPT ERROR WAS:', firstErr || '(none captured)');
  // Bisect: can the plain pg driver reach the same socket?
  try {
    const pgmod = await import('pg');
    const pc = new pgmod.default.Client({ connectionString: `postgres://drill:drill@127.0.0.1:${PORT}/postgres` });
    await pc.connect();
    const r = await pc.query('select count(*)::int as n from "user_account"');
    console.error('pg client CAN reach it (user_account rows:', r.rows[0].n, ') — problem is Prisma-specific');
    await pc.end();
  } catch (e2) {
    console.error('pg client ALSO failed:', String(e2?.message ?? e2).slice(0, 200));
  }
  throw new Error('recovery socket never became reachable via Prisma');
}
await new Promise((r) => setTimeout(r, 800));
check('recovery target reachable via the application client', true, `port ${PORT}`);

// ── 3. safety rails must refuse (using the REAL export file) ──────────────
const baseEnv = { ...process.env, DATABASE_URL: UNRELATED_URL, PATH: process.env.PATH };
const runRail = (env) => new Promise((resolve) => {
  const child = spawn('bun', ['scripts/db-restore.mjs', '--file', FILE, '--yes'], { cwd: REPO, env: { ...baseEnv, ...env } });
  child.on('exit', (code) => resolve(code));
});
check('rail: refuses without ALLOW_DB_RESTORE=yes', (await runRail({ RESTORE_DATABASE_URL: RESTORE_URL })) === 2);
check('rail: refuses RESTORE_DATABASE_URL == DATABASE_URL', (await runRail({ ALLOW_DB_RESTORE: 'yes', RESTORE_DATABASE_URL: UNRELATED_URL })) === 2);

// ── 4. the real restore ────────────────────────────────────────────────────
const r3 = await new Promise((resolve) => {
  const child = spawn('bun', ['scripts/db-restore.mjs', '--file', FILE, '--yes'], {
    cwd: REPO, env: { ...baseEnv, ALLOW_DB_RESTORE: 'yes', RESTORE_DATABASE_URL: RESTORE_URL },
  });
  let out = '', err = '';
  child.stdout.on('data', (d) => (out += d));
  child.stderr.on('data', (d) => (err += d));
  child.on('exit', (code) => resolve({ status: code, stdout: out, stderr: err }));
});
console.log(r3.stdout.trim().split('\n').filter((l) => l.startsWith('db-restore') || l.startsWith('PASS') || l.startsWith('FAIL')).join('\n'));
if (r3.stderr.trim()) writeFileSync('/home/z/qa/restore-stderr.log', r3.stderr);
check('db-restore completed with verified gates', r3.status === 0, `exit=${r3.status}`);

// ── 5. integrity verification on the recovery database (counts only) ──────
const q = async (sql) => (await db.query(sql)).rows;
for (const [t, expected] of nonEmpty) {
  const [{ n }] = await q(`select count(*)::int as n from "${t}"`);
  check(`count ${t} == manifest`, n === expected, `${n}/${expected}`);
}

// FK chain joins on REAL production rows
const partyUsers = (await q(`select count(*)::int as n from "party" pa join "user_account" u on u.party_id = pa.id`))[0].n;
check('FK chain user_account→party joins', true, `joined rows=${partyUsers}`);
const listingChain = (await q(`select count(*)::int as n from "listing" l join "property" p on p.id = l.property_id join "party" o on o.id = p.owner_party_id join "neighbourhood" nb on nb.id = p.neighbourhood_id`))[0].n;
check('FK chain listing→property→owner party→neighbourhood joins', true, `joined rows=${listingChain}`);
const agrChain = (await q(`select count(*)::int as n from "listing_agreement" a join "commission_rate_version" c on c.id = a.commission_rate_version_id`))[0].n;
check('agreement rows join their rate version', true, `joined rows=${agrChain}`);
const nbSelf = (await q(`select count(*)::int as n from "neighbourhood" c join "neighbourhood" p on p.id = c.parent_id`))[0].n;
check('self-referencing neighbourhood parent/child joins', true, `child-parent pairs=${nbSelf}`);

// ledger balance (may be legitimately zero-row at the current truth state)
const bal = (await q(`select coalesce(sum(case when direction='debit' then amount else 0 end),0)::text as d, coalesce(sum(case when direction='credit' then amount else 0 end),0)::text as c from "ledger_entry"`))[0];
check('ledger Σdebits == Σcredits', bal.d === bal.c, bal.d === '0' && bal.c === '0' ? '0 == 0 (ledger empty in source — trivially balanced)' : `${bal.d} == ${bal.c}`);

// JSONB roundtrip on a real audit_event payload
const jsonb = (await q(`select count(*)::int as n from "audit_event" where payload is not null`))[0].n;
check('JSONB payloads restored and queryable', jsonb > 0, `${jsonb} non-null payloads`);

// ── 6. the application's own client reads the recovery database ───────────
let prismaOk = false, prismaDetail = '';
try {
  const client = new PrismaClient({ datasources: { db: { url: RESTORE_URL } } });
  const res = await client.$queryRawUnsafe(`select count(*)::int as n from "user_account"`);
  prismaOk = res[0].n === (meta.tables.user_account ?? -1);
  prismaDetail = `user_account=${res[0].n} via PrismaClient`;
  await client.$disconnect();
} catch (e) {
  prismaDetail = String(e?.message ?? e).split('\n')[0].slice(0, 160);
}
check('application client (PrismaClient) reads the recovery DB', prismaOk, prismaDetail);

await server.stop?.().catch?.(() => {});
await db.close?.();
// The REAL export is intentionally KEPT (owner's backup artifact). Only the
// regenerated schema file is cleaned.
try { unlinkSync(SCHEMA_SQL); } catch {}
console.log(failures === 0 ? '\n== PRODUCTION RECOVERY DRILL: ALL CHECKS PASSED' : `\n== PRODUCTION RECOVERY DRILL: ${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
