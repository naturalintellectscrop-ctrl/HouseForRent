/**
 * Generates the placeholder artwork seeded listings carry.
 *
 * ── Why generated geometry and not a photograph ──
 * The repository already had nine stock architectural renders committed for
 * the mobile welcome screen, with a README admitting what they are: a
 * Californian infinity-pool villa, a glass office tower, an A-frame in a
 * pine forest. Putting those on a property card would assert that someone
 * from this platform stood in that room, which is the single claim the
 * business sells and the one thing a demonstration must not fake.
 *
 * So fixtures are unmistakably drawings. Flat geometry in the brand
 * palette: nobody looks at one and thinks they are seeing a house in
 * Ntinda, the grid still has visual rhythm, and the moment a field officer
 * uploads a real capture it replaces this and the card looks better for it.
 *
 * PNG is written by hand — zlib is in the standard library and an image
 * dependency for eleven rectangles would be weight for nothing.
 */
import { deflateSync } from 'node:zlib';
import { createHash } from 'node:crypto';

const W = 1200;
const H = 800;

/** Deterministic per seed, so re-running the seeder produces identical bytes. */
function rng(seed) {
  let h = createHash('sha256').update(String(seed)).digest();
  let i = 0;
  return () => {
    if (i >= h.length - 4) {
      h = createHash('sha256').update(h).digest();
      i = 0;
    }
    const v = h.readUInt32BE(i);
    i += 4;
    return v / 0xffffffff;
  };
}

/**
 * Five schemes drawn off the brand board — the near-black ink, the green,
 * the amber, the off-white. Muted deliberately: a placeholder that shouts
 * competes with the real photograph beside it.
 */
const SCHEMES = [
  // dusk over the ink page — the product's own surface
  { sky: [0x0e, 0x14, 0x12], glow: [0x2c, 0x46, 0x3a], far: [0x1a, 0x27, 0x22], near: [0x2c, 0x3c, 0x35], accent: [0x16, 0xa3, 0x4a], ground: [0x0b, 0x0f, 0x0e] },
  // late afternoon, amber
  { sky: [0x1a, 0x18, 0x1d], glow: [0x6b, 0x4a, 0x2a], far: [0x2b, 0x25, 0x25], near: [0x44, 0x39, 0x33], accent: [0xf5, 0x9e, 0x0b], ground: [0x14, 0x11, 0x10] },
  // overcast morning — the light counterpart
  { sky: [0xdd, 0xe4, 0xe8], glow: [0xf4, 0xf7, 0xf9], far: [0xa9, 0xb7, 0xbf], near: [0x7d, 0x8e, 0x98], accent: [0x15, 0x80, 0x3d], ground: [0x5f, 0x6e, 0x77] },
  // blue hour
  { sky: [0x10, 0x18, 0x22], glow: [0x2a, 0x40, 0x5c], far: [0x1c, 0x28, 0x36], near: [0x2f, 0x3f, 0x50], accent: [0x16, 0xa3, 0x4a], ground: [0x0c, 0x11, 0x18] },
  // warm daylight, the greenest of the set
  { sky: [0xc9, 0xd8, 0xd2], glow: [0xe9, 0xf1, 0xec], far: [0x8f, 0xa5, 0x9c], near: [0x63, 0x7b, 0x71], accent: [0x15, 0x80, 0x3d], ground: [0x4a, 0x5c, 0x54] },
];

