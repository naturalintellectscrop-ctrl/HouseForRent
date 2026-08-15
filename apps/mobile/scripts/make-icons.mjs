// Crops the HOUSE MARK out of the full logo and emits the app-icon sizes.
//
// The full lockup (house + HOUSE/FOR/RENT wordmark + tagline) is unreadable
// at 48dp on a launcher — the type collapses into grey mush. An app icon
// wants the symbol alone, which is exactly what the house-with-roof is.
//
// So this finds the mark's bounding box by scanning ONLY the region above
// the wordmark, rather than hardcoding pixel offsets that would silently
// produce a wrong crop if the source art were ever replaced.
import fs from 'node:fs';
import zlib from 'node:zlib';

const SRC = '_legacy/public/House For Rent App Logo.png';

/* ── decode ────────────────────────────────────────────────────────── */
const src = fs.readFileSync(SRC);
let pos = 8,
  w = 0,
  h = 0,
  bd = 0,
  ct = 0;
const idat = [];
while (pos < src.length) {
  const len = src.readUInt32BE(pos);
  const type = src.toString('ascii', pos + 4, pos + 8);
  const d = src.subarray(pos + 8, pos + 8 + len);
  if (type === 'IHDR') {
    w = d.readUInt32BE(0);
    h = d.readUInt32BE(4);
    bd = d[8];
    ct = d[9];
  }
  if (type === 'IDAT') idat.push(d);
  if (type === 'IEND') break;
  pos += 12 + len;
}
const ch = { 0: 1, 2: 3, 4: 2, 6: 4 }[ct];
const bpp = ch * (bd / 8);
const stride = w * bpp;
const raw = zlib.inflateSync(Buffer.concat(idat));
const px = Buffer.alloc(h * stride);
let rp = 0;
for (let y = 0; y < h; y++) {
  const f = raw[rp++];
  const line = raw.subarray(rp, rp + stride);
  rp += stride;
  for (let x = 0; x < stride; x++) {
    const a = x >= bpp ? px[y * stride + x - bpp] : 0;
    const b = y > 0 ? px[(y - 1) * stride + x] : 0;
    const c = x >= bpp && y > 0 ? px[(y - 1) * stride + x - bpp] : 0;
    let v = line[x];
    if (f === 1) v += a;
    else if (f === 2) v += b;
    else if (f === 3) v += (a + b) >> 1;
    else if (f === 4) {
      const p = a + b - c,
        pa = Math.abs(p - a),
        pb = Math.abs(p - b),
        pc = Math.abs(p - c);
      v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
    }
    px[y * stride + x] = v & 255;
  }
}
const at = (x, y) => {
  const i = y * stride + x * bpp;
  return [px[i], px[i + 1], px[i + 2]];
};
const ink = (x, y) => {
  const [r, g, b] = at(x, y);
  return !(r > 240 && g > 240 && b > 240);
};

/* ── find the wordmark's top, then take everything above it ────────── */
// The green ground-line under the house is the last element of the mark.
// Below it there is a clear white gutter, then "HOUSE". Finding the widest
// run of blank rows in the middle of the image locates that gutter without
// assuming any fixed coordinate.
const rowHasInk = [];
for (let y = 0; y < h; y++) {
  let n = 0;
  for (let x = 0; x < w; x++) if (ink(x, y)) n++;
  rowHasInk.push(n);
}

let firstInk = rowHasInk.findIndex((n) => n > 0);
let bestGapStart = -1,
  bestGapLen = 0,
  curStart = -1;
for (let y = firstInk; y < h; y++) {
  if (rowHasInk[y] === 0) {
    if (curStart < 0) curStart = y;
  } else if (curStart >= 0) {
    const len = y - curStart;
    // Only consider gaps in the upper 60% — below that are the gaps
    // between the wordmark's own lines.
    if (len > bestGapLen && curStart < h * 0.6) {
      bestGapLen = len;
      bestGapStart = curStart;
    }
    curStart = -1;
  }
}

const markBottom = bestGapStart > 0 ? bestGapStart : Math.floor(h * 0.5);

let x0 = w,
  x1 = 0,
  y0 = h,
  y1 = 0;
