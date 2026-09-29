#!/usr/bin/env node
/**
 * QA regression harness — admin/ops endpoints over REAL HTTP.
 *
 * ── Why this exists ──
 * Tasks 11–16 added admin/ops endpoints (viewing cancel, lister tier,
 * mandate decision, neighbourhood service area, party detail, ops identity
 * check, officers roster, viewing detail). This script replays their
 * contracts so a future change that breaks one fails loudly. It exercises
 * the same surface a browser does — /api/v1 over HTTP with session cookies
 * — never Prisma directly (a test that bypasses the API can prove a service
 * works; it cannot prove the product works).
 *
 * ── Empty-instance aware (Task 19) ──
 * The demo-data purge (scripts/purge-demo-data.mjs) removed the seeded
 * content and the three QA-labelled accounts. The harness now detects what
 * is present and runs accordingly: contract refusals (401/403/404/422) and
 * idempotent no-ops always run because they write nothing; blocks that
 * need seeded content (QA identity checks, a real viewing) print `skip`
 * lines instead of failing. Nothing is written to a kept account except a
 * same-value no-op, which records nothing by design.
 *
 * ── The F-009 rule ──
 * Refuses to run without QA_PASSWORD in the environment. The password is
 * never printed. Sandbox use only — the real repo's auth is different.
 *
 * Usage: QA_PASSWORD=… node scripts/qa-journey.mjs [baseUrl]
 * (baseUrl defaults to http://localhost:3000)
 */
const QA_PASSWORD = process.env.QA_PASSWORD;
if (!QA_PASSWORD) {
  console.error('Refusing to run without QA_PASSWORD (F-009).');
  process.exit(1);
}

const BASE = process.argv[2] ?? 'http://localhost:3000';
const API = `${BASE}/api/v1`;

// Seed OPERATOR accounts (see scripts/seed-demo.mjs) — these survive the
// purge so the staff console and the portals stay reachable. The QA_* phones
// belong to the purged QA-labelled accounts and are optional at runtime.
const ADMIN_PHONE = '+256700100030';
const TENANT_PHONE = '+256700100010'; // Grace Achieng — verified tenant
const LISTER_PHONE = '+256700100001'; // Sarah Nabukenya — verified lister
const QA_TENANT_PHONE = '+256700100099';
const QA_LISTER_PHONE = '+256700100098';
const NIN_OK = 'CM90010099QA01';

let passed = 0;
let failed = 0;
let skipped = 0;

