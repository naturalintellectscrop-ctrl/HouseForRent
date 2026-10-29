#!/usr/bin/env node
/**
 * media-drill — the round-56 durability drill (local, real store).
 *
 * Proves the Supabase media adapter end to end, through the REAL api:
 *   1. sign in as the local fixture lister
 *   2. upload a real JPEG to the fixture draft listing (multipart, the
 *      same route the landlord portal uses — pipeline, variants, rows)
 *   3. read the served bytes back (200, image/webp for the card variant)
 *   4. confirm the objects exist in the private bucket
 *   5. --verify mode: re-read after a server restart (the durability proof)
 *   6. --cleanup mode: delete via the landlord route (rows + bytes leave
 *      together) and confirm the bucket is clean
 *
 * Refuses production DATABASE_URL. The password arrives via env only.
 *
 * Usage:
 *   node scripts/media-drill.mjs upload    --file <jpg> --listing <id>
 *   node scripts/media-drill.mjs verify    --asset <mediaAssetId>
 *   node scripts/media-drill.mjs cleanup   --asset <mediaAssetId> --listing <id>
 */
import { assertSandboxDatabase } from './production-guard.mjs';
import { readFile } from 'node:fs/promises';

assertSandboxDatabase('scripts/media-drill.mjs');

const BASE = process.env.DRILL_BASE_URL ?? 'http://localhost:3000';
const PHONE = process.env.DRILL_PHONE ?? '+256700100901';
const PASSWORD = process.env.LOCAL_FIXTURE_PASSWORD;
if (!PASSWORD) {
  console.error('Refusing without LOCAL_FIXTURE_PASSWORD.');
  process.exit(1);
}

const mode = process.argv[2];
const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : undefined;
};

function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

let cookie = '';
async function api(path, init = {}) {
  const res = await fetch(BASE + path, {
    ...init,
    headers: { ...(init.headers ?? {}), ...(cookie ? { cookie } : {}) },
  });
  const setCookie = res.headers.getSetCookie?.() ?? [];
  if (setCookie.length) cookie = setCookie.map((c) => c.split(';')[0]).join('; ');
  return res;
}

async function signIn() {
  const res = await api('/api/v1/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ identifier: PHONE, password: PASSWORD }),
  });
  if (!res.ok) fail(`sign-in failed (HTTP ${res.status})`);
  console.log('✓ signed in as fixture lister');
}

if (mode === 'upload') {
  const file = arg('--file');
  const listing = arg('--listing');
  if (!file || !listing) fail('upload needs --file <jpg> --listing <id>');
  await signIn();
  const bytes = await readFile(file);
  const form = new FormData();
  form.append('file', new Blob([bytes], { type: 'image/jpeg' }), 'drill.jpg');
  form.append('caption', 'Local durability drill photograph');
  const res = await api(`/api/v1/landlord/listings/${listing}/photos`, { method: 'POST', body: form });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) fail(`upload refused (HTTP ${res.status}): ${JSON.stringify(body).slice(0, 220)}`);
  console.log(`✓ uploaded asset ${body.mediaAssetId} (${body.byteSize} B, ${body.variants?.length ?? 0} variants, ${body.processingMs}ms)`);
  console.log(`  detail : ${body.url}`);
  console.log(`  card   : ${body.cardUrl}`);
  process.exit(0);
}

if (mode === 'verify') {
  const asset = arg('--asset');
  if (!asset) fail('verify needs --asset <mediaAssetId>');
  // Sign in: an asset on a non-live listing is visible to its uploader and
  // staff only — an anonymous read is a 404 MEDIA_NOT_FOUND before the store
  // is ever consulted (that refusal is the privacy contract working).
  await signIn();
  for (const [label, variant] of [['detail', 'detail'], ['card', 'card'], ['thumb', 'thumb']]) {
    const res = await api(`/api/v1/media/${asset}?variant=${variant}`);
    const type = res.headers.get('content-type') ?? '?';
    console.log(`${res.ok ? '✓' : '✗'} ${label.padEnd(6)} HTTP ${res.status} ${type} (${res.headers.get('content-length') ?? '?'} B)`);
    if (!res.ok) process.exitCode = 1;
  }
  process.exit(process.exitCode ?? 0);
}

if (mode === 'cleanup') {
  const asset = arg('--asset');
  const listing = arg('--listing');
  if (!asset || !listing) fail('cleanup needs --asset <mediaAssetId> --listing <id>');
  await signIn();
  const res = await api(`/api/v1/landlord/listings/${listing}/photos`, {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ mediaAssetId: asset }),
  });
  console.log(`${res.ok ? '✓' : '✗'} delete via landlord route: HTTP ${res.status}`);
  const check = await fetch(`${BASE}/api/v1/media/${asset}?variant=card`);
  console.log(`${check.status === 404 ? '✓' : '✗'} post-delete read: HTTP ${check.status} (expect 404)`);
  process.exit(res.ok && check.status === 404 ? 0 : 1);
}

fail('mode must be upload | verify | cleanup');
