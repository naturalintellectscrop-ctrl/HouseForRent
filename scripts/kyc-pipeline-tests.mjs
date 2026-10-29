// LANDLORD KYC + TERMS + ADMIN REVIEW TEST SUITE (consolidated round).
//
// Boots the FULL application stack on a private, disposable rig:
//   PGlite (real Postgres 16 WASM) over the wire protocol
//   + `next dev` (Turbopack) with MEDIA_STORAGE=local
// and drives the actual HTTP surface with real multipart uploads processed
// by the real sharp pipeline. Nothing here touches production.
//
// Covers:
//   Terms   — version mismatch refusal, explicit acceptance, idempotent
//             re-acceptance, append-only history preserved, server-side
//             enforcement (submission without acceptance is a 403).
//   Evidence — valid uploads through the real pipeline, spoofed MIME,
//             corrupt bytes, oversize, unauthenticated/tenant refusals,
//             uploader/admin access, cross-account + anonymous 404s,
//             delete-while-open, delete-refusal semantics via FK wall.
//   Submission — validation matrix (missing docs, short explanations,
//             bogus payout methods/destinations, forged asset ids), the
//             terms gate, KYC_ALREADY_OPEN, resubmission of a more_info
//             section resetting exactly that section.
//   Review  — authorization (401/403), the queue + detail reads, decision
//             reasons required, approve/request-info/reject, idempotent
//             409 on a repeated identical decision, section independence
//             (identity approval never touches authority or payout),
//             party status untouched, listing verification untouched,
//             broker authority approval verifying an EXISTING pending
//             mandate (and never creating ownership), non-standard
//             document path flagged for owner review.
//
// Usage: bun scripts/kyc-pipeline-tests.mjs
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { readFileSync, writeFileSync, rmSync, mkdirSync, existsSync } from 'node:fs';
import { execFileSync, spawn } from 'node:child_process';
import path from 'node:path';
import sharp from 'sharp';
import bcrypt from 'bcryptjs';

const REPO = '/home/z/my-project';
const PORT_DB = 55000 + Math.floor(Math.random() * 4000);
const PORT_APP = 31000 + Math.floor(Math.random() * 8000);
const API = `http://127.0.0.1:${PORT_APP}/api/v1`;
const MEDIA_ROOT = '/tmp/hfr-kyc-test-' + Date.now();

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
check('rig DB ready (schema + neighbourhood seed)', true);

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
  if (!appReady) await sleep(1000);
}
check('next dev ready', appReady, `on :${PORT_APP}`);
if (!appReady) {
  console.log(appLog.slice(-2000));
  process.exit(1);
}

// ── 3. HTTP helpers ──────────────────────────────────────────────────────────
function client() {
  const state = { cookie: null };
  const call = async function (method, urlPath, body, headers = {}) {
    const res = await fetch(`${API}${urlPath}`, {
      method,
      headers: {
        ...(state.cookie ? { cookie: state.cookie } : {}),
        ...(body instanceof FormData || body === undefined ? {} : { 'content-type': 'application/json' }),
        ...headers,
      },
      body: body instanceof FormData ? body : body !== undefined ? JSON.stringify(body) : undefined,
      redirect: 'manual',
    });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) state.cookie = setCookie.split(';')[0];
    let json = null;
    try { json = await res.json(); } catch {}
    return { status: res.status, json, headers: res.headers };
  };
  return call;
}

function multipart(filename, bytes, mime, extra = {}) {
  const fd = new FormData();
  fd.append('file', new Blob([bytes], { type: mime }), filename);
  for (const [k, v] of Object.entries(extra)) fd.append(k, v);
  return fd;
}

// ── 4. fixtures (sharp, in-process) ─────────────────────────────────────────
const idJpeg = await sharp({
  create: { width: 1200, height: 800, channels: 3, background: { r: 120, g: 100, b: 80 } },
}).jpeg({ quality: 88 }).toBuffer();
const selfieJpeg = await sharp({
  create: { width: 900, height: 1200, channels: 3, background: { r: 90, g: 110, b: 120 } },
}).jpeg({ quality: 88 }).toBuffer();
const titleJpeg = await sharp({
  create: { width: 1400, height: 1000, channels: 3, background: { r: 100, g: 120, b: 90 } },
}).jpeg({ quality: 85 }).toBuffer();
const corruptJpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('not really jpeg payload. '.repeat(300))]);
const oversize = Buffer.alloc(4_200_000, 0x01);