function check(name, cond, detail = '') {
  if (cond) {
    passed += 1;
    console.log(`  ok   ${name}`);
  } else {
    failed += 1;
    console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function skip(name) {
  skipped += 1;
  console.log(`  skip ${name} — not present on this instance`);
}

/** Minimal cookie-carrying client: one jar per login. */
function client() {
  let cookie = null;
  return async function call(method, path, body) {
    const res = await fetch(`${API}${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0];
    let json = null;
    try {
      json = await res.json();
    } catch {
      /* empty body is fine */
    }
    return { status: res.status, json };
  };
}

const anon = client();

async function login(call, phone) {
  const r = await call('POST', '/auth/login', { primaryPhone: phone, password: QA_PASSWORD });
  if (r.status !== 200) throw new Error(`login failed for ${phone}: ${r.status}`);
  return r.json;
}

console.log(`qa-journey against ${API}\n`);

// ── setup ────────────────────────────────────────────────────────────────
const admin = client();
await login(admin, ADMIN_PHONE);
const tenant = client();
await login(tenant, TENANT_PHONE);

// Resolve accounts through the directory (the way the UI does).
const dir = await admin('GET', '/admin/users');
check('directory lists accounts', dir.status === 200 && Array.isArray(dir.json) && dir.json.length > 0);
const row = (phone) => dir.json.find((r) => r.primaryPhone === phone);
const qaTenant = row(QA_TENANT_PHONE);
const qaLister = row(QA_LISTER_PHONE);
const tenantRow = row(TENANT_PHONE);
const listerRow = row(LISTER_PHONE);
const adminRow = row(ADMIN_PHONE);
check('admin present in directory', Boolean(adminRow));
check('tenant present in directory', Boolean(tenantRow));
check('lister present in directory', Boolean(listerRow));
if (!adminRow || !tenantRow || !listerRow) {
  console.error('Seed operator accounts missing — run scripts/seed-demo.mjs first.');
  process.exit(1);
}

// ── party detail (GET /admin/users/:partyId) ─────────────────────────────
console.log('\nparty detail:');
check('admin 200 with identity block', await (async () => {
  const r = await admin('GET', `/admin/users/${tenantRow.partyId}`);
  return r.status === 200 && r.json.identity && typeof r.json.identity.attempts === 'number';
})());
check('anon 401', (await anon('GET', `/admin/users/${tenantRow.partyId}`)).status === 401);
check('tenant 403', (await tenant('GET', `/admin/users/${tenantRow.partyId}`)).status === 403);
check('unknown id 404 PARTY_NOT_FOUND', (await admin('GET', '/admin/users/nope')).status === 404);

// ── ops identity check (POST /admin/users/:partyId/identity-check) ──────
console.log('\nops identity check:');
check('anon 401', (await anon('POST', `/admin/users/${tenantRow.partyId}/identity-check`, { nin: NIN_OK, fullName: 'x' })).status === 401);
check('tenant 403', (await tenant('POST', `/admin/users/${tenantRow.partyId}/identity-check`, { nin: NIN_OK, fullName: 'x' })).status === 403);
const staff = await admin('POST', `/admin/users/${adminRow.partyId}/identity-check`, { nin: NIN_OK, fullName: 'x' });
check('staff account 422 IDENTITY_CHECK_NOT_APPLICABLE', staff.status === 422 && staff.json.error?.code === 'IDENTITY_CHECK_NOT_APPLICABLE', JSON.stringify(staff.json));
check('missing field 400', (await admin('POST', `/admin/users/${tenantRow.partyId}/identity-check`, { nin: NIN_OK })).status === 400);
if (qaTenant) {
  const path = `/admin/users/${qaTenant.partyId}/identity-check`;
  const failedCheck = await admin('POST', path, { nin: NIN_OK, fullName: 'Not The Account Name' });
  check('mismatching name records 201 failed', failedCheck.status === 201 && failedCheck.json.state === 'failed' && failedCheck.json.by === 'operations', JSON.stringify(failedCheck.json));
  const okCheck = await admin('POST', path, { nin: NIN_OK, fullName: qaTenant.displayName });
  check('matching name records 201 verified', okCheck.status === 201 && okCheck.json.state === 'verified', JSON.stringify(okCheck.json));
  const detail = await admin('GET', `/admin/users/${qaTenant.partyId}`);
  check('trail carries ops-run rows', detail.json.audit.filter((a) => a.action === 'identity_verification' && a.detail?.by === 'operations').length >= 2);
} else {
  skip('mismatching name records 201 failed (needs a QA tenant)');
  skip('matching name records 201 verified (needs a QA tenant)');
  skip('trail carries ops-run rows (needs a QA tenant)');
}

// ── lister tier (POST /admin/users/:partyId/tier) ────────────────────────
console.log('\nlister tier:');
const tierPath = `/admin/users/${listerRow.partyId}/tier`;
check('anon 401', (await anon('POST', tierPath, { tier: 'broker_agent' })).status === 401);
check('tenant 403', (await tenant('POST', tierPath, { tier: 'broker_agent' })).status === 403);
check('invalid tier 422', (await admin('POST', tierPath, { tier: 'kingpin' })).status === 422);
const sameTier = await admin('POST', tierPath, { tier: listerRow.listerTier ?? 'property_owner' });
check('same-value submit is a no-op', sameTier.status === 200 && sameTier.json.changed === false, JSON.stringify(sameTier.json));
if (qaLister) {
  check('q composes to the QA lister', await (async () => {
    const r = await admin('GET', `/admin/users?q=${encodeURIComponent(QA_LISTER_PHONE.slice(-7))}&role=lister`);
    return r.status === 200 && r.json.length === 1 && r.json[0].primaryPhone === QA_LISTER_PHONE;
  })());
} else {
  skip('q composes to the QA lister (QA lister purged)');
}

// ── mandate queue + decision refusals ────────────────────────────────────
console.log('\nmandates:');
for (const state of ['pending', 'verified', 'rejected']) {
  const r = await admin('GET', `/admin/mandates?state=${state}`);
  check(`admin queue ${state} 200`, r.status === 200 && Array.isArray(r.json));
}
check('anon 401', (await anon('GET', '/admin/mandates?state=pending')).status === 401);
check('tenant 403', (await tenant('GET', '/admin/mandates?state=pending')).status === 403);
check('bad state 400', (await admin('GET', '/admin/mandates?state=nope')).status === 400);
const badDecision = await admin('POST', '/admin/mandates/qa-journey-nonexistent/decision', { decision: 'maybe' });
check('bad decision 422', badDecision.status === 422, JSON.stringify(badDecision.json));
const noMandate = await admin('POST', '/admin/mandates/qa-journey-nonexistent/decision', { decision: 'verified' });
check('unknown mandate 404', noMandate.status === 404 && noMandate.json.error?.code === 'MANDATE_NOT_FOUND');

// ── neighbourhoods / service area ────────────────────────────────────────
console.log('\nneighbourhoods:');
const list = await admin('GET', '/ops/neighbourhoods');
check('admin list 200', list.status === 200 && Array.isArray(list.json.neighbourhoods) && list.json.neighbourhoods.length > 0);
check('anon 401', (await anon('GET', '/ops/neighbourhoods')).status === 401);
check('tenant 403', (await tenant('GET', '/ops/neighbourhoods')).status === 403);
const first = list.json.neighbourhoods[0];
const dup = await admin('POST', '/ops/neighbourhoods', { name: first.name, district: first.district });
check('duplicate 409 NEIGHBOURHOOD_EXISTS', dup.status === 409 && dup.json.error?.code === 'NEIGHBOURHOOD_EXISTS', JSON.stringify(dup.json));
check('missing name 400', (await admin('POST', '/ops/neighbourhoods', { district: first.district })).status === 400);
const sameArea = await admin('POST', `/ops/neighbourhoods/${first.id}/service-area`, { inServiceArea: first.inServiceArea });
check('same-value toggle is a no-op', sameArea.status === 200 && sameArea.json.changed === false, JSON.stringify(sameArea.json));
check('unknown neighbourhood 404', (await admin('POST', '/ops/neighbourhoods/nope/service-area', { inServiceArea: true })).status === 404);

// ── viewing cancel refusals ──────────────────────────────────────────────
console.log('\nviewing cancel:');
check('anon 401', (await anon('POST', '/viewings/qa-journey-nonexistent/cancel')).status === 401);
const badViewing = await tenant('POST', '/viewings/qa-journey-nonexistent/cancel');
check('unknown viewing 404', badViewing.status === 404 && badViewing.json.error?.code === 'VIEWING_NOT_FOUND', JSON.stringify(badViewing.json));
check('tenant on ops cancel 403', (await tenant('POST', '/ops/viewings/qa-journey-nonexistent/cancel', { note: 'x' })).status === 403);

// ── directory role filter (GET /admin/users?role=…) ──────────────────────
console.log('\ndirectory role filter:');
check('role=tenant only tenants', await (async () => {
  const r = await admin('GET', '/admin/users?role=tenant');
  return r.status === 200 && r.json.length > 0 && r.json.every((x) => x.role === 'tenant');
})());
check('role=lister only listers', await (async () => {
  const r = await admin('GET', '/admin/users?role=lister');
  return r.status === 200 && r.json.length > 0 && r.json.every((x) => x.role === 'lister');
})());
check('unknown role 422 VALIDATION', await (async () => {
  const r = await admin('GET', '/admin/users?role=hacker');
  return r.status === 422 && r.json.error?.code === 'VALIDATION' && /role must be one of/.test(r.json.error.message);
})());
check('q composes with role', await (async () => {
  const r = await admin('GET', `/admin/users?q=${encodeURIComponent(LISTER_PHONE.slice(-7))}&role=lister`);
  return r.status === 200 && r.json.length === 1 && r.json[0].primaryPhone === LISTER_PHONE;
})());
check('tenant 403 on filtered read', (await tenant('GET', '/admin/users?role=tenant')).status === 403);

// ── viewing detail (GET /viewings/:id — the HTTP surface for the officer's
//    visit record, including the server-derived listing block) ────────────
console.log('\nviewing detail:');
const myViewings = await tenant('GET', '/viewings/mine');
check('tenant viewings list 200', myViewings.status === 200 && Array.isArray(myViewings.json));
check('unknown viewing 404', (await admin('GET', '/viewings/qa-journey-nonexistent')).status === 404);
check('anon 401 on detail', (await anon('GET', '/viewings/qa-journey-nonexistent')).status === 401);
if (myViewings.json?.length > 0) {
  const vid = myViewings.json[0].id;
  const asAdmin = await admin('GET', `/viewings/${vid}`);
  check('admin 200 with listing block', asAdmin.status === 200 && asAdmin.json.listing && typeof asAdmin.json.listing.expectedUpfront === 'string');
  check('expectedUpfront = rent×months + deposit', await (async () => {
    const l = asAdmin.json.listing;
    const expect = (BigInt(l.monthlyRent) * BigInt(l.requiredMonthsUpfront) + BigInt(l.depositAmount)).toString();
    return l.expectedUpfront === expect;
  })());
  check('publiclyVisible is boolean', typeof asAdmin.json.listing.publiclyVisible === 'boolean');
  check('listing block carries landmark', typeof asAdmin.json.listing.landmarkText === 'string' && asAdmin.json.listing.landmarkText.length > 0);
  check('tenant 403 on staff surface', (await tenant('GET', `/viewings/${vid}`)).status === 403);
} else {
  skip('admin 200 with listing block (no viewings on this instance)');
  skip('expectedUpfront = rent×months + deposit (no viewings)');
  skip('publiclyVisible is boolean (no viewings)');
  skip('listing block carries landmark (no viewings)');
  skip('tenant 403 on staff surface (no viewings)');
}

// ── assignable officers + dispatch refusals ──────────────────────────────
// Refusals only: an assertion that actually assigns would move a real
// visit; reassignment semantics were verified by hand in the browser.
console.log('\nassignable officers + dispatch refusals:');
const officersRes = await admin('GET', '/ops/officers');
check('admin 200 roster with load', officersRes.status === 200 && Array.isArray(officersRes.json) && officersRes.json.every((o) => typeof o.assignedCount === 'number'));
check('tenant 403', (await tenant('GET', '/ops/officers')).status === 403);
check('anon 401', (await anon('GET', '/ops/officers')).status === 401);
check('dispatch anon 401', (await anon('POST', '/ops/dispatch', { viewingId: 'x', fooPartyId: 'y' })).status === 401);
check('dispatch tenant 403', (await tenant('POST', '/ops/dispatch', { viewingId: 'x', fooPartyId: 'y' })).status === 403);
check('dispatch unknown viewing 404', (await admin('POST', '/ops/dispatch', { viewingId: 'qa-journey-nonexistent', fooPartyId: 'y' })).status === 404);
if (qaTenant && myViewings.json?.length > 0) {
  const vid = myViewings.json[0].id;
  const r = await admin('POST', '/ops/dispatch', { viewingId: vid, fooPartyId: qaTenant.partyId });
  check('dispatch non-officer party 404 OFFICER_NOT_FOUND', r.status === 404 && r.json.error?.code === 'OFFICER_NOT_FOUND');
} else {
  skip('dispatch non-officer party 404 (needs a QA tenant + a real viewing)');
}

console.log(`\n${passed} passed, ${failed} failed, ${skipped} skipped`);
process.exit(failed === 0 ? 0 : 1);