for (let y = 0; y < markBottom; y++) {
  for (let x = 0; x < w; x++) {
    if (!ink(x, y)) continue;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
}
console.log(
  `source ${w}x${h}  wordmark gutter at y=${markBottom}  mark box ${x1 - x0 + 1}x${y1 - y0 + 1} at ${x0},${y0}`,
);

/* ── encode ────────────────────────────────────────────────────────── */
const crcTable = [];
for (let n = 0; n < 256; n++) {
  let k = n;
  for (let j = 0; j < 8; j++) k = k & 1 ? 0xedb88320 ^ (k >>> 1) : k >>> 1;
  crcTable[n] = k >>> 0;
}
function chunk(type, data) {
  const c = Buffer.alloc(8 + data.length + 4);
  c.writeUInt32BE(data.length, 0);
  c.write(type, 4, 'ascii');
  data.copy(c, 8);
  let crc = 0xffffffff;
  for (const byte of c.subarray(4, 8 + data.length))
    crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  c.writeUInt32BE((crc ^ 0xffffffff) >>> 0, 8 + data.length);
  return c;
}

/**
 * @param size    output edge, px
 * @param file    destination
 * @param opts.transparent  cut the white ground out
 * @param opts.pad          fraction of the canvas left as margin. Adaptive
 *                          icons crop to a circle on many launchers, so the
 *                          mark needs breathing room or the roof clips.
 */
function emit(size, file, { transparent = true, pad = 0 } = {}) {
  const cw = x1 - x0 + 1,
    chh = y1 - y0 + 1;
  const inner = Math.round(size * (1 - pad * 2));

  /**
   * Fit by whichever edge runs out first.
   *
   * The house mark is 798×476 — roughly 1.68:1 — so in a square icon the
   * width is always the constraint and some vertical space is unavoidable.
   * That is a property of the artwork, not something to fix by stretching
   * it. The lever that actually matters is `pad`: less padding means the
   * mark spans more of the canvas.
   */
  const scale = Math.max(cw / inner, chh / inner);
  const offX = Math.round((size - cw / scale) / 2);
  const offY = Math.round((size - chh / scale) / 2);

  const oc = 4,
    os = size * oc;
  const buf = Buffer.alloc(size * os);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const o = y * os + x * oc;
      const sx = x0 + Math.floor((x - offX) * scale);
      const sy = y0 + Math.floor((y - offY) * scale);

      // Box-average the source region. Nearest-neighbour turns the thin red
      // roof stripe into a dotted line at icon sizes.
      let r = 0,
        g = 0,
        b = 0,
        n = 0;
      const step = Math.max(1, Math.floor(scale));
      for (let dy = 0; dy < step; dy++) {
        for (let dx = 0; dx < step; dx++) {
          const px2 = sx + dx,
            py2 = sy + dy;
          // Clamp to the MARK's bounding box, not the whole image. Bounding
          // only by image size lets the padding area keep sampling downward
          // into the wordmark — which is exactly the bug that put "HOUSE"
          // and "FOR" back into a crop meant to exclude them.
          if (px2 < x0 || px2 > x1 || py2 < y0 || py2 > y1) continue;
          const [rr, gg, bb] = at(px2, py2);
          r += rr;
          g += gg;
          b += bb;
          n++;
        }
      }
      if (!n) {
        buf[o] = 255;
        buf[o + 1] = 255;
        buf[o + 2] = 255;
        buf[o + 3] = transparent ? 0 : 255;
        continue;
      }
      r = Math.round(r / n);
      g = Math.round(g / n);
      b = Math.round(b / n);
      buf[o] = r;
      buf[o + 1] = g;
      buf[o + 2] = b;
      buf[o + 3] = transparent && r > 245 && g > 245 && b > 245 ? 0 : 255;
    }
  }

  const rows = Buffer.alloc(size * (os + 1));
  for (let y = 0; y < size; y++) {
    rows[y * (os + 1)] = 0;
    buf.copy(rows, y * (os + 1) + 1, y * os, (y + 1) * os);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  fs.writeFileSync(
    file,
    Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk('IHDR', ihdr),
      chunk('IDAT', zlib.deflateSync(rows, { level: 9 })),
      chunk('IEND', Buffer.alloc(0)),
    ]),
  );
  console.log(
    `  ${file}  ${size}x${size}  ${(fs.statSync(file).size / 1024).toFixed(1)}KB`,
  );
}

// The launcher icon. Opaque white ground so the black house outline reads
// on any wallpaper.
emit(1024, 'apps/mobile/assets/icon.png', { transparent: false, pad: 0.10 });

// Adaptive foreground: transparent, and padded hard — Android crops this to
// a circle/squircle on most launchers, and the roof is the first thing lost.
emit(432, 'apps/mobile/assets/android-icon-foreground.png', { pad: 0.20 });

// Monochrome (themed icons, Android 13+): same geometry as the foreground.
emit(432, 'apps/mobile/assets/android-icon-monochrome.png', { pad: 0.20 });

emit(256, 'apps/mobile/assets/splash-icon.png', { pad: 0.08 });
emit(64, 'apps/console/public/favicon.png', { transparent: false, pad: 0.05 });
