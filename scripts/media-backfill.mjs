#!/usr/bin/env node
/**
 * Backfill media objects into the durable Supabase bucket, driven by DB rows.
 *
 * ── What it does ──
 * Reads every MediaAsset row and its variant rows from the database, and for
 * each DB-named storageRef reads the bytes from the LOCAL disk tree
 * (MEDIA_ROOT, default cwd/media) and PUTs them to the Supabase bucket with
 * the exact semantics of the app adapter (POST + x-upsert, so a re-run is
 * safe and a half-landed attempt heals).
 *
 * ── What it deliberately does NOT do ──
 * - It never invents a path: refs come ONLY from DB rows.
 * - It never fabricates bytes: a file missing on disk is reported SKIPPED
 *   (honest), which is the correct outcome for the round-56 loss where the
 *   originals are genuinely gone.
 * - It never writes to the database: rows are read-only here; the rows are
 *   already the source of truth naming these objects.
 * - It never prints credentials; store errors are token-redacted.
 *
 * Usage (dry run first):
 *   DRY_RUN=1 DATABASE_URL="postgresql://..." SUPABASE_URL="https://<ref>.supabase.co" \
 *   SUPABASE_SERVICE_ROLE_KEY="..." [SUPABASE_MEDIA_BUCKET=media] [MEDIA_ROOT=...] \
 *   node scripts/media-backfill.mjs
 */
import { PrismaClient } from '@prisma/client';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const DATABASE_URL = process.env.PROVISION_DATABASE_URL || process.env.DATABASE_URL;
const URL_BASE = process.env.SUPABASE_URL?.trim();
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const BUCKET = process.env.SUPABASE_MEDIA_BUCKET?.trim() || 'media';
const MEDIA_ROOT = process.env.MEDIA_ROOT?.trim() || path.join(process.cwd(), 'media');
const DRY_RUN = process.env.DRY_RUN === '1';

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}
if (!DATABASE_URL || !/^postgres(ql)?:\/\//.test(DATABASE_URL)) {
  fail('DATABASE_URL (or PROVISION_DATABASE_URL) must be a postgres:// connection string.');
}
if (!URL_BASE || !KEY) {
  fail('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set. They are never printed, logged, or written anywhere.');
}

const redact = (s) => String(s).replace(/[A-Za-z0-9+/_-]{32,}/g, '[redacted]').slice(0, 220);
// Same guard as the app adapter (assertSafeStorageRef): server-shaped refs only.
function assertSafeRef(ref) {
  if (!/^[a-z0-9][a-z0-9/._-]{0,511}$/.test(ref) || ref.includes('..')) {
    fail(`DB row carries an unsafe storageRef (${ref.slice(0, 40)}…) — aborting before any upload.`);
  }
}

const db = new PrismaClient({ datasources: { db: { url: DATABASE_URL } } });

async function main() {
  const assets = await db.mediaAsset.findMany({
    select: {
      id: true,
      mimeType: true,
      storageRef: true,
      variants: { select: { variant: true, storageRef: true, mimeType: true } },
    },
  });
  if (assets.length === 0) {
    console.log('No MediaAsset rows — nothing to backfill.');
    return;
  }

  const plan = [];
  for (const a of assets) {
    plan.push({ kind: 'origin', ref: a.storageRef, mime: a.mimeType ?? 'application/octet-stream' });
    for (const v of a.variants) {
      plan.push({ kind: v.variant, ref: v.storageRef, mime: v.mimeType ?? 'image/webp' });
    }
  }
  for (const item of plan) assertSafeRef(item.ref);

  console.log(`→ ${assets.length} asset row(s), ${plan.length} object(s) named by the DB. Mode: ${DRY_RUN ? 'DRY RUN' : 'UPLOAD'}.`);

  const base = URL_BASE.replace(/\/+$/, '');
  let ok = 0;
  let skipped = 0;
  let failed = 0;

  for (const item of plan) {
    const localPath = path.resolve(MEDIA_ROOT, item.ref);
    let bytes;
    try {
      bytes = await readFile(localPath);
    } catch (err) {
      if (err?.code === 'ENOENT') {
        console.log(`  SKIP ${item.kind.padEnd(6)} ${item.ref}  (not on local disk — bytes genuinely unavailable)`);
        skipped += 1;
        continue;
      }
      console.log(`  FAIL ${item.kind.padEnd(6)} ${item.ref}  (local read error: ${redact(err?.message ?? err)})`);
      failed += 1;
      continue;
    }
    if (DRY_RUN) {
      console.log(`  DRY  ${item.kind.padEnd(6)} ${item.ref}  (${bytes.length} bytes ready)`);
      ok += 1;
      continue;
    }
    const res = await fetch(`${base}/storage/v1/object/${encodeURIComponent(BUCKET)}/${item.ref}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${KEY}`,
        'Content-Type': item.mime,
        'x-upsert': 'true',
      },
      body: bytes,
    });
    if (res.ok) {
      console.log(`  OK   ${item.kind.padEnd(6)} ${item.ref}  (${bytes.length} bytes)`);
      ok += 1;
    } else {
      console.log(`  FAIL ${item.kind.padEnd(6)} ${item.ref}  (HTTP ${res.status}: ${redact(await res.text().catch(() => ''))})`);
      failed += 1;
    }
  }

  console.log(`\nSummary: ${ok} uploaded, ${skipped} skipped (bytes unavailable), ${failed} failed.`);
  if (failed > 0) process.exit(1);
  if (skipped > 0) {
    console.log('Skipped refs name objects whose bytes exist nowhere — they stay honestly broken until the owner supplies the files or authorizes clearly-labeled replacements.');
  }
}

main()
  .catch((err) => fail(String(err)))
  .finally(() => db.$disconnect());