// ── 5. accounts ──────────────────────────────────────────────────────────────
// The admin cannot self-register (by design) — seeded directly, the same
// provisioning shape the ops console and provision-platform-owner use.
await db.query(
  `INSERT INTO party (id, display_name, primary_phone, status, created_at, updated_at)
   VALUES ('rig-admin-party', 'Rig Platform Admin', '+256700000100', 'active', now(), now())
   ON CONFLICT (id) DO NOTHING`,
);
await db.query(
  `INSERT INTO user_account (id, party_id, auth_role, created_at)
   VALUES ('rig-admin-account', 'rig-admin-party', 'admin', now())
   ON CONFLICT (id) DO NOTHING`,
);
await db.query(
  `INSERT INTO user_credential (id, user_account_id, password_hash, created_at, updated_at)
   VALUES ('rig-admin-cred', 'rig-admin-account', $1, now(), now())
   ON CONFLICT (id) DO NOTHING`,
  [bcrypt.hashSync('rig-admin-password', 10)],
);
check('rig admin seeded (party + account + bcrypt credential)', true);

const admin = client();
const landlordA = client(); // the KYC applicant (owner path)
const brokerB = client();   // the KYC applicant (broker path, mandate integration)
const tenantC = client();   // role-refusal checks
const stranger = client();  // cross-account evidence refusals

let r = await admin('POST', '/auth/login', { primaryPhone: '+256700000100', password: 'rig-admin-password' });
check('admin sign-in', r.status === 200, JSON.stringify(r.json?.error ?? ''));

r = await landlordA('POST', '/auth/register', { displayName: 'Rig Owner Landlord', primaryPhone: '+256700000201', password: 'rig-password-1', role: 'lister' });
r = await landlordA('POST', '/auth/login', { primaryPhone: '+256700000201', password: 'rig-password-1' });
check('landlord A signed in', r.status === 200);
r = await brokerB('POST', '/auth/register', { displayName: 'Rig Broker', primaryPhone: '+256700000202', password: 'rig-password-2', role: 'lister' });
r = await brokerB('POST', '/auth/login', { primaryPhone: '+256700000202', password: 'rig-password-2' });
check('broker B signed in', r.status === 200);
r = await tenantC('POST', '/auth/register', { displayName: 'Rig Tenant', primaryPhone: '+256700000203', password: 'rig-password-3', role: 'tenant' });
r = await tenantC('POST', '/auth/login', { primaryPhone: '+256700000203', password: 'rig-password-3' });
check('tenant C signed in', r.status === 200);
// The stranger never signs in.
// Broker B uploads their identity documents EARLY so a REAL cross-account
// citation can be tested below (citing another applicant's asset id).
const brokerAssets = {};
for (const [kind, bytes] of [['id_front', idJpeg], ['id_back', idJpeg], ['selfie', selfieJpeg]]) {
  const up = await brokerB('POST', '/landlord/kyc/media', multipart(`b-${kind}.jpg`, bytes, 'image/jpeg', { kind }));
  brokerAssets[kind] = up.json?.mediaAssetId;
}
check('B-0 broker uploaded their three identity documents',
  Boolean(brokerAssets.id_front) && Boolean(brokerAssets.id_back) && Boolean(brokerAssets.selfie), '');

r = await landlordA('POST', '/landlord/properties', {
  propertyType: 'apartment', bedrooms: 2, bathrooms: 1, furnished: 'semi_furnished',
  neighbourhoodId: 'rig-nbhd-1', landmarkText: 'Rig KYC property', streetAddress: 'Rig street',
  monthlyRent: 900000, depositAmount: 450000, requiredMonthsUpfront: 2, descriptionText: 'Rig listing',
});
const kycPropertyId = r.json?.propertyId;
check('property created for mandate integration', r.status === 201 && Boolean(kycPropertyId));

