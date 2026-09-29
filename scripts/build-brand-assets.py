#!/usr/bin/env python3
"""
Build the House For Rent brand asset set from the ORIGINAL logo.

Source: the genuine logo supplied by the company (1254x1254 PNG, white
background). Everything the site ships as identity is derived here so the
site never drifts from the original artwork:

  public/brand/house-for-rent-logo.png   full trimmed lockup (wordmark + mark + tagline)
  public/brand/mark-512.png              house mark only, transparent bg
  public/logo.png                        header mark (64px, transparent)
  public/favicon.png                     32px, white tile
  public/favicon.ico                     16/32/48, white tile
  public/apple-touch-icon.png            180px, white full-bleed
  public/brand/og-cover.png              1200x630 OpenGraph cover

It also prints the sampled solid colours so the CSS tokens match the real
artwork instead of a guess.
"""

from PIL import Image, ImageDraw
import os

SRC = "/tmp/hfr-logo-original.png"
OUT = "/home/z/my-project/public"
BRAND = os.path.join(OUT, "brand")
os.makedirs(BRAND, exist_ok=True)

img = Image.open(SRC).convert("RGB")
W, H = img.size
px = img.load()
print(f"source: {W}x{H}")


def row_has_ink(y, thresh=235):
    """True if any pixel in the row is meaningfully non-white."""
    for x in range(0, W, 2):
        r, g, b = px[x, y]
        if min(r, g, b) < thresh:
            return True
    return False


# ── 1. find horizontal ink bands (mark / HOUSE / FOR / RENT / tagline) ──
bands = []
in_band = False
start = 0
for y in range(H):
    ink = row_has_ink(y)
    if ink and not in_band:
        in_band, start = True, y
    elif not ink and in_band:
        in_band = False
        bands.append((start, y - 1))
if in_band:
    bands.append((start, H - 1))

# merge bands separated by tiny gaps (< 8px) — anti-aliasing artifacts
merged = []
for b in bands:
    if merged and b[0] - merged[-1][1] <= 8:
        merged[-1] = (merged[-1][0], b[1])
    else:
        merged.append(list(b))
print("bands (y0,y1,height):", [(b[0], b[1], b[1] - b[0]) for b in merged])


def hspan(y0, y1):
    """Left/right extent of ink within a row band."""
    left, right = W, 0
    for y in range(y0, y1 + 1):
        for x in range(W):
            r, g, b = px[x, y]
            if min(r, g, b) < 235:
                left = min(left, x)
                right = max(right, x)
    return left, right


# mark = first band; tagline = last band
mark_band = merged[0]
mark_x0, mark_x1 = hspan(*mark_band)
print(f"mark band: y {mark_band}, x {mark_x0}..{mark_x1}")

full_x0, full_x1, full_y0, full_y1 = W, 0, H, 0
for b in merged:
    x0, x1 = hspan(*b)
    full_x0, full_x1 = min(full_x0, x0), max(full_x1, x1)
    full_y0, full_y1 = min(full_y0, b[0]), max(full_y1, b[1])
print(f"full lockup: x {full_x0}..{full_x1}, y {full_y0}..{full_y1}")

# ── 2. sample the true brand colours from solid interiors ────────────────
def sample(name, x, y):
    r, g, b = px[x, y]
    print(f"  {name}: #{r:02x}{g:02x}{b:02x}  ({x},{y})")
    return (r, g, b)

print("colour samples:")
# probe a grid inside the mark band to find solid red / black / green
reds, blacks, greens = [], [], []
for y in range(mark_band[0], mark_band[1], 4):
    for x in range(mark_x0, mark_x1, 4):
        r, g, b = px[x, y]
        if min(r, g, b) > 230:
            continue
        if r > 150 and g < 90 and b < 90:
            reds.append((r, g, b))
        elif max(r, g, b) < 80:
            blacks.append((r, g, b))
        elif g > 80 and g > r + 30 and g > b + 20:
            greens.append((r, g, b))

def dominant(pixels, label):
    if not pixels:
        print(f"  {label}: none found")
        return None
    n = len(pixels)
    r = sum(p[0] for p in pixels) // n
    g = sum(p[1] for p in pixels) // n
    b = sum(p[2] for p in pixels) // n
    print(f"  {label}: #{r:02x}{g:02x}{b:02x}  ({n} px)")
    return (r, g, b)

