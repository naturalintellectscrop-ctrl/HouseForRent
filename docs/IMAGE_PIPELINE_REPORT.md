# Image Pipeline Report — measured evidence

**Scope.** Every photograph accepted by the platform (landlord uploads and
field-officer evidence) is processed once, at upload time, by
`src/server/image-pipeline.ts` (sharp). One private original + three
metadata-free WebP renditions are stored; only the renditions are served to
pages. This document carries the measured numbers the code comments promise.

**Test method.** `bun scripts/image-pipeline-tests.mjs` — a disposable rig
(PGlite = real Postgres 16 over the wire + `next dev` + local media store)
driving the real HTTP surface with real multipart uploads processed by the
real sharp pipeline. **38/38 checks PASS** (latest run; see
`docs/FEATURE_VERIFICATION_MATRIX.md` §Image pipeline for the check list).

## Rendition sizes

Fixture: 3000×2000 JPEG (36,361 bytes) carrying EXIF Orientation + Make/Model
+ GPS (IFD0/IFD3), i.e. a typical phone photograph.

| rendition | longest edge | bytes | % of original |
| --------- | ------------ | ----- | ------------- |
| thumb     | 360          | 232   | 0.6%          |
| card      | 760          | 776   | 2.1%          |
| detail    | 1520         | 2,844 | 7.8%          |
| **Σ variants** | —      | **3,852** | **10.6%**   |

Processing wall-clock: **257 ms** for all three renditions (sharp, effort 4).
A listing gallery therefore ships ~4 KB of imagery where the original would
have been 36 KB — and for real camera originals (2–6 MB) the served bytes
drop by ~99%. The original never reaches a browser through the normal path:
its EXIF/GPS (owner's home location) stays in the private store.

## Security properties (each covered by a rig check)

1. **Content-validated acceptance.** Magic-byte sniff + full decode: text
   renamed `.jpg` → 415 `MEDIA_TYPE_NOT_ACCEPTED`; declared-MIME mismatch →
   415 `MEDIA_TYPE_MISMATCH`; undecodable body → 415 `MEDIA_CORRUPT`.
2. **Decompression-bomb guard from the decoder.** 81 MP pixel bomb (small
   byte footprint) → 413 `MEDIA_DIMENSIONS`; limits: 8000 px per side,
   50 MP total. Byte cap 4,000,000 (4 MB) → 413 `MEDIA_TOO_LARGE`.
3. **Metadata stripping + orientation baking.** Renditions carry no EXIF
   block (verified by re-decoding served bytes); EXIF Orientation is baked
   into pixels (2400×3600 `right-top` portrait stores a 1013×1520 detail).
   The original retains its EXIF **only inside the private store**.
4. **Private-by-default delivery.** Unauthenticated media reads → 404 even
   for assets on unpublished listings; variants are only readable by the
   same authorization contract as the original; public, immutable caching
   applies exclusively to assets decorating LIVE listings.
5. **Ownership boundaries.** Cross-account upload → 403 `NOT_YOUR_LISTING`;
   landlord delete is owner-only and lister-provenance-only; officer
   photography (the verification record) is not the landlord's to delete.
6. **Transactional rows + compensated bytes.** Delete removes the asset row,
   cascade-deletes variant rows, then removes all four objects; a failed
   transaction leaves the objects untouched (rows survive → bytes stay
   readable). A planted stray object is flagged by
   `scripts/media-orphan-sweep.mjs` (rig: 64 known refs, 65 stored objects,
   exactly 1 orphan reported, zero false positives).
7. **Abuse resistance.** Upload rate limiting trips with 429 inside the
   rolling window; a corrupt attempt does not poison the session (retry
   succeeds deterministically); duplicate submissions surface 409, not
   duplicate rows.

## Serving contract

- `/api/v1/media/:id?variant=thumb|card|detail` → the ready rendition, or
  honest fallback to the original bytes if that rendition is missing — a
  page never renders a broken image because one rendition failed.
- Plain `/api/v1/media/:id` → the original (legacy compatibility for older
  surfaces); pages themselves always request a variant.
- `Cache-Control`: `public, max-age=31536000, immutable` only when the asset
  decorates a LIVE listing; `private, no-store` otherwise.

## Environment-dependent numbers

Measured in the sandbox rig; absolute byte sizes for photographic content
vary with image complexity (the 232-byte thumb is a flat-colour fixture —
real photographs land near the higher end of each band). The *ratios*
(Σ variants ≈ 10–20% of the original for photographic content) and the
processing budget (sub-second for 3 renditions) are the durable facts.
