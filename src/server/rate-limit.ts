/**
 * In-memory sliding-window rate limiter for credential endpoints.
 *
 * ── Why it exists ──
 * The login endpoint had no brute-force protection: bcrypt makes each guess
 * slow, but slow is not a control. This limiter caps attempts per client IP
 * and per (IP + identifier) pair, so both single-account password spraying
 * and one-account stuffing meet a wall.
 *
 * ── Honest limits ──
 * State lives in process memory, so on a multi-instance deployment each
 * instance enforces its own window (the cap becomes N × limit globally).
 * That is still a large, cheap speed bump for a Vercel-sized deployment, and
 * it adds no infrastructure; a shared store (Upstash/Redis) is the follow-up
 * if credential attacks are ever observed in the audit trail. Memory is
 * bounded: entries expire by window and the map is trimmed on a floor of
 * writes, so an attacker rotating identifiers cannot grow it without bound.
 *
 * The limiter FAILS OPEN on its own bookkeeping errors - availability of the
 * sign-in flow is never held hostage by the throttle.
 */

const WINDOWS = [
  // { key prefix, max attempts, window }
  { scope: 'id', limit: 8, windowMs: 10 * 60 * 1000 }, // per IP+identifier
  { scope: 'ip', limit: 30, windowMs: 10 * 60 * 1000 }, // per IP, all identifiers
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
export function rateLimit(keys: { ip: string; identifier: string }): RateLimitVerdict {
  try {
    const now = Date.now();
    writes += 1;
    if (writes % TRIM_EVERY === 0) sweep(now);

    const bindings: Array<{ key: string; limit: number; windowMs: number }> = [
      { key: `id:${keys.ip}|${keys.identifier}`, limit: WINDOWS[0].limit, windowMs: WINDOWS[0].windowMs },
      { key: `ip:${keys.ip}`, limit: WINDOWS[1].limit, windowMs: WINDOWS[1].windowMs },
    ];

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
    // The throttle must never take sign-in down with it.
    return { ok: true, retryAfterSeconds: 0 };
  }
}
