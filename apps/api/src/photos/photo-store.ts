import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * Where listing photographs actually live.
 *
 * ── Why this is not the FOO capture ladder ──
 * `MediaService` implements a three-rung compression ladder for field
 * capture over a 2G connection (NFR-5), and its post-condition genuinely
 * checks that the provider honoured each ceiling. Routing browser uploads
 * through it would require a server-side image encoder to produce those
 * rungs; without one, the only way to satisfy the check would be to weaken
 * it, and that check is the low-bandwidth guarantee.
 *
 * So browser photography takes a different, honest path: the client
 * downscales before upload (presentation work, not a business rule), the
 * server enforces a hard ceiling at the boundary, and the bytes are stored
 * once at the size that arrived. The ladder is left intact for the field
 * app it was built for.
 *
 * ── Why the filesystem ──
 * `MEDIA_ROOT` is a directory, defaulting to `var/media` beside the API.
 * An object store is the production answer and the seam for it is this
 * class alone — nothing above it knows where a byte lives. Content is
 * addressed by SHA-256, so re-uploading the same photograph costs nothing
 * and a corrupted transfer cannot masquerade as a good one.
 */
@Injectable()
export class PhotoStore {
  private readonly logger = new Logger(PhotoStore.name);
  private readonly root = resolve(
    process.env.MEDIA_ROOT ?? join(process.cwd(), 'var', 'media'),
  );

  /** The MIME types a browser may upload. Deliberately narrow. */
  static readonly ACCEPTED = ['image/jpeg', 'image/png', 'image/webp'] as const;

  /**
   * The hard ceiling, enforced server-side.
   *
   * 1.5MB is roughly a 1600px JPEG at good quality — enough for a full-width
   * hero on a laptop, small enough that a tenant on a phone connection is
   * not made to pay for a photographer's raw export. A client that has not
   * downscaled is refused at the boundary rather than silently accepted and
   * served to someone paying by the megabyte.
   */
  static readonly MAX_BYTES = 1_500_000;

  private extensionFor(mimeType: string): string {
    if (mimeType === 'image/png') return 'png';
    if (mimeType === 'image/webp') return 'webp';
    return 'jpg';
  }

  /**
   * Writes bytes and returns the storage ref.
   *
   * The ref is `file:<sha256>.<ext>` — a value this class can resolve and
   * nothing else needs to interpret. It is NOT a URL: the API serves photos
   * through its own route so that a future move to an object store, or a
   * decision to gate a photo, does not break every link already shared.
   */
  async put(params: {
    bytes: Buffer;
    mimeType: string;
  }): Promise<{ storageRef: string; byteSize: number }> {
    const digest = createHash('sha256').update(params.bytes).digest('hex');
    const name = `${digest}.${this.extensionFor(params.mimeType)}`;

    await mkdir(this.root, { recursive: true });
    const path = join(this.root, name);

    // Content-addressed: identical bytes are already the same file, so a
    // re-upload is a no-op rather than a duplicate.
    if (!existsSync(path)) {
      await writeFile(path, params.bytes);
    }

    return { storageRef: `file:${name}`, byteSize: params.bytes.byteLength };
  }

  /**
   * Reads bytes back. Returns null for a ref this store did not write —
   * `mock://` refs from the V1 capture path have no file behind them, and
   * the caller renders an honest empty frame rather than a broken image.
   */
  async get(storageRef: string): Promise<Buffer | null> {
    if (!storageRef.startsWith('file:')) return null;

    const name = storageRef.slice('file:'.length);
    // The ref comes from our own database, but path traversal is cheap to
    // rule out and expensive to discover later.
    if (name.includes('/') || name.includes('\\') || name.includes('..')) {
      this.logger.warn(`refusing suspicious storage ref: ${storageRef}`);
      return null;
    }

    const path = join(this.root, name);
    if (!existsSync(path)) return null;
    return readFile(path);
  }
}