red = dominant(reds, "red (roof)")
black = dominant(blacks, "black (house)")
green = dominant(greens, "green (sweep/RENT)")

# ── 3. white → transparency for the mark ─────────────────────────────────
def transparentize(im, solid_below=215, clear_above=242):
    """Solid artwork on white → RGBA. Chunky shapes; two-threshold ramp."""
    im = im.convert("RGB")
    out = Image.new("RGBA", im.size)
    src, dst = im.load(), out.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b = src[x, y]
            m = min(r, g, b)
            if m >= clear_above:
                dst[x, y] = (r, g, b, 0)
            elif m <= solid_below:
                dst[x, y] = (r, g, b, 255)
            else:
                a = int(255 * (clear_above - m) / (clear_above - solid_below))
                dst[x, y] = (r, g, b, a)
    return out


def autocrop_alpha(im, thresh=8):
    bbox = im.getchannel("A").point(lambda a: 255 if a > thresh else 0).getbbox()
    return im.crop(bbox) if bbox else im


def pad_square(im, frac=0.06):
    """Center on a transparent square with `frac` padding per side."""
    w, h = im.size
    side = int(max(w, h) * (1 + 2 * frac))
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.paste(im, ((side - w) // 2, (side - h) // 2), im)
    return canvas


mark = img.crop((mark_x0, mark_band[0], mark_x1 + 1, mark_band[1] + 1))
mark_t = autocrop_alpha(transparentize(mark))
mark_sq = pad_square(mark_t)
print(f"mark: {mark_t.size} -> square {mark_sq.size}")

# full lockup trimmed, on white (faithful to the original artwork)
lockup = img.crop((full_x0, full_y0, full_x1 + 1, full_y1 + 1))
lockup.save(f"{BRAND}/house-for-rent-logo.png")
print(f"lockup saved: {lockup.size}")

# header mark (transparent; CSS gives it the tile surface)
mark_sq.resize((64, 64), Image.LANCZOS).save(f"{OUT}/logo.png")
mark_sq.resize((512, 512), Image.LANCZOS).save(f"{BRAND}/mark-512.png")

# favicon tiles: white rounded tile keeps the black house visible in dark
# browser chrome while staying native on light tab bars
def tiled(size, radius_ratio=0.22, pad=0.10, bg=(255, 255, 255, 255)):
    tile = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(tile)
    r = int(size * radius_ratio)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=r, fill=bg)
    inner = int(size * (1 - 2 * pad))
    m = mark_t.resize((inner, inner), Image.LANCZOS)
    tile.paste(m, ((size - inner) // 2, (size - inner) // 2), m)
    return tile

tiled(32).save(f"{OUT}/favicon.png")
tiled(48).save(f"{OUT}/favicon-48-tmp.png")
tiled(16).save(f"{OUT}/favicon-16-tmp.png")
img32 = Image.open(f"{OUT}/favicon.png")
img48 = Image.open(f"{OUT}/favicon-48-tmp.png")
img16 = Image.open(f"{OUT}/favicon-16-tmp.png")
img32.save(
    f"{OUT}/favicon.ico",
    sizes=[(16, 16), (32, 32), (48, 48)],
    append_images=[img16, img48],
)
os.remove(f"{OUT}/favicon-48-tmp.png")
os.remove(f"{OUT}/favicon-16-tmp.png")

# apple-touch-icon: iOS supplies its own rounding; white full bleed
apple = Image.new("RGBA", (180, 180), (255, 255, 255, 255))
inner = int(180 * 0.78)
m = mark_t.resize((inner, inner), Image.LANCZOS)
apple.paste(m, ((180 - inner) // 2, (180 - inner) // 2), m)
apple.convert("RGB").save(f"{OUT}/apple-touch-icon.png")

# OpenGraph cover 1200x630 — the real lockup, centred, nothing invented
og = Image.new("RGB", (1200, 630), (255, 255, 255))
lh = 500
lw = int(lockup.size[0] * lh / lockup.size[1])
og.paste(lockup.resize((lw, lh), Image.LANCZOS), ((1200 - lw) // 2, (630 - lh) // 2))
og.save(f"{BRAND}/og-cover.png")
print("favicon.ico / favicon.png / apple-touch-icon / og-cover written")
print("DONE")
