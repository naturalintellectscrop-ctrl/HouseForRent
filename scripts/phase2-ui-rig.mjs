/**
 * PHASE 2 UI VERIFICATION RIG - a disposable local stack (PGlite + the real
 * app) seeded with duplicate-payment / refund / statement state, kept ALIVE
 * so the finance console can be verified in a browser. Nothing touches
 * production; kill it when done.
 *
 * Usage: bun scripts/phase2-ui-rig.mjs   (Ctrl+C / SIGTERM to tear down)
 */
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { readFileSync, mkdirSync, rmSync } from 'node:fs';
import { execFileSync, spawn } from 'node:child_process';
import path from 'node:path';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import sharp from 'sharp';

const REPO = '/home/z/my-project';
const PORT_DB = 55901;
const PORT_APP = 3200;
const API = `http://127.0.0.1:${PORT_APP}/api/v1`;
const WEBHOOK_SECRET = 'rig-finance-webhook-secret';

try { execFileSync('fuser', ['-k', `${PORT_APP}/tcp`], { stdio: 'ignore' }); } catch {}
mkdirSync(path.join(REPO, 'backups'), { recursive: true });
const DDL = execFileSync(
  'bunx',
  ['prisma', 'migrate', 'diff', '--from-empty', '--to-schema-datamodel', 'prisma/schema.prisma', '--script'],
  { cwd: REPO, encoding: 'utf8', env: { ...process.env, DATABASE_URL: 'postgresql://x:x@127.0.0.1:9/x' } },
);

const db = new PGlite();
await db.exec(DDL);
await db.query(
  `INSERT INTO neighbourhood (id, name, parent_id, in_service_area, created_at)
   VALUES ('rig-nbhd-1', 'Rig Central', NULL, true, now())`,
);
const server = new PGLiteSocketServer({ db, port: PORT_DB, host: '127.0.0.1', maxConnections: 4 });
await server.start();

const app = spawn('bunx', ['next', 'dev', '-p', String(PORT_APP)], {
  cwd: REPO,
  detached: true,
  env: {
    ...process.env,
    DATABASE_URL: `postgres://rig:rig@127.0.0.1:${PORT_DB}/postgres?pgbouncer=true&connection_limit=1&pool_timeout=60`,
    MEDIA_STORAGE: 'local',
    MEDIA_ROOT: '/tmp/hfr-phase2-ui-' + Date.now(),
    NODE_ENV: 'development',
    NEXT_TELEMETRY_DISABLED: '1',
    NYLONPAY_WEBHOOK_SECRET: WEBHOOK_SECRET,
  },
});
let log = '';
app.stdout.on('data', (d) => (log += d));
app.stderr.on('data', (d) => (log += d));
app.on('exit', (code, signal) => {
  console.error(`[rig] next dev EXITED code=${code} signal=${signal}`);
  console.error('[rig] last app output:', log.slice(-800));
});
const shutdown = () => { try { app.kill('SIGKILL'); } catch {}; process.exit(0); };
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

let ready = false;
for (let i = 0; i < 90 && !ready; i++) {
  try {
    const r = await fetch(`${API}/listings`, { signal: AbortSignal.timeout(2500) });
    if (r.status === 200) ready = true;
  } catch {}
  if (!ready) await new Promise((r) => setTimeout(r, 1000));
}
if (!ready) { console.error('rig app not ready'); console.error(log.slice(-3000)); process.exit(2); }
console.log(`RIG READY: app on http://127.0.0.1:${PORT_APP}`);

// ── seed: admin + landlord + tenant + funded deal + duplicate + statement ──
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

const admin = client();
const adminParty = await db.query(
  `INSERT INTO party (id, display_name, primary_phone, status, created_at, updated_at)
   VALUES (gen_random_uuid(), 'Rig Finance Admin', '+2567700990001', 'active', now(), now()) RETURNING id`,
);
const adminAccount = await db.query(
  `INSERT INTO user_account (id, party_id, auth_role, created_at) VALUES (gen_random_uuid(), $1, 'admin', now()) RETURNING id`,
  [adminParty.rows[0].id],
);
await db.query(
  `INSERT INTO user_credential (id, user_account_id, password_hash, created_at, updated_at) VALUES (gen_random_uuid(), $1, $2, now(), now())`,
  [adminAccount.rows[0].id, bcrypt.hashSync('RigAdmin!2026', 10)],
);
let r = await admin('POST', '/auth/login', { primaryPhone: '+2567700990001', password: 'RigAdmin!2026' });
if (r.status !== 200) { console.error('admin login failed', r); process.exit(2); }

const nbhd = (await admin('GET', '/ops/neighbourhoods')).body?.neighbourhoods?.find((n) => n.inServiceArea);

async function makeActor(kind, phoneSuffix, name) {
  const c = client();
  r = await c('POST', '/auth/register', { displayName: name, primaryPhone: `+25677210${phoneSuffix}`, password: 'RigPass!2026', role: kind === 'officer' ? 'lister' : kind });
  const partyId = r.body.partyId;
  await c('POST', '/auth/login', { primaryPhone: `+25677210${phoneSuffix}`, password: 'RigPass!2026' });
  if (kind !== 'officer') {
    const nin = `CM900100${phoneSuffix}QA${phoneSuffix}`;
    await admin('POST', `/admin/users/${partyId}/identity-check`, { nin, fullName: name, method: 'nin' });
  }
  return { client: c, partyId };
}

const landlord = await makeActor('lister', '01', 'Rig Landlord');
const tenant = await makeActor('tenant', '02', 'Rig Tenant');
const L = landlord.client, T = tenant.client;

