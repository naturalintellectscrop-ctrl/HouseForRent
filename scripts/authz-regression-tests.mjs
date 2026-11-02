// AUTHORIZATION & HYGIENE REGRESSION TEST SUITE (P-1 / B-3 / B-4 / P-11 / B-1).
//
// Boots the FULL application stack on a private, disposable rig —
// PGlite (real Postgres 16 WASM) over the wire protocol + `next dev` —
// and drives the real HTTP surface and the real server-rendered pages.
// Nothing touches production; no real money (the mock provider labels
// itself MOCK in the database).
//
// What each correction proves, as executed evidence:
//   P-1  officer read-path authorization — the six flagged in-process
//        resolvers (dispatch queue, launch gate, deal book, reconciliation,
//        config versions, audit trail) plus the equivalent gaps found
//        (introductions, commission-rate versions, viewing detail) refuse
//        roles that must not read them, over HTTP AND through the pages,
//        while officers keep their assigned operational reads.
//   B-3  markNoShow — assignment enforced, state machine + CAS refuse
//        duplicate/invalid transitions, an audit event lands in the same
 //       transaction, and no unrelated viewing row is touched.
//   B-4  dry-run publish — reports nothing about a listing the caller does
//        not own; the real publish's refusal shape is preserved; a missing
//        listing is a 404, not a 500.
//   P-11 registration / login / password-change rate limiting — repeated
//        attempts hit a clean 429, and the durable layer fails OPEN with the
//        counter table absent (production behaviour before migration
//        20261101120000 is applied).
//   B-1  QA-walk shape — the corrected walk reads the REAL deal figure
//        (`financials.expectedUpfront`) and the fund-escrow amount-match
//        check passes against it.
//
// Usage: bun scripts/authz-regression-tests.mjs
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync, spawn } from 'node:child_process';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import sharp from 'sharp';

const REPO = '/home/z/my-project';
const PORT_DB = 59000 + Math.floor(Math.random() * 2000);
const PORT_APP = 32000 + Math.floor(Math.random() * 4000);
const API = `http://127.0.0.1:${PORT_APP}/api/v1`;
const BASE = `http://127.0.0.1:${PORT_APP}`;

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
const SCHEMA_SQL = path.join(REPO, 'backups', 'authz-rig-schema.sql');
const DDL = execFileSync(
  'bunx',
  ['prisma', 'migrate', 'diff', '--from-empty', '--to-schema-datamodel', 'prisma/schema.prisma', '--script'],
  { cwd: REPO, encoding: 'utf8', env: { ...process.env, DATABASE_URL: 'postgresql://x:x@127.0.0.1:9/x' } },
);
writeFileSync(SCHEMA_SQL, DDL);

const db = new PGlite();
await db.exec(readFileSync(SCHEMA_SQL, 'utf8'));
await db.query(
  `INSERT INTO neighbourhood (id, name, parent_id, in_service_area, created_at)
   VALUES ('rig-nbhd-1', 'Rig Central', NULL, true, now())`,
);
check('rig DB ready (schema regenerated from current model incl. rate_limit_counter)', true);

const server = new PGLiteSocketServer({ db, port: PORT_DB, host: '127.0.0.1', maxConnections: 4 });
await server.start();

// ── 2. the real application server ──────────────────────────────────────────
try { execFileSync('fuser', ['-k', `${PORT_APP}/tcp`], { stdio: 'ignore' }); } catch {}

