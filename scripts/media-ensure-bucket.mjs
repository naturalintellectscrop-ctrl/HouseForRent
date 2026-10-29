#!/usr/bin/env node
/**
 * Ensure the private Supabase Storage bucket exists (operator tool, idempotent).
 *
 * Round-56 root cause: production runs the Supabase storage adapter (the 503
 * MEDIA_STORE_UNAVAILABLE signature proves it — local mode would 404) but the
 * private bucket was never created, so every media read fails at the store.
 * This script closes that gap in one operator command. It:
 *   - refuses to run without SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY,
 *   - treats "absent" exactly the way the Storage API reports it (404, or the
 *     object-route-style 400 wrapper carrying NoSuchBucket),
 *   - creates the bucket PRIVATE (public:false) and refuses to touch an
 *     existing PUBLIC bucket — private media must never land in a public one,
 *   - verifies after creation and prints only non-secret diagnostics
 *     (the service key and project URL are never printed).
 *
 * Usage:
 *   SUPABASE_URL="https://<ref>.supabase.co" \
 *   SUPABASE_SERVICE_ROLE_KEY="..." \
 *   [SUPABASE_MEDIA_BUCKET=media] \
 *   node scripts/media-ensure-bucket.mjs
 */
const URL_BASE = process.env.SUPABASE_URL?.trim();
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const BUCKET = process.env.SUPABASE_MEDIA_BUCKET?.trim() || 'media';

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}
if (!URL_BASE || !KEY) {
  fail('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set. They are used for this run only and are never printed, logged, or written anywhere.');
}
if (!/^https:\/\/.+/.test(URL_BASE)) {
  fail('SUPABASE_URL must be an https:// project URL.');
}

const base = URL_BASE.replace(/\/+$/, '');
const auth = { Authorization: `Bearer ${KEY}` };
const redact = (s) => String(s).replace(/[A-Za-z0-9+/_-]{32,}/g, '[redacted]').slice(0, 220);
const bucketUrl = `${base}/storage/v1/bucket/${encodeURIComponent(BUCKET)}`;

async function main() {
  const check = await fetch(bucketUrl, { headers: auth });
  const checkBody = await check.text().catch(() => '');

  if (check.ok) {
    const meta = JSON.parse(checkBody || '{}');
    if (meta.public) {
      fail(`bucket "${BUCKET}" exists but is PUBLIC. Private media must never live in a public bucket — recreate it as private, then re-run.`);
    }
    console.log(`✓ bucket "${BUCKET}" already exists (private). Nothing to do.`);
    return;
  }

  const absent =
    check.status === 404 ||
    (check.status === 400 && /not found|NoSuchBucket/i.test(checkBody));
  if (!absent) {
    fail(`bucket lookup failed (HTTP ${check.status}): ${redact(checkBody)}`);
  }

  console.log(`→ bucket "${BUCKET}" is absent; creating it as PRIVATE…`);
  const create = await fetch(`${base}/storage/v1/bucket`, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: BUCKET, public: false }),
  });
  if (!create.ok) {
    fail(`bucket creation refused (HTTP ${create.status}): ${redact(await create.text().catch(() => ''))}`);
  }

  const verify = await fetch(bucketUrl, { headers: auth });
  if (!verify.ok) {
    fail(`bucket created but verification failed (HTTP ${verify.status}) — inspect the Storage dashboard before uploading.`);
  }
  const meta = JSON.parse(await verify.text().catch(() => '{}'));
  if (meta.public) {
    fail('created bucket reports public:true — refusing. Delete it and investigate before any upload.');
  }
  console.log(`✓ private bucket "${BUCKET}" created and verified.`);
  console.log('  Next: run scripts/media-backfill.mjs to push DB-named objects into it.');
}

main().catch((err) => fail(String(err)));