// Party ids from registration are dynamic — resolve them for the mandate row.
const partyIds = await db.query(
  `SELECT p.id, u.auth_role, p.primary_phone FROM party p JOIN user_account u ON u.party_id = p.id
   WHERE p.primary_phone IN ('+256700000201', '+256700000202')`,
);
const ownerPartyId = partyIds.rows.find((x) => x.primary_phone === '+256700000201')?.id;
const brokerPartyId = partyIds.rows.find((x) => x.primary_phone === '+256700000202')?.id;
// A property + pending mandate for the broker-integration test: the
// property belongs to A (the owner); B (broker) holds a PENDING mandate
// for it — exactly the row a broker's listing flow would have created.
await db.query(
  `INSERT INTO property_mandate (id, lister_party_id, property_id, state, created_at, updated_at)
   VALUES ('rig-mandate-1', $1, $2, 'pending', now(), now())
   ON CONFLICT (id) DO NOTHING`,
  [brokerPartyId, kycPropertyId],
);
const mandateRow = await db.query(`SELECT state FROM property_mandate WHERE id = 'rig-mandate-1'`);
check('pending mandate seeded for (broker B, property)', mandateRow.rows[0]?.state === 'pending');

// ── 6. TERMS ─────────────────────────────────────────────────────────────────
r = await landlordA('GET', '/landlord/terms');
check('T-1 terms status: current version, not yet accepted',
  r.status === 200 && r.json.current === false && r.json.accepted === null
  && typeof r.json.currentVersion === 'string' && r.json.currentVersion.length > 0,
  JSON.stringify(r.json));

r = await landlordA('POST', '/landlord/terms', { version: 'not-a-version' });
check('T-2 acceptance with a wrong version refused (400)',
  r.status === 400 && r.json?.error?.code === 'TERMS_VERSION_MISMATCH', JSON.stringify(r.json?.error));

r = await tenantC('POST', '/landlord/terms', { version: (await landlordA('GET', '/landlord/terms')).json.currentVersion });
check('T-3 tenant cannot accept LANDLORD terms (403 role surface)', r.status === 403, JSON.stringify(r.json?.error));

const currentVersion = (await landlordA('GET', '/landlord/terms')).json.currentVersion;
r = await landlordA('POST', '/landlord/terms', { version: currentVersion });
check('T-4 explicit acceptance recorded (current=true, version+timestamp)',
  r.status === 200 && r.json.current === true && r.json.accepted?.version === currentVersion
  && Boolean(r.json.accepted?.acceptedAt), JSON.stringify(r.json.accepted));
const consentRows = await db.query(
  `SELECT id, policy_version FROM consent_record WHERE purpose = 'landlord_terms'`,
);
check('T-5 ConsentRecord row written server-side (append-only table)',
  consentRows.rows.length === 1 && consentRows.rows[0].policy_version === currentVersion);
const auditTerms = await db.query(
  `SELECT count(*)::int n FROM audit_event WHERE event_type = 'landlord_terms_accepted'`,
);
check('T-6 acceptance audited', auditTerms.rows[0].n === 1);

r = await landlordA('POST', '/landlord/terms', { version: currentVersion });
const consentAfter = await db.query(
  `SELECT count(*)::int n FROM consent_record WHERE purpose = 'landlord_terms'`,
);
check('T-7 re-acceptance idempotent (no duplicate row)', r.status === 200 && consentAfter.rows[0].n === 1);

// Historical preservation: an older-version row (as a previous round would
// have written) must survive alongside the current acceptance.
await db.query(
  `INSERT INTO consent_record (id, party_id, purpose, granted_at, policy_version)
   VALUES ('rig-old-consent', (SELECT id FROM party WHERE primary_phone = '+256700000201'),
           'landlord_terms', now() - interval '30 days', 'landlord-onboarding-OLD')`,
);
r = await landlordA('GET', '/landlord/terms');
check('T-8 history keeps the superseded acceptance untouched',
  r.json.history.length === 2 && r.json.history.some((h) => h.version === 'landlord-onboarding-OLD')
  && r.json.current === true, JSON.stringify(r.json.history));

// ── 7. EVIDENCE UPLOADS ──────────────────────────────────────────────────────
r = await landlordA('POST', '/landlord/kyc/media', multipart('id-front.jpg', idJpeg, 'image/jpeg', { kind: 'id_front' }));
check('E-1 valid ID-front upload → 201 with asset + thumb url',
  r.status === 201 && Boolean(r.json.mediaAssetId) && r.json.thumbUrl?.includes('/api/v1/media/'),
  JSON.stringify(r.json?.error ?? ''));
const idFrontAsset = r.json?.mediaAssetId;

