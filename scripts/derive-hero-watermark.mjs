/**
 * One-off asset derivation, kept for provenance. Run: node scripts/derive-hero-watermark.mjs
 *
 * The registered logo (public/brand/house-for-rent-logo.png) ships as an
 * opaque white-matte PNG — correct on the about page's card, but a hard
 * white rectangle if it ever sits on the hero panel's brand ink. This
 * script derives the watermark the hero panel needs and writes it as
 * house-for-rent-logo-reverse.png. The original artwork is never modified;
 * the about page keeps using it.
 *
 * Two steps, both lossless in shape:
 * 1. Alpha un-matting (observed = a*ink + (1-a)*white, solved for the most
 *    saturated ink each pixel can imply) — NOT a hard threshold, so
 *    anti-aliased edges and the artwork's soft drop shadows survive as
 *    partial alpha instead of leaving halos on dark ground.
 * 2. One-colour reversal: every surviving pixel takes the panel's light
 *    ink. The artwork's own black body would be invisible on the dark
 *    panel (dark on dark), which is exactly why printed brands carry a
 *    reversed one-colour version for dark grounds — this is that version,
 *    derived from the real artwork's geometry rather than redrawn.
 */
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const src = path.join(root, 'public/brand/house-for-rent-logo.png');
const out = path.join(root, 'public/brand/house-for-rent-logo-reverse.png');

// The panel's own light ink (globals.css .hero-panel color), so the
// watermark is lit by the same light as the copy it sits behind.
const LIGHT_INK = [244, 247, 246]; // #f4f7f6

const { width, height } = await sharp(src).metadata();
const raw = await sharp(src).ensureAlpha().raw().toBuffer();

for (let i = 0; i < raw.length; i += 4) {
  const min = Math.min(raw[i], raw[i + 1], raw[i + 2]);
  const alpha = 255 - min; // pure white matte -> 0; artwork -> 255; edges/shadows -> partial
  raw[i] = LIGHT_INK[0];
  raw[i + 1] = LIGHT_INK[1];
  raw[i + 2] = LIGHT_INK[2];
  raw[i + 3] = alpha;
}

await sharp(raw, { raw: { width, height, channels: 4 } })
  .png({ compressionLevel: 9 })
  .toFile(out);

console.log(`wrote ${out} (${width}x${height}, one-colour reverse stamp)`);
