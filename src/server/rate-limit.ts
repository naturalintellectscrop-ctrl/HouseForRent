/**
 * Rate limiting — credential AND upload endpoints.
 *
 * ── Two layers, one rule ──
 * The in-memory sliding-window limiter came first (login brute force, then
 * the upload byte-bomb loop). P-11 added the DURABLE layer: fixed-window
 * counters in the shared `rate_limit_counter` table (migration
 * 20261101120000), so a multi-instance deployment enforces ONE limit instead
 * of N per-instance windows. The credential endpoints (login, register,
 * password change) run BOTH layers - memory first as a free fast-path
 * speed bump, then the shared store, which is the layer that actually holds
 * across instances. The upload endpoints keep the memory-only layer: an
 * upload flood from a multi-instance split is a resource concern, not a
 * credential-guessing one, and per-instance throttling still bounds it.
 *
 * ── Honest limits ──
 * The memory layer lives in process memory (per-instance; unchanged). The
 * durable layer is one atomic INSERT .. ON CONFLICT per window per bucket,
 * bounded by distinct keys; rows past their window are swept
 * opportunistically. BOTH layers FAIL OPEN on their own bookkeeping errors -
 * and the durable layer specifically fails open while the migration is
 * unapplied (P2021, table missing), so production behaviour is unchanged
 * until the owner applies 20261101120000 through the migration rails.
 *
 * The limiter FAILS OPEN on its own bookkeeping errors - availability of the
 * protected flow is never held hostage by the throttle.
 */
import crypto from 'node:crypto';
import { db } from '@/lib/db';

const WINDOWS = [
  // { key prefix, max attempts, window }
  { scope: 'id', limit: 8, windowMs: 10 * 60 * 1000 }, // per IP+identifier (credentials)
  { scope: 'ip', limit: 30, windowMs: 10 * 60 * 1000 }, // per IP, all identifiers (credentials)
] as const;

/** Upload windows (image pipeline round): a landlord or officer arranging a
 * gallery uploads several photographs in quick succession, so the
 * per-party+IP window is generous; the per-IP window caps abuse across
 * accounts. An accidental limit trip returns 429 with Retry-After. */
const UPLOAD_WINDOWS = [
  { scope: 'up-id', limit: 24, windowMs: 10 * 60 * 1000 }, // per IP+party
  { scope: 'up-ip', limit: 60, windowMs: 10 * 60 * 1000 }, // per IP, all parties
] as const;

const TRIM_EVERY = 64;

type Bucket = { hits: number[]; };

const buckets = new Map<string, Bucket>();
let writes = 0;

function sweep(now: number): void {
  for (const [key, bucket] of buckets) {
    if (bucket.hits.length === 0 || now - bucket.hits[bucket.hits.length - 1] > 30 * 60 * 1000) {
      buckets.delete(key);
    }
  }
}

export interface RateLimitVerdict {
  ok: boolean;
  /** Seconds until the binding window clears; 0 when ok. */
  retryAfterSeconds: number;
}

/**
 * Records one attempt for every window that binds this request. Call AFTER
 * basic input validation, with a normalised identifier (the caller must not
 * pass raw unbounded strings - this keys a Map).
 */
function checkWindows(bindings: Array<{ key: string; limit: number; windowMs: number }>): RateLimitVerdict {
  try {
    const now = Date.now();
    writes += 1;
    if (writes % TRIM_EVERY === 0) sweep(now);

    let retryAfter = 0;
    for (const binding of bindings) {
      const bucket = buckets.get(binding.key) ?? { hits: [] };
      const cutoff = now - binding.windowMs;
      bucket.hits = bucket.hits.filter((t) => t > cutoff);
      if (bucket.hits.length >= binding.limit) {
        const oldest = bucket.hits[0];
        retryAfter = Math.max(retryAfter, Math.ceil((oldest + binding.windowMs - now) / 1000));
      } else {
        bucket.hits.push(now);
        buckets.set(binding.key, bucket);
      }
    }

    return retryAfter > 0
      ? { ok: false, retryAfterSeconds: Math.min(retryAfter, 900) }
      : { ok: true, retryAfterSeconds: 0 };
  } catch {
    // The throttle must never take the protected flow down with it.
    return { ok: true, retryAfterSeconds: 0 };
  }
}