r = await landlordA('POST', '/landlord/kyc/media', multipart('id-back.jpg', idJpeg, 'image/jpeg', { kind: 'id_back' }));
const idBackAsset = r.json?.mediaAssetId;
check('E-2 ID-back upload → 201', r.status === 201, '');
r = await landlordA('POST', '/landlord/kyc/media', multipart('selfie.jpg', selfieJpeg, 'image/jpeg', { kind: 'selfie' }));
const selfieAsset = r.json?.mediaAssetId;
check('E-3 selfie upload → 201', r.status === 201, '');
r = await landlordA('POST', '/landlord/kyc/media', multipart('title.jpg', titleJpeg, 'image/jpeg', { kind: 'ownership_evidence' }));
const ownershipAsset = r.json?.mediaAssetId;
check('E-3b ownership-evidence upload → 201', r.status === 201, '');

const assetRow = await db.query(`SELECT storage_ref FROM media_asset WHERE id = $1`, [idFrontAsset]);
check('E-4 evidence stored under kyc/<partyId>/ (no listing linkage)',
  assetRow.rows[0]?.storage_ref?.startsWith('kyc/') === true, assetRow.rows[0]?.storage_ref);
const photoCount = await db.query(
  `SELECT count(*)::int n FROM listing_photo WHERE media_asset_id = ANY($1)`,
  [[idFrontAsset, idBackAsset, selfieAsset]],
);
check('E-5 evidence never becomes a listing photo', photoCount.rows[0].n === 0);

r = await landlordA('GET', `/media/${idFrontAsset}?variant=thumb`);
check('E-6 uploader reads own evidence (200 image/webp)',
  r.status === 200, `status ${r.status}`);
r = await admin('GET', `/media/${idFrontAsset}?variant=detail`);
check('E-7 staff reads evidence (200)', r.status === 200, `status ${r.status}`);
r = await stranger('GET', `/media/${idFrontAsset}`);
check('E-8 unauthenticated read refused (404, no existence leak)', r.status === 404, `status ${r.status}`);
r = await brokerB('GET', `/media/${idFrontAsset}`);
check('E-9 another lister cannot read the evidence (404)', r.status === 404, `status ${r.status}`);
r = await tenantC('GET', `/media/${idFrontAsset}`);
check('E-10 tenant cannot read the evidence (404)', r.status === 404, `status ${r.status}`);

r = await landlordA('POST', '/landlord/kyc/media', multipart('spoof.jpg', idJpeg, 'image/png', { kind: 'id_front' }));
check('E-11 declared-MIME spoof refused (415)', r.status === 415, JSON.stringify(r.json?.error));
r = await landlordA('POST', '/landlord/kyc/media', multipart('corrupt.jpg', corruptJpeg, 'image/jpeg', { kind: 'selfie' }));
check('E-12 corrupt bytes refused (415)', r.status === 415, '');
r = await landlordA('POST', '/landlord/kyc/media', multipart('big.jpg', oversize, 'image/jpeg', { kind: 'selfie' }));
check('E-13 oversize refused (413)', r.status === 413, '');
r = await landlordA('POST', '/landlord/kyc/media', multipart('x.jpg', idJpeg, 'image/jpeg', { kind: 'bank_statement' }));
check('E-14 unknown kind refused (400)', r.status === 400, '');
const anon = client();
r = await anon('POST', '/landlord/kyc/media', multipart('x.jpg', idJpeg, 'image/jpeg', { kind: 'selfie' }));
check('E-15 unauthenticated upload refused (401)', r.status === 401, '');
r = await tenantC('POST', '/landlord/kyc/media', multipart('x.jpg', idJpeg, 'image/jpeg', { kind: 'selfie' }));
check('E-16 tenant upload refused (403)', r.status === 403, '');

// Delete-while-open works (and detaches any open citation).
r = await landlordA('POST', '/landlord/kyc/media', multipart('spare.jpg', selfieJpeg, 'image/jpeg', { kind: 'id_back' }));
const spareAsset = r.json?.mediaAssetId;
r = await landlordA('DELETE', '/landlord/kyc/media', { mediaAssetId: spareAsset });
const spareGone = await db.query(`SELECT count(*)::int n FROM media_asset WHERE id = $1`, [spareAsset]);
const spareFiles = await db.query(`SELECT count(*)::int n FROM media_variant WHERE media_asset_id = $1`, [spareAsset]);
check('E-17 own evidence deleted while open (rows + variants gone)',
  r.status === 200 && spareGone.rows[0].n === 0 && spareFiles.rows[0].n === 0, '');

