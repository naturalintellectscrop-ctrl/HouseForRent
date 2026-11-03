// DEAL-UNIQUENESS REGRESSION SUITE (migration 20261028120000 compatibility).
//
// Boots the FULL application stack on a private, disposable rig —
// PGlite (real Postgres 16 WASM) over the wire protocol + `next dev` —
// applies the AMENDED active-deal migration file to the rig, and proves the
// code and the index agree on what "one ACTIVE deal per introduction" means.
// Nothing touches production; no real money (no payment provider is invoked).
//
// Scenarios (owner brief, 2026-11-02) as executed evidence:
//   1-4  a CLOSED / CANCELLED / REFUNDED / REVERSED deal does not prevent a
//        new deal from the same introduction — at the DB layer (raw insert
//        succeeds against the index) AND through the real API (201). The
//        REVERSED case is the regression that motivated the amendment: the
//        original draft predicate omitted `reversed`, so a provider-clawback
//        terminal state would have permanently blocked the code-permitted
//        retry and surfaced as an unhandled unique violation.
//   5    an ACTIVE deal still prevents a second active deal — DB layer (the
//        index raises 23505 naming deal_one_active_per_introduction) and API
//        layer (typed 409 DEAL_ALREADY_EXISTS via the pre-check).
//   6    a uniqueness RACE returns a typed 409, never an opaque 500 —
//        concurrent creates on one introduction: exactly one 201, every
//        loser a 409 DEAL_ALREADY_EXISTS, and exactly one active deal row
//        survives in the database.
//   7    unrelated uniqueness violations keep their own error handling —
//        duplicate-phone registration still answers its established
//        409 PHONE_TAKEN (never DEAL_ALREADY_EXISTS, never a 500).
//
// The rig schema is regenerated from prisma/schema.prisma (which cannot
// model the partial index) and the migration file is then applied verbatim —
// so the suite also proves the amended SQL parses and applies cleanly on a
// schema-fresh database, and asserts the applied indexdef lists all four
// terminal statuses from src/server/domain.ts TERMINAL_STATUSES.
//
// Usage: bun scripts/deal-uniqueness-tests.mjs
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync, spawn } from 'node:child_process';
import path from 'node:path';
import bcrypt from 'bcryptjs';

const REPO = '/home/z/my-project';
const PORT_DB = 61000 + Math.floor(Math.random() * 1500);
const PORT_APP = 34000 + Math.floor(Math.random() * 3000);
const API = `http://127.0.0.1:${PORT_APP}/api/v1`;
const MIGRATION = path.join(
  REPO,
  'prisma/migrations/20261028120000_deal_active_per_introduction/migration.sql',
);

// Kill any stray next dev from a previous aborted run, and always clean up
// our own child on exit (the .next/dev lock is single-instance).
try { execFileSync('pkill', ['-9', '-f', 'next dev'], { stdio: 'ignore' }); } catch {}
try { execFileSync('pkill', ['-9', '-f', 'next-server'], { stdio: 'ignore' }); } catch {}
rmSync(path.join(REPO, '.next/dev/lock'), { force: true });
process.on('exit', () => { try { app?.kill('SIGKILL'); } catch {} });

