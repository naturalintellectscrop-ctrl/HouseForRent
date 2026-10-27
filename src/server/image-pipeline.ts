/**
 * Image pipeline — content-validated upload bytes become private originals
 * plus three optimized, metadata-free WebP renditions.
 *
 * ── Why process at upload time ──
 * The request is the only moment the ORIGINAL bytes are in hand. Deriving
 * the variants here means the serving route never decodes anything, never
 * trusts a client-declared size, and a listing page pays the bandwidth of a
 * ~40–200 KB rendition instead of a multi-megabyte camera original.
 *
 * ── Security properties ──
 * 1. Input was already magic-byte-sniffed by the caller (JPEG/PNG/WebP);
 *    this module re-checks by letting sharp DECODE the bytes — a file that
 *    cannot decode never becomes an asset (corrupt-file rejection).
 * 2. Pixel-bomb guard: dimensions come from the decoder, not the client.
 *    Images above MAX_SIDE on either edge or above MAX_PIXELS total are
 *    refused BEFORE any re-encode work.
 * 3. EXIF is applied, not copied: `.rotate()` bakes the orientation into
 *    the pixels; no `.withMetadata()` call means the re-encoded outputs
 *    carry NO EXIF, no GPS location, no camera serial — nothing. The
 *    original (with its metadata) stays in the PRIVATE bucket, served to
 *    nobody through the media route.
 * 4. Output is always image/webp — a format the bucket allowlist accepts
 *    and browsers render everywhere that matters (Uganda's mobile web is
 *    Chromium-dominated; Safari 14+ renders WebP).
 *
 * ── Measured targets (docs/IMAGE_PIPELINE_REPORT.md carries the numbers) ──
 * thumb  ≤400px, card ≤800px, detail ≤1600px — longest edge, never enlarged.
 */
import sharp from 'sharp';
import { ApiError } from './http';

/** Longest edge limits per variant (px). Within the brief:
 * thumbnail 320–400, card 640–800, detail 1280–1600. */
export const VARIANT_SPECS = {
  thumb: { maxEdge: 360, quality: 78 },
  card: { maxEdge: 760, quality: 80 },
  detail: { maxEdge: 1520, quality: 82 },
} as const;

export type VariantName = keyof typeof VARIANT_SPECS;

/** Decompression-bomb guard. A 50 MP image decodes to ~150 MB of RGBA —
 * over a typical serverless function's working set; refuse before decode
 * work, using DECODER-reported dimensions. */
const MAX_PIXELS = 50_000_000;
/** Any single edge over 8000 px is scanner/stitcher territory, not a phone
 * photograph; refuse before decode. */
const MAX_SIDE = 8000;

export interface ProcessedVariant {
  variant: VariantName;
  bytes: Buffer;
  width: number;
  height: number;
  byteSize: number;
  mimeType: 'image/webp';
}

export interface ProcessedImage {
  /** Decoder-verified original dimensions (pre-orientation pixels as
   * reported; the variants carry the post-orientation truth). */
  width: number;
  height: number;
  variants: ProcessedVariant[];
  /** Wall-clock processing milliseconds, for the pipeline report. */
  processingMs: number;
}

/**
 * Decodes, guards, auto-orients, strips metadata and re-encodes the three
 * renditions. Throws ApiError 415 MEDIA_CORRUPT / 413 MEDIA_DIMENSIONS on
 * refusal — the upload routes map these onto their own error surfaces.
 */
export async function processImage(bytes: Uint8Array): Promise<ProcessedImage> {
  const started = Date.now();
  const input = Buffer.from(bytes);

  // Dimension guard from the DECODER (cheap metadata read, no full decode).
  let meta: sharp.Metadata;
  try {
    meta = await sharp(input, { failOn: 'error' }).metadata();
  } catch {
    throw new ApiError(415, 'MEDIA_CORRUPT', 'the image could not be decoded');
  }
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (!width || !height) {
    throw new ApiError(415, 'MEDIA_CORRUPT', 'the image has no readable dimensions');
  }
  if (Math.max(width, height) > MAX_SIDE || width * height > MAX_PIXELS) {
    throw new ApiError(
      413,
      'MEDIA_DIMENSIONS',
      `images above ${MAX_SIDE}px per side or ${Math.round(MAX_PIXELS / 1_000_000)} megapixels are not accepted`,
    );
  }

  // rotate(): bakes EXIF orientation into pixels. No withMetadata(): the
  // outputs carry no EXIF/GPS/ICC baggage — the orientation IS the pixels.
  const oriented = sharp(input, { failOn: 'error' }).rotate();
  const orientedMeta = await oriented.metadata(); // post-rotate dimensions
  const variants: ProcessedVariant[] = [];

  for (const [name, spec] of Object.entries(VARIANT_SPECS) as [VariantName, (typeof VARIANT_SPECS)[VariantName]][]) {
    let out: Buffer;
    let outMeta: sharp.OutputInfo;
    try {
      const pipeline = sharp(input, { failOn: 'error' })
        .rotate()
        .resize({
          width: spec.maxEdge,
          height: spec.maxEdge,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp({ quality: spec.quality, effort: 4 });
      out = await pipeline.toBuffer({ resolveWithObject: true }).then((r) => {
        outMeta = r.info;
        return r.data;
      });
    } catch {
      throw new ApiError(415, 'MEDIA_CORRUPT', `the image could not be processed (${name})`);
    }
    variants.push({
      variant: name,
      bytes: out,
      width: outMeta!.width,
      height: outMeta!.height,
      byteSize: out.length,
      mimeType: 'image/webp',
    });
  }
  void orientedMeta;

  return { width, height, variants, processingMs: Date.now() - started };
}
