#!/usr/bin/env node
/**
 * media-orphan-sweep — report (and optionally delete) stored media objects
 * that NO database row names anymore.
 *
 * ── Why this exists ──
 * Every legitimate object in the private `media` bucket is named by either
 * media_asset.storage_ref (the original) or media_variant.storage_ref (a
 * rendition). Upload compensation and transactional deletes make orphans
 * rare-but-possible (a crash between object write and row commit, or a
 * failed compensation call). Orphans are inert — a private bucket, no row,
 * no URL — but they are un-governed bytes, so an operator sweeps them.
 *
 * ── Modes ──
 * - LOCAL:  MEDIA_STORAGE=local + MEDIA_ROOT set → walks the disk.
 * - SUPABASE: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY set → lists the
 *   bucket over the Storage REST API (service key stays in env, never
 *   printed). SWEEP_DRY_RUN=yes (default) only reports; deleting requires
 *   ALLOW_ORPHAN_DELETE=yes as well (two-key convention).
 *
 * Usage:
 *   DATABASE_URL=… MEDIA_STORAGE=local MEDIA_ROOT=… bun scripts/media-orphan-sweep.mjs          # dry run
 *   DATABASE_URL=… SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… SWEEP_DRY_RUN=no ALLOW_ORPHAN_DELETE=yes bun scripts/media-orphan-sweep.mjs
 */
import { PrismaClient } from '@prisma/client';
import { readdirSync, statSync, readFileSync } from 'node:fs';
import path from 'node:path';

const DRY_RUN = (process.env.SWEEP_DRY_RUN ?? 'yes') !== 'no';
const MODE = process.env.MEDIA_STORAGE?.trim().toLowerCase() === 'local' ? 'local' : 'supabase';
const BUCKET = process.env.SUPABASE_MEDIA_BUCKET?.trim() || 'media';

function refuse(msg) {
  console.error(`media-orphan-sweep: refusing — ${msg}`);
  process.exit(2);
}
if (!process.env.DATABASE_URL) refuse('DATABASE_URL is required (row names come from the database)');
if (MODE === 'local' && !process.env.MEDIA_ROOT) refuse('MEDIA_ROOT is required in local mode');
if (MODE === 'supabase' && !process.env.SUPABASE_URL) refuse('SUPABASE_URL is required in supabase mode');
if (MODE === 'supabase' && !process.env.SUPABASE_SERVICE_ROLE_KEY) refuse('SUPABASE_SERVICE_ROLE_KEY is required in supabase mode');
if (!DRY_RUN && process.env.ALLOW_ORPHAN_DELETE !== 'yes') {
  refuse('deleting orphans requires ALLOW_ORPHAN_DELETE=yes in addition to SWEEP_DRY_RUN=no');
}

const prisma = new PrismaClient();
const known = new Set();
const assets = await prisma.mediaAsset.findMany({ select: { storageRef: true } });
for (const a of assets) known.add(a.storageRef);
const variants = await prisma.mediaVariant.findMany({ select: { storageRef: true } });
for (const v of variants) known.add(v.storageRef);
console.log(`media-orphan-sweep: mode=${MODE} dryRun=${DRY_RUN} knownRefs=${known.size}`);

const stored = [];
if (MODE === 'local') {
  const root = path.resolve(process.env.MEDIA_ROOT);
  const walk = (dir) => {
    let entries;
    try { entries = readdirSync(dir); } catch { return; }
    for (const f of entries) {
      const p = path.join(dir, f);
      if (statSync(p).isDirectory()) walk(p);
      else stored.push(path.relative(root, p).split(path.sep).join('/'));
    }
  };
  walk(root);
} else {
  // Supabase Storage REST: list objects page by page (service role).
  const base = process.env.SUPABASE_URL.replace(/\/+$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  let offset = 0;
  for (;;) {
    const res = await fetch(`${base}/storage/v1/object/list/${BUCKET}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefix: '', limit: 1000, offset, sortBy: { column: 'name', order: 'asc' } }),
    });
    if (!res.ok) {
      refuse(`bucket list failed (HTTP ${res.status}): ${(await res.text()).slice(0, 200)}`);
    }
    const rows = await res.json();
    for (const row of rows) {
      if (row.name && !row.name.endsWith('/')) stored.push(row.name);
    }
    if (rows.length < 1000) break;
    offset += 1000;
  }
}

const orphans = stored.filter((ref) => !known.has(ref));
console.log(`media-orphan-sweep: storedObjects=${stored.length} orphans=${orphans.length}`);
for (const ref of orphans) console.log(`  orphan: ${ref}`);

if (orphans.length === 0) {
  console.log('media-orphan-sweep: nothing to do — storage and rows agree.');
} else if (DRY_RUN) {
  console.log('media-orphan-sweep: DRY RUN — nothing deleted. Re-run with SWEEP_DRY_RUN=no ALLOW_ORPHAN_DELETE=yes to delete.');
} else if (MODE === 'local') {
  const { rmSync } = await import('node:fs');
  for (const ref of orphans) {
    rmSync(path.resolve(process.env.MEDIA_ROOT, ref), { force: true });
    console.log(`  deleted: ${ref}`);
  }
  console.log(`media-orphan-sweep: ${orphans.length} orphan file(s) deleted.`);
} else {
  const base = process.env.SUPABASE_URL.replace(/\/+$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  let deleted = 0;
  for (const ref of orphans) {
    const res = await fetch(`${base}/storage/v1/object/${BUCKET}/${ref}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${key}` },
    });
    if (res.ok || res.status === 404) deleted++;
    else console.error(`  delete failed (HTTP ${res.status}): ${ref}`);
  }
  console.log(`media-orphan-sweep: ${deleted}/${orphans.length} orphan object(s) deleted.`);
}

await prisma.$disconnect().catch(() => {});