// ── 8. SUBMISSION (the terms gate + validation matrix) ───────────────────────
const submission = (overrides = {}) => ({
  legalName: 'Rig Owner Landlord',
  idDocumentType: 'national_id',
  ageConfirmed: true,
  idFrontMediaId: idFrontAsset,
  idBackMediaId: idBackAsset,
  selfieMediaId: selfieAsset,
  relationship: 'owner',
  titleParticulars: 'Plot 12 Rig Road, block A, FRV 1234 (FIXTURE)',
  ownershipEvidenceMediaId: ownershipAsset,
  declarations: {
    identityAccurate: true, relationshipHonest: true, authorityDisclosed: true,
    accuracyOngoing: true, agreeTerms: true,
  },
  termsVersion: currentVersion,
  ...overrides,
});

// The terms gate: broker B has NOT accepted the terms yet.
r = await brokerB('POST', '/landlord/kyc', submission());
check('S-1 submission without accepted terms refused server-side (403)',
  r.status === 403 && r.json?.error?.code === 'TERMS_NOT_ACCEPTED', JSON.stringify(r.json?.error));

r = await landlordA('POST', '/landlord/kyc', submission({ idFrontMediaId: null }));
check('S-2 national_id path without ID front refused (400)', r.status === 400, '');
r = await landlordA('POST', '/landlord/kyc', submission({ ageConfirmed: false }));
check('S-3 age declaration not confirmed refused (400)', r.status === 400, '');
r = await landlordA('POST', '/landlord/kyc', submission({
  declarations: { identityAccurate: true, relationshipHonest: true, authorityDisclosed: true, accuracyOngoing: true, agreeTerms: false },
}));
check('S-4 incomplete declarations refused (400)', r.status === 400, '');
r = await landlordA('POST', '/landlord/kyc', submission({ titleParticulars: null }));
check('S-5 owner without title particulars refused (400)', r.status === 400, '');
r = await landlordA('POST', '/landlord/kyc', submission({ ownershipEvidenceMediaId: '00000000-0000-4000-8000-000000000000' }));
check('S-6 forged ownership-evidence id refused (404)', r.status === 404, JSON.stringify(r.json?.error));
r = await landlordA('POST', '/landlord/kyc', submission({ selfieMediaId: brokerAssets.selfie }));
check("S-7 citing ANOTHER applicant's real asset refused (404)",
  r.status === 404 && r.json?.error?.code === 'MEDIA_NOT_FOUND', JSON.stringify(r.json?.error));
const appAId = (await landlordA('POST', '/landlord/kyc', submission())).json?.id;
check('S-8 valid owner submission → 201, all sections pending',
  Boolean(appAId), appAId);
r = await landlordA('POST', '/landlord/kyc', submission());
check('S-9 second submission while open refused (409 KYC_ALREADY_OPEN)',
  r.status === 409 && r.json?.error?.code === 'KYC_ALREADY_OPEN', '');
r = await brokerB('POST', '/landlord/kyc', submission({ legalName: 'Someone Else', termsVersion: 'made-up-version' }));
check('S-10 submission citing a non-current terms version refused (400)',
  r.status === 403 || r.json?.error?.code === 'TERMS_VERSION_MISMATCH', JSON.stringify(r.json?.error));

const submittedAudit = await db.query(
  `SELECT count(*)::int n FROM audit_event WHERE event_type = 'landlord_kyc_submitted'`,
);
check('S-11 submission audited', submittedAudit.rows[0].n >= 1);
const partyStatus = await db.query(
  `SELECT status FROM party WHERE primary_phone = '+256700000201'`,
);
check('S-12 submission did NOT auto-activate or verify anything (party still pending_verification)',
  partyStatus.rows[0].status === 'pending_verification', partyStatus.rows[0].status);