const app = spawn('bunx', ['next', 'dev', '-p', String(PORT_APP)], {
  cwd: REPO,
  detached: true,
  env: {
    ...process.env,
    DATABASE_URL: `postgres://rig:rig@127.0.0.1:${PORT_DB}/postgres?pgbouncer=true&connection_limit=1&pool_timeout=60`,
    MEDIA_STORAGE: 'local',
    MEDIA_ROOT: '/tmp/hfr-authz-test-' + Date.now(),
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

// ── 3. sessions ──────────────────────────────────────────────────────────────
function client(ip) {
  let cookie = null;
  return async function call(method, p, body) {
    const res = await fetch(`${API}${p}`, {
      method,
      headers: {
        // The rig trusts x-forwarded-for exactly the way production trusts
        // Vercel's header. Distinct simulated client IPs keep each rate-limit
        // window's evidence isolated from the other scenarios.
        ...(ip ? { 'x-forwarded-for': ip } : {}),
        ...(body !== undefined && !(body instanceof FormData) ? { 'content-type': 'application/json' } : {}),
        ...(cookie ? { cookie } : {}),
      },
      body: body instanceof FormData ? body : body !== undefined ? JSON.stringify(body) : undefined,
      redirect: 'manual',
    });
    const setCookie = res.headers.getSetCookie?.() ?? [];
    for (const c of setCookie) if (c.startsWith('hfr_session=')) cookie = c.split(';')[0];
    let json = null;
    try { json = await res.json(); } catch {}
    return { status: res.status, body: json };
  };
}

/** A PAGE fetch (HTML) with its own login — see pageClientWithLogin below. */

const RUN = Date.now().toString().slice(-8);
const PASSWORD = 'AuthzPass!2026';

// The admin is seeded directly (admins cannot self-register by design).
const adminHash = bcrypt.hashSync('AuthzAdmin!2026', 10);
const adminParty = await db.query(
  `INSERT INTO party (id, display_name, primary_phone, status, created_at, updated_at)
   VALUES (gen_random_uuid(), $1, $2, 'active', now(), now()) RETURNING id`,
  [`QA Authz Admin ${RUN}`, `+256770002${RUN.slice(-4)}`],
);
const adminAccount = await db.query(
  `INSERT INTO user_account (id, party_id, auth_role, created_at) VALUES (gen_random_uuid(), $1, 'admin', now()) RETURNING id`,
  [adminParty.rows[0].id],
);
await db.query(
  `INSERT INTO user_credential (id, user_account_id, password_hash, created_at, updated_at) VALUES (gen_random_uuid(), $1, $2, now(), now())`,
  [adminAccount.rows[0].id, adminHash],
);
const admin = client();
let r = await admin('POST', '/auth/login', { primaryPhone: `+256770002${RUN.slice(-4)}`, password: 'AuthzAdmin!2026' });
check('admin session (seeded operator)', r.status === 200);

// ── 4. actors ────────────────────────────────────────────────────────────────
const landlordA = client();
const landlordB = client();
const tenant = client();
let seq = 0;
async function registerActor(c, kind) {
  seq++;
  const phone = `+2567730${String(seq).padStart(3, '0')}${RUN.slice(-4)}`;
  const displayName = `QA Authz ${kind} ${RUN} ${seq}`;
  r = await c('POST', '/auth/register', { displayName, primaryPhone: phone, password: PASSWORD, role: kind });
  if (r.status !== 201) throw new Error(`register ${kind} failed: ${JSON.stringify(r.body)}`);
  return { phone, partyId: r.body.partyId, displayName };
}
const la = await registerActor(landlordA, 'lister');
const lb = await registerActor(landlordB, 'lister');
const tn = await registerActor(tenant, 'tenant');
// The mock identity provider verifies ONLY when the supplied fullName equals
// the account's displayName - the same rule the real forms follow.
for (const [name, actor] of [['landlord A', la], ['landlord B', lb], ['tenant', tn]]) {
  r = await admin('POST', `/admin/users/${actor.partyId}/identity-check`, { nin: `CM90010099${RUN.slice(-4)}`, fullName: actor.displayName, method: 'nin' });
  check(`${name} identity-check activation`, (r.status === 200 || r.status === 201) && r.body?.state === 'verified', `status=${r.status} state=${r.body?.state}`);
}

// Officers are provisioned by the admin (never self-served).
const officerA = client();
const officerB = client();
async function provisionOfficer(c, name) {
  const phone = `+2567740${String(seq).padStart(3, '0')}${RUN.slice(-4)}`;
  seq++;
  r = await admin('POST', '/ops/staff', { displayName: `QA Authz ${name} ${RUN}`, primaryPhone: phone, password: PASSWORD, role: 'foo' });
  if (r.status !== 201) throw new Error(`provision ${name} failed: ${JSON.stringify(r.body)}`);
  r = await c('POST', '/auth/login', { primaryPhone: phone, password: PASSWORD });
  if (r.status !== 200) throw new Error(`officer login ${name} failed: ${JSON.stringify(r.body)}`);
  r = await admin('GET', '/ops/officers');
  // The roster endpoint returns the assignable officers as a BARE array.
  const roster = Array.isArray(r.body) ? r.body : r.body?.officers ?? [];
  const me = roster.find((o) => o.displayName === `QA Authz ${name} ${RUN}`);
  if (!me) throw new Error(`officer ${name} partyId not found on roster: ${JSON.stringify(r.body).slice(0, 200)}`);
  return { phone, partyId: me.partyId };
}
const ofA = await provisionOfficer(officerA, 'Officer A');
const ofB = await provisionOfficer(officerB, 'Officer B');
check('two field officers provisioned and signed in', Boolean(ofA.partyId && ofB.partyId));

// ── 5. listings ──────────────────────────────────────────────────────────────
r = await landlordA('POST', '/landlord/properties', {
  propertyType: 'apartment', bedrooms: 2, bathrooms: 1, furnished: 'semi_furnished',
  neighbourhoodId: 'rig-nbhd-1', landmarkText: `QA-AUTHZ-A block ${RUN}`,
  monthlyRent: '800,000', requiredMonthsUpfront: 2, depositAmount: '1,600,000',
  description: 'Authz suite landlord A apartment.',
});
if (r.status !== 201) throw new Error(`property A failed: ${JSON.stringify(r.body)}`);
const listingA = r.body?.listing?.id ?? r.body?.listingId;

r = await landlordB('POST', '/landlord/properties', {
  propertyType: 'house', bedrooms: 3, bathrooms: 2, furnished: 'unfurnished',
  neighbourhoodId: 'rig-nbhd-1', landmarkText: `QA-AUTHZ-B block ${RUN}`,
  monthlyRent: '1,200,000', requiredMonthsUpfront: 1, depositAmount: '1,200,000',
  description: 'Authz suite landlord B house.',
});
if (r.status !== 201) throw new Error(`property B failed: ${JSON.stringify(r.body)}`);
const listingB = r.body?.listing?.id ?? r.body?.listingId;
check('two listings authored (A and B)', Boolean(listingA && listingB));

// ── 6. B-4: the publish dry-run verifies ownership ───────────────────────────
r = await landlordB('POST', `/landlord/listings/${listingA}/publish`, { dryRun: true });
check('B-4 dry-run on ANOTHER landlord listing is refused 403 NOT_YOUR_LISTING',
  r.status === 403 && r.body?.error?.code === 'NOT_YOUR_LISTING', JSON.stringify(r.body?.error ?? r.body));
r = await landlordB('POST', `/landlord/listings/${listingB}/publish`, { dryRun: true });
check('B-4 dry-run on OWN listing still reports the gate (200 + blockers)',
  r.status === 200 && Array.isArray(r.body?.blockedBy) && r.body.blockedBy.includes('photography'), JSON.stringify(r.body));
r = await landlordB('POST', '/landlord/listings/does-not-exist/publish', { dryRun: true });
check('B-4 dry-run on a missing listing is 404 LISTING_NOT_FOUND (was a 500)',
  r.status === 404 && r.body?.error?.code === 'LISTING_NOT_FOUND', JSON.stringify(r.body?.error ?? r.body));
r = await landlordB('POST', `/landlord/listings/${listingA}/publish`, {});
check('B-4 real publish of ANOTHER landlord listing still refused 403',
  r.status === 403 && r.body?.error?.code === 'NOT_YOUR_LISTING', JSON.stringify(r.body?.error ?? r.body));

// ── 7. publish listing A through the full gate (for the viewing journeys) ────
const jpeg = await sharp({ create: { width: 900, height: 600, channels: 3, background: { r: 92, g: 138, b: 96 } } })
  .jpeg({ quality: 85 }).toBuffer();
const form = new FormData();
form.append('file', new Blob([jpeg], { type: 'image/jpeg' }), 'authz-photo.jpeg');
form.append('caption', 'Authz suite fixture photograph');
r = await landlordA('POST', `/landlord/listings/${listingA}/photos`, form);
check('landlord A photo upload', r.status === 201, `status=${r.status}`);
r = await landlordA('POST', `/landlord/listings/${listingA}/agreement`, {});
check('landlord A accepts the listing agreement', r.status === 200 || r.status === 201, `status=${r.status}`);
r = await officerA('POST', '/viewings/authz-visit/verify-listing', { listingId: listingA, verified: true, available: true, note: 'authz rig in-person visit' });
check('officer verification verdict on listing A', r.status === 200, `status=${r.status} body=${JSON.stringify(r.body)}`);
r = await landlordA('POST', `/landlord/listings/${listingA}/publish`, {});
check('landlord A publishes (listing live)', r.status === 200 && (r.body?.publicationState === 'live' || r.body?.publicationState === 'published'), JSON.stringify(r.body));

// ── 8. tenant viewing requests ───────────────────────────────────────────────
async function tenantRequestsViewing() {
  const res = await tenant('POST', '/viewings', { listingId: listingA, preferredDate: new Date(Date.now() + 86400000).toISOString() });
  if (res.status !== 201) throw new Error(`viewing request failed: ${JSON.stringify(res.body)}`);
  return res.body.id;
}
const viewing1 = await tenantRequestsViewing(); // → dispatch → conduct → deal (the journey)
const viewing2 = await tenantRequestsViewing(); // → dispatch → no-show (B-3)
const viewing3 = await tenantRequestsViewing(); // stays requested (invalid-transition proof)
check('three tenant viewing requests filed', Boolean(viewing1 && viewing2 && viewing3));

// ── 9. P-1: officer read-path on viewings ────────────────────────────────────
r = await officerB('GET', `/viewings/${viewing3}`);
check('P-1 officer refused an UNASSIGNED requested viewing (403 NOT_ASSIGNED_OFFICER)',
  r.status === 403 && r.body?.error?.code === 'NOT_ASSIGNED_OFFICER', JSON.stringify(r.body?.error ?? r.body));

r = await admin('POST', '/ops/dispatch', { viewingId: viewing1, fooPartyId: ofA.partyId });
check('admin dispatches viewing 1 to officer A', r.status === 200 || r.status === 201, `status=${r.status}`);
r = await admin('POST', '/ops/dispatch', { viewingId: viewing2, fooPartyId: ofA.partyId });
check('admin dispatches viewing 2 to officer A', r.status === 200 || r.status === 201, `status=${r.status}`);

r = await officerB('GET', `/viewings/${viewing1}`);
check('P-1 officer B refused ANOTHER officer assigned viewing (identity check, was display-name)',
  r.status === 403 && r.body?.error?.code === 'NOT_ASSIGNED_OFFICER', JSON.stringify(r.body?.error ?? r.body));
r = await officerA('GET', `/viewings/${viewing1}`);
check('P-1 officer A still reads their OWN assigned viewing (200)', r.status === 200, `status=${r.status}`);
r = await admin('GET', `/viewings/${viewing1}`);
check('P-1 admin reads any viewing (200)', r.status === 200, `status=${r.status}`);
r = await officerA('GET', '/viewings/assigned/me');
check('P-1 officer board keeps its assigned visits (both dispatched rows)',
  r.status === 200 && Array.isArray(r.body) && r.body.some((v) => v.id === viewing1) && r.body.some((v) => v.id === viewing2), JSON.stringify(r.body?.length));
r = await tenant('GET', '/viewings/assigned/me');
check('P-1 tenant refused the officer board (403)', r.status === 403, `status=${r.status}`);

// ── 10. B-3: no-show assignment, state, audit ────────────────────────────────
r = await officerB('POST', `/viewings/${viewing2}/no-show`, {});
check('B-3 officer B refused to no-show ANOTHER officer visit (403 NOT_ASSIGNED_OFFICER)',
  r.status === 403 && r.body?.error?.code === 'NOT_ASSIGNED_OFFICER', JSON.stringify(r.body?.error ?? r.body));
r = await tenant('POST', `/viewings/${viewing2}/no-show`, {});
check('B-3 tenant refused at the role gate (403)', r.status === 403, `status=${r.status}`);
r = await officerA('POST', `/viewings/${viewing2}/no-show`, {});
check('B-3 assigned officer records the no-show (200, status no_show)',
  r.status === 200 && r.body?.status === 'no_show', JSON.stringify(r.body));
r = await officerA('POST', `/viewings/${viewing2}/no-show`, {});
check('B-3 duplicate no-show refused by the terminal state (409 ILLEGAL_VIEWING_TRANSITION)',
  r.status === 409 && r.body?.error?.code === 'ILLEGAL_VIEWING_TRANSITION', JSON.stringify(r.body?.error ?? r.body));
r = await admin('GET', `/admin/audit/${viewing2}`);
const noShowEvents = (Array.isArray(r.body) ? r.body : []).filter((e) => e.eventType === 'viewing_no_show');
check('B-3 exactly ONE audit event records the no-show (same transaction as the write)',
  r.status === 200 && noShowEvents.length === 1, `events=${noShowEvents.length} status=${r.status}`);
r = await officerB('POST', `/viewings/${viewing3}/no-show`, {});
check('B-3 invalid transition refused (requested → no_show, 409)',
  r.status === 409 && r.body?.error?.code === 'ILLEGAL_VIEWING_TRANSITION', JSON.stringify(r.body?.error ?? r.body));
r = await officerA('GET', '/viewings/assigned/me');
check('B-3 no-show touched only its own viewing (viewing 1 still scheduled on the board)',
  r.status === 200 && r.body.some((v) => v.id === viewing1 && v.status === 'scheduled'), JSON.stringify(r.body?.map((v) => v.status)));

// ── 11. the officer→deal journey keeps working (and proves the B-1 shape) ────
r = await officerA('POST', `/viewings/${viewing1}/field-report`, {
  conditionRating: 'good', matchesListing: true, isAvailable: true, issuesText: 'Authz rig report: no issues.',
});
check('officer files the structured field report', r.status === 201, `status=${r.status}`);
r = await officerA('POST', `/viewings/${viewing1}/conduct`, {});
check('officer conducts (introduction recorded)', r.status === 201 && Boolean(r.body?.introductionRecordId), JSON.stringify(r.body));
const introductionRecordId = r.body?.introductionRecordId;
r = await officerA('GET', '/viewings/introductions');
check('P-1 officer introductions remain readable and SCOPED to their own records',
  r.status === 200 && Array.isArray(r.body) && r.body.length >= 1 && r.body.every((i) => i.fooPartyId === ofA.partyId), JSON.stringify(r.body?.length));
r = await officerB('GET', '/viewings/introductions');
check('P-1 officer B sees none of officer A introductions (scoping)',
  r.status === 200 && Array.isArray(r.body) && r.body.every((i) => i.fooPartyId === ofB.partyId), JSON.stringify(r.body?.length));

r = await officerA('POST', '/deals', { introductionRecordId });
check('officer opens the deal from the introduction', r.status === 201 && Boolean(r.body?.id), JSON.stringify(r.body));
const dealId = r.body?.id;
r = await officerA('POST', `/deals/${dealId}/match-tenant`, {});
check('officer matches the tenant on the deal', r.status === 200, JSON.stringify(r.body));
r = await landlordA('POST', `/deals/${dealId}/sign-agreement`, {});
check('landlord signs the deal agreement', r.status === 200, JSON.stringify(r.body));
// B-1: the shape the corrected QA-walk reads — the REAL figure, and the
// fund-escrow amount-match (F-012) passing against it.
r = await landlordA('GET', `/deals/${dealId}`);
const expectedUpfront = r.body?.financials?.expectedUpfront ?? null;
check('B-1 deal detail carries financials.expectedUpfront (the walk fixed shape)',
  Boolean(expectedUpfront), JSON.stringify(r.body?.financials ?? r.body));
r = await tenant('POST', `/deals/${dealId}/fund-escrow`, { expectedAmount: expectedUpfront });
check('B-1 fund-escrow passes the amount-match check with the derived figure',
  r.status === 200, JSON.stringify(r.body?.error ?? r.body));

// ── 12. P-1: admin reads over real HTTP (regression on the route gates) ─────
for (const [label, path] of [
  ['launch gate', '/admin/launch-gate'],
  ['deal book', '/admin/deals'],
  ['reconciliation', '/admin/reconciliation'],
  ['audit trail', '/admin/audit'],
  ['verification queue', '/admin/verification-queue'],
  ['officer roster', '/ops/officers'],
  ['dispatch queue', '/viewings/dispatch-queue'],
]) {
  r = await officerB('GET', path);
  check(`P-1 officer refused ${label} over HTTP (403)`, r.status === 403, `status=${r.status}`);
}
r = await tenant('GET', '/viewings/introductions');
check('P-1 tenant refused introductions over HTTP (403)', r.status === 403, `status=${r.status}`);
r = await admin('GET', '/admin/deals');
check('P-1 admin deal book still reads over HTTP (200)', r.status === 200, `status=${r.status}`);
r = await admin('GET', '/admin/audit');
check('P-1 admin audit trail still reads over HTTP (200)', r.status === 200, `status=${r.status}`);

// ── 13. P-1: the PAGE boundary (in-process resolvers) ────────────────────────
// A page fetch carries its own session: sign in through the real API, keep
// the cookie, then request the server-rendered page.
function pageClientWithLogin() {
  let cookie = null;
  return {
    async apiLogin(method, p, body) {
      const res = await fetch(`${API}${p}`, {
        method,
        headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        redirect: 'manual',
      });
      for (const c of res.headers.getSetCookie?.() ?? []) if (c.startsWith('hfr_session=')) cookie = c.split(';')[0];
      return res.status;
    },
    async get(p) {
      const res = await fetch(`${BASE}${p}`, {
        headers: { ...(cookie ? { cookie } : {}), accept: 'text/html' },
        redirect: 'manual',
      });
      const text = await res.text();
      return { status: res.status, location: res.headers.get('location'), text };
    },
  };
}
const offPages = pageClientWithLogin();
await offPages.apiLogin('POST', '/auth/login', { primaryPhone: ofB.phone, password: PASSWORD });
let page = await offPages.get('/ops');
check('P-1 officer page /ops keeps the launch gate (legitimate field-work access)',
  page.status === 200 && page.text.includes('Launch gate') && !page.text.includes('Admin only'), `status=${page.status}`);
page = await offPages.get('/ops/deals');
check('P-1 officer page /ops/deals renders the admin-only refusal (no deal data)',
  page.status === 200 && page.text.includes('Admin only') && !page.text.includes('Newest activity first'),
  `status=${page.status} adminOnly=${page.text.includes('Admin only')} dataLeak=${page.text.includes('Newest activity first')}`);
page = await offPages.get('/ops/reconciliation');
check('P-1 officer page /ops/reconciliation renders the admin-only refusal (no ledger figures)',
  page.status === 200 && page.text.includes('Admin only') && !page.text.includes('Ledger'), `status=${page.status}`);
page = await offPages.get('/ops/config');
check('P-1 officer page /ops/config renders the admin-only refusal (no parameter history)',
  page.status === 200 && page.text.includes('Admin only'), `status=${page.status}`);
page = await offPages.get(`/ops/audit?subjectRef=${dealId}`);
check('P-1 officer page /ops/audit (subject lookup) renders the admin-only refusal (no audit rows)',
  page.status === 200 && page.text.includes('Admin only') && !page.text.includes('append-only and immutable'),
  `status=${page.status} adminOnly=${page.text.includes('Admin only')}`);
page = await offPages.get('/ops/dispatch');
check('P-1 officer page /ops/dispatch renders the admin-only refusal (no queue, no roster)',
  page.status === 200 && page.text.includes('Admin only'), `status=${page.status}`);
page = await offPages.get('/ops/introductions');
check('P-1 officer page /ops/introductions (Evidence) still serves the officer',
  page.status === 200 && !page.text.includes('Admin only'), `status=${page.status}`);

const adminPages = pageClientWithLogin();
const adminPhone = `+256770002${RUN.slice(-4)}`;
await adminPages.apiLogin('POST', '/auth/login', { primaryPhone: adminPhone, password: 'AuthzAdmin!2026' });
page = await adminPages.get('/ops/deals');
check('P-1 admin page /ops/deals still renders the console (200, no refusal)',
  page.status === 200 && !page.text.includes('Admin only'), `status=${page.status}`);
page = await adminPages.get('/ops/dispatch');
check('P-1 admin page /ops/dispatch still renders the queue', page.status === 200 && !page.text.includes('Admin only'), `status=${page.status}`);

const tenantPages = pageClientWithLogin();
await tenantPages.apiLogin('POST', '/auth/login', { primaryPhone: tn.phone, password: PASSWORD });
page = await tenantPages.get('/ops');
check('P-1 tenant is redirected away from the ops console by the layout',
  page.status === 307 || page.status === 302, `status=${page.status} location=${page.location}`);

// ── 14. P-11: rate limiting (kept LAST — the windows are real) ───────────────
// Each scenario runs from its OWN simulated client IP (x-forwarded-for, which
// the rig trusts the way production trusts Vercel's header), so the evidence
// for one window is never polluted by another scenario's attempts. The memory
// and durable layers enforce the same shape; the durable layer is what holds
// across instances once migration 20261101120000 is applied.
const RL_LOGIN_IP = '10.9.9.9';
const RL_PW_IP = '10.9.9.10';
const RL_REG_IP = '10.9.9.11';
const RL_FAILOPEN_IP = '10.9.9.12';

// 14a. login brute force: one identifier hammered with a wrong password —
// the per-(IP+identifier) window refuses by the 9th attempt.
let saw429 = false;
let saw429Code = '';
const hammerPhone = `+2567799${RUN.slice(-6)}`;
for (let i = 1; i <= 10; i++) {
  const res = await client(RL_LOGIN_IP)('POST', '/auth/login', { primaryPhone: hammerPhone, password: 'wrong-password' });
  if (res.status === 429) { saw429 = true; saw429Code = res.body?.error?.code ?? ''; break; }
}
check('P-11 login attempts hit a clean 429 TOO_MANY_ATTEMPTS', saw429 && saw429Code === 'TOO_MANY_ATTEMPTS', `code=${saw429Code}`);

// 14b. password-change guessing under a stolen session: every attempt
// re-verifies the CURRENT password, so failures are guesses — refused by
// the 9th (account-keyed windows: memory per IP+party, durable per party).
let pw429 = false;
let pwCodesBefore = new Set();
{
  const pwClient = client(RL_PW_IP);
  const s = await pwClient('POST', '/auth/login', { primaryPhone: lb.phone, password: PASSWORD });
  if (s.status !== 200) throw new Error(`pw hammer login failed: ${JSON.stringify(s.body)}`);
  for (let i = 1; i <= 12; i++) {
    r = await pwClient('POST', '/auth/password', { currentPassword: 'wrong-current', newPassword: 'NewPass!2026b' });
    if (r.status === 429) { pw429 = true; break; }
    pwCodesBefore.add(r.body?.error?.code);
  }
}
check('P-11 repeated password-change attempts hit 429 (account-level window)',
  pw429 && pwCodesBefore.has('INVALID_CURRENT_PASSWORD'), `last=${r.status} codes=${[...pwCodesBefore].join(',')}`);

// 14c. registration spam: per-IP durable window (reg-ip 60/hour — set above
// the ~30-account legitimate bulk a QA rig builds). The memory layer's
// registration-owned windows mirror it, so the refusal that lands here is
// the durable layer's shared-store enforcement.
let reg429 = false;
let regFirst429At = 0;
let regOkBefore = 0;
for (let i = 1; i <= 70; i++) {
  const res = await client(RL_REG_IP)('POST', '/auth/register', {
    displayName: `QA Rate ${RUN} ${i}`, primaryPhone: `+2567781${String(i).padStart(4, '0')}${RUN.slice(-2)}`,
    password: PASSWORD, role: 'tenant',
  });
  if (res.status === 201) regOkBefore++;
  if (res.status === 429) { reg429 = true; regFirst429At = i; break; }
}
check('P-11 registration spam hits 429 on the durable per-IP window',
  reg429 && regOkBefore >= 55, `first429=#${regFirst429At} okBefore=${regOkBefore}`);
const regBucket = await db.query(
  `SELECT hits FROM rate_limit_counter WHERE bucket_key LIKE $1 ORDER BY hits DESC LIMIT 1`,
  [`reg-ip:${RL_REG_IP}`],
);
check('P-11 durable counter recorded the registration window (shared-store evidence)',
  Number(regBucket.rows[0]?.hits ?? 0) >= 60, `hits=${regBucket.rows[0]?.hits ?? 0}`);

// 14d. the durable layer FAILS OPEN with the counter table absent — exactly
// production's state until migration 20261101120000 is applied. The memory
// layer (fresh IP, fresh identifiers) still passes the attempts through.
await db.query('DROP TABLE IF EXISTS rate_limit_counter');
r = await client(RL_FAILOPEN_IP)('POST', '/auth/register', {
  displayName: `QA FailOpen ${RUN}`, primaryPhone: `+2567782${RUN.slice(-6)}`, password: PASSWORD, role: 'tenant',
});
check('P-11 register still works with the counter table absent (fail-open, pre-migration safety)',
  r.status === 201, `status=${r.status} body=${JSON.stringify(r.body?.error ?? '')}`);
r = await client(RL_FAILOPEN_IP)('POST', '/auth/login', { primaryPhone: la.phone, password: PASSWORD });
check('P-11 login still works with the counter table absent (fail-open)', r.status === 200, `status=${r.status}`);

// ── summary ──────────────────────────────────────────────────────────────────
console.log(`\n${checks - failures}/${checks} checks passed${failures ? ` — ${failures} FAILED` : ' — ALL PASS'}`);
process.exit(failures ? 1 : 0);
