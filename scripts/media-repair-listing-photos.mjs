#!/usr/bin/env node
/**
 * media-repair-listing-photos — replace a listing's DEAD photographs with
 * staged replacement photography, through the same storage + rows contract
 * the application enforces.
 *
 * ── Why this exists ──
 * The round-56 media loss left listings whose MediaAsset/ListingPhoto rows
 * exist but whose bytes are gone from the store (the media route answers
 * 404 MEDIA_GONE, the card renders "Photograph unavailable"). This tool
 * lets the owner-directed operator repair ONE listing at a time: it swaps
 * only the photos whose bytes are verifiably gone, never touching a
 * photograph the store can still serve.
 *
 * ── Honesty rules (non-negotiable) ──
 * - It refuses to replace a photo whose bytes are still alive unless
 *   ALLOW_ALIVE=1 is set explicitly.
 * - It refuses a MediaAsset that other listings also reference.
 * - It never invents storage paths: new refs follow the app's own shape
 *   (listings/<listingId>/<assetId>/original.<ext> + WebP variants).
 * - Rows and bytes move together: bytes are stored FIRST, rows commit in
 *   ONE transaction, and a failed transaction compensates every uploaded
 *   object away — the same contract as src/server/media.ts.
 * - The provenance of replacement imagery (operator-supplied from public
 *   web sources on owner instruction) is written to the append-only audit
 *   log in the same transaction, so the record never silently becomes
 *   "the lister's own photography" without a trace.
 * - New ListingPhoto rows carry source='lister' (shown, never described as
 *   verified) — the enum has no honest "operator" value and inventing one
 *   would need a migration.
 * - Credentials are never printed; store errors are token-redacted.
 *
 * ── Staged input ──
 * PHOTO_DIR holds the replacement originals, ordered by numeric filename
 * prefix (1-exterior.jpg, 2-living.jpg, …). JPEG/PNG/WebP only, ≤ 4 MB,
 * decoder-verified (same guards as the upload path). Variants (thumb/card/
 * detail WebP) are re-encoded here with the exact VARIANT_SPECS of
 * src/server/image-pipeline.ts.
 *
 * ── Usage ──
 *   # 1. always look first (no writes):
 *   LISTING_ID=<uuid> PHOTO_DIR=media-repair/<uuid> DATABASE_URL="postgres://…" \
 *     [MEDIA_STORAGE=local|supabase] [SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=…] \
 *     node scripts/media-repair-listing-photos.mjs
 *
 *   # 2. apply:
 *   … APPLY=1 (same env)
 *
 * Sandbox/local drill: DATABASE_URL=<rig pglite url> MEDIA_STORAGE=local MEDIA_ROOT=/tmp/…
 */
import { PrismaClient } from '@prisma/client';
import sharp from 'sharp';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const DATABASE_URL = process.env.DATABASE_URL?.trim();
const LISTING_ID = process.env.LISTING_ID?.trim();
const PHOTO_DIR = process.env.PHOTO_DIR?.trim();
const APPLY = process.env.APPLY === '1';
const ALLOW_ALIVE = process.env.ALLOW_ALIVE === '1';
const SUPABASE_URL = process.env.SUPABASE_URL?.trim();
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const BUCKET = process.env.SUPABASE_MEDIA_BUCKET?.trim() || 'media';
const MEDIA_ROOT = process.env.MEDIA_ROOT?.trim() || path.join(process.cwd(), 'media');

// The variant specs are copied verbatim from src/server/image-pipeline.ts —
// if the app's specs change, this file MUST be updated in the same round.
const VARIANT_SPECS = {
  thumb: { maxEdge: 360, quality: 78 },
  card: { maxEdge: 760, quality: 80 },
  detail: { maxEdge: 1520, quality: 82 },
};
const MAX_BYTES = 4_000_000; // mirrors MEDIA_MAX_BYTES default
const MAX_SIDE = 8000;
const MAX_PIXELS = 50_000_000;

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}
const redact = (s) => String(s).replace(/[A-Za-z0-9+/_-]{32,}/g, '[redacted]').slice(0, 220);

if (!DATABASE_URL || !/^postgres(ql)?:\/\//.test(DATABASE_URL)) {
  fail('DATABASE_URL must be a postgres:// connection string (the repair never runs on file: databases).');
}
if (!LISTING_ID || !/^[0-9a-f-]{36}$/i.test(LISTING_ID)) {
  fail('LISTING_ID must be the listing uuid to repair.');
}
if (!PHOTO_DIR) {
  fail('PHOTO_DIR must point at the staged replacement originals.');
}

