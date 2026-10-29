#!/usr/bin/env node
/**
 * qa-walk — stage ladder driver for full-product browser QA (round 59).
 *
 * Boots NOTHING itself: it drives the REAL HTTP API of a running rig
 (scripts/test-rig.mjs on :3111) so each browser-E2E segment can rebuild
 the product state it needs through the same surfaces a user's browser
 hits — never Prisma-direct.
 *
 * Cumulative stages:
 *   pending-landlord  — register the QA lister (pending account)
 *   listing           — approve lister (admin identity-check), author property+listing
 *   photo             — upload 1 real JPEG through the media pipeline
 *   agreement         — landlord accepts the listing agreement
 *   officer           — admin provisions a FOO (staff are never self-served)
 *   verified          — FOO files the verify-listing verdict
 *   live              — publish → LIVE (public discovery)
 *   tenant            — register the QA tenant (pending)
 *   viewing-refused   — unverified tenant viewing request → TENANT_NOT_VERIFIED
 *   approved-tenant   — admin identity-check activates the tenant
 *   viewing           — tenant viewing request → scheduled
 *   dispatch          — admin dispatches the viewing to the FOO
 *   field-report      — FOO files the structured visit record
 *   conducted         — FOO conducts (immutable introduction record)
 *   deal              — FOO creates the deal from the introduction
 *   match-tenant      — deal → tenant_matched
 *   sign              — landlord signs the agreement on the deal
 *   fund-escrow       — MOCK provider funding (sandbox only; labelled MOCK in DB)
 *
 * Honesty rules: fixture-labelled accounts (+256 77 100 9xx, "QA Walk"
 * names, "QA-WALK" landmark), no production URL, no real money (the mock
 * provider labels itself MOCK in the DB). Refuses without RIG_BASE.
 */
import sharp from 'sharp';

const BASE = process.env.RIG_BASE;
if (!BASE) {
  console.error('Refusing without RIG_BASE (e.g. http://127.0.0.1:3111).');
  process.exit(1);
}
const API = `${BASE}/api/v1`;
const STAGE = process.argv[2] ?? 'fund-escrow';
const PASSWORD = process.env.QA_WALK_PASSWORD ?? 'QaWalkPass!2026';

const ADMIN_PHONE = process.env.RIG_ADMIN_PHONE;
const ADMIN_PASS = process.env.RIG_ADMIN_PASS;
if (!ADMIN_PHONE || !ADMIN_PASS) {
  console.error('Refusing without RIG_ADMIN_PHONE / RIG_ADMIN_PASS (the rig prints them).');
  process.exit(1);
}

const TS = Date.now().toString().slice(-6);
const LANDLORD_PHONE = `+256771009${TS.slice(0, 3)}`;
const TENANT_PHONE = `+256771009${TS.slice(3, 6)}`;
const OFFICER_PHONE = `+2567710098${TS.slice(0, 2)}`;

function client() {
  let cookie = null;
  return async function call(method, path, body) {
    const res = await fetch(`${API}${path}`, {
      method,
      headers: {
        ...(body !== undefined && !(body instanceof FormData) ? { 'content-type': 'application/json' } : {}),
        ...(body instanceof FormData ? {} : body !== undefined ? {} : {}),
        ...(cookie ? { cookie } : {}),
      },
      body: body instanceof FormData ? body : body !== undefined ? JSON.stringify(body) : undefined,
      redirect: 'manual',
    });
    const setCookie = res.headers.getSetCookie?.() ?? [];
    for (const c of setCookie) if (c.startsWith('hfr_session=')) cookie = c.split(';')[0];
    let json = null;
    try { json = await res.json(); } catch {}
    return { status: res.status, body: json, headers: res.headers };
  };
}
const admin = client();
const landlord = client();
const tenant = client();
const officer = client();

function fail(msg, detail) {
  console.error(`QA-WALK FAILED at stage check: ${msg}${detail ? ` — ${JSON.stringify(detail).slice(0, 400)}` : ''}`);
  process.exit(2);
}

const manifest = { landlord: { phone: LANDLORD_PHONE, password: PASSWORD }, tenant: { phone: TENANT_PHONE, password: PASSWORD }, officer: { phone: OFFICER_PHONE, password: PASSWORD }, admin: { phone: ADMIN_PHONE, password: ADMIN_PASS } };

// ── stage: pending-landlord ──────────────────────────────────────────────
let reg = await landlord('POST', '/auth/register', {
  displayName: `QA Walk Landlord ${TS}`, primaryPhone: LANDLORD_PHONE, password: PASSWORD, role: 'lister',
});
if (reg.status !== 201) fail('landlord register', reg);
manifest.landlord.partyId = reg.body.partyId;