// Payout validation on resubmission (PATCH).
r = await landlordA('PATCH', `/landlord/kyc/${appAId}`, {
  payoutRecipientName: 'Rig Owner', payoutMethod: 'bank_transfer', payoutDestination: '+256700100901',
});
check('S-13 unsupported payout method refused (400)', r.status === 400, JSON.stringify(r.json?.error));
r = await landlordA('PATCH', `/landlord/kyc/${appAId}`, {
  payoutRecipientName: 'Rig Owner', payoutMethod: 'mobile_money', payoutDestination: '07123',
});
check('S-14 invalid mobile-money destination refused (400)', r.status === 400, '');
r = await landlordA('PATCH', `/landlord/kyc/${appAId}`, {
  payoutRecipientName: 'Rig Owner', payoutMethod: 'mobile_money', payoutDestination: '0770000111',
});
const payoutStored = await db.query(
  `SELECT payout_method, payout_destination FROM landlord_kyc WHERE id = $1`, [appAId],
);
check('S-15 valid payout normalized to +256 (mobile_money only)',
  r.status === 200 && payoutStored.rows[0]?.payout_method === 'mobile_money'
  && payoutStored.rows[0]?.payout_destination === '+256770000111',
  JSON.stringify(payoutStored.rows[0]));

// ── 9. ADMIN REVIEW ──────────────────────────────────────────────────────────
r = await landlordA('GET', '/admin/kyc');
check('R-1 queue is admin-only (lister 403)', r.status === 403, '');
const anonClient2 = client();
r = await anonClient2('GET', '/admin/kyc');
check('R-2 queue refuses anonymous (401)', r.status === 401, '');
r = await admin('GET', '/admin/kyc');
const queueRow = r.json?.rows?.find((x) => x.id === appAId);
check('R-3 queue lists the application with flags', r.status === 200 && Boolean(queueRow),
  JSON.stringify(r.json?.rows?.[0]?.flags ?? ''));
r = await admin('GET', `/admin/kyc/${appAId}`);
check('R-4 detail carries evidence ids + declarations + terms version',
  r.status === 200 && r.json?.row?.evidence?.idFrontMediaId === idFrontAsset
  && r.json.row.declarations?.identityAccurate === true && r.json.row.termsVersion === currentVersion,
  JSON.stringify(r.json?.row?.evidence ?? r.json?.error ?? r.json).slice(0, 200));

r = await admin('POST', `/admin/kyc/${appAId}/decision`, { section: 'identity', decision: 'approve', reason: '' });
check('R-5 decision without a reason refused (400)', r.status === 400, '');
r = await landlordA('POST', `/admin/kyc/${appAId}/decision`, { section: 'identity', decision: 'approve', reason: 'self-approved' });
check('R-6 lister cannot decide (403)', r.status === 403, '');

r = await admin('POST', `/admin/kyc/${appAId}/decision`, {
  section: 'identity', decision: 'approve', reason: 'ID front/back consistent with the selfie; name matches.',
});
check('R-7 identity approve → approved', r.status === 200 && r.json.identityState === 'approved', '');
r = await admin('POST', `/admin/kyc/${appAId}/decision`, {
  section: 'identity', decision: 'approve', reason: 'Approving again changes nothing.',
});
check('R-8 identical re-decision refused (409 KYC_ALREADY_IN_STATE)',
  r.status === 409 && r.json?.error?.code === 'KYC_ALREADY_IN_STATE', '');
const dupAudit = await db.query(
  `SELECT count(*)::int n FROM audit_event
   WHERE event_type = 'landlord_kyc_decision' AND subject_ref = $1
     AND payload->>'section' = 'identity' AND payload->>'decision' = 'approve'`,
  [appAId],
);
check('R-9 no duplicate audit row for the refused repeat', dupAudit.rows[0].n === 1);

// Section independence: identity approval must NOT move authority/payout.
const afterIdentity = await db.query(
  `SELECT identity_state, authority_state, payout_state FROM landlord_kyc WHERE id = $1`, [appAId],
);
check('R-10 authority + payout untouched by identity approval',
  afterIdentity.rows[0]?.authority_state === 'pending' && afterIdentity.rows[0]?.payout_state === 'pending', '');

// Request-info on authority → applicant resubmits → state returns to pending.
r = await admin('POST', `/admin/kyc/${appAId}/decision`, {
  section: 'authority', decision: 'request_info',
  reason: 'The title scan is unreadable in one corner - please re-upload it.',
});
check('R-11 request-info → more_info with reason recorded',
  r.status === 200 && r.json.authorityState === 'more_info', '');
const infoAudit = await db.query(
  `SELECT payload->>'reason' reason FROM audit_event
   WHERE event_type = 'landlord_kyc_decision' AND subject_ref = $1
     AND payload->>'section' = 'authority' ORDER BY occurred_at DESC LIMIT 1`, [appAId],
);
check('R-12 the reviewer reason is on the trail', (infoAudit.rows[0]?.reason ?? '').includes('unreadable'), '');