let failures = 0;
let checks = 0;
const check = (name, pass, detail = '') => {
  checks++;
  if (!pass) failures++;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` | ${detail}` : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── 1. rig database (schema regenerated from the current model) ─────────────
mkdirSync(path.join(REPO, 'backups'), { recursive: true });
const SCHEMA_SQL = path.join(REPO, 'backups', 'deal-rig-schema.sql');
const DDL = execFileSync(
  'bunx',
  ['prisma', 'migrate', 'diff', '--from-empty', '--to-schema-datamodel', 'prisma/schema.prisma', '--script'],
  { cwd: REPO, encoding: 'utf8', env: { ...process.env, DATABASE_URL: 'postgresql://x:x@127.0.0.1:9/x' } },
);
writeFileSync(SCHEMA_SQL, DDL);

const db = new PGlite();
await db.exec(readFileSync(SCHEMA_SQL, 'utf8'));

// Apply the AMENDED migration file verbatim — the exact bytes that the rails
// would checksum and apply to production. This is the rig, not production.
const migrationSql = readFileSync(MIGRATION, 'utf8');
await db.exec(migrationSql);
check('amended migration applied verbatim to the rig (parses + applies cleanly)', true);

const indexDef = await db.query(
  `SELECT indexdef FROM pg_indexes WHERE indexname = 'deal_one_active_per_introduction'`,
);
const def = indexDef.rows[0]?.indexdef ?? '';
check(
  'applied indexdef lists ALL FOUR terminal statuses from domain.ts TERMINAL_STATUSES',
  ["'closed'", "'cancelled'", "'refunded'", "'reversed'"].every((s) => def.includes(s)),
  def,
);

const server = new PGLiteSocketServer({ db, port: PORT_DB, host: '127.0.0.1', maxConnections: 6 });
await server.start();

// ── 2. the real application server ──────────────────────────────────────────
try { execFileSync('fuser', ['-k', `${PORT_APP}/tcp`], { stdio: 'ignore' }); } catch {}

const app = spawn('bunx', ['next', 'dev', '-p', String(PORT_APP)], {
  cwd: REPO,
  detached: true,
  env: {
    ...process.env,
    DATABASE_URL: `postgres://rig:rig@127.0.0.1:${PORT_DB}/postgres?pgbouncer=true&connection_limit=4&pool_timeout=60`,
    MEDIA_STORAGE: 'local',
    MEDIA_ROOT: '/tmp/hfr-deal-test-' + Date.now(),
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
  if (!appReady) await sleep(1000);
}
check('real app server ready (next dev on the rig socket)', appReady);
if (!appReady) {
  console.error(appLog.slice(-3000));
  process.exit(2);
}

// ── 3. fixtures (seeded directly — what is under test is DEAL CREATION and
//      the index, not the viewing journey; the prerequisite rows are honest
//      rig fixtures exactly like the seeded admin in the authz suite) ────────
const RUN = Date.now().toString().slice(-8);

const neighbourhood = await db.query(
  `INSERT INTO neighbourhood (id, name, parent_id, in_service_area, created_at)
   VALUES ('rig-nbhd-1', 'Rig Central', NULL, true, now()) RETURNING id`,
);

async function seedParty(displayName, phone, role) {
  const party = await db.query(
    `INSERT INTO party (id, display_name, primary_phone, status, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, $2, 'active', now(), now()) RETURNING id`,
    [displayName, phone],
  );
  const account = await db.query(
    `INSERT INTO user_account (id, party_id, auth_role, created_at)
     VALUES (gen_random_uuid(), $1, $2, now()) RETURNING id`,
    [party.rows[0].id, role],
  );
  await db.query(
    `INSERT INTO user_credential (id, user_account_id, password_hash, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, $2, now(), now())`,
    [account.rows[0].id, bcrypt.hashSync('DealRig!2026', 10)],
  );
  return { partyId: party.rows[0].id, phone };
}

const landlord = await seedParty(`QA Deal Landlord ${RUN}`, `+256771001${RUN.slice(-4)}`, 'lister');
const tenant = await seedParty(`QA Deal Tenant ${RUN}`, `+256771002${RUN.slice(-4)}`, 'tenant');
const officer = await seedParty(`QA Deal Officer ${RUN}`, `+256771003${RUN.slice(-4)}`, 'foo');

const property = await db.query(
  `INSERT INTO property (id, owner_party_id, property_type, bedrooms, bathrooms, furnished,
      neighbourhood_id, landmark_text, transaction_type, created_at, updated_at)
   VALUES (gen_random_uuid(), $1, 'apartment', 2, 1, 'semi_furnished', $2,
      'rig landmark, deal uniqueness suite', 'rental', now(), now()) RETURNING id`,
  [landlord.partyId, neighbourhood.rows[0].id],
);
const listing = await db.query(
  `INSERT INTO listing (id, property_id, monthly_rent, required_months_upfront, deposit_amount,
      tier, publication_state, verification_state, availability_status, created_at, updated_at)
   VALUES (gen_random_uuid(), $1, 900000, 2, 900000, 'standard', 'live', 'verified', 'available',
      now(), now()) RETURNING id`,
  [property.rows[0].id],
);
const LISTING_ID = listing.rows[0].id;

// A conducted viewing + its introduction record — the prerequisite a real
// deal creation derives every party from.
let introSeq = 0;
async function seedIntroduction() {
  introSeq += 1;
  const viewing = await db.query(
    `INSERT INTO viewing (id, listing_id, tenant_party_id, conducted_by_party_id,
        conducted_by_role, scheduled_for, status, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, $2, $3, 'foo', now(), 'conducted', now(), now()) RETURNING id`,
    [LISTING_ID, tenant.partyId, officer.partyId],
  );
  const intro = await db.query(
    `INSERT INTO introduction_record (id, viewing_id, tenant_party_id, listing_id,
        landlord_party_id, foo_party_id, introduced_at, created_at)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, now(), now()) RETURNING id`,
    [viewing.rows[0].id, tenant.partyId, LISTING_ID, landlord.partyId, officer.partyId],
  );
  return intro.rows[0].id;
}

async function seedDeal(introId, status) {
  await db.query(
    `INSERT INTO deal (id, listing_id, tenant_party_id, landlord_party_id,
        introduction_record_id, status, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, now(), now())`,
    [LISTING_ID, tenant.partyId, landlord.partyId, introId, status],
  );
}

// ── 4. the officer session (deal creation is officer/admin-gated) ───────────
function client(ip) {
  let cookie = null;
  return async function call(method, p, body) {
    const res = await fetch(`${API}${p}`, {
      method,
      headers: {
        ...(ip ? { 'x-forwarded-for': ip } : {}),
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(cookie ? { cookie } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      redirect: 'manual',
    });
    const setCookie = res.headers.getSetCookie?.() ?? [];
    for (const c of setCookie) if (c.startsWith('hfr_session=')) cookie = c.split(';')[0];
    let json = null;
    try { json = await res.json(); } catch {}
    return { status: res.status, body: json };
  };
}

const officerApi = client('127.0.0.77');
let r = await officerApi('POST', '/auth/login', { primaryPhone: officer.phone, password: 'DealRig!2026' });
check('officer session (seeded, logged in through the real auth surface)', r.status === 200);

// ── 5. DB layer: the AMENDED INDEX enforces exactly the terminal set ────────
async function rawInsertActiveDeal(introId) {
  try {
    await db.query(
      `INSERT INTO deal (id, listing_id, tenant_party_id, landlord_party_id,
          introduction_record_id, status, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, 'created', now(), now())`,
      [LISTING_ID, tenant.partyId, landlord.partyId, introId],
    );
    return { ok: true };
  } catch (err) {
    return { ok: false, message: String(err.message ?? err) };
  }
}

const TERMINAL = ['closed', 'cancelled', 'refunded', 'reversed'];
for (const status of TERMINAL) {
  const intro = await seedIntroduction();
  await seedDeal(intro, status);
  const attempt = await rawInsertActiveDeal(intro);
  check(
    `DB layer: ${status.toUpperCase()} deal does not block a new active deal (scenario ${TERMINAL.indexOf(status) + 1})`,
    attempt.ok,
    attempt.message?.slice(0, 160),
  );
}

{
  const intro = await seedIntroduction();
  await seedDeal(intro, 'created'); // an ACTIVE deal
  const attempt = await rawInsertActiveDeal(intro);
  const namesTheIndex =
    attempt.message?.includes('deal_one_active_per_introduction') ||
    attempt.message?.includes('introduction_record_id');
  check(
    'DB layer: ACTIVE deal still blocks a second active deal — 23505 naming the active-deal index (scenario 5)',
    !attempt.ok && namesTheIndex,
    attempt.message?.slice(0, 160),
  );
}

// ── 6. API layer: every terminal retry is a clean 201 through the real app ──
for (const status of TERMINAL) {
  const intro = await seedIntroduction();
  await seedDeal(intro, status);
  const res = await officerApi('POST', '/deals', { introductionRecordId: intro });
  check(
    `API layer: retry after a ${status.toUpperCase()} deal creates the new deal (201, scenario ${TERMINAL.indexOf(status) + 1})`,
    res.status === 201 && Boolean(res.body?.id),
    JSON.stringify(res.body ?? res.status).slice(0, 160),
  );
}

{
  const intro = await seedIntroduction();
  await seedDeal(intro, 'created');
  const res = await officerApi('POST', '/deals', { introductionRecordId: intro });
  check(
    'API layer: second active deal refused by the pre-check (409 DEAL_ALREADY_EXISTS, scenario 5)',
    res.status === 409 && res.body?.error?.code === 'DEAL_ALREADY_EXISTS',
    JSON.stringify(res.body ?? res.status).slice(0, 160),
  );
}

// ── 7. API layer: the RACE — concurrent creates, typed 409s, one winner ─────
{
  const intro = await seedIntroduction();
  const racers = await Promise.all(
    Array.from({ length: 6 }, () => officerApi('POST', '/deals', { introductionRecordId: intro })),
  );
  const created = racers.filter((x) => x.status === 201);
  const typed409 = racers.filter(
    (x) => x.status === 409 && x.body?.error?.code === 'DEAL_ALREADY_EXISTS',
  );
  const opaque500 = racers.filter((x) => x.status >= 500);
  check(
    'API layer: uniqueness RACE — exactly one 201 among 6 concurrent creates (scenario 6)',
    created.length === 1,
    `statuses=${racers.map((x) => x.status).join(',')}`,
  );
  check(
    'API layer: every race loser is the TYPED 409 (DEAL_ALREADY_EXISTS), none opaque (scenario 6)',
    typed409.length === racers.length - created.length && opaque500.length === 0,
    `typed409=${typed409.length} 500s=${opaque500.length}`,
  );
  const survivors = await db.query(
    `SELECT count(*)::int AS n FROM deal
     WHERE introduction_record_id = $1 AND status NOT IN ('closed','cancelled','refunded','reversed')`,
    [intro],
  );
  check(
    'DB layer: the race leaves EXACTLY ONE active deal for the introduction (scenario 6)',
    survivors.rows[0].n === 1,
    `active=${survivors.rows[0].n}`,
  );
}

// ── 8. API layer: unrelated uniqueness keeps its own handling (scenario 7) ──
{
  const dup = client('127.0.0.78');
  const phone = `+256771009${RUN.slice(-4)}`;
  const first = await dup('POST', '/auth/register', {
    displayName: `QA Deal Reg ${RUN}`, primaryPhone: phone, password: 'DealRig!2026', role: 'tenant',
  });
  const second = await dup('POST', '/auth/register', {
    displayName: `QA Deal Reg Duplicate ${RUN}`, primaryPhone: phone, password: 'DealRig!2026', role: 'tenant',
  });
  check(
    'API layer: duplicate-phone registration keeps its established 409 PHONE_TAKEN (scenario 7)',
    first.status === 201 && second.status === 409 && second.body?.error?.code === 'PHONE_TAKEN',
    `first=${first.status} second=${second.status} code=${second.body?.error?.code}`,
  );
}

// ── summary ─────────────────────────────────────────────────────────────────
console.log(`\n${checks - failures}/${checks} checks passed${failures ? ` — ${failures} FAILED` : ' — ALL PASS'}`);
process.exit(failures ? 1 : 0);