// tenant register (also pending) — needed from stage `tenant` on
reg = await tenant('POST', '/auth/register', {
  displayName: `QA Walk Tenant ${TS}`, primaryPhone: TENANT_PHONE, password: PASSWORD, role: 'tenant',
});
if (reg.status !== 201) fail('tenant register', reg);
manifest.tenant.partyId = reg.body.partyId;

if (STAGE === 'pending-landlord') { console.log(JSON.stringify(manifest, null, 2)); process.exit(0); }

// ── admin session ─────────────────────────────────────────────────────────
let r = await admin('POST', '/auth/login', { primaryPhone: ADMIN_PHONE, password: ADMIN_PASS });
if (r.status !== 200) fail('admin login', r);

// approve landlord (operations identity check → activation; sandbox mock NIN)
const NIN = 'CM90010099QA01';
r = await admin('POST', `/admin/users/${manifest.landlord.partyId}/identity-check`, { nin: NIN, fullName: `QA Walk Landlord ${TS}`, method: 'nin' });
if ((r.status !== 200 && r.status !== 201) || r.body?.state !== "verified") fail("landlord identity-check activation", r);

if (STAGE === 'approved-landlord') { console.log(JSON.stringify(manifest, null, 2)); process.exit(0); }

// ── stage: listing ────────────────────────────────────────────────────────
r = await landlord('POST', '/auth/login', { primaryPhone: LANDLORD_PHONE, password: PASSWORD });
if (r.status !== 200) fail('landlord login', r);

r = await admin('GET', '/ops/neighbourhoods');
if (r.status !== 200 || !r.body?.neighbourhoods?.length) fail('neighbourhood directory', r);
const nbhd = r.body.neighbourhoods.find((n) => n.inServiceArea) ?? r.body.neighbourhoods[0];

r = await landlord('POST', '/landlord/properties', {
  propertyType: 'apartment', bedrooms: 2, bathrooms: 1, furnished: 'semi_furnished',
  neighbourhoodId: nbhd.id, landmarkText: `QA-WALK landmark block ${TS}`,
  monthlyRent: '800,000', requiredMonthsUpfront: 2, depositAmount: '1,600,000',
  description: 'QA walk two-bedroom fixture apartment.',
});
if (r.status !== 201) fail('property+listing create', r);
const listingId = r.body?.listing?.id ?? r.body?.listingId;
manifest.listingId = listingId;
if (!listingId) fail('listing id missing from create response', r.body);

// honest publish gate BEFORE anything clears
r = await landlord('POST', `/landlord/listings/${listingId}/publish`, { dryRun: true });
manifest.publishGateBefore = r.body?.blockedBy ?? `status=${r.status}`;

if (STAGE === 'listing') { console.log(JSON.stringify(manifest, null, 2)); process.exit(0); }

// ── stage: photo ──────────────────────────────────────────────────────────
const jpeg = await sharp({ create: { width: 1200, height: 800, channels: 3, background: { r: 92, g: 138, b: 96 } } })
  .jpeg({ quality: 88 }).toBuffer();
const form = new FormData();
form.append('file', new Blob([jpeg], { type: 'image/jpeg' }), 'qa-walk-photo.jpeg');
form.append('caption', 'QA walk fixture photograph');
r = await landlord('POST', `/landlord/listings/${listingId}/photos`, form);
if (r.status !== 201) fail('photo upload', r);
manifest.photoMediaId = r.body?.mediaAssetId ?? null;

if (STAGE === 'photo') { console.log(JSON.stringify(manifest, null, 2)); process.exit(0); }

// ── stage: agreement ─────────────────────────────────────────────────────
r = await landlord('POST', `/landlord/listings/${listingId}/agreement`, {});
if (r.status !== 200 && r.status !== 201) fail('agreement accept', r);
manifest.agreementStatus = r.body?.agreement?.status ?? r.body?.status ?? r.status;

if (STAGE === 'agreement') { console.log(JSON.stringify(manifest, null, 2)); process.exit(0); }

// ── stage: officer ───────────────────────────────────────────────────────
r = await admin('POST', '/ops/staff', {
  displayName: `QA Walk Officer ${TS}`, primaryPhone: OFFICER_PHONE, password: PASSWORD, role: 'foo',
});
if (r.status !== 201) fail('officer provisioning', r);
// the provisioning response names the account, not the party — the
// dispatch-queue read model carries the assignable officers' party ids
r = await admin('GET', '/viewings/dispatch-queue');
const officers = r.body?.officers ?? [];
const me = officers.find((o) => o.displayName === `QA Walk Officer ${TS}`);
manifest.officer.partyId = me?.partyId ?? null;
if (!manifest.officer.partyId) fail('officer partyId not on dispatch queue', r.body);
r = await officer('POST', '/auth/login', { primaryPhone: OFFICER_PHONE, password: PASSWORD });
if (r.status !== 200) fail('officer login', r);