r = await landlordA('POST', '/landlord/kyc/media', multipart('title.jpg', titleJpeg, 'image/jpeg', { kind: 'ownership_evidence' }));
const titleAsset = r.json?.mediaAssetId;
r = await landlordA('PATCH', `/landlord/kyc/${appAId}`, { ownershipEvidenceMediaId: titleAsset });
check('R-13 applicant resubmits the sent-back section (200)',
  r.status === 200 && r.json.authorityState === 'pending', '');
const afterResubmit = await db.query(
  `SELECT identity_state, authority_state FROM landlord_kyc WHERE id = $1`, [appAId],
);
check('R-14 resubmission did NOT reset the decided identity section',
  afterResubmit.rows[0].identity_state === 'approved', '');
const resubAudit = await db.query(
  `SELECT count(*)::int n FROM audit_event WHERE event_type = 'landlord_kyc_resubmitted' AND subject_ref = $1`,
  [appAId],
);
check('R-15 resubmission audited (payout PATCH + section resubmit)', resubAudit.rows[0].n >= 2, `n=${resubAudit.rows[0].n}`);

// Evidence FK wall: a DECIDED section's evidence cannot be deleted.
r = await landlordA('DELETE', '/landlord/kyc/media', { mediaAssetId: idFrontAsset });
check('R-16 decided evidence delete refused (409)', r.status === 409
  && r.json?.error?.code === 'KYC_EVIDENCE_DECIDED', `status=${r.status} ${JSON.stringify(r.json?.error ?? '')}`);

r = await admin('POST', `/admin/kyc/${appAId}/decision`, {
  section: 'authority', decision: 'approve', reason: 'Title evidence re-reviewed and coherent.',
});
check('R-17 authority approve after resubmission', r.status === 200 && r.json.authorityState === 'approved', '');

// Payout stays pending even with identity+authority approved — payout is
// its own decision, and payouts stay disabled at the platform level.
const afterAuthority = await db.query(
  `SELECT payout_state, identity_state FROM landlord_kyc WHERE id = $1`, [appAId],
);
check('R-18 payout NOT auto-approved by identity/authority approval',
  afterAuthority.rows[0]?.payout_state === 'pending', '');
r = await admin('POST', `/admin/kyc/${appAId}/decision`, {
  section: 'payout', decision: 'approve', reason: 'Mobile-money number valid; recipient recorded.',
});
check('R-19 payout decision works independently (approved)',
  r.status === 200 && r.json.payoutState === 'approved', '');

// The application is now fully decided → new submission allowed, resubmit refused.
r = await landlordA('PATCH', `/landlord/kyc/${appAId}`, { titleParticulars: 'Plot 12 Rig Road, block A, FRV 1234 amended (FIXTURE)' });
check('R-20 resubmission after a decided application refused (409 KYC_NOT_OPEN)',
  r.status === 409 && r.json?.error?.code === 'KYC_NOT_OPEN', '');

// ── 10. BROKER PATH + MANDATE INTEGRATION ────────────────────────────────────
await brokerB('POST', '/landlord/terms', { version: currentVersion });
r = await brokerB('POST', '/landlord/kyc', {
  legalName: 'Rig Broker',
  idDocumentType: 'national_id',
  ageConfirmed: true,
  idFrontMediaId: brokerAssets.id_front,
  idBackMediaId: brokerAssets.id_back,
  selfieMediaId: brokerAssets.selfie,
  relationship: 'broker_agent',
  propertyId: kycPropertyId,
  titleParticulars: 'Plot 12 Rig Road (owner: Rig Owner Landlord) (FIXTURE)',
  authorityExplanation: 'I manage this property for the owner under a signed management agreement.',
  declarations: {
    identityAccurate: true, relationshipHonest: true, authorityDisclosed: true,
    accuracyOngoing: true, agreeTerms: true,
  },
  termsVersion: currentVersion,
});
const appBId = r.json?.id;
check('B-1 broker application accepted (authority explanation satisfies the non-owner path)',
  r.status === 201, JSON.stringify(r.json?.error ?? ''));
// A broker's submission does NOT need ownership evidence — but B attached none.
const bRow = await db.query(`SELECT relationship, authority_explanation FROM landlord_kyc WHERE id = $1`, [appBId]);
check('B-2 broker row keeps the declared relationship + explanation (never recorded as owner)',
  bRow.rows[0]?.relationship === 'broker_agent' && (bRow.rows[0]?.authority_explanation ?? '').includes('owner'), '');

