// ISOLATED TEST RIG - disposable local environment for browser E2E.
//
// Boots the FULL application stack against a private PGlite database and
// LEAVES IT RUNNING so a human or browser agent can drive the real UI:
//   PGlite (real Postgres WASM) over the wire protocol on :5511
//   + `next dev` (Turbopack) on :3111 with MEDIA_STORAGE=local
//
// What it seeds (FIXTURES ONLY - the workflows under test run through the
// real application, never through these rows):
//   - one in-service neighbourhood
//   - one platform ADMIN ("QA Platform Admin") with a printed test password
//
// Test credentials are written to .env.test-rig (gitignored via .env*).
// Nothing here ever touches the production database.
//
// Usage:   bun scripts/test-rig.mjs        (boot; Ctrl-C or scripts/test-rig-down.mjs)
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { readFileSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { execFileSync, spawn } from 'node:child_process';
import path from 'node:path';
import bcrypt from 'bcryptjs';

const REPO = '/home/z/my-project';
const PORT_DB = 5511;
const PORT_APP = 3111;
const API = `http://127.0.0.1:${PORT_APP}/api/v1`;
const MEDIA_ROOT = '/tmp/hfr-media-rig-' + Date.now();

// Unique, clearly-labelled test identities. The suffix changes per boot so
// re-running the rig never collides with a previous boot's rows.
const RUN = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12);
const ADMIN = {
  displayName: `QA Platform Admin ${RUN}`,
  primaryPhone: `+25677000${RUN.slice(-5)}`,
  password: 'qa-' + Math.random().toString(36).slice(2, 10) + '-rig',
};

// ── schema straight from the current model ──────────────────────────────────
mkdirSync(path.join(REPO, 'backups'), { recursive: true });
mkdirSync(path.join(REPO, 'db'), { recursive: true });
const SCHEMA_SQL = path.join(REPO, 'backups', 'rig-schema.sql');
const DDL = execFileSync(
  'bunx',
  ['prisma', 'migrate', 'diff', '--from-empty', '--to-schema-datamodel', 'prisma/schema.prisma', '--script'],
  { cwd: REPO, encoding: 'utf8', env: { ...process.env, DATABASE_URL: 'postgresql://x:x@127.0.0.1:9/x' } },
);
writeFileSync(SCHEMA_SQL, DDL);

const db = new PGlite();
await db.exec(readFileSync(SCHEMA_SQL, 'utf8'));
const server = new PGLiteSocketServer({ db, port: PORT_DB, host: '127.0.0.1', maxConnections: 4 });
await server.start();

// ── fixtures (setup only) ───────────────────────────────────────────────────
await db.query(
  `INSERT INTO neighbourhood (id, name, parent_id, in_service_area, created_at)
   VALUES ('rig-nbhd-1', 'Rig Central', NULL, true, now())`,
);
const adminHash = bcrypt.hashSync(ADMIN.password, 10);
const adminParty = await db.query(
  `INSERT INTO party (id, display_name, primary_phone, status, created_at, updated_at)
   VALUES (gen_random_uuid(), $1, $2, 'active', now(), now()) RETURNING id`,
  [ADMIN.displayName, ADMIN.primaryPhone],
);
const adminPartyId = adminParty.rows[0].id;
const adminAccount = await db.query(
  `INSERT INTO user_account (id, party_id, auth_role, created_at)
   VALUES (gen_random_uuid(), $1, 'admin', now()) RETURNING id`,
  [adminPartyId],
);
await db.query(
  `INSERT INTO user_credential (id, user_account_id, password_hash, created_at, updated_at)
   VALUES (gen_random_uuid(), $1, $2, now(), now())`,
  [adminAccount.rows[0].id, adminHash],
);
await db.query(
  `INSERT INTO audit_event (id, actor_party_id, event_type, subject_ref, payload, occurred_at)
   VALUES (gen_random_uuid(), $1, 'platform_owner_provisioned', $2, '{"note":"isolated test rig fixture"}', now())`,
  [adminPartyId, adminAccount.rows[0].id],
);

// ── the application server ──────────────────────────────────────────────────
try { execFileSync('fuser', ['-k', `${PORT_APP}/tcp`], { stdio: 'ignore' }); } catch {}
try { execFileSync('fuser', ['-k', `${PORT_DB}/tcp`], { stdio: 'ignore' }); } catch {}

const app = spawn('bunx', ['next', 'dev', '-p', String(PORT_APP)], {
  cwd: REPO,
  detached: true,
  env: {
    ...process.env,
    DATABASE_URL: `postgres://rig:rig@127.0.0.1:${PORT_DB}/postgres?pgbouncer=true&connection_limit=1&pool_timeout=60`,
    // Own build dir: the main dev server holds .next/dev/lock, so a second
    // instance in the same repo needs its own (next.config.ts honours this).
    NEXT_DIST_DIR: '.next-rig',
    MEDIA_STORAGE: 'local',
    MEDIA_ROOT,
    NODE_ENV: 'development',
    NEXT_TELEMETRY_DISABLED: '1',
  },
});
let appLog = '';
app.stdout.on('data', (d) => (appLog += d));
app.stderr.on('data', (d) => (appLog += d));

let appReady = false;
for (let i = 0; i < 90 && !appReady; i++) {
  try {
    const r = await fetch(`${API}/listings`, { signal: AbortSignal.timeout(2500) });
    if (r.status === 200) appReady = true;
  } catch {}
  if (!appReady) await new Promise((r) => setTimeout(r, 1000));
}
if (!appReady) {
  console.error('RIG FAILED TO BOOT - last app log:');
  console.error(appLog.slice(-3000));
  process.exit(1);
}

const creds = [
  '# House For Rent - isolated test rig credentials (LOCAL ONLY, gitignored)',
  `# Rig URL      : http://127.0.0.1:${PORT_APP}`,
  `# Admin        : ${ADMIN.primaryPhone}  (${ADMIN.displayName})`,
  `# Admin pass   : ${ADMIN.password}`,
  `# Admin party  : ${adminPartyId}`,
  '# Landlord / tenant applicants: register through the real /register UI.',
  '# Teardown: bun scripts/test-rig-down.mjs',
  '',
].join('\n');
writeFileSync(path.join(REPO, '.env.test-rig'), creds);
rmSync(SCHEMA_SQL, { force: true });

console.log('RIG READY');
console.log(`  app        : http://127.0.0.1:${PORT_APP}`);
console.log(`  admin      : ${ADMIN.primaryPhone} / ${ADMIN.password}`);
console.log(`  creds file : .env.test-rig (gitignored)`);
console.log('  the rig keeps running; stop it with scripts/test-rig-down.mjs');

// Keep the process alive so the socket server stays up.
setInterval(() => {}, 60_000);