const step = (name, res) => {
  const ok = res && (res.status === 200 || res.status === 201);
  console.log(`[step] ${name}: ${res?.status ?? 'no-response'} ${ok ? '' : JSON.stringify(res?.body)?.slice(0, 200)}`);
  if (!ok) throw new Error(`rig step failed: ${name}`);
  return res;
};

r = await L('POST', '/landlord/properties', {
  propertyType: 'apartment', bedrooms: 2, bathrooms: 1, furnished: 'semi_furnished',
  neighbourhoodId: nbhd.id, landmarkText: 'Rig UI block A',
  monthlyRent: '800,000', requiredMonthsUpfront: 2, depositAmount: '1,600,000',
  description: 'Rig UI fixture.',
});
const listingId = r.body?.listing?.id ?? r.body?.listingId;
step('agreement', await L('POST', `/landlord/listings/${listingId}/agreement`, {}));
const jpeg = await sharp({ create: { width: 900, height: 600, channels: 3, background: { r: 96, g: 128, b: 90 } } }).jpeg({ quality: 85 }).toBuffer();
const form = new FormData();
form.append('file', new Blob([jpeg], { type: 'image/jpeg' }), 'rig.jpeg');
step('photo', await L('POST', `/landlord/listings/${listingId}/photos`, form));

// officer provisioning + the visit journey
await admin('POST', '/ops/staff', { displayName: 'Rig Officer', primaryPhone: '+256773001001', password: 'RigPass!2026', role: 'foo' });
const officers = (await admin('GET', '/viewings/dispatch-queue')).body?.officers ?? [];
const officerRow = officers.find((o) => o.displayName === 'Rig Officer');
// The officer client IS the provisioned staff account (staff are never
// self-served) - a freshly registered party holds no staff role.
const officer = client();
await officer('POST', '/auth/login', { primaryPhone: '+256773001001', password: 'RigPass!2026' });
step('verify-listing', await officer('POST', '/viewings/qa-fin-visit/verify-listing', { listingId, verified: true, available: true, note: 'rig visit' }));
step('publish', await L('POST', `/landlord/listings/${listingId}/publish`, {}));
r = await T('POST', '/viewings', { listingId, preferredDate: new Date(Date.now() + 86400000).toISOString() });
step('viewing request', r);
const viewingId = r.body.id;
step('dispatch', await admin('POST', '/ops/dispatch', { viewingId, fooPartyId: officerRow.partyId }));
step('field-report', await officer('POST', `/viewings/${viewingId}/field-report`, { conditionRating: 'good', matchesListing: true, isAvailable: true, issuesText: 'ok' }));
r = await officer('POST', `/viewings/${viewingId}/conduct`, {});
step('conduct', r);
r = await officer('POST', '/deals', { introductionRecordId: r.body.introductionRecordId });
step('deal create', r);
const dealId = r.body.id;
step('match-tenant', await officer('POST', `/deals/${dealId}/match-tenant`, {}));
step('sign-agreement', await L('POST', `/deals/${dealId}/sign-agreement`, {}));
step('fund-escrow', await T('POST', `/deals/${dealId}/fund-escrow`, {}));

// the provider double-collected: a second successful confirmation arrives
const collect = (await db.query(`SELECT id, provider_ref FROM psp_instruction WHERE deal_id = $1 AND kind = 'collect' LIMIT 1`, [dealId])).rows[0];
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
console.log('duplicate webhook:', await signedWebhook('transaction.successful', collect.provider_ref, '3200000'));

// a failed payout attempt + its record (retryable), and one resolved segment
r = await admin('POST', `/deals/${dealId}/duplicate-payment-refund`, {
  amount: '800,000',
  reason: 'Statement DUP-UI-1: excess segment of the double collection.',
  duplicateOfInstructionId: collect.id,
});
console.log('dup refund segment 1:', r.status, JSON.stringify(r.body).slice(0, 120));

// a provider statement import: matched + duplicate + unexpected rows
const statement = {
  provider: 'nylonpay',
  note: 'Rig UI statement: one double collection, one unknown row.',
  lines: [
    { lineRef: 'ui-row-1', providerRef: collect.provider_ref, kind: 'collection', amount: '3200000', occurredAt: new Date().toISOString() },
    { lineRef: 'ui-row-2', providerRef: collect.provider_ref, kind: 'collection', amount: '3200000', occurredAt: new Date().toISOString() },
    { lineRef: 'ui-row-3', providerRef: crypto.randomUUID(), kind: 'collection', amount: '123456', occurredAt: new Date().toISOString() },
  ],
};
r = await admin('POST', '/admin/finance/provider-statements', statement);
console.log('statement import:', r.status, JSON.stringify(r.body).slice(0, 160));

// an unresolved duplicate on a second deal for the console's unresolved state

// Mint an admin session row so the browser can skip the login form (the
// form is not what this rig exists to verify).
const sessionToken = crypto.randomUUID();
await db.query(
  `INSERT INTO session (id, user_account_id, refresh_token_hash, expires_at, created_at)
   VALUES (gen_random_uuid(), $1, $2, now() + interval '1 day', now())`,
  [adminAccount.rows[0].id, crypto.createHash('sha256').update(sessionToken).digest('hex')],
);
console.log(`SESSION_TOKEN=${sessionToken}`);
console.log('RIG SEEDED. Admin login: +2567700990001 / RigAdmin!2026');
setInterval(() => {
  console.log(`[heartbeat] ${new Date().toISOString()} rig alive`);
}, 15000); // stay alive + prove it
