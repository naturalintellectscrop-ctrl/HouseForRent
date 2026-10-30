// Seeds one deal through the REAL journey on a running rig and advances it
// through the new financial lifecycle, so the UI shows live states.
// Usage: APP=http://127.0.0.1:3000 ADMIN_PHONE=... ADMIN_PASS=... bun scripts/seed-finance-ui.mjs
import crypto from 'node:crypto';

const BASE = process.env.APP ?? 'http://127.0.0.1:3000';
const API = `${BASE}/api/v1`;

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

const adminPhone = process.env.ADMIN_PHONE;
const adminPass = process.env.ADMIN_PASS;
const PASSWORD = process.env.SEED_PASSWORD ?? 'QaWalkPass!2026';
const TS = Date.now().toString().slice(-6);

const admin = client();
let r = await admin('POST', '/auth/login', { primaryPhone: adminPhone, password: adminPass });
if (r.status !== 200) throw new Error(`admin login ${r.status}`);

async function makeActor(kind, suffix) {
  const c = client();
  const phone = `+25677${String(Date.now()).slice(-6)}${suffix}`;
  r = await c('POST', '/auth/register', { displayName: `Seed ${kind} ${TS}${suffix}`, primaryPhone: phone, password: PASSWORD, role: kind });
  if (r.status !== 201) throw new Error(`register ${kind}: ${JSON.stringify(r.body)}`);
  const partyId = r.body.partyId;
  r = await c('POST', '/auth/login', { primaryPhone: phone, password: PASSWORD });
  if (r.status !== 200) throw new Error(`login ${kind}`);
  r = await admin('POST', `/admin/users/${partyId}/identity-check`, { nin: `CM9001009${suffix}QA0${suffix}`, fullName: `Seed ${kind} ${TS}${suffix}`, method: 'nin' });
  if (!(r.status === 200 || r.status === 201) || r.body?.state !== 'verified') throw new Error(`identity ${kind}: ${JSON.stringify(r.body)}`);
  return { c, partyId };
}

const landlord = await makeActor('lister', '1');
const tenant = await makeActor('tenant', '2');

r = await admin('GET', '/ops/neighbourhoods');
const nbhd = (r.body?.neighbourhoods ?? []).find((n) => n.inServiceArea);
const officerPhone = `+25677${String(Date.now() + 7).slice(-6)}9`;
r = await admin('POST', '/ops/staff', { displayName: `Seed Officer ${TS}`, primaryPhone: officerPhone, password: PASSWORD, role: 'foo' });
r = await admin('GET', '/viewings/dispatch-queue');
const officer = (r.body?.officers ?? []).find((o) => o.displayName === `Seed Officer ${TS}`);
const OC = client();
await OC('POST', '/auth/login', { primaryPhone: officerPhone, password: PASSWORD });

r = await landlord.c('POST', '/landlord/properties', {
  propertyType: 'apartment', bedrooms: 2, bathrooms: 1, furnished: 'semi_furnished',
  neighbourhoodId: nbhd.id, landmarkText: `Seed landmark ${TS}`,
  monthlyRent: '900,000', requiredMonthsUpfront: 2, depositAmount: '900,000',
  description: 'Seeded apartment for the finance UI walk.',
});
if (r.status !== 201) throw new Error(`listing: ${JSON.stringify(r.body)}`);
const listingId = r.body?.listing?.id ?? r.body?.listingId;
await landlord.c('POST', `/landlord/listings/${listingId}/agreement`, {});
const jpeg = Buffer.from(
  `/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwcJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPDUzNDP/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==`,
  'base64',
);
const form = new FormData();
form.append('file', new Blob([jpeg], { type: 'image/jpeg' }), 'seed.jpeg');
form.append('caption', 'Seed photo');
r = await landlord.c('POST', `/landlord/listings/${listingId}/photos`, form);
if (r.status !== 201) throw new Error(`photo: ${JSON.stringify(r.body)}`);
r = await OC('POST', '/viewings/seed-visit/verify-listing', { listingId, verified: true, available: true, note: 'seed visit' });
if (r.status !== 200) throw new Error(`verify: ${JSON.stringify(r.body)}`);
r = await landlord.c('POST', `/landlord/listings/${listingId}/publish`, {});
if (r.status !== 200) throw new Error(`publish: ${JSON.stringify(r.body)}`);

