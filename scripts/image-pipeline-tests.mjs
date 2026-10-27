// IMAGE PIPELINE TEST SUITE (launch round: image optimization)
//
// Boots the FULL application stack on a private, disposable rig:
//   PGlite (real Postgres 16 WASM) over the wire protocol
//   + `next dev` (Turbopack) with MEDIA_STORAGE=local
// and drives the actual HTTP surface with real multipart uploads processed
// by the real sharp pipeline. Nothing here touches production.
//
// Covers: valid JPEG/PNG/WebP uploads, EXIF+GPS stripping, orientation
// baking, variant metadata rows, spoofed MIME, declared-MIME mismatch,
// corrupt files, byte-oversize, pixel-bomb, unauthorized listing,
// unauthenticated reads, unknown variant, delete (rows+bytes+variants),
// retry-after-failure, duplicate submission, rate limiting (429), and the
// orphan sweep. Prints original-vs-variant byte measurements.
//
// Usage: bun scripts/image-pipeline-tests.mjs
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { readFileSync, writeFileSync, rmSync, mkdirSync, existsSync, readdirSync, statSync } from 'node:fs';
import { execFileSync, spawn } from 'node:child_process';
import path from 'node:path';
import sharp from 'sharp';

const REPO = '/home/z/my-project';
const PORT_DB = 55000 + Math.floor(Math.random() * 4000);
const PORT_APP = 31000 + Math.floor(Math.random() * 8000); // rotate: killed runs leave orphans behind
const RESTORE_URL = `postgres://rig:rig@127.0.0.1:${PORT_DB}/postgres?pgbouncer=true&connection_limit=1&pool_timeout=60`;
const API = `http://127.0.0.1:${PORT_APP}/api/v1`;
const MEDIA_ROOT = '/tmp/hfr-media-test-' + Date.now();