/** Credential endpoints (login, register, password reset). */
export function rateLimit(keys: { ip: string; identifier: string }): RateLimitVerdict {
  return checkWindows([
    { key: `id:${keys.ip}|${keys.identifier}`, limit: WINDOWS[0].limit, windowMs: WINDOWS[0].windowMs },
    { key: `ip:${keys.ip}`, limit: WINDOWS[1].limit, windowMs: WINDOWS[1].windowMs },
  ]);
}

/** Media upload endpoints. identifier = the party id (normalised server data). */
export function uploadRateLimit(keys: { ip: string; identifier: string }): RateLimitVerdict {
  return checkWindows([
    { key: `up-id:${keys.ip}|${keys.identifier}`, limit: UPLOAD_WINDOWS[0].limit, windowMs: UPLOAD_WINDOWS[0].windowMs },
    { key: `up-ip:${keys.ip}`, limit: UPLOAD_WINDOWS[1].limit, windowMs: UPLOAD_WINDOWS[1].windowMs },
  ]);
}

/** Client IP the way every route sees it (Vercel forwards XFF). */
export function clientIp(req: Request): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  );
}

// ── the durable layer (P-11) ─────────────────────────────────────────────
//
// Fixed-window counters in the shared `rate_limit_counter` table. One atomic
// upsert per bucket: a window boundary resets the row in place, otherwise the
// hit count increments - there is no read-then-write race to lose. The table
// is bounded by DISTINCT KEYS (a new window reuses the row), and stale rows
// are swept with ~2% probability per check so an attacker rotating IPs cannot
// grow the table without bound.

/** Registration windows (P-11): creating accounts is a one-time human act,
 * so the per-identifier window is tight; the per-IP window bounds bulk
 * account farming from one address. The per-IP ceiling is set HIGH ENOUGH
 * for legitimate bulk onboarding - a shared office connection, or the QA
 * rigs that build ~30 accounts per run through the real API - and low
 * enough that farming is capped and every account lands in the audit
 * trail. These are REGISTRATION-OWNED windows - deliberately NOT the login
 * limiter's shared credential budget, so a burst of legitimate sign-ins
 * can never lock a household out of onboarding, and vice versa. */
const REGISTRATION_WINDOWS = [
  { key: 'reg-id', limit: 5, windowMs: 60 * 60 * 1000 }, // per IP+identifier
  { key: 'reg-ip', limit: 60, windowMs: 60 * 60 * 1000 }, // per IP, all identifiers
] as const;

/** Password-change windows (P-11): the endpoint re-verifies the CURRENT
 * password, so repeated 403s are exactly credential guessing under a stolen
 * session - the account-level window is the control that binds regardless
 * of source IP. */
const PASSWORD_WINDOWS = [
  { key: 'pw-party', limit: 10, windowMs: 60 * 60 * 1000 }, // per account
  { key: 'pw-ip', limit: 30, windowMs: 10 * 60 * 1000 }, // per IP, all accounts
] as const;

let lastDurableWarn = 0;

function warnDurableOnce(err: unknown): void {
  const now = Date.now();
  if (now - lastDurableWarn < 60_000) return;
  lastDurableWarn = now;
  const kind = err instanceof Error ? err.name : 'unknown';
  // One line per minute at most - the fail-open state is visible in logs
  // without a blocked table turning into a log flood.
  console.warn(
    `[rate-limit] durable layer unavailable (${kind}); failing open — ` +
      'apply migration 20261101120000_rate_limit_counters to enforce shared windows',
  );
}

/**
 * One fixed-window hit against the shared table. Returns ok:false once the
 * bucket's window is exhausted, with the seconds until it rolls over.
 */
