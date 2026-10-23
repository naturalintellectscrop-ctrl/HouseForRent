/**
 * The MediaStorageProvider seam (SSOT §8) — where bytes live.
 *
 * ── Why this exists ──
 * The V1 port stored media bytes on the server's own disk (DEPLOYMENT.md
 * §2.3). That was honest for the sandbox but is a lie on serverless hosting:
 * the Vercel filesystem is ephemeral and read-only outside /tmp, so a file
 * written with a request is gone by the next one. This module is the
 * transport seam the reference product reserved for the object store: the
 * rest of the system keeps naming assets by MediaAsset.storageRef and never
 * learns whether bytes came from disk or Supabase Storage.
 *
 * ── Selection (fail-closed) ──
 *   MEDIA_STORAGE=supabase  → Supabase Storage (private bucket). Requires
 *                             SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
 *   MEDIA_STORAGE=local     → the historical disk behavior (sandbox/dev).
 *   unset                   → supabase when its env is present, else local.
 * In production, local storage REFUSES uploads: bytes written to an
 * ephemeral disk would disappear and the listing would present photographs
 * the platform can no longer serve — exactly the "misleading published
 * state" this launch must not ship.
 *
 * ── Privacy ──
 * The Supabase bucket is PRIVATE and every read is proxied through
 * /api/v1/media/:id with server-side authorization (src/server/media.ts).
 * No public object URL is ever constructed, so a mandate evidence scan can
 * never become world-readable through a predictable URL. The service key
 * is server-side only and never reaches the browser bundle.
 */
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

export interface MediaStorageProvider {
  /** Persist bytes; throws MediaStoreUnavailableError / MediaStoreError on failure. */
  put(ref: string, bytes: Uint8Array, contentType: string): Promise<void>;
  /** Read bytes back; throws MediaNotFoundError / MediaStoreError on failure. */
  get(ref: string): Promise<Uint8Array>;
  /** Best-effort delete (compensation paths must not mask the original error). */
  delete(ref: string): Promise<void>;
}

export class MediaStoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MediaStoreError';
  }
}

export class MediaStoreUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MediaStoreUnavailableError';
  }
}

export class MediaNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MediaNotFoundError';
  }
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || !v.trim()) {
    throw new MediaStoreUnavailableError(`${name} is not configured`);
  }
  return v.trim();
}

// ── Supabase Storage (private bucket, service-role REST) ────────────────────

class SupabaseMediaStorage implements MediaStorageProvider {
  private readonly baseUrl: string;
  private readonly bucket: string;

  constructor(baseUrl: string, private readonly serviceKey: string, bucket: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.bucket = bucket;
  }

  private objectUrl(ref: string): string {
    // ref is server-generated (viewings/<uuid>/<uuid>.<ext>) — no user path
    // fragments reach this string unvalidated (see assertSafeStorageRef).
    return `${this.baseUrl}/storage/v1/object/${this.bucket}/${ref}`;
  }

  async put(ref: string, bytes: Uint8Array, contentType: string): Promise<void> {
    let res: Response;
    try {
      res = await fetch(this.objectUrl(ref), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.serviceKey}`,
          'Content-Type': contentType,
          // A retried upload must not fail on the first attempt having
          // half-landed; the row is the source of truth, the object is just
          // where the row points.
          'x-upsert': 'true',
        },
        body: Buffer.from(bytes),
      });
    } catch (err) {
      throw new MediaStoreError(`media store unreachable: ${String(err)}`);
    }
    if (!res.ok) {
      throw new MediaStoreError(`media store rejected upload (HTTP ${res.status})`);
    }
  }

  async get(ref: string): Promise<Uint8Array> {
    let res: Response;
    try {
      res = await fetch(this.objectUrl(ref), {
        method: 'GET',
        headers: { Authorization: `Bearer ${this.serviceKey}` },
        cache: 'no-store',
      });
    } catch (err) {
      throw new MediaStoreError(`media store unreachable: ${String(err)}`);
    }
    if (res.status === 404 || res.status === 400) {
      throw new MediaNotFoundError('media file missing from store');
    }
    if (!res.ok) {
      throw new MediaStoreError(`media store read failed (HTTP ${res.status})`);
    }
    return new Uint8Array(await res.arrayBuffer());
  }

  async delete(ref: string): Promise<void> {
    try {
      await fetch(this.objectUrl(ref), {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${this.serviceKey}` },
      });
    } catch {
      // Best-effort by contract: compensation deletes never mask the
      // original failure. Orphaned objects are inert (private bucket,
      // unreachable without a row).
    }
  }
}

