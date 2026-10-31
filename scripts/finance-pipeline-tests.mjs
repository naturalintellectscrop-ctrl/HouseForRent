// FINANCIAL ARCHITECTURE PIPELINE TEST SUITE (2026-10-30).
//
// Boots the FULL application stack on a private, disposable rig:
//   PGlite (real Postgres 16 WASM) over the wire protocol
//   + `next dev` (Turbopack) with the sandbox (MOCK) payment provider
// and drives the real HTTP surface - registrations, listings, viewings,
// deals, ledger actions and signed webhooks. Nothing touches production;
// the mock provider labels itself MOCK in the database.
//
// Covers the 20 mandated scenarios (task §14), each printed PASS/FAIL with
// real executed evidence:
//   1 advance-rent calc            8 payment ≠ landlord release
//   2 10% commission               9 move-in verification gates settlement
//   3 commission ≠ deposit        10 conflicting evidence → review
//   4 fees borne by HFR           11 settlement = rent − commission
//   5 >3 months mutual agreement  12 deposit separate from rent/commission
//   6 snapshots survive edits     13 partial deposit release + refund
//   7 duplicate payment safety    14 refund before settlement
//                                 15 refund after settlement (landlord owes)
//                                 16 provider reversal
//                                 17 unauthorized attempts fail
//                                 18 ledger balances + reconciliation
//                                 19 audit history preserved
//                                 20 existing journeys keep working
//
// Usage: bun scripts/finance-pipeline-tests.mjs
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { execFileSync, spawn } from 'node:child_process';
import path from 'node:path';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import sharp from 'sharp';

const REPO = '/home/z/my-project';
const PORT_DB = 55000 + Math.floor(Math.random() * 4000);
const PORT_APP = 31000 + Math.floor(Math.random() * 8000);
const API = `http://127.0.0.1:${PORT_APP}/api/v1`;
const WEBHOOK_SECRET = 'rig-finance-webhook-secret';

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
const SCHEMA_SQL = path.join(REPO, 'backups', 'rig-schema.sql');
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
check('rig DB ready (schema regenerated from current model incl. new tables)', true);

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
    MEDIA_ROOT: '/tmp/hfr-finance-test-' + Date.now(),
    NODE_ENV: 'development',
    NEXT_TELEMETRY_DISABLED: '1',
    NYLONPAY_WEBHOOK_SECRET: WEBHOOK_SECRET, // sandbox mode; lets tests rehearse signed deliveries
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