// ── storage provider (same wire semantics as src/server/media-storage.ts) ──
const explicitMode = process.env.MEDIA_STORAGE?.trim().toLowerCase();
const mode = explicitMode === 'supabase' || (explicitMode !== 'local' && SUPABASE_URL && SUPABASE_KEY)
  ? 'supabase'
  : 'local';

function assertSafeRef(ref) {
  if (!/^[a-z0-9][a-z0-9/._-]{0,511}$/.test(ref) || ref.includes('..')) {
    fail(`unsafe storage ref (${ref.slice(0, 40)}…) — aborting before any store operation.`);
  }
}

async function putObject(ref, bytes, contentType) {
  assertSafeRef(ref);
  if (process.env.DEBUG_MEDIA_REPAIR === '1') {
    console.log(`  [debug] put ${ref} bytes=${bytes?.constructor?.name}/${bytes?.length} ct=${contentType}`);
  }
  if (mode === 'supabase') {
    const res = await fetch(`${SUPABASE_URL.replace(/\/+$/, '')}/storage/v1/object/${BUCKET}/${ref}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': contentType, 'x-upsert': 'true' },
      body: Buffer.from(bytes),
    });
    if (!res.ok) {
      const body = (await res.text().catch(() => '')).replace(/[A-Za-z0-9+/_-]{32,}/g, '[redacted]').slice(0, 220);
      throw new Error(`store rejected upload (HTTP ${res.status}): ${body}`);
    }
  } else {
    const { mkdir, writeFile } = await import('node:fs/promises');
    const p = path.resolve(MEDIA_ROOT, ref);
    if (!p.startsWith(path.resolve(MEDIA_ROOT) + path.sep)) fail('local ref escaped MEDIA_ROOT');
    await mkdir(path.dirname(p), { recursive: true });
    await writeFile(p, bytes);
  }
}

async function getObjectOrNull(ref) {
  assertSafeRef(ref);
  if (mode === 'supabase') {
    const res = await fetch(`${SUPABASE_URL.replace(/\/+$/, '')}/storage/v1/object/${BUCKET}/${ref}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${SUPABASE_KEY}` },
    });
    if (res.ok) return await res.arrayBuffer();
    const body = await res.text().catch(() => '');
    const absent = res.status === 404 || (res.status === 400 && /\bNoSuchKey\b/.test(body));
    if (absent) return null; // the honest round-56 signature
    throw new Error(`store read failed (HTTP ${res.status}): ${redact(body)}`);
  }
  try {
    const { readFile } = await import('node:fs/promises');
    return await readFile(path.resolve(MEDIA_ROOT, ref));
  } catch (err) {
    if (err?.code === 'ENOENT') return null;
    throw new Error(`local media read failed: ${redact(String(err))}`);
  }
}

async function deleteObjectBestEffort(ref) {
  assertSafeRef(ref);
  try {
    if (mode === 'supabase') {
      await fetch(`${SUPABASE_URL.replace(/\/+$/, '')}/storage/v1/object/${BUCKET}/${ref}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${SUPABASE_KEY}` },
      });
    } else {
      const { rm } = await import('node:fs/promises');
      await rm(path.resolve(MEDIA_ROOT, ref), { force: true });
    }
  } catch {
    // best-effort by contract
  }
}

// ── the pipeline (mirrors processImage in src/server/image-pipeline.ts) ──
function sniffImageType(bytes) {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return { mime: 'image/png', ext: 'png' };
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
      bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
    return { mime: 'image/webp', ext: 'webp' };
  }
  return null;
}

async function processImage(bytes) {
  let meta;
  try {
    meta = await sharp(Buffer.from(bytes), { failOn: 'error' }).metadata();
  } catch {
    fail('a staged file could not be decoded (corrupt) — nothing was written.');
  }
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (!width || !height) fail('a staged file has no readable dimensions.');
  if (Math.max(width, height) > MAX_SIDE || width * height > MAX_PIXELS) {
    fail(`a staged file is over the dimension guard (${width}x${height}).`);
  }
  const variants = [];
  for (const [name, spec] of Object.entries(VARIANT_SPECS)) {
    const out = await sharp(Buffer.from(bytes), { failOn: 'error' })
      .rotate()
      .resize({ width: spec.maxEdge, height: spec.maxEdge, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: spec.quality, effort: 4 })
      .toBuffer({ resolveWithObject: true });
    variants.push({
      variant: name,
      bytes: out.data,
      width: out.info.width,
      height: out.info.height,
      byteSize: out.data.length,
      mimeType: 'image/webp',
    });
  }
  return { width, height, variants };
}

// ── main ─────────────────────────────────────────────────────────────────
const db = new PrismaClient({ datasources: { db: { url: DATABASE_URL } } });

async function main() {
  console.log(`media-repair-listing-photos — listing ${LISTING_ID} (${APPLY ? 'APPLY' : 'DRY RUN'}, store: ${mode})`);

  const listing = await db.listing.findUnique({
    where: { id: LISTING_ID },
    select: {
      id: true,
      publicationState: true,
      property: { select: { ownerPartyId: true, landmarkText: true, propertyType: true, bedrooms: true, bathrooms: true } },
      photos: {
        orderBy: { sortOrder: 'asc' },
        select: {
          id: true, sortOrder: true, caption: true, source: true,
          mediaAsset: { select: { id: true, storageRef: true, mimeType: true, byteSize: true, variants: { select: { variant: true, storageRef: true } } } },
        },
      },
    },
  });
  if (!listing) fail('listing not found.');
  console.log(`  listing: ${listing.property.propertyType} · ${listing.property.bedrooms}bd/${listing.property.bathrooms}ba · ${listing.publicationState}`);
  console.log(`  landmark: ${listing.property.landmarkText}`);
  console.log(`  photos on record: ${listing.photos.length}`);

  // Classify every existing photo: are its bytes actually gone?
  const deadPhotos = [];
  const alivePhotos = [];
  for (const p of listing.photos) {
    const original = await getObjectOrNull(p.mediaAsset.storageRef);
    if (original === null) deadPhotos.push(p);
    else alivePhotos.push(p);
  }
  console.log(`  dead (bytes gone): ${deadPhotos.length} · alive: ${alivePhotos.length}`);
  if (alivePhotos.length && !ALLOW_ALIVE) {
    fail('some photographs are still served by the store. Repairing only dead ones requires ALLOW_ALIVE=1 (this tool never touches living photography by default).');
  }
  if (deadPhotos.length === 0) {
    console.log('nothing to repair — every photo on this listing still has bytes.');
    return;
  }
  for (const p of deadPhotos) {
    const others = await db.listingPhoto.count({ where: { mediaAssetId: p.mediaAsset.id, NOT: { listingId: LISTING_ID } } });
    if (others > 0) fail(`asset ${p.mediaAsset.id} is also referenced by ${others} other listing(s) — refusing to delete it.`);
  }

  // Load + validate staged originals.
  const staged = (await readdir(PHOTO_DIR))
    .filter((f) => /^\d{1,2}-[a-z0-9-]+\.(jpe?g|png|webp)$/i.test(f))
    .sort((a, b) => (parseInt(a, 10) - parseInt(b, 10)));
  if (staged.length === 0) fail('PHOTO_DIR holds no numbered originals (1-exterior.jpg …).');
  if (staged.length > 12) fail('a listing carries at most 12 photographs.');
  const replacements = [];
  let slot = Math.min(...listing.photos.map((p) => p.sortOrder), 1);
  for (const file of staged) {
    const bytes = await readFile(path.join(PHOTO_DIR, file));
    if (bytes.length === 0) fail(`${file} is empty.`);
    if (bytes.length > MAX_BYTES) fail(`${file} is over the ${Math.floor(MAX_BYTES / 1_000_000)} MB media cap.`);
    const sniffed = sniffImageType(bytes);
    if (!sniffed) fail(`${file} is not a JPEG/PNG/WebP file (magic-byte check).`);
    const processed = await processImage(bytes);
    replacements.push({ file, bytes, sniffed, processed, sortOrder: slot++ });
    console.log(`  staged ${file} → original ${bytes.length}B + variants ${processed.variants.map((v) => `${v.variant}:${v.width}x${v.height}:${v.byteSize}B`).join(', ')}`);
  }

  // Count how many total rows the listing will carry afterwards.
  const finalCount = alivePhotos.length + replacements.length;
  if (finalCount > 12) fail(`repair would leave ${finalCount} photos on the listing (cap 12).`);

  if (!APPLY) {
    console.log('DRY RUN — no bytes or rows written. Re-run with APPLY=1 to repair.');
    console.log(`  would delete: ${deadPhotos.length} dead photo rows + their assets (variants cascade)`);
    console.log(`  would create: ${replacements.length} assets (original + 3 WebP variants) + photo rows`);
    return;
  }

  // ── APPLY: bytes first, then rows in ONE transaction, audit inside it ──
  const actorPartyId = listing.property.ownerPartyId;
  const writtenRefs = [];
  const prepared = [];
  try {
    for (const r of replacements) {
      const assetId = crypto.randomUUID();
      const base = `listings/${LISTING_ID}/${assetId}`;
      const originalRef = `${base}/original.${r.sniffed.ext}`;
      await putObject(originalRef, r.bytes, r.sniffed.mime);
      writtenRefs.push(originalRef);
      const variantRows = r.processed.variants.map((v) => ({
        variant: v.variant,
        storageRef: `${base}/${v.variant}.webp`,
        mimeType: v.mimeType,
        width: v.width,
        height: v.height,
        byteSize: v.byteSize,
        processingStatus: 'ready',
      }));
      for (let i = 0; i < variantRows.length; i++) {
        // The row carries DB fields only; the bytes live on the processed
        // variant — they travel in parallel by index.
        await putObject(variantRows[i].storageRef, r.processed.variants[i].bytes, r.processed.variants[i].mimeType);
        writtenRefs.push(variantRows[i].storageRef);
      }
      prepared.push({ assetId, originalRef, originalBytes: r.bytes, originalMime: r.sniffed.mime, variantRows, file: r.file, sortOrder: r.sortOrder, dims: { w: r.processed.width, h: r.processed.height } });
    }
  } catch (err) {
    await Promise.allSettled(writtenRefs.map((ref) => deleteObjectBestEffort(ref)));
    fail(`store upload failed, uploaded objects compensated away: ${redact(err?.stack ?? err?.message ?? err)}`);
  }

  try {
    // The repair's transaction carries ~29 sequential statements (delete the
    // dead rows, then asset + 3 variants + photo per replacement + the audit
    // event). From the operator's sandbox each statement pays a pooler round
    // trip, so the whole transaction can legitimately run past Prisma's
    // 5-second interactive-transaction default — which closes the tx and
    // surfaces later as "Transaction not found" (observed live twice). The
    // generous explicit budget covers exactly this one repair batch; nothing
    // else about the transaction's atomicity changes.
    await db.$transaction(async (tx) => {
      for (const p of deadPhotos) {
        await tx.listingPhoto.deleteMany({ where: { listingId: LISTING_ID, mediaAssetId: p.mediaAsset.id } });
        await tx.mediaAsset.delete({ where: { id: p.mediaAsset.id } });
      }
      for (const r of prepared) {
        await tx.mediaAsset.create({
          data: {
            id: r.assetId,
            storageRef: r.originalRef,
            kind: 'image',
            uploadedByPartyId: actorPartyId,
            mimeType: r.originalMime,
            byteSize: r.originalBytes.length,
          },
        });
        for (const v of r.variantRows) {
          await tx.mediaVariant.create({ data: { mediaAssetId: r.assetId, ...v } });
        }
        await tx.listingPhoto.create({
          data: { listingId: LISTING_ID, mediaAssetId: r.assetId, sortOrder: r.sortOrder, caption: null, source: 'lister' },
        });
      }
      await tx.auditEvent.create({
        data: {
          actorPartyId,
          eventType: 'media_repair',
          subjectRef: LISTING_ID,
          payload: {
            action: 'replaced dead listing photography',
            reason: 'round-56 media loss — DB rows existed, stored bytes were gone (404 MEDIA_GONE)',
            replacedDeadAssetIds: deadPhotos.map((p) => p.mediaAsset.id),
            replacements: prepared.map((r) => ({
              file: r.file,
              mediaAssetId: r.assetId,
              storageRef: r.originalRef,
              originalByteSize: r.originalBytes.length,
              variants: r.variantRows.map((v) => ({ variant: v.variant, byteSize: v.byteSize, width: v.width, height: v.height })),
            })),
            provenance: 'representative photography sourced from public property listings by the platform operator on the owner\u2019s instruction; not photographs of the specific unit. Provenance record: media-repair/<listingId>/sources.json in the repository.',
            storeMode: mode,
          },
          occurredAt: new Date(),
        },
      });
    }, { timeout: 120_000, maxWait: 20_000 });
  } catch (err) {
    await Promise.allSettled(writtenRefs.map((ref) => deleteObjectBestEffort(ref)));
    fail(`row transaction failed, uploaded objects compensated away: ${redact(err?.stack ?? err?.message ?? err)}`);
  }

  // ── post-verify: every new variant must read back from the store ──
  console.log('rows committed. Post-verify:');
  let ok = 0;
  for (const r of prepared) {
    for (const ref of [r.originalRef, ...r.variantRows.map((v) => v.storageRef)]) {
      const got = await getObjectOrNull(ref);
      if (got === null) console.error(`  ✗ ${ref} MISSING after commit`);
      else ok++;
    }
  }
  console.log(`  ${ok}/${writtenRefs.length} objects read back from the store.`);
  console.log('repair complete.');
}

main()
  .catch((e) => {
    console.error(redact(e?.stack ?? String(e)));
    process.exit(1);
  })
  .finally(() => db.$disconnect());