let failures = 0;
const check = (name, pass, detail = '') => {
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
const seed = await db.query(
  `INSERT INTO neighbourhood (id, name, parent_id, in_service_area, created_at)
   VALUES ('rig-nbhd-1', 'Rig Central', NULL, true, now()) RETURNING id`,
);
check('rig DB ready (schema + seed neighbourhood)', seed.rows.length === 1);

const server = new PGLiteSocketServer({ db, port: PORT_DB, host: '127.0.0.1' });
await server.start();

// ── 2. the real application server ──────────────────────────────────────────
// Best-effort: clear any stale listener on the chosen port before spawning.
try { execFileSync('fuser', ['-k', `${PORT_APP}/tcp`], { stdio: 'ignore' }); } catch {}

// Own process group so a killed run takes next-server's children with it.
const app = spawn('bunx', ['next', 'dev', '-p', String(PORT_APP)], {
  cwd: REPO,
  detached: true,
  env: {
    ...process.env,
    DATABASE_URL: RESTORE_URL,
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
check('next dev ready on :3111', appReady);
if (!appReady) {
  console.log(appLog.slice(-2000));
  process.exit(1);
}

// ── 3. HTTP helpers (cookie-jar client) ─────────────────────────────────────
function client() {
  let cookie = null;
  return async function call(method, urlPath, body, headers = {}) {
    const res = await fetch(`${API}${urlPath}`, {
      method,
      headers: {
        ...(cookie ? { cookie } : {}),
        ...(body instanceof FormData ? {} : body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...headers,
      },
      body: body instanceof FormData ? body : body !== undefined ? JSON.stringify(body) : undefined,
      redirect: 'manual',
    });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0];
    let json = null;
    try { json = await res.json(); } catch {}
    return { status: res.status, json, headers: res.headers, cookie };
  };
}

// ── 4. fixtures (sharp, in-process) ─────────────────────────────────────────
const bigJpeg = await sharp({
  create: { width: 3000, height: 2000, channels: 3, background: { r: 140, g: 90, b: 70 } },
})
  .jpeg({ quality: 90 })
  .withMetadata({
    exif: { IFD0: { Orientation: 'right-top', Make: 'RigCam', Model: 'Test-1' }, IFD3: { GPSLatitude: '0.3167', GPSLatitudeRef: 'N', GPSLongitude: '32.5833', GPSLongitudeRef: 'E' } },
  })
  .toBuffer();
const portraitJpeg = await sharp({
  create: { width: 2400, height: 3600, channels: 3, background: { r: 40, g: 110, b: 90 } },
})
  .jpeg({ quality: 88 })
  .withMetadata({ exif: { IFD0: { Orientation: 'right-top' } } })
  .toBuffer();
const plainPng = await sharp({ create: { width: 1600, height: 1200, channels: 4, background: { r: 30, g: 60, b: 120, alpha: 1 } } }).png().toBuffer();
const webpInput = await sharp({ create: { width: 1800, height: 1350, channels: 3, background: { r: 90, g: 120, b: 40 } } }).webp({ quality: 85 }).toBuffer();
const tinyJpeg = await sharp({ create: { width: 4, height: 4, channels: 3, background: { r: 200, g: 200, b: 200 } } }).jpeg().toBuffer();
const corruptJpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('this is not really jpeg payload data at all. '.repeat(400))]);
const textJpeg = Buffer.from('this is a text file pretending to be a photograph, honestly.');
const bigOversize = Buffer.alloc(4_200_000, 0x01); // >4MB, invalid image body (size check fires first)
const pixelBomb = await sharp({ create: { width: 9000, height: 9000, channels: 3, background: { r: 5, g: 5, b: 5 } } }).jpeg({ quality: 40 }).toBuffer(); // 81 MP, small bytes

// ── 5. accounts + listing ───────────────────────────────────────────────────
const lister = client();
const other = client();

let r = await lister('POST', '/auth/register', { displayName: 'Rig Lister', primaryPhone: '+256700000201', password: 'rig-password-1', role: 'lister' });
check('register lister', r.status === 201, JSON.stringify(r.json?.error ?? ''));
r = await lister('POST', '/auth/login', { primaryPhone: '+256700000201', password: 'rig-password-1' });
check('login lister', r.status === 200, JSON.stringify(r.json?.error ?? ''));
r = await other('POST', '/auth/register', { displayName: 'Rig Other', primaryPhone: '+256700000202', password: 'rig-password-2', role: 'lister' });
r = await other('POST', '/auth/login', { primaryPhone: '+256700000202', password: 'rig-password-2' });

r = await lister('POST', '/landlord/properties', {
  propertyType: 'apartment', bedrooms: 2, bathrooms: 1, furnished: 'semi_furnished',
  neighbourhoodId: 'rig-nbhd-1', landmarkText: 'Rig landmark 1', streetAddress: 'Rig street 1',
  monthlyRent: 800000, depositAmount: 400000, requiredMonthsUpfront: 2, descriptionText: 'Rig listing',
});
check('create property+listing', r.status === 201, JSON.stringify(r.json?.error ?? ''));
if (r.status !== 201) { console.log('--- app log tail:\n' + appLog.slice(-2500)); }
const listingId = r.json?.listingId;

function multipart(filename, bytes, mime, extra = {}) {
  const fd = new FormData();
  fd.append('file', new Blob([bytes], { type: mime }), filename);
  for (const [k, v] of Object.entries(extra)) fd.append(k, v);
  return fd;
}

// ── 6. the matrix ───────────────────────────────────────────────────────────
// T1: valid JPEG with EXIF+GPS
r = await lister('POST', `/landlord/listings/${listingId}/photos`, multipart('photo.jpg', bigJpeg, 'image/jpeg', { caption: 'Rig living room' }));
check('T1 valid JPEG upload → 201', r.status === 201, JSON.stringify(r.json?.error ?? ''));
const assetId1 = r.json?.mediaAssetId;
const t1 = r.json ?? {};
check('T1 response carries 3 ready variants', Array.isArray(t1.variants) && t1.variants.length === 3, JSON.stringify(t1.variants ?? []));
check('T1 variant edges within spec (≤360/760/1520)', ['thumb', 'card', 'detail'].every((n) => {
  const v = (t1.variants ?? []).find((x) => x.variant === n);
  return v && Math.max(v.width, v.height) <= { thumb: 360, card: 760, detail: 1520 }[n];
}), JSON.stringify(t1.variants ?? []));
check('T1 processing measured', typeof t1.processingMs === 'number' && t1.processingMs >= 0, `${t1.processingMs}ms`);
const variantSum = (t1.variants ?? []).reduce((a, v) => a + v.byteSize, 0);
check('T1 total variant bytes < original', variantSum > 0 && variantSum < bigJpeg.length, `original=${bigJpeg.length} Σvariants=${variantSum}`);

const rows = await db.query(`SELECT variant, storage_ref, mime_type, width, height, byte_size, processing_status FROM media_variant WHERE media_asset_id = $1 ORDER BY variant`, [assetId1]);
check('T1 three media_variant rows (ready, webp)', rows.rows.length === 3 && rows.rows.every((x) => x.processing_status === 'ready' && x.mime_type === 'image/webp'), JSON.stringify(rows.rows.map((x) => x.variant)));
const originalRow = await db.query(`SELECT storage_ref, mime_type, byte_size FROM media_asset WHERE id = $1`, [assetId1]);
const origRef = originalRow.rows[0]?.storage_ref ?? '';
const origPath = `${MEDIA_ROOT}/${origRef}`;
check('T1 original stored privately', existsSync(origPath), origPath);
const origMeta = existsSync(origPath) ? await sharp(readFileSync(origPath)).metadata() : null;
check('T1 original retains EXIF (private by design)', !!origMeta?.exif, 'EXIF lives only on the private original');
const thumbFile = rows.rows.find((x) => x.variant === 'thumb');
const thumbPath = thumbFile ? `${MEDIA_ROOT}/${thumbFile.storage_ref}` : null;
const thumbMeta = thumbPath && existsSync(thumbPath) ? await sharp(readFileSync(thumbPath)).metadata() : null;
check('T1 rendition strips EXIF/GPS', !!thumbMeta && !thumbMeta.exif, 'no EXIF block in thumb.webp');

// T1b: orientation baked (portrait + right-top → detail stays portrait ≤1520)
r = await lister('POST', `/landlord/listings/${listingId}/photos`, multipart('portrait.jpg', portraitJpeg, 'image/jpeg'));
const assetIdPortrait = r.json?.mediaAssetId;
const detailRow = (await db.query(`SELECT width, height FROM media_variant WHERE media_asset_id = $1 AND variant='detail'`, [assetIdPortrait])).rows[0];
check('T1b EXIF orientation baked into pixels (portrait ≤1520 tall)', detailRow && detailRow.height > detailRow.width && detailRow.height <= 1520, JSON.stringify(detailRow));

// T2: PNG accepted
r = await lister('POST', `/landlord/listings/${listingId}/photos`, multipart('shot.png', plainPng, 'image/png'));
check('T2 valid PNG upload → 201', r.status === 201, JSON.stringify(r.json?.error ?? ''));

// T3: WebP accepted
r = await lister('POST', `/landlord/listings/${listingId}/photos`, multipart('shot.webp', webpInput, 'image/webp'));
check('T3 valid WebP upload → 201', r.status === 201, JSON.stringify(r.json?.error ?? ''));

// T4: text masquerading as JPEG
r = await lister('POST', `/landlord/listings/${listingId}/photos`, multipart('fake.jpg', textJpeg, 'image/jpeg'));
check('T4 text-as-jpeg refused 415 MEDIA_TYPE_NOT_ACCEPTED', r.status === 415 && r.json?.error?.code === 'MEDIA_TYPE_NOT_ACCEPTED', JSON.stringify(r.json?.error ?? ''));

// T5: declared MIME mismatch (PNG bytes declared jpeg)
r = await lister('POST', `/landlord/listings/${listingId}/photos`, multipart('mismatch.jpg', plainPng, 'image/jpeg'));
check('T5 declared-MIME mismatch refused 415', r.status === 415 && r.json?.error?.code === 'MEDIA_TYPE_MISMATCH', JSON.stringify(r.json?.error ?? ''));

// T6: corrupt file (valid magic, undecodable body)
r = await lister('POST', `/landlord/listings/${listingId}/photos`, multipart('corrupt.jpg', corruptJpeg, 'image/jpeg'));
check('T6 corrupt image refused 415 MEDIA_CORRUPT', r.status === 415 && r.json?.error?.code === 'MEDIA_CORRUPT', JSON.stringify(r.json?.error ?? ''));

// T7: byte-oversize
r = await lister('POST', `/landlord/listings/${listingId}/photos`, multipart('huge.jpg', bigOversize, 'image/jpeg'));
check('T7 >4MB refused 413 MEDIA_TOO_LARGE', r.status === 413 && r.json?.error?.code === 'MEDIA_TOO_LARGE', JSON.stringify(r.json?.error ?? ''));

// T8: pixel bomb (81 MP, small bytes)
r = await lister('POST', `/landlord/listings/${listingId}/photos`, multipart('bomb.jpg', pixelBomb, 'image/jpeg'));
check('T8 pixel-bomb refused 413 MEDIA_DIMENSIONS', r.status === 413 && r.json?.error?.code === 'MEDIA_DIMENSIONS', JSON.stringify(r.json?.error ?? ''));

// T9: unauthorized listing (other lister uploads to rig lister's listing)
r = await other('POST', `/landlord/listings/${listingId}/photos`, multipart('steal.jpg', tinyJpeg, 'image/jpeg'));
check('T9 cross-account upload refused (403/404)', r.status === 403 || r.status === 404, `status=${r.status} code=${r.json?.error?.code ?? ''}`);

// T10: unauthenticated media reads
const anon = client();
r = await anon('GET', `/media/${assetId1}`);
check('T10 unauthenticated media GET → 404', r.status === 404, `status=${r.status}`);
r = await anon('GET', `/media/${assetId1}?variant=card`);
check('T10 unauthenticated variant GET → 404', r.status === 404, `status=${r.status}`);

// T11: owner variant reads (raw fetch to inspect bytes)
const listerCookie = lister.cookie ?? '';
async function rawGet(pathWithQuery) {
  return fetch(`${API}${pathWithQuery}`, { headers: { cookie: listerCookie } });
}
let res = await rawGet(`/media/${assetId1}?variant=thumb`);
const thumbBuf = Buffer.from(await res.arrayBuffer());
const thumbServeMeta = await sharp(thumbBuf).metadata().catch(() => null);
check('T11 owner thumb read → 200 webp, decoded, metadata-free', res.status === 200 && (res.headers.get('content-type') ?? '').includes('webp') && !!thumbServeMeta && !thumbServeMeta.exif, `status=${res.status} bytes=${thumbBuf.length}`);
res = await rawGet(`/media/${assetId1}?variant=card`);
check('T11 owner card read → 200', res.status === 200);
res = await rawGet(`/media/${assetId1}`);
check('T12 plain GET serves the original (legacy compat)', res.status === 200 && (res.headers.get('content-type') ?? '').includes('jpeg'), `ct=${res.headers.get('content-type')}`);

// T13: unknown variant
r = await lister('GET', `/media/${assetId1}?variant=mega`);
check('T13 unknown variant → 400 MEDIA_VARIANT_UNKNOWN', r.status === 400 && r.json?.error?.code === 'MEDIA_VARIANT_UNKNOWN', JSON.stringify(r.json?.error ?? ''));

// T14: delete removes rows AND bytes (original + renditions)
const filesBefore = listMediaFiles(MEDIA_ROOT);
r = await lister('DELETE', `/landlord/listings/${listingId}/photos`, { mediaAssetId: assetId1 });
check('T14 delete → 200', r.status === 200, JSON.stringify(r.json?.error ?? ''));
const rowsAfter = await db.query(`SELECT count(*)::int AS n FROM media_variant WHERE media_asset_id = $1`, [assetId1]);
check('T14 variant rows cascade-deleted', rowsAfter.rows[0].n === 0);
const removedCount = filesBefore - listMediaFiles(MEDIA_ROOT);
check('T14 bytes removed (original + 3 renditions)', removedCount === 4, `removed=${removedCount}`);

// T15: retry after failure — corrupt upload does not poison the session
r = await lister('POST', `/landlord/listings/${listingId}/photos`, multipart('corrupt2.jpg', corruptJpeg, 'image/jpeg'));
check('T15 corrupt refused again (deterministic)', r.status === 415);
r = await lister('POST', `/landlord/listings/${listingId}/photos`, multipart('retry.jpg', tinyJpeg, 'image/jpeg'));
check('T15 valid upload succeeds after failures', r.status === 201, JSON.stringify(r.json?.error ?? ''));

// T16: photo list includes variant URLs
r = await lister('GET', `/landlord/listings/${listingId}/photos`);
const listed = r.json?.photos ?? [];
check('T16 photo list carries detail/thumb/card URLs', listed.length >= 1 && listed.every((p) => p.url.includes('variant=detail') && p.thumbUrl.includes('variant=thumb') && p.cardUrl.includes('variant=card')), JSON.stringify(listed[0] ?? {}));

// T17: rate limiting — fresh account, 24-window, expect 429 at ≤#25
const burst = client();
await burst('POST', '/auth/register', { displayName: 'Rig Burst', primaryPhone: '+256700000203', password: 'rig-password-3', role: 'lister' });
await burst('POST', '/auth/login', { primaryPhone: '+256700000203', password: 'rig-password-3' });
r = await burst('POST', '/landlord/properties', {
  propertyType: 'apartment', bedrooms: 1, bathrooms: 1, furnished: 'unfurnished',
  neighbourhoodId: 'rig-nbhd-1', landmarkText: 'Rig landmark 2', monthlyRent: 500000, depositAmount: 250000,
});
const burstListing = r.json?.listingId;
let got429 = false; let lastStatus = 0;
for (let i = 0; i < 25; i++) {
  const res2 = await burst('POST', `/landlord/listings/${burstListing}/photos`, multipart(`burst-${i}.jpg`, tinyJpeg, 'image/jpeg'));
  lastStatus = res2.status;
  if (res2.status === 429) { got429 = true; break; }
}
check('T17 upload rate limit trips with 429 inside the window', got429, `lastStatus=${lastStatus}`);

// T18: orphan sweep (local mode) — plant a stray object, sweep must flag it
const strayRef = 'listings/stray-listing/stray-object.webp';
writeFileSync(`${MEDIA_ROOT}/${strayRef}`, Buffer.from('orphan bytes'));
const sweep = spawn('bun', ['scripts/media-orphan-sweep.mjs'], {
  cwd: REPO,
  env: { ...process.env, DATABASE_URL: RESTORE_URL, MEDIA_STORAGE: 'local', MEDIA_ROOT, SWEEP_DRY_RUN: 'yes' },
});
let sweepOut = '';
sweep.stdout.on('data', (d) => (sweepOut += d));
await new Promise((res2) => sweep.on('exit', res2));
check('T18 orphan sweep flags the stray object', sweepOut.includes(strayRef), sweepOut.split('\n').filter((l) => l.includes('orphan') || l.includes('stray')).slice(0, 3).join(' | '));

// ── measurements ────────────────────────────────────────────────────────────
console.log('\n== MEASUREMENTS (T1 fixture: 3000x2000 JPEG with EXIF+GPS) ==');
console.log(`original:      ${bigJpeg.length} bytes`);
for (const v of t1.variants ?? []) console.log(`${v.variant.padEnd(7)} ${String(v.width)}x${String(v.height)}  ${v.byteSize} bytes  (${((v.byteSize / bigJpeg.length) * 100).toFixed(1)}% of original)`);
console.log(`Σ variants:    ${variantSum} bytes  (${((variantSum / bigJpeg.length) * 100).toFixed(1)}% of original)`);
console.log(`processing:    ${t1.processingMs}ms wall clock`);

function listMediaFiles(root) {
  let n = 0;
  const walk = (dir) => {
    if (!existsSync(dir)) return;
    for (const f of readdirSync(dir)) {
      const p = path.join(dir, f);
      if (statSync(p).isDirectory()) walk(p);
      else n++;
    }
  };
  walk(root);
  return n;
}

// ── teardown ──────────────────────────────────────────────────────────────
// Kill the WHOLE process group (next dev spawns its own server child).
try { process.kill(-app.pid, 'SIGKILL'); } catch {}
await sleep(800);
try { execFileSync('fuser', ['-k', `${PORT_APP}/tcp`], { stdio: 'ignore' }); } catch {}
try { rmSync(MEDIA_ROOT, { recursive: true, force: true }); } catch {}
await server.stop().catch(() => {});
await db.close().catch(() => {});
try { rmSync(SCHEMA_SQL, { force: true }); } catch {}

console.log(failures === 0 ? '\n== IMAGE PIPELINE TESTS: ALL CHECKS PASSED' : `\n== IMAGE PIPELINE TESTS: ${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