r = await tenant.c('POST', '/viewings', { listingId, preferredDate: new Date(Date.now() + 86400000).toISOString() });
if (r.status !== 201) throw new Error(`viewing: ${JSON.stringify(r.body)}`);
const viewingId = r.body.id;
await admin('POST', '/ops/dispatch', { viewingId, fooPartyId: officer.partyId });
await OC('POST', `/viewings/${viewingId}/field-report`, { conditionRating: 'good', matchesListing: true, isAvailable: true, issuesText: 'seed report' });
r = await OC('POST', `/viewings/${viewingId}/conduct`, {});
if (r.status !== 201) throw new Error('conduct');
r = await OC('POST', '/deals', { introductionRecordId: r.body.introductionRecordId });
const dealId = r.body.id;
await OC('POST', `/deals/${dealId}/match-tenant`, {});
r = await landlord.c('POST', `/deals/${dealId}/sign-agreement`, {});
if (r.status !== 200) throw new Error(`sign: ${JSON.stringify(r.body)}`);
r = await tenant.c('POST', `/deals/${dealId}/fund-escrow`, {});
if (r.status !== 200) throw new Error(`fund: ${JSON.stringify(r.body)}`);

// Move-in verification: tenant confirms, landlord confirms → verified.
r = await tenant.c('POST', `/deals/${dealId}/confirm-move-in`, { note: 'Keys collected at 10am; meter readings shared.', evidenceRef: 'handover-01' });
if (r.status !== 200) throw new Error(`tenant confirm: ${JSON.stringify(r.body)}`);
r = await landlord.c('POST', `/deals/${dealId}/confirm-move-in-landlord`, { note: 'Handed over as agreed.', evidenceRef: 'handover-02' });
if (r.status !== 200) throw new Error(`landlord confirm: ${JSON.stringify(r.body)}`);

// Settle → settled.
r = await admin('POST', `/deals/${dealId}/settle`, {});
if (r.status !== 200) throw new Error(`settle: ${JSON.stringify(r.body)}`);

// Deposit: propose → approve → tenant accepts → apply (case stays open with balance).
r = await landlord.c('POST', `/deals/${dealId}/propose-deduction`, { amount: '200,000', reason: 'Repainting one wall beyond normal wear (invoice INV-31).', evidenceRef: 'wall-photo-4' });
if (r.status !== 200) throw new Error(`propose: ${JSON.stringify(r.body)}`);
const deductionId = r.body.id;
await admin('POST', `/deals/${dealId}/approve-deduction`, { deductionId, reason: 'Evidence consistent; beyond wear and tear.' });
await tenant.c('POST', `/deals/${dealId}/accept-deduction`, { deductionId, note: 'Accepted.' });
await admin('POST', `/deals/${dealId}/apply-deduction`, { deductionId });

// A second deal left mid-verification for the open-state views.
async function secondDeal() {
  const l2 = await makeActor('lister', '3');
  const t2 = await makeActor('tenant', '4');
  r = await l2.c('POST', '/landlord/properties', {
    propertyType: 'house', bedrooms: 3, bathrooms: 2, furnished: 'unfurnished',
    neighbourhoodId: nbhd.id, landmarkText: `Seed house ${TS}`,
    monthlyRent: '1,200,000', requiredMonthsUpfront: 2, depositAmount: '1,200,000',
    description: 'Seeded house deal awaiting verification.',
  });
  if (r.status !== 201) throw new Error(`house listing: ${JSON.stringify(r.body)}`);
  const l2id = r.body?.listing?.id ?? r.body?.listingId;
  await l2.c('POST', `/landlord/listings/${l2id}/agreement`, {});
  const f2 = new FormData();
  f2.append('file', new Blob([jpeg], { type: 'image/jpeg' }), 'seed2.jpeg');
  f2.append('caption', 'Seed photo 2');
  await l2.c('POST', `/landlord/listings/${l2id}/photos`, f2);
  await OC('POST', '/viewings/seed-visit/verify-listing', { listingId: l2id, verified: true, available: true, note: 'visit' });
  await l2.c('POST', `/landlord/listings/${l2id}/publish`, {});
  r = await t2.c('POST', '/viewings', { listingId: l2id, preferredDate: new Date(Date.now() + 86400000).toISOString() });
  const v2 = r.body.id;
  await admin('POST', '/ops/dispatch', { viewingId: v2, fooPartyId: officer.partyId });
  await OC('POST', `/viewings/${v2}/field-report`, { conditionRating: 'good', matchesListing: true, isAvailable: true, issuesText: 'ok' });
  r = await OC('POST', `/viewings/${v2}/conduct`, {});
  r = await OC('POST', '/deals', { introductionRecordId: r.body.introductionRecordId });
  const d2 = r.body.id;
  await OC('POST', `/deals/${d2}/match-tenant`, {});
  await l2.c('POST', `/deals/${d2}/sign-agreement`, {});
  await t2.c('POST', `/deals/${d2}/fund-escrow`, {});
  await t2.c('POST', `/deals/${d2}/confirm-move-in`, { note: 'Moved in.' });
  return d2;
}
const deal2Id = await secondDeal();

console.log(JSON.stringify({ dealId, deal2Id, listingId, tenantPhone: `+25677400${TS}2`, landlordPhone: `+25677400${TS}1`, adminPhone, adminPass, password: PASSWORD }));