// ── Local disk (sandbox/dev; DEPLOYMENT.md §2.3 semantics) ──────────────────

class LocalDiskMediaStorage implements MediaStorageProvider {
  private readonly root: string;

  constructor(root: string) {
    this.root = root;
  }

  private absolute(ref: string): string {
    const p = path.resolve(this.root, ref);
    if (!p.startsWith(this.root + path.sep)) {
      throw new MediaStoreError('invalid storage reference');
    }
    return p;
  }

  async put(ref: string, bytes: Uint8Array, _contentType: string): Promise<void> {
    const p = this.absolute(ref);
    await mkdir(path.dirname(p), { recursive: true });
    await writeFile(p, bytes);
  }

  async get(ref: string): Promise<Uint8Array> {
    try {
      return new Uint8Array(await readFile(this.absolute(ref)));
    } catch (err) {
      if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') {
        throw new MediaNotFoundError('media file missing on disk');
      }
      throw new MediaStoreError(`media read failed: ${String(err)}`);
    }
  }

  async delete(ref: string): Promise<void> {
    try {
      await rm(this.absolute(ref), { force: true });
    } catch {
      // Best-effort by contract.
    }
  }
}

// ── Selection ───────────────────────────────────────────────────────────────

let cached: { provider: MediaStorageProvider; mode: 'supabase' | 'local' } | null = null;

/**
 * The active provider, resolved once per process. `assertUploadable` is
 * where production refuses the local adapter — resolved separately so a
 * read-only health probe can report the mode without triggering the refusal.
 */
export function mediaStorage(): { provider: MediaStorageProvider; mode: 'supabase' | 'local' } {
  if (cached) return cached;
  const explicit = process.env.MEDIA_STORAGE?.trim().toLowerCase();
  const supabaseConfigured =
    !!process.env.SUPABASE_URL?.trim() && !!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const mode: 'supabase' | 'local' =
    explicit === 'supabase'
      ? 'supabase'
      : explicit === 'local'
        ? 'local'
        : supabaseConfigured
          ? 'supabase'
          : 'local';

  if (mode === 'supabase') {
    cached = {
      provider: new SupabaseMediaStorage(
        requireEnv('SUPABASE_URL'),
        requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
        process.env.SUPABASE_MEDIA_BUCKET?.trim() || 'media',
      ),
      mode,
    };
  } else {
    cached = {
      provider: new LocalDiskMediaStorage(
        process.env.MEDIA_ROOT?.trim() || path.join(process.cwd(), 'media'),
      ),
      mode,
    };
  }
  return cached;
}

/**
 * Uploads are refused on the local adapter in production: an ephemeral
 * filesystem cannot honour "the photograph outlives the request". This is
 * fail-closed on purpose — a 503 with an honest message beats a listing
 * that renders broken images tomorrow.
 */
export function assertUploadableStorage(): 'supabase' | 'local' {
  const { mode } = mediaStorage();
  if (mode === 'local' && process.env.NODE_ENV === 'production') {
    throw new MediaStoreUnavailableError(
      'media storage is not configured for this deployment (MEDIA_STORAGE/SUPABASE_URL)',
    );
  }
  return mode;
}

/** Server-generated refs only: guards the Supabase URL against path tricks. */
export function assertSafeStorageRef(ref: string): void {
  if (!/^[a-z0-9][a-z0-9/._-]{0,511}$/.test(ref) || ref.includes('..')) {
    throw new MediaStoreError('invalid storage reference');
  }
}