async function durableLimit(bucketKey: string, limit: number, windowMs: number): Promise<RateLimitVerdict> {
  try {
    const now = Date.now();
    const windowStart = new Date(Math.floor(now / windowMs) * windowMs);
    const rows = await db.$queryRaw<{ hits: number }[]>`
      INSERT INTO "rate_limit_counter" ("id", "bucket_key", "hits", "window_start", "updated_at")
      VALUES (${crypto.randomUUID()}, ${bucketKey}, 1, ${windowStart}, now())
      ON CONFLICT ("bucket_key") DO UPDATE SET
        "hits" = CASE
          WHEN "rate_limit_counter"."window_start" = ${windowStart}::timestamptz
          THEN "rate_limit_counter"."hits" + 1
          ELSE 1 END,
        "window_start" = ${windowStart}::timestamptz,
        "updated_at" = now()
      RETURNING "hits"`;
    if (Math.random() < 0.02) {
      await db.$executeRaw`DELETE FROM "rate_limit_counter" WHERE "window_start" < now() - interval '2 hours'`;
    }
    const hits = Number(rows[0]?.hits ?? 1);
    if (hits > limit) {
      const retryAfterSeconds = Math.min(Math.ceil((windowStart.getTime() + windowMs - now) / 1000), 900);
      return { ok: false, retryAfterSeconds };
    }
    return { ok: true, retryAfterSeconds: 0 };
  } catch (err) {
    // Missing table (P2021 - migration unapplied), pool exhaustion, anything:
    // availability of the protected flow is never held hostage by the throttle.
    warnDurableOnce(err);
    return { ok: true, retryAfterSeconds: 0 };
  }
}

/** Durable + memory throttle for REGISTRATION. identifier = normalised phone
 * digits (the account key being claimed). Call after basic input validation
 * and BEFORE touching the database. Runs on REGISTRATION-OWNED windows in
 * both layers - never the login limiter's shared credential budget. */
export async function registrationRateLimit(keys: { ip: string; identifier: string }): Promise<RateLimitVerdict> {
  const memory = checkWindows([
    { key: `mem-${REGISTRATION_WINDOWS[0].key}:${keys.ip}|${keys.identifier}`, limit: REGISTRATION_WINDOWS[0].limit, windowMs: REGISTRATION_WINDOWS[0].windowMs },
    { key: `mem-${REGISTRATION_WINDOWS[1].key}:${keys.ip}`, limit: REGISTRATION_WINDOWS[1].limit, windowMs: REGISTRATION_WINDOWS[1].windowMs },
  ]);
  if (!memory.ok) return memory;
  const perId = await durableLimit(`${REGISTRATION_WINDOWS[0].key}:${keys.ip}|${keys.identifier}`, REGISTRATION_WINDOWS[0].limit, REGISTRATION_WINDOWS[0].windowMs);
  if (!perId.ok) return perId;
  return durableLimit(`${REGISTRATION_WINDOWS[1].key}:${keys.ip}`, REGISTRATION_WINDOWS[1].limit, REGISTRATION_WINDOWS[1].windowMs);
}

/** Durable + memory throttle for PASSWORD CHANGE. Called with the SESSION
 * holder's party id, so the account-level window binds no matter which
 * address the stolen cookie is used from. */
export async function passwordChangeRateLimit(keys: { ip: string; partyId: string }): Promise<RateLimitVerdict> {
  const memory = rateLimit({ ip: keys.ip, identifier: `party:${keys.partyId}` });
  if (!memory.ok) return memory;
  const perParty = await durableLimit(`${PASSWORD_WINDOWS[0].key}:${keys.partyId}`, PASSWORD_WINDOWS[0].limit, PASSWORD_WINDOWS[0].windowMs);
  if (!perParty.ok) return perParty;
  return durableLimit(`${PASSWORD_WINDOWS[1].key}:${keys.ip}`, PASSWORD_WINDOWS[1].limit, PASSWORD_WINDOWS[1].windowMs);
}

/** Durable + memory throttle for the credential endpoints that already used
 * the memory limiter (login today; register/password got their own shaped
 * windows above). Same windows as the memory layer, now shared. */
export async function credentialRateLimit(keys: { ip: string; identifier: string }): Promise<RateLimitVerdict> {
  const memory = rateLimit(keys);
  if (!memory.ok) return memory;
  const perId = await durableLimit(`cred-id:${keys.ip}|${keys.identifier}`, WINDOWS[0].limit, WINDOWS[0].windowMs);
  if (!perId.ok) return perId;
  return durableLimit(`cred-ip:${keys.ip}`, WINDOWS[1].limit, WINDOWS[1].windowMs);
}