if (STAGE === 'officer') { console.log(JSON.stringify(manifest, null, 2)); process.exit(0); }

// landlord must NOT be able to run the verification verdict on a listing id
r = await landlord('POST', '/viewings/qa-walk-refusal/verify-listing', { listingId });
if (r.status === 401 || r.status === 403 || r.status === 404 || r.status === 422) {
  manifest.landlordVerifyRefusal = r.status;
} else {
  fail('landlord verify attempt expected refusal', r);
}

// ── stage: verified ──────────────────────────────────────────────────────
r = await officer('POST', '/viewings/qa-walk-visit/verify-listing', { listingId, verified: true, available: true, note: 'QA walk in-person visit' });
if (r.status !== 200) fail('officer verify-listing', r);

if (STAGE === 'verified') { console.log(JSON.stringify(manifest, null, 2)); process.exit(0); }

// ── stage: live ──────────────────────────────────────────────────────────
r = await landlord('POST', `/landlord/listings/${listingId}/publish`, {});
if (r.status !== 200) fail('publish', r);
manifest.publicationState = r.body?.publicationState ?? 'published';

if (STAGE === 'live' || STAGE === 'tenant') { console.log(JSON.stringify(manifest, null, 2)); process.exit(0); }

// ── stage: viewing-refused ───────────────────────────────────────────────
r = await tenant('POST', '/auth/login', { primaryPhone: TENANT_PHONE, password: PASSWORD });
if (r.status !== 200) fail('tenant login', r);
const refused = await tenant('POST', '/viewings', { listingId, preferredDate: new Date(Date.now() + 86400000).toISOString() });
manifest.viewingRefusal = { status: refused.status, code: refused.body?.error?.code };
if (refused.status !== 409 || refused.body?.error?.code !== 'TENANT_NOT_VERIFIED') fail('unverified tenant refusal', refused);

// ── stage: approved-tenant (activation after the refusal was observed) ──
r = await admin('POST', `/admin/users/${manifest.tenant.partyId}/identity-check`, { nin: NIN, fullName: `QA Walk Tenant ${TS}`, method: 'nin' });
if ((r.status !== 200 && r.status !== 201) || r.body?.state !== 'verified') fail('tenant identity-check activation', r);

if (STAGE === 'approved-tenant') { console.log(JSON.stringify(manifest, null, 2)); process.exit(0); }

// ── stage: viewing ───────────────────────────────────────────────────────
r = await tenant('POST', '/viewings', { listingId, preferredDate: new Date(Date.now() + 86400000).toISOString() });
if (r.status !== 201) fail('verified tenant viewing request', r);
manifest.viewingId = r.body.id;

if (STAGE === 'viewing') { console.log(JSON.stringify(manifest, null, 2)); process.exit(0); }

// ── stage: dispatch ──────────────────────────────────────────────────────
r = await admin('POST', '/ops/dispatch', { viewingId: manifest.viewingId, fooPartyId: manifest.officer.partyId });
if (r.status !== 200 && r.status !== 201) fail('dispatch', r);

if (STAGE === 'dispatch') { console.log(JSON.stringify(manifest, null, 2)); process.exit(0); }

// ── stage: field-report ──────────────────────────────────────────────────
r = await officer('POST', `/viewings/${manifest.viewingId}/field-report`, {
  conditionRating: 'good', matchesListing: true, isAvailable: true, issuesText: 'QA walk report: no issues.',
});
if (r.status !== 201) fail('field report', r);

if (STAGE === 'field-report') { console.log(JSON.stringify(manifest, null, 2)); process.exit(0); }

// ── stage: conducted ─────────────────────────────────────────────────────
r = await officer('POST', `/viewings/${manifest.viewingId}/conduct`, {});
if (r.status !== 201) fail('conduct (introduction)', r);
manifest.introductionRecordId = r.body.introductionRecordId;

if (STAGE === 'conducted') { console.log(JSON.stringify(manifest, null, 2)); process.exit(0); }

// ── stage: deal ──────────────────────────────────────────────────────────
r = await officer('POST', '/deals', { introductionRecordId: manifest.introductionRecordId });
if (r.status !== 201) fail('deal create', r);
manifest.dealId = r.body.id;

if (STAGE === 'deal') { console.log(JSON.stringify(manifest, null, 2)); process.exit(0); }

// ── stage: match-tenant ──────────────────────────────────────────────────
r = await officer('POST', `/deals/${manifest.dealId}/match-tenant`, {});
if (r.status !== 200) fail('match-tenant', r);