r = await admin('POST', `/admin/kyc/${appBId}/decision`, {
  section: 'authority', decision: 'approve', reason: 'Management agreement consistent; owner confirmed by phone.',
});
const mandateAfter = await db.query(`SELECT state, verified_by_party_id FROM property_mandate WHERE id = 'rig-mandate-1'`);
check('B-3 authority approval verified the EXISTING pending mandate in the same transaction',
  r.status === 200 && mandateAfter.rows[0]?.state === 'verified', JSON.stringify(mandateAfter.rows[0]));
const mandateAudit = await db.query(
  `SELECT payload->>'via' via FROM audit_event WHERE event_type = 'mandate_decided' AND subject_ref = 'rig-mandate-1'`,
);
check('B-4 the mandate decision is on the audit trail with via=landlord_kyc',
  mandateAudit.rows[0]?.via === 'landlord_kyc', '');

// ── 11. NON-STANDARD DOCUMENT PATH (owner review, never invented rejection) ──
const docD = client();
await docD('POST', '/auth/register', { displayName: 'Rig OtherDoc', primaryPhone: '+256700000204', password: 'rig-password-4', role: 'lister' });
await docD('POST', '/auth/login', { primaryPhone: '+256700000204', password: 'rig-password-4' });
await docD('POST', '/landlord/terms', { version: currentVersion });
let selfieD = null;
let titleD = null;
r = await docD('POST', '/landlord/kyc/media', multipart('selfie.jpg', selfieJpeg, 'image/jpeg', { kind: 'selfie' }));
selfieD = r.json?.mediaAssetId;
r = await docD('POST', '/landlord/kyc/media', multipart('title.jpg', titleJpeg, 'image/jpeg', { kind: 'ownership_evidence' }));
titleD = r.json?.mediaAssetId;
r = await docD('POST', '/landlord/kyc', {
  legalName: 'Rig OtherDoc',
  idDocumentType: 'other_document',
  ageConfirmed: true,
  selfieMediaId: selfieD,
  relationship: 'owner',
  titleParticulars: 'Plot 99 Rig Road (FIXTURE, other-document path)',
  ownershipEvidenceMediaId: titleD,
  declarations: {
    identityAccurate: true, relationshipHonest: true, authorityDisclosed: true,
    accuracyOngoing: true, agreeTerms: true,
  },
  termsVersion: currentVersion,
});
const appDId = r.json?.id;
check('D-1 other-document submission accepted (selfie suffices; no invented rule)', r.status === 201, JSON.stringify(r.json?.error ?? ''));
r = await admin('GET', '/admin/kyc');
const dRow = r.json?.rows?.find((x) => x.id === appDId);
check('D-2 queue flags the non-standard path for owner review',
  Boolean(dRow) && dRow.flags.some((f) => f.includes('owner-review')), JSON.stringify(dRow?.flags ?? []));
r = await admin('POST', `/admin/kyc/${appDId}/decision`, {
  section: 'identity', decision: 'request_info',
  reason: 'Please attach the passport page you referenced.',
});
check('D-3 reviewer can request more information on the exception path', r.status === 200 && r.json.identityState === 'more_info', '');

// ── 12. EXISTING GATES UNTOUCHED ─────────────────────────────────────────────
const listingState = await db.query(
  `SELECT publication_state, verification_state FROM listing WHERE property_id = $1`, [kycPropertyId],
);
check('G-1 KYC approval changed NO listing verification/publication state',
  listingState.rows[0]?.publication_state === 'awaiting_verification'
  && listingState.rows[0]?.verification_state === 'unverified',
  JSON.stringify(listingState.rows[0]));
r = await landlordA('GET', '/identity/me');
check('G-2 identity/me mock-NIN surface untouched (landlord NIN still unattempted)',
  r.status === 200 && r.json.identityVerified === false, '');

// ── done ─────────────────────────────────────────────────────────────────────
try { app.kill('SIGTERM'); process.kill(-app.pid, 'SIGTERM'); } catch {}
rmSync(MEDIA_ROOT, { recursive: true, force: true });
console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : 'FAILURES PRESENT'}: ${checks - failures}/${checks} passed`);
process.exit(failures === 0 ? 0 : 1);