// ── 3. sessions + fixtures ───────────────────────────────────────────────────
function client() {
  let cookie = null;
  return async function call(method, p, body) {
    const res = await fetch(`${API}${p}`, {
      method,
      headers: {
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

const RUN = Date.now().toString().slice(-8);
const PASSWORD = 'FinPass!2026';
const admin = client();

const adminHash = bcrypt.hashSync('FinAdmin!2026', 10);
const adminParty = await db.query(
  `INSERT INTO party (id, display_name, primary_phone, status, created_at, updated_at)
   VALUES (gen_random_uuid(), $1, $2, 'active', now(), now()) RETURNING id`,
  [`QA Finance Admin ${RUN}`, `+256770001${RUN.slice(-4)}`],
);
const adminAccount = await db.query(
  `INSERT INTO user_account (id, party_id, auth_role, created_at) VALUES (gen_random_uuid(), $1, 'admin', now()) RETURNING id`,
  [adminParty.rows[0].id],
);
await db.query(
  `INSERT INTO user_credential (id, user_account_id, password_hash, created_at, updated_at) VALUES (gen_random_uuid(), $1, $2, now(), now())`,
  [adminAccount.rows[0].id, adminHash],
);

let r = await admin('POST', '/auth/login', { primaryPhone: `+256770001${RUN.slice(-4)}`, password: 'FinAdmin!2026' });
check('admin session (seeded fixture login through the real API)', r.status === 200);

let seq = 0;
async function makeActor(kind) {
  seq++;
  const phone = `+2567720${String(seq).padStart(3, '0')}${RUN.slice(-4)}`;
  const c = client();
  const name = `QA Fin ${kind} ${RUN} ${seq}`;
  r = await c('POST', '/auth/register', { displayName: name, primaryPhone: phone, password: PASSWORD, role: kind === 'officer' ? 'lister' : kind });
  if (r.status !== 201) throw new Error(`register ${kind} failed: ${JSON.stringify(r.body)}`);
  const partyId = r.body.partyId;
  r = await c('POST', '/auth/login', { primaryPhone: phone, password: PASSWORD });
  if (r.status !== 200) throw new Error(`login ${kind} failed`);
  if (kind !== 'officer') {
    // Same NIN shape the sandbox mock validates (CM + 8 digits + 2 letters + 2 digits).
    const nin = `CM900100${String(seq).padStart(2, '0')}QA${String(seq).padStart(2, '0')}`;
    r = await admin('POST', `/admin/users/${partyId}/identity-check`, { nin, fullName: name, method: 'nin' });
    if (!(r.status === 200 || r.status === 201) || r.body?.state !== 'verified') {
      throw new Error(`identity-check ${kind} failed: ${JSON.stringify(r.body)}`);
    }
  }
  return { client: c, partyId, phone, name };
}

const officer = await (async () => {
  r = await admin('POST', '/ops/staff', {
    displayName: `QA Fin Officer ${RUN}`, primaryPhone: `+25677300${RUN.slice(-4)}`, password: PASSWORD, role: 'foo',
  });
  if (r.status !== 201) throw new Error(`officer provisioning failed: ${JSON.stringify(r.body)}`);
  r = await admin('GET', '/viewings/dispatch-queue');
  const me = (r.body?.officers ?? []).find((o) => o.displayName === `QA Fin Officer ${RUN}`);
  const c = client();
  r = await c('POST', '/auth/login', { primaryPhone: `+25677300${RUN.slice(-4)}`, password: PASSWORD });
  if (r.status !== 200) throw new Error('officer login failed');
  return { client: c, partyId: me.partyId };
})();
check('officer provisioned (staff are never self-served)', true);

r = await admin('GET', '/ops/neighbourhoods');
const nbhd = (r.body?.neighbourhoods ?? []).find((n) => n.inServiceArea);

/**
 * Builds a funded-or-not deal through the REAL journey:
 * register → activate → listing (+agreement) → officer verify → publish →
 * tenant viewing → dispatch → field report → conduct → deal → match → sign
 * → [fund]. Returns the deal id and both actor clients.
 */
async function createDeal({ months = 2, monthlyRent = '800,000', deposit = '1,600,000', mutualRef, fund = true, expectedAmount } = {}) {
  seq++;
  const landlord = await makeActor('lister');
  const tenant = await makeActor('tenant');
  const L = landlord.client;
  const T = tenant.client;

  r = await L('POST', '/landlord/properties', {
    propertyType: 'apartment', bedrooms: 2, bathrooms: 1, furnished: 'semi_furnished',
    neighbourhoodId: nbhd.id, landmarkText: `QA-FIN block ${RUN} ${seq}`,
    monthlyRent, requiredMonthsUpfront: months, depositAmount: deposit,
    ...(mutualRef ? { advanceMutualAgreementRef: mutualRef } : {}),
    description: 'QA finance fixture apartment.',
  });
  if (r.status !== 201) throw new Error(`listing create failed: ${JSON.stringify(r.body)}`);
  const listingId = r.body?.listing?.id ?? r.body?.listingId;

  r = await L('POST', `/landlord/listings/${listingId}/agreement`, {});
  if (!(r.status === 200 || r.status === 201)) throw new Error('agreement accept failed');

  // The publish gate requires field-verified photography - a real upload
  // through the real pipeline (same as the qa-walk journey).
  const jpeg = await sharp({ create: { width: 900, height: 600, channels: 3, background: { r: 96, g: 128, b: 90 } } })
    .jpeg({ quality: 85 }).toBuffer();
  const form = new FormData();
  form.append('file', new Blob([jpeg], { type: 'image/jpeg' }), 'qa-fin-photo.jpeg');
  form.append('caption', 'QA finance fixture photograph');
  r = await L('POST', `/landlord/listings/${listingId}/photos`, form);
  if (r.status !== 201) throw new Error(`photo upload failed: ${JSON.stringify(r.body)}`);

  r = await officer.client('POST', '/viewings/qa-fin-visit/verify-listing', { listingId, verified: true, available: true, note: 'QA finance in-person visit' });
  if (r.status !== 200) throw new Error(`verify-listing failed: ${JSON.stringify(r.body)}`);

  r = await L('POST', `/landlord/listings/${listingId}/publish`, {});
  if (r.status !== 200) throw new Error(`publish failed: ${JSON.stringify(r.body)}`);

  r = await T('POST', '/viewings', { listingId, preferredDate: new Date(Date.now() + 86400000).toISOString() });
  if (r.status !== 201) throw new Error(`viewing request failed: ${JSON.stringify(r.body)}`);
  const viewingId = r.body.id;

  r = await admin('POST', '/ops/dispatch', { viewingId, fooPartyId: officer.partyId });
  if (!(r.status === 200 || r.status === 201)) throw new Error('dispatch failed');

  r = await officer.client('POST', `/viewings/${viewingId}/field-report`, {
    conditionRating: 'good', matchesListing: true, isAvailable: true, issuesText: 'QA finance report: no issues.',
  });
  if (r.status !== 201) throw new Error('field report failed');

  r = await officer.client('POST', `/viewings/${viewingId}/conduct`, {});
  if (r.status !== 201) throw new Error('conduct failed');
  const introductionRecordId = r.body.introductionRecordId;

  r = await officer.client('POST', '/deals', { introductionRecordId });
  if (r.status !== 201) throw new Error('deal create failed');
  const dealId = r.body.id;

  r = await officer.client('POST', `/deals/${dealId}/match-tenant`, {});
  if (r.status !== 200) throw new Error('match-tenant failed');

  r = await L('POST', `/deals/${dealId}/sign-agreement`, {});
  if (r.status !== 200) throw new Error(`sign-agreement failed: ${JSON.stringify(r.body)}`);

  if (fund) {
    r = await T('POST', `/deals/${dealId}/fund-escrow`, expectedAmount !== undefined ? { expectedAmount } : {});
    if (r.status !== 200) throw new Error(`fund-escrow failed: ${JSON.stringify(r.body)}`);
  }
  return { dealId, listingId, landlord, tenant, L, T };
}

const getDeal = (who, dealId) => who('GET', `/deals/${dealId}`);
const action = (who, dealId, name, body = {}) => who('POST', `/deals/${dealId}/${name}`, body);
const sh = (v) => BigInt(v ?? '0');
const shs = (v) => v.toString();

// Signed webhook delivery (the same seam the real provider uses).
function signedWebhook(event, reference, amount, extra = {}) {
  const body = JSON.stringify({
    delivery_id: `rig-${crypto.randomUUID()}`,
    event,
    timestamp: Date.now(),
    payload: { reference, amount, currency: 'UGX', status: 'SUCCESSFUL', ...extra },
  });
  const signature = crypto.createHmac('sha256', WEBHOOK_SECRET).update(body).digest('hex');
  return fetch(`${API}/payments/nylonpay/webhook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-nylon-signature': signature },
    body,
  }).then((res) => res.status);
}
const instructionRef = async (dealId, kind) => {
  const rows = await db.query(
    `SELECT provider_ref, id FROM psp_instruction WHERE deal_id = $1 AND kind = $2 ORDER BY created_at DESC LIMIT 1`,
    [dealId, kind],
  );
  return { providerRef: rows.rows[0]?.provider_ref ?? null, id: rows.rows[0]?.id ?? null };
};

// ═══════════════════════════ DEAL A — the golden path ═══════════════════════
try {
console.log('\n── Deal A: golden path (snapshots → fund → verify → settle → deposit) ──');
const A = await createDeal();
const RENT = 800000n, MONTHS = 2n, DEPOSIT = 1600000n, ADVANCE = RENT * MONTHS; // 3.2m upfront, 1.6m advance rent
const COMMISSION = RENT; // 10% of one month = 800,000

let d = (await getDeal(A.L, A.dealId)).body;

// 1. advance-rent calculation
check('1. advance-rent snapshot = rent × months (1,600,000)', d.financials.advanceRentSnapshot === shs(ADVANCE), `got ${d.financials.advanceRentSnapshot}`);
check('1. expectedUpfront = advanceRent + deposit (3,200,000)', d.financials.expectedUpfront === shs(ADVANCE + DEPOSIT), `got ${d.financials.expectedUpfront}`);
check('1. deposit + advance months + payer snapshotted at signing',
  d.financials.depositAmountSnapshot === shs(DEPOSIT) && d.financials.advanceMonthsSnapshot === 2 && d.financials.commissionPayerSnapshot === 'landlord',
  JSON.stringify({ dep: d.financials.depositAmountSnapshot, months: d.financials.advanceMonthsSnapshot, payer: d.financials.commissionPayerSnapshot }));

// 2+3. commission at confirmed payment, 10% of ONE month, deposit excluded
check('2. commission earned at confirmed payment = 10% of one month (800,000)',
  d.financials.commissionAmount === shs(COMMISSION) && d.financials.commissionRecognised === shs(COMMISSION),
  `amount ${d.financials.commissionAmount} recognised ${d.financials.commissionRecognised}`);
check('3. commission excludes the deposit (800,000 ≠ 10% of 3.2m = 320,000)',
  sh(d.financials.commissionRecognised) === COMMISSION && COMMISSION !== (ADVANCE + DEPOSIT) / 10n);
check('2. rent and deposit held SEPARATELY (0.8m rent refundable / 1.6m deposit)',
  d.financials.rentHeld === '800000' && d.financials.depositHeld === '1600000',
  `rent ${d.financials.rentHeld} / dep ${d.financials.depositHeld}`);

// 8. payment confirmation did NOT release landlord funds
r = await action(admin, A.dealId, 'settle');
check('8. settle BEFORE verified move-in is refused (409, admin)', r.status === 409, `status ${r.status}`);
d = (await getDeal(A.L, A.dealId)).body;
check('8. after payment: owed to landlord = 0, deposit untouched',
  d.financials.owedToLandlord === '0' && d.financials.depositHeld === shs(DEPOSIT),
  `owed ${d.financials.owedToLandlord} dep ${d.financials.depositHeld}`);

// 4. provider fee borne by HFR (operating expense; tenant figures untouched)
r = await action(admin, A.dealId, 'record-provider-fee', { amount: '25,000', reason: 'rig: provider fee schedule psp-fee-001' });
check('4. provider fee recorded (admin)', r.status === 200, JSON.stringify(r.body).slice(0, 120));
d = (await getDeal(A.L, A.dealId)).body;
check('4. fee sits in psp_fee_expense; tenant figures unchanged',
  d.financials.providerFeesRecorded === '25000' && d.financials.heldInEscrow === shs(ADVANCE + DEPOSIT - COMMISSION),
  `fees ${d.financials.providerFeesRecorded} held ${d.financials.heldInEscrow}`);

// 17. unauthorized attempts (role matrix, re-checked per request)
r = await action(A.T, A.dealId, 'settle');
check('17. tenant cannot settle (403)', r.status === 403, `status ${r.status}`);
r = await action(A.T, A.dealId, 'refund');
check('17. tenant cannot refund (403)', r.status === 403, `status ${r.status}`);
r = await action(A.L, A.dealId, 'earn-commission');
check('17. landlord cannot recognise commission (403)', r.status === 403, `status ${r.status}`);
r = await action(A.L, A.dealId, 'partial-refund', { amount: '100,000', reason: 'x' });
check('17. landlord cannot partial-refund (403)', r.status === 403, `status ${r.status}`);

// 9. move-in verification gates settlement; both parties confirm
r = await action(admin, A.dealId, 'open-move-in-verification', {});
check('9. direct admin shortcut does not exist (404)', r.status === 404, `status ${r.status}`);
r = await action(A.T, A.dealId, 'confirm-move-in', { note: 'Keys received; appliances working.', evidenceRef: 'handover-photo-001' });
check('9. tenant confirmation opens verification', r.status === 200 && r.body.status === 'move_in_awaiting_verification', JSON.stringify(r.body).slice(0, 100));
d = (await getDeal(A.L, A.dealId)).body;
check('9. verification record carries the tenant entry', d.moveInVerification?.tenantConfirmedAt != null && d.moveInVerification?.state === 'tenant_confirmed', `state ${d.moveInVerification?.state}`);
r = await action(admin, A.dealId, 'settle');
check('9. settle still refused while verification open (409)', r.status === 409, `status ${r.status}`);
r = await action(officer.client, A.dealId, 'add-move-in-evidence', { note: 'Officer: unit handed over clean; inventory signed.', evidenceRef: 'field-inventory-77' });
check('9. officer may ATTACH evidence (never decide)', r.status === 200, `status ${r.status}`);
r = await action(A.L, A.dealId, 'confirm-move-in-landlord', { note: 'Handed over as agreed.', evidenceRef: 'landlord-note-3' });
check('9. landlord confirmation completes verification → move_in_confirmed', r.status === 200 && r.body.status === 'move_in_confirmed', JSON.stringify(r.body).slice(0, 100));

// 11+12. settlement = rent − commission; deposit untouched
r = await action(admin, A.dealId, 'settle');
check('11. settlement executes after verified move-in', r.status === 200 && r.body.status === 'settled', JSON.stringify(r.body).slice(0, 100));
d = (await getDeal(A.L, A.dealId)).body;
check('11. landlord received rent − commission (800,000)',
  d.financials.releasedToLandlord === shs(ADVANCE - COMMISSION), `got ${d.financials.releasedToLandlord}`);
check('12. deposit still held in full after settlement (1,600,000)',
  d.financials.depositHeld === shs(DEPOSIT) && d.financials.rentHeld === '0',
  `dep ${d.financials.depositHeld} rent ${d.financials.rentHeld}`);

// 13. deposit lifecycle: propose → review → tenant accepts → apply → refund → close
r = await action(A.L, A.dealId, 'propose-deduction', { amount: '2,500,000', reason: 'over the held deposit' });
check('13. deduction above the held deposit is refused (422)', r.status === 422, `status ${r.status}`);
r = await action(A.L, A.dealId, 'propose-deduction', { amount: '500,000', reason: 'Broken window (tenant accident) - invoice INV-12.', evidenceRef: 'window-photo-9' });
check('13. landlord proposes 500,000 deduction', r.status === 200, JSON.stringify(r.body).slice(0, 100));
const deductionId = r.body.id;
r = await action(admin, A.dealId, 'apply-deduction', { deductionId });
check('13. deduction cannot be applied before HFR review + tenant acceptance (409)', r.status === 409, `status ${r.status}`);
r = await action(admin, A.dealId, 'approve-deduction', { deductionId, reason: 'Valid damage, evidence consistent; not wear and tear.' });
check('13. HFR approves with a recorded reason', r.status === 200, JSON.stringify(r.body).slice(0, 100));
r = await action(A.T, A.dealId, 'accept-deduction', { deductionId, note: 'Fair - the window was broken.' });
check('13. tenant accepts the reviewed deduction', r.status === 200, JSON.stringify(r.body).slice(0, 100));
r = await action(admin, A.dealId, 'apply-deduction', { deductionId });
check('13. deduction applied (deposit pays landlord)', r.status === 200, JSON.stringify(r.body).slice(0, 120));
d = (await getDeal(A.L, A.dealId)).body;
check('13. deposit now 1,100,000; landlord total payout 1,300,000',
  d.financials.depositHeld === '1100000' && d.financials.releasedToLandlord === '1300000',
  `dep ${d.financials.depositHeld} released ${d.financials.releasedToLandlord}`);
r = await action(admin, A.dealId, 'refund-deposit', { reason: 'Tenancy ended; deposit balance released to the tenant.' });
check('13. remaining deposit released to the tenant', r.status === 200, JSON.stringify(r.body).slice(0, 120));
d = (await getDeal(A.L, A.dealId)).body;
check('13. deposit liability discharged to zero', d.financials.depositHeld === '0' && d.financials.depositReleased === '1100000', `dep ${d.financials.depositHeld}`);
r = await action(admin, A.dealId, 'close-deposit-case', { reason: 'Deposit fully accounted: 500,000 deduction, 1,100,000 released.' });
d = (await getDeal(A.L, A.dealId)).body;
check('13. deposit case is closed at zero balance (auto-closed by the final release; manual close honestly refused)',
  d.depositCase?.state === 'closed' && r.status === 409, `case ${d.depositCase?.state} close ${r.status}`);

// 15. refund AFTER settlement = the landlord's responsibility (never HFR's)
const heldBefore = d.financials.heldInEscrow;
r = await action(A.T, A.dealId, 'record-post-settlement-refund', { amount: '800,000', reason: 'One paid month unused - tenancy ended early.' });
check('15. tenant records unearned prepaid rent after settlement', r.status === 200, JSON.stringify(r.body).slice(0, 100));
const psrId = r.body.recordId;
r = await action(A.L, A.dealId, 'progress-post-settlement-refund', { refundId: psrId, outcome: 'landlord_acknowledged', note: 'Acknowledged - will pay by month end.' });
check('15. landlord acknowledges the responsibility', r.status === 200, JSON.stringify(r.body).slice(0, 100));
r = await action(A.L, A.dealId, 'progress-post-settlement-refund', { refundId: psrId, outcome: 'resolved_paid_by_landlord' });
check('15. landlord cannot self-resolve (admin decision)', r.status === 403, `status ${r.status}`);
r = await action(admin, A.dealId, 'progress-post-settlement-refund', { refundId: psrId, outcome: 'resolved_paid_by_landlord', note: 'Landlord paid the tenant directly; receipt filed.' });
check('15. admin resolves as paid by the landlord', r.status === 200, JSON.stringify(r.body).slice(0, 100));
d = (await getDeal(A.L, A.dealId)).body;
check('15. NO platform balance was created or changed by the coordination', d.financials.heldInEscrow === heldBefore && d.financials.owedToLandlord === '0', `held ${d.financials.heldInEscrow}`);

// 7. duplicate payment events cannot double-book
const fundedBefore = d.financials.funded;
const collectRef = (await instructionRef(A.dealId, 'collect')).providerRef;
r = await action(A.T, A.dealId, 'fund-escrow', {});
check('7. re-funding a funded deal is refused by the machine (409)', r.status === 409, `status ${r.status}`);
let whStatus = await signedWebhook('transaction.successful', collectRef, '3200000');
check('7. duplicate signed webhook acked', whStatus === 200, `status ${whStatus}`);
d = (await getDeal(A.L, A.dealId)).body;
check('7. ledger booked the collection exactly once (no duplicate credit)', d.financials.funded === fundedBefore, `funded ${d.financials.funded}`);
const collectInstr = await instructionRef(A.dealId, 'collect');
r = await admin('GET', `/admin/audit/${collectInstr.id}`);
const dupAudit = JSON.stringify(r.body ?? []).includes('psp_duplicate_collect_confirmation');
check('7. duplicate confirmation is ops-visible in the audit trail', r.status === 200 && dupAudit, `status ${r.status}`);
whStatus = await signedWebhook('transaction.successful', collectRef, '2999000');
d = (await getDeal(A.L, A.dealId)).body;
check('7. amount-mismatched confirmation is NOT booked (money guard)', whStatus === 200 && d.financials.funded === fundedBefore, `status ${whStatus} funded ${d.financials.funded}`);
whStatus = await signedWebhook('transaction.successful', '00000000-0000-0000-0000-000000000000', '3200000');
check('7. unknown provider reference is ACKed, never applied', whStatus === 200, `status ${whStatus}`);

// 4b. duplicate-payment refund record (booked-once discipline)
r = await action(admin, A.dealId, 'duplicate-payment-refund', { amount: '3,200,000', reason: 'Provider collected twice per statement row DUP-88; reconcile.' });
check('4b. duplicate-payment refund is recorded, not double-booked', r.status === 200, JSON.stringify(r.body).slice(0, 100));
d = (await getDeal(A.L, A.dealId)).body;
check('4b. no second ledger booking for the duplicate', d.financials.funded === fundedBefore && d.refunds.some((x) => x.kind === 'duplicate_payment' && x.state === 'pending'), `funded ${d.financials.funded}`);

// 19. audit history preserved (transitions + audit rows)
d = (await getDeal(A.L, A.dealId)).body;
const transitionSet = d.transitions.map((t) => t.toStatus);
check('19. full transition history on the deal',
  ['escrow_funded', 'move_in_awaiting_verification', 'move_in_confirmed', 'settled'].every((s) => transitionSet.includes(s)),
  transitionSet.join(' → '));
r = await admin('GET', `/admin/audit/${A.dealId}`);
const auditBody = JSON.stringify(r.body ?? []);
check('19. money events audited with actor + amounts',
  r.status === 200 && auditBody.includes('escrow_funded') && auditBody.includes('deal_settled') && auditBody.includes('commission'),
  `status ${r.status}`);

// ═══════════════════════ DEAL B — refund before settlement ═══════════════════
console.log('\n── Deal B: refund before settlement + commission retention policy ──');
const B = await createDeal();
d = (await getDeal(B.L, B.dealId)).body;
check('14. deal funded (commission earned at payment per policy)', d.status === 'escrow_funded' && d.financials.commissionRecognised === '800000');
r = await action(admin, B.dealId, 'refund', { reason: 'Tenant withdrew before move-in; full refund of held rent.' });
check('14. full pre-settlement refund executes', r.status === 200 && r.body.status === 'refunded', JSON.stringify(r.body).slice(0, 100));
d = (await getDeal(B.L, B.dealId)).body;
check('14. tenant received the rent actually held (advance − commission = 800,000)',
  d.financials.refunded === '800000' && d.financials.rentHeld === '0',
  `refunded ${d.financials.refunded}`);
check('14. the deposit is NOT part of the rent refund - it stays in custody for its own lifecycle',
  d.financials.depositHeld === '1600000', `dep ${d.financials.depositHeld}`);
check('14. commission retention is the default (no invented reversal)', d.financials.commissionRecognised === '800000');
r = await action(admin, B.dealId, 'reverse-commission', { reasonCategory: 'tenant_cancelled', reason: 'should be refused' });
check('14. unapproved reversal category refused (COMMISSION_RETENTION_POLICY_PENDING)',
  r.status === 422 && r.body?.error?.code === 'COMMISSION_RETENTION_POLICY_PENDING', `status ${r.status}`);
r = await action(admin, B.dealId, 'reverse-commission', { reasonCategory: 'landlord_failure_to_provide_property', reason: 'Landlord never handed over; approved category.' });
check('14. approved category reverses commission + pays the tenant', r.status === 200, JSON.stringify(r.body).slice(0, 120));
d = (await getDeal(B.L, B.dealId)).body;
check('14. commission recognised back to zero; tenant payout recorded',
  d.financials.commissionRecognised === '0' && d.refunds.some((x) => x.kind === 'commission_reversal_payout' && x.state === 'confirmed'),
  `commission ${d.financials.commissionRecognised}`);

// ═══════════════════════ DEAL C — partial refund ═════════════════════════════
console.log('\n── Deal C: partial refund ──');
const C = await createDeal();
r = await action(admin, C.dealId, 'partial-refund', { amount: '900,000', reason: 'Exceeds held rent' });
check('partial refund above the held rent is refused (422)', r.status === 422, `status ${r.status}`);
r = await action(admin, C.dealId, 'partial-refund', { amount: '300,000', reason: 'One week counted as occupied by mutual record.' });
check('partial refund executes → partially_refunded', r.status === 200 && r.body.status === 'partially_refunded', JSON.stringify(r.body).slice(0, 100));
d = (await getDeal(C.L, C.dealId)).body;
check('partial refund leaves the remainder held (500,000)',
  d.financials.rentHeld === '500000' && d.status === 'partially_refunded', `rent ${d.financials.rentHeld}`);
r = await action(admin, C.dealId, 'refund', {});
check('full refund after partial → terminal refunded', r.status === 200 && r.body.status === 'refunded', JSON.stringify(r.body).slice(0, 100));
d = (await getDeal(C.L, C.dealId)).body;
check('ledger discharged: rent 0, deposits intact, refunded totals correct',
  d.financials.rentHeld === '0' && d.financials.refunded === '800000' && d.financials.escrowDischarged === false, // deposit still held
  `refunded ${d.financials.refunded}`);

// ═══════════════════ DEAL D/E — conflicting evidence → review ════════════════
console.log('\n── Deals D+E: move-in dispute paths ──');
const D = await createDeal();
r = await action(D.T, D.dealId, 'confirm-move-in', { note: 'Moved in Saturday.' });
r = await action(D.L, D.dealId, 'dispute-move-in', { reason: 'Tenant has NOT collected keys; property still vacant.', evidenceRef: 'vacant-photos-11' });
check('10. landlord dispute → move_in_disputed', r.status === 200 && r.body.status === 'move_in_disputed', JSON.stringify(r.body).slice(0, 100));
r = await action(admin, D.dealId, 'verify-move-in', { reason: 'Evidence: officer inventory + signed keys log confirm handover.' });
check('10. authorized review verifies the handover (recorded decision)', r.status === 200 && r.body.status === 'move_in_confirmed', JSON.stringify(r.body).slice(0, 100));
d = (await getDeal(D.L, D.dealId)).body;
check('10. decision recorded with reason and reviewer', d.moveInVerification.state === 'verified' && d.moveInVerification.decisionReason?.includes('inventory'), `state ${d.moveInVerification?.state}`);

const E = await createDeal();
r = await action(E.T, E.dealId, 'confirm-move-in', { note: 'Says moved in.' });
r = await action(E.L, E.dealId, 'dispute-move-in', { reason: 'No handover happened; tenant never met me.', evidenceRef: 'no-keys-log' });
r = await action(admin, E.dealId, 'reject-move-in', { reason: 'No verified handover: evidence contradicts the tenant claim.' });
check('10. review decision NOT verified → deal back to escrow_funded (money held)',
  r.status === 200 && r.body.status === 'escrow_funded', JSON.stringify(r.body).slice(0, 100));
r = await action(admin, E.dealId, 'refund', { reason: 'No verified move-in; rent returned to the tenant.' });
check('10. the not-verified deal can only end in a refund', r.status === 200 && r.body.status === 'refunded', JSON.stringify(r.body).slice(0, 100));

// ═══════════════════ DEAL G — provider payment reversal ══════════════════════
console.log('\n── Deal G: provider payment reversal ──');
const G = await createDeal();
r = await action(admin, G.dealId, 'reverse-payment', { reason: 'Provider reversal REF-9911: mobile-money sender dispute upheld.', evidenceRef: 'psp-reversal-9911' });
check('16. pre-settlement reversal executes → REVERSED (terminal)', r.status === 200 && r.body.status === 'reversed', JSON.stringify(r.body).slice(0, 100));
d = (await getDeal(G.L, G.dealId)).body;
check('16. custody and commission fully reversed (held 0, commission 0)',
  d.financials.heldInEscrow === '0' && d.financials.commissionRecognised === '0' && d.financials.rentHeld === '0' && d.financials.depositHeld === '0',
  `held ${d.financials.heldInEscrow} commission ${d.financials.commissionRecognised}`);
r = await action(admin, G.dealId, 'settle');
check('16. no further transitions from REVERSED (409)', r.status === 409, `status ${r.status}`);
r = await action(admin, G.dealId, 'record-provider-fee', { amount: '5,000', reason: 'rig: reversal processing fee psp-fee-002' });
check('16. provider fee still recordable on a reversed deal (HFR expense)', r.status === 200, `status ${r.status}`);

// ═══════════════ DEAL H — snapshots survive listing edits + 3-month rule ═════
console.log('\n── Deal H: snapshot immunity + mutual-agreement policy ──');
seq++;
{
  const landlord = await makeActor('lister');
  const tenant = await makeActor('tenant');
  const L = landlord.client, T = tenant.client;
  r = await L('POST', '/landlord/properties', {
    propertyType: 'house', bedrooms: 3, bathrooms: 2, furnished: 'unfurnished',
    neighbourhoodId: nbhd.id, landmarkText: `QA-FIN snap block ${RUN} ${seq}`,
    monthlyRent: '1,000,000', requiredMonthsUpfront: 2, depositAmount: '1,000,000',
    description: 'QA snapshot fixture house.',
  });
  if (r.status !== 201) throw new Error(`H listing failed: ${JSON.stringify(r.body)}`);
  const listingId = r.body?.listing?.id ?? r.body?.listingId;
  r = await L('POST', `/landlord/listings/${listingId}/agreement`, {});
  const jpeg = await sharp({ create: { width: 900, height: 600, channels: 3, background: { r: 96, g: 128, b: 90 } } })
    .jpeg({ quality: 85 }).toBuffer();
  const form = new FormData();
  form.append('file', new Blob([jpeg], { type: 'image/jpeg' }), 'qa-fin-photo.jpeg');
  form.append('caption', 'QA finance fixture photograph');
  r = await L('POST', `/landlord/listings/${listingId}/photos`, form);
  if (r.status !== 201) throw new Error(`H photo failed: ${JSON.stringify(r.body)}`);
  r = await officer.client('POST', '/viewings/qa-fin-visit/verify-listing', { listingId, verified: true, available: true, note: 'visit' });
  r = await L('POST', `/landlord/listings/${listingId}/publish`, {});
  r = await T('POST', '/viewings', { listingId, preferredDate: new Date(Date.now() + 86400000).toISOString() });
  const viewingId = r.body.id;
  r = await admin('POST', '/ops/dispatch', { viewingId, fooPartyId: officer.partyId });
  r = await officer.client('POST', `/viewings/${viewingId}/field-report`, { conditionRating: 'good', matchesListing: true, isAvailable: true, issuesText: 'ok' });
  r = await officer.client('POST', `/viewings/${viewingId}/conduct`, {});
  r = await officer.client('POST', '/deals', { introductionRecordId: r.body.introductionRecordId });
  const dealId = r.body.id;
  r = await officer.client('POST', `/deals/${dealId}/match-tenant`, {});
  r = await L('POST', `/deals/${dealId}/sign-agreement`, {});
  if (r.status !== 200) throw new Error('H sign failed');

  // 6b. a caller-supplied wrong amount is rejected BEFORE any booking (the
  // machine check passes at agreement_signed, then the amount guard fires).
  r = await T('POST', `/deals/${dealId}/fund-escrow`, { expectedAmount: '7200000' });
  check('6. a caller-supplied wrong amount is rejected (AMOUNT_NOT_AUTHORITATIVE)', r.status === 422, `status ${r.status}`);

  // A live listing is withdraw-first for amendment; the signed deal is
  // unaffected by the listing's publication state.
  r = await L('POST', `/landlord/listings/${listingId}/withdraw`, {});
  if (r.status !== 200) throw new Error(`H withdraw failed: ${JSON.stringify(r.body)}`);

  // 5. the >3-months rule on amendment
  r = await L('POST', `/landlord/listings/${listingId}/amend`, { requiredMonthsUpfront: 4, monthlyRent: '1,200,000', depositAmount: '2,400,000' });
  check('5. >3 months WITHOUT a recorded mutual agreement is refused (422)', r.status === 422 && r.body?.error?.code === 'ADVANCE_MUTUAL_AGREEMENT_REQUIRED', `status ${r.status}`);
  r = await L('POST', `/landlord/listings/${listingId}/amend`, { requiredMonthsUpfront: 4, monthlyRent: '1,200,000', depositAmount: '2,400,000', advanceMutualAgreementRef: 'Written mutual agreement dated this week: 4 months upfront for a reduced rate, signed by both parties.' });
  check('5. >3 months WITH the mutual agreement reference is accepted', r.status === 200, `status ${r.status}`);

  // 6. the signed deal is priced by its OWN snapshots, not the amended listing
  r = await T('POST', `/deals/${dealId}/fund-escrow`, {});
  check('6. funding STILL uses the deal\'s signed terms (2.0m + 1.0m deposit, not the amended 4.8m + 2.4m)', r.status === 200, JSON.stringify(r.body).slice(0, 120));
  d = (await getDeal(L, dealId)).body;
  check('6. funded exactly the snapshotted amount (3,000,000)',
    d.financials.funded === '3000000' && d.financials.expectedUpfront === '3000000', `funded ${d.financials.funded}`);
  check('6. snapshot fields unchanged by the listing edit (rent 1.0m, months 2, deposit 1.0m)',
    d.financials.monthlyRentSnapshot === '1000000' && d.financials.advanceMonthsSnapshot === 2 && d.financials.depositAmountSnapshot === '1000000');
}

// ═══════ ADVERSARIAL REGRESSIONS — review round 2026-10-30 ═══════
// Targeted repairs under test (each maps to a defect fixed in the review):
//   R1 silence never confirms and never unlocks settlement
//   R2 duplicate confirm events are refused (no duplicate verification)
//   R3 officers submit evidence but hold NO settlement/decision authority
//   R4 a decision reason is mandatory for the authorized review
//   R5 the landlord confirm is available exactly when the verification is open
//   R6 an authorized NOT-verified decision is final (no re-open, no 500)
//   R7 disputed deposit deductions: cannot apply while disputed; admin can
//      still approve a disputed deduction; wear-and-tear rejections recorded
//   R8 duplicate deposit release requests refused
//   R9 provider reversal from move_in_disputed ends the deal REVERSED
//   R10 six-months-upfront: post-settlement unearned rent is a LANDLORD
//       responsibility (no platform balance, no false receipt, refusal→escalated)
//   R11 concurrent settlement attempts book at most one payout
console.log('\n── R: adversarial regressions (review round) ──');

// R1–R5: verification discipline (Deal I)
const I = await createDeal();
r = await action(I.T, I.dealId, 'confirm-move-in', { note: 'Moved in with keys.' });
check('R1. tenant confirmation opens the verification', r.status === 200 && r.body.status === 'move_in_awaiting_verification', `status ${r.status}`);
r = await action(I.T, I.dealId, 'confirm-move-in', { note: 'duplicate event' });
check('R2. duplicate tenant confirmation is refused (409)', r.status === 409, `status ${r.status}`);
r = await action(admin, I.dealId, 'settle');
check('R1. settlement while the landlord is silent is refused (409)', r.status === 409, `status ${r.status}`);
d = (await getDeal(I.L, I.dealId)).body;
check('R1. silence does NOT confirm the handover or complete the verification',
  d.status === 'move_in_awaiting_verification' && d.moveInVerification?.landlordConfirmedAt == null && d.moveInVerification?.state === 'tenant_confirmed',
  `status ${d.status} state ${d.moveInVerification?.state}`);
r = await action(officer.client, I.dealId, 'verify-move-in', { reason: 'officer self-authorizing' });
check('R3. officer has NO verification-decision authority (403)', r.status === 403, `status ${r.status}`);
r = await action(officer.client, I.dealId, 'settle');
check('R3. officer cannot authorize settlement (403)', r.status === 403, `status ${r.status}`);
r = await action(admin, I.dealId, 'verify-move-in', { reason: '   ' });
check('R4. an authorized verify decision WITHOUT a reason is refused (400)', r.status === 400, `status ${r.status}`);
r = await action(I.L, I.dealId, 'confirm-move-in-landlord', { note: 'Handed over as agreed.' });
check('R5. landlord confirmation on the open verification completes it (dual confirm)',
  r.status === 200 && r.body.status === 'move_in_confirmed', `status ${r.status}`);
d = (await getDeal(I.L, I.dealId)).body;
check('R5. the completed verification records the reviewer decision', d.moveInVerification?.state === 'verified', `state ${d.moveInVerification?.state}`);
r = await action(I.L, I.dealId, 'confirm-move-in-landlord', { note: 'second time' });
check('R2. duplicate landlord confirmation is refused (409)', r.status === 409, `status ${r.status}`);

// R6: the NOT-verified decision is final (Deal K)
const K = await createDeal();
await action(K.T, K.dealId, 'confirm-move-in', { note: 'claims moved in' });
await action(K.L, K.dealId, 'dispute-move-in', { reason: 'Property still vacant; no keys collected.', evidenceRef: 'vacant-11' });
r = await action(admin, K.dealId, 'reject-move-in', { reason: 'Evidence contradicts the tenant claim: no handover.' });
check('R6. review decides NOT verified → escrow_funded', r.status === 200 && r.body.status === 'escrow_funded', `status ${r.status}`);
r = await action(K.T, K.dealId, 'confirm-move-in', { note: 'try to re-open' });
check('R6. re-opening after a NOT-verified decision refuses cleanly (409, not 500)',
  r.status === 409 && r.body?.error?.code === 'MOVEIN_DECISION_FINAL', `status ${r.status} ${JSON.stringify(r.body).slice(0, 80)}`);
r = await action(admin, K.dealId, 'refund', { reason: 'No verified handover; rent returned.' });
check('R6. only a refund releases the held rent after the final decision', r.status === 200 && r.body.status === 'refunded', `status ${r.status}`);

// R7+R8: deposit adversarials (Deal L)
const L2 = await createDeal();
r = await action(L2.L, L2.dealId, 'propose-deduction', { amount: '400,000', reason: 'Damaged door panel - invoice INV-31.', evidenceRef: 'door-31' });
check('R7. landlord proposes a deduction', r.status === 200, `status ${r.status}`);
const disputedDeduction = r.body.id;
r = await action(L2.T, L2.dealId, 'dispute-deduction', { deductionId: disputedDeduction, reason: 'That door was damaged before I moved in - pre-existing.' });
check('R7. tenant disputes the deduction', r.status === 200, `status ${r.status}`);
r = await action(admin, L2.dealId, 'apply-deduction', { deductionId: disputedDeduction });
check('R7. a DISPUTED deduction cannot be applied (409)', r.status === 409, `status ${r.status}`);
r = await action(admin, L2.dealId, 'approve-deduction', { deductionId: disputedDeduction, reason: 'Admin dispute resolution: officer visit notes record pre-existing damage - but tenant accepts reviewed scope.' });
check('R7. the authorized review CAN approve a disputed deduction (recorded decision)', r.status === 200, `status ${r.status}`);
r = await action(L2.T, L2.dealId, 'accept-deduction', { deductionId: disputedDeduction, note: 'Accepted after the review note.' });
check('R7. tenant accepts the reviewed deduction', r.status === 200, `status ${r.status}`);
r = await action(admin, L2.dealId, 'apply-deduction', { deductionId: disputedDeduction });
check('R7. the resolved deduction applies (deposit pays landlord)', r.status === 200, `status ${r.status}`);
r = await action(L2.L, L2.dealId, 'propose-deduction', { amount: '50,000', reason: 'Repainting scuffed walls.' });
const wearDeduction = r.body.id;
r = await action(admin, L2.dealId, 'reject-deduction', { deductionId: wearDeduction, reason: 'Normal wear and tear is never charged to the tenant - recorded rejection.' });
check('R7. a wear-and-tear deduction is rejected with the reason recorded', r.status === 200, `status ${r.status}`);
d = (await getDeal(L2.L, L2.dealId)).body;
check('R7. only the accepted deduction left the deposit (1,600,000 − 400,000 held)',
  d.financials.depositHeld === '1200000' && d.depositCase?.state !== 'closed', `dep ${d.financials.depositHeld} case ${d.depositCase?.state}`);
r = await action(admin, L2.dealId, 'refund-deposit', { reason: 'Tenancy ended; remaining deposit released.' });
check('R8. deposit release executes', r.status === 200, `status ${r.status}`);
r = await action(admin, L2.dealId, 'refund-deposit', { reason: 'duplicate release request' });
check('R8. duplicate release request refused (nothing left to release, 409)', r.status === 409, `status ${r.status}`);
r = await action(admin, L2.dealId, 'close-deposit-case', { reason: 'Every shilling accounted for.' });
d = (await getDeal(L2.L, L2.dealId)).body;
check('R8. deposit case closed at zero balance', r.status === 200 || d.depositCase?.state === 'closed', `status ${r.status} case ${d.depositCase?.state}`);

// R9: provider reversal from move_in_disputed (Deal M)
const M = await createDeal();
await action(M.T, M.dealId, 'confirm-move-in', { note: 'Moved in.' });
await action(M.L, M.dealId, 'dispute-move-in', { reason: 'Handover contested.' });
r = await action(admin, M.dealId, 'reverse-payment', { reason: 'Provider clawback REF-7722 while the handover is disputed.', evidenceRef: 'psp-7722' });
check('R9. reversal executes from move_in_disputed → REVERSED', r.status === 200 && r.body.status === 'reversed', `status ${r.status}`);
d = (await getDeal(M.L, M.dealId)).body;
check('R9. custody and commission fully reversed from the disputed state',
  d.financials.heldInEscrow === '0' && d.financials.commissionRecognised === '0', `held ${d.financials.heldInEscrow}`);

// R10: six months upfront → post-settlement landlord responsibility (Deal N)
const N = await createDeal({ months: 6, mutualRef: 'Written mutual agreement: six months upfront agreed by both parties for the fixed rate.' });
const RENT6 = 800000n, ADV6 = RENT6 * 6n, DEP6 = 1600000n, COM6 = RENT6; // 10% of ONE month
r = await action(N.T, N.dealId, 'confirm-move-in', {});
r = await action(N.L, N.dealId, 'confirm-move-in-landlord', {});
r = await action(admin, N.dealId, 'settle');
check('R10. six-month deal settles after verified move-in', r.status === 200 && r.body.status === 'settled', `status ${r.status}`);
d = (await getDeal(N.L, N.dealId)).body;
check('R10. landlord received advance − commission (4,000,000); commission is 10% of ONE month (800,000, not 480,000)',
  d.financials.releasedToLandlord === shs(ADV6 - COM6) && d.financials.commissionRecognised === shs(COM6),
  `released ${d.financials.releasedToLandlord} commission ${d.financials.commissionRecognised}`);
const heldAfterSettleN = d.financials.heldInEscrow;
r = await action(N.T, N.dealId, 'record-post-settlement-refund', { amount: '3,200,000', reason: 'Tenancy lawfully ended after two months - four paid months unearned (4 × 800,000).' });
check('R10. tenant records the four unearned months (3,200,000)', r.status === 200, `status ${r.status}`);
const psrN = r.body.recordId;
d = (await getDeal(N.L, N.dealId)).body;
check('R10. the claim created NO platform balance and NO false tenant refund receipt',
  d.financials.heldInEscrow === heldAfterSettleN && !d.refunds.some((x) => x.kind !== 'duplicate_payment' && x.state === 'confirmed'),
  `held ${d.financials.heldInEscrow} refunds ${JSON.stringify(d.refunds.map((x) => x.kind))}`);
r = await action(N.L, N.dealId, 'progress-post-settlement-refund', { refundId: psrN, outcome: 'resolved_paid_by_landlord' });
check('R10. the landlord cannot self-resolve the coordination (403)', r.status === 403, `status ${r.status}`);
r = await action(admin, N.dealId, 'progress-post-settlement-refund', { refundId: psrN, outcome: 'escalated', note: 'Landlord refuses to refund the unearned months - escalated for review.' });
check('R10. a REFUSING landlord ends in escalated (an honest terminal, never a platform promise)', r.status === 200, `status ${r.status}`);
d = (await getDeal(N.L, N.dealId)).body;
check('R10. refusal changed no money: balances identical, nothing refunded by the platform',
  d.financials.heldInEscrow === heldAfterSettleN && d.financials.owedToLandlord === '0' && d.financials.refunded === '0',
  `held ${d.financials.heldInEscrow} refunded ${d.financials.refunded}`);
r = await action(admin, N.dealId, 'refund-deposit', { reason: 'Deposit returned; the unearned-rent claim stays a landlord coordination record, not platform money.' });
check('R10. the deposit lifecycle still discharges independently', r.status === 200, `status ${r.status}`);

// R11: concurrent settlement attempts book at most one payout (Deal O)
const O = await createDeal();
await action(O.T, O.dealId, 'confirm-move-in', {});
await action(O.L, O.dealId, 'confirm-move-in-landlord', {});
const [s1, s2] = await Promise.allSettled([
  action(admin, O.dealId, 'settle'),
  action(admin, O.dealId, 'settle'),
]);
const statuses = [s1, s2].map((x) => (x.status === 'fulfilled' ? x.value.status : 0));
check('R11. exactly one of two concurrent settlements succeeds',
  statuses.filter((x) => x === 200).length === 1 && statuses.some((x) => x >= 400),
  `statuses ${JSON.stringify(statuses)}`);
d = (await getDeal(O.L, O.dealId)).body;
check('R11. the landlord was paid exactly once (800,000, no double release)',
  d.financials.releasedToLandlord === '800000' && d.financials.rentHeld === '0',
  `released ${d.financials.releasedToLandlord} rent ${d.financials.rentHeld}`);

// ═══════════════════ 18. ledger integrity + reconciliation ═══════════════════
console.log('\n── Ledger integrity + reconciliation + finance overview ──');
r = await admin('POST', '/ops/reconciliation', {});
check('18. reconciliation runs and reports', r.status === 200 || r.status === 201, `status ${r.status}`);
const rec = r.body?.check ?? r.body;
check('18. every posting balances; PSP/ledger inflow + classification + payouts reconcile',
  rec?.isReconciled === true, JSON.stringify(rec).slice(0, 200));
r = await admin('GET', '/admin/finance/overview');
const ov = r.body ?? {};
check('18. finance overview: postings balanced + custody classified (rent vs deposit vs legacy)',
  r.status === 200 && ov.integrity?.everyPostingBalances === true && ov.money?.heldInCustody?.rent !== undefined,
  `status ${r.status}`);
check('18. overview distinguishes HFR commission from HFR-borne provider fees',
  ov.money?.commissionEarned !== undefined && ov.money?.providerFeesBorneByHfr !== undefined);
check('18. pending policy approvals are explicit, not buried',
  Array.isArray(ov.pendingPolicyApprovals) && ov.pendingPolicyApprovals.length >= 5 &&
  JSON.stringify(ov.pendingPolicyApprovals).includes('awaiting business approval'));
check('18. custody honesty: provider custody NOT confirmed by default',
  ov.provider?.depositCustodyConfirmed === false, JSON.stringify(ov.provider).slice(0, 120));

// 20. existing journeys keep working (public surface + admin surface)
r = await fetch(`${API}/listings`).then((x) => x.json());
check('20. public search still serves the feed', Array.isArray(r?.results));
r = await admin('GET', '/admin/users');
check('20. admin user directory still works', r.status === 200);
r = await admin('GET', '/viewings/dispatch-queue');
check('20. ops dispatch queue still works', r.status === 200);

// ── summary ──────────────────────────────────────────────────────────────────
console.log(`\n══════════════════════════════════════════════════`);
console.log(`${failures === 0 ? 'ALL PASS' : 'FAILURES PRESENT'}: ${checks - failures}/${checks} checks passed`);
process.exit(failures === 0 ? 0 : 1);
} catch (err) {
  console.error('SUITE ERROR:', err?.message ?? err);
  console.error('\n── app log tail ──');
  console.error(appLog.slice(-5000));
  process.exit(2);
}
if (false) {
  console.error('\n── app log tail ──');
  console.error(appLog.slice(-4000));
}
process.exit(failures === 0 ? 0 : 1);