function mix(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

/** Draws the scene into a flat RGB buffer. */
function render(seed) {
  const rand = rng(seed);
  const scheme = SCHEMES[Math.floor(rand() * SCHEMES.length)];
  const px = Buffer.alloc(W * H * 3);

  const put = (x, y, rgb) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const o = (y * W + x) * 3;
    px[o] = rgb[0];
    px[o + 1] = rgb[1];
    px[o + 2] = rgb[2];
  };

  // The horizon sits low in the frame: the sky is where the light is, and
  // a placeholder with half its area in featureless ground reads as broken.
  const horizon = Math.round(H * (0.78 + rand() * 0.06));

  // Sky: a wash that brightens sharply toward the horizon, the way it does
  // an hour before dark. The exponent keeps the glow low rather than
  // spreading it into a gradient across the whole frame.
  for (let y = 0; y < horizon; y++) {
    const t = (y / horizon) ** 3;
    for (let x = 0; x < W; x++) put(x, y, mix(scheme.sky, scheme.glow, t * 0.9));
  }
  // Ground, one flat step darker than everything above it.
  for (let y = horizon; y < H; y++) {
    for (let x = 0; x < W; x++) put(x, y, scheme.ground);
  }

  // A low ridge behind everything — Kampala is built across hills, and the
  // silhouette is what makes these read as a place rather than a chart.
  const phase = rand() * 10;
  for (let x = 0; x < W; x++) {
    const t = x / W;
    const ridge =
      Math.sin(t * 4.1 + phase) * H * 0.05 +
      Math.sin(t * 9.3 + phase * 2) * H * 0.022;
    const top = Math.round(horizon - H * 0.13 + ridge);
    for (let y = Math.max(0, top); y < horizon; y++) {
      put(x, y, mix(scheme.far, scheme.sky, 0.5));
    }
  }

  // Building masses. Simple rectangles of two depths, one accent opening.
  const blocks = 4 + Math.floor(rand() * 4);
  const accentBlock = Math.floor(rand() * blocks);

  for (let b = 0; b < blocks; b++) {
    const far = rand() < 0.4;
    const bw = Math.round(W * (0.09 + rand() * 0.15));
    const bx = Math.round(rand() * (W - bw));
    const bh = Math.round(H * ((far ? 0.16 : 0.28) + rand() * 0.3));
    const by = horizon - bh;
    const body = far ? scheme.far : scheme.near;

    for (let y = by; y < horizon; y++) {
      for (let x = bx; x < bx + bw; x++) {
        // A faint left-to-right fall-off gives each mass a lit face.
        put(x, y, mix(body, scheme.glow, ((x - bx) / bw) * 0.14));
      }
    }

    // Windows: a regular grid, because a building reads as a building
    // through repetition more than through detail.
    if (!far) {
      const cols = Math.max(2, Math.round(bw / 46));
      const rows = Math.max(2, Math.round(bh / 54));
      const cw = Math.round((bw * 0.62) / cols);
      const ch = Math.round((bh * 0.5) / rows);
      const padX = Math.round((bw - cols * cw) / (cols + 1));
      const padY = Math.round((bh - rows * ch) / (rows + 1));
      const lit = b === accentBlock;

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const wx = bx + padX + c * (cw + padX);
          const wy = by + padY + r * (ch + padY);
          // Sparse on purpose. A facade where half the windows are lit
          // reads as a data chart; a few reads as evening.
          const on = lit ? rand() < 0.22 : rand() < 0.07;
          const rgb = on
            ? mix(scheme.accent, scheme.glow, 0.2)
            : mix(body, scheme.ground, 0.55);
          for (let y = wy; y < wy + ch; y++) {
            for (let x = wx; x < wx + cw; x++) put(x, y, rgb);
          }
        }
      }
    }
  }

  // One deliberate line at the horizon, in the accent. It is the single
  // mark that says a person chose this frame — without it the composition
  // is just shapes that happen to be stacked.
  for (let x = 0; x < W; x++) {
    for (let y = horizon; y < horizon + 3; y++) {
      put(x, y, mix(scheme.accent, scheme.ground, 0.3));
    }
  }

  return px;
}

/** Minimal PNG writer: IHDR, IDAT, IEND. Filter type 0 on every row. */
function toPng(rgb) {
  const raw = Buffer.alloc((W * 3 + 1) * H);
  for (let y = 0; y < H; y++) {
    raw[y * (W * 3 + 1)] = 0;
    rgb.copy(raw, y * (W * 3 + 1) + 1, y * W * 3, (y + 1) * W * 3);
  }

  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

let CRC_TABLE = null;
function crc32(buf) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c;
    }
  }
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return c ^ -1;
}

/** A fixture image for `seed`, as PNG bytes. */
export function fixtureImage(seed) {
  return toPng(render(seed));
}