if (STAGE === 'match-tenant') { console.log(JSON.stringify(manifest, null, 2)); process.exit(0); }

// ── stage: sign ──────────────────────────────────────────────────────────
r = await landlord('POST', `/deals/${manifest.dealId}/sign-agreement`, {});
if (r.status !== 200) fail('sign-agreement', r);

if (STAGE === 'sign') { console.log(JSON.stringify(manifest, null, 2)); process.exit(0); }

// ── stage: fund-escrow (MOCK provider, sandbox only) ─────────────────────
const detail = await landlord('GET', `/deals/${manifest.dealId}`);
const escrow = detail.body?.financialSnapshot?.totalPayable ?? detail.body?.financialSnapshot?.totalDueUpfront ?? null;
r = await tenant('POST', `/deals/${manifest.dealId}/fund-escrow`, { expectedAmount: escrow ?? undefined });
manifest.fundEscrow = { status: r.status, body: r.body };
if (r.status !== 200) fail('fund-escrow (mock)', r);

console.log(JSON.stringify(manifest, null, 2));
console.log(`QA-WALK OK through stage: ${STAGE}`);

// ── stage: kyc-submitted (after `live`; independent landlord onboarding) ──
async function kycStage() {
  const jpeg = await sharp({ create: { width: 600, height: 800, channels: 3, background: { r: 40, g: 90, b: 60 } } })
    .jpeg({ quality: 88 }).toBuffer();
  const selfie = await sharp({ create: { width: 480, height: 480, channels: 3, background: { r: 150, g: 120, b: 90 } } })
    .jpeg({ quality: 88 }).toBuffer();
  async function upload(jar, name, bytes, kind) {
    const f = new FormData();
    f.append('file', new Blob([bytes], { type: 'image/jpeg' }), name);
    f.append('kind', kind);
    const res = await jar('POST', '/landlord/kyc/media', f);
    if (res.status !== 201) fail(`kyc media upload ${kind}`, res);
    return res.body.mediaAssetId;
  }
  const idFront = await upload(landlord, 'id-front.jpg', jpeg, 'id_front');
  const idBack = await upload(landlord, 'id-back.jpg', jpeg, 'id_back');
  const selfieId = await upload(landlord, 'selfie.jpg', selfie, 'selfie');
  const ownership = await upload(landlord, 'title.jpg', jpeg, 'ownership_evidence');
  r = await landlord('GET', '/landlord/terms');
  const version = r.body?.currentVersion;
  if (!version) fail('terms version', r);
  r = await landlord('POST', '/landlord/terms', { version });
  if (r.status !== 200 && r.status !== 201) fail('terms acceptance', r);
  r = await landlord('POST', '/landlord/kyc', {
    legalName: `QA Walk Landlord ${TS}`, idDocumentType: 'national_id', ageConfirmed: true,
    idFrontMediaId: idFront, idBackMediaId: idBack, selfieMediaId: selfieId,
    relationship: 'owner', titleParticulars: `Plot ${TS} QA-WALK road, block A (FIXTURE)`,
    ownershipEvidenceMediaId: ownership,
    declarations: { identityAccurate: true, relationshipHonest: true, authorityDisclosed: true, accuracyOngoing: true, agreeTerms: true },
    termsVersion: version,
  });
  if (r.status !== 201) fail('kyc submission', r);
  manifest.kycSubmissionId = r.body.id;
  manifest.termsVersion = version;
}
if (STAGE === 'kyc-submitted') { await kycStage(); console.log(JSON.stringify(manifest, null, 2)); console.log('QA-WALK OK through stage: kyc-submitted'); process.exit(0); }

// ── stage: kyc-approved (admin approves all three sections) ──────────────
async function kycApprove() {
  await kycStage();
  r = await admin('GET', '/admin/kyc');
  const row = (r.body?.applications ?? r.body?.items ?? []).find((a) => a.id === manifest.kycSubmissionId);
  if (!row) fail('kyc application not in admin queue', r.body);
  for (const section of ['identity', 'authority', 'payout']) {
    r = await admin('POST', `/admin/kyc/${manifest.kycSubmissionId}/decision`, {
      section, decision: 'approved', reason: `QA walk: ${section} reviewed and consistent.`,
    });
    if (r.status !== 200) fail(`kyc ${section} approval`, r);
  }
}
if (STAGE === 'kyc-approved') { await kycApprove(); console.log(JSON.stringify(manifest, null, 2)); console.log('QA-WALK OK through stage: kyc-approved'); process.exit(0); }

console.log(JSON.stringify(manifest, null, 2));
console.log(`QA-WALK OK through stage: ${STAGE}`);
