// Best-effort, in-memory rate limiting for Edge functions.
//
// This is a plain fixed-window counter kept in a module-scope Map — it has
// no shared state across regions or isolates, and resets on every cold
// start. It is NOT a hard, globally-consistent guarantee the way a shared
// store (Vercel KV, Upstash Redis) would be: a determined, distributed
// attacker can spread requests across enough isolates to evade it.
//
// What it DOES do, at zero infra cost and zero new env vars: cap how many
// requests a single warm isolate serves a single client in a window. That's
// enough to blunt the realistic cases here — a runaway client-side retry
// loop, a single-source burst, or a brute-force attempt against one of the
// access keys (this check runs before the key comparison, so wrong guesses
// count against the limit too, not just successful ones). For a hard
// guarantee under real distributed abuse, wire up Vercel KV or Upstash
// Redis instead — this file is deliberately not that: validating an actual
// KV/Redis integration needs live credentials this environment doesn't
// have, and shipping one untested would be worse than being honest about
// what a zero-dependency limiter can and can't promise.

interface Bucket {
  count: number;
  windowStart: number;
}

const buckets = new Map<string, Bucket>();

// Bounds how large this Map can grow on a long-lived isolate. Map preserves
// insertion order, so dropping the first key is a cheap approximation of
// evicting the oldest bucket — good enough for a best-effort limiter, not
// worth a real LRU for this.
const MAX_BUCKETS = 5000;

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now: number = Date.now()
): RateLimitResult {
  let bucket = buckets.get(key);
  if (!bucket || now - bucket.windowStart >= windowMs) {
    bucket = { count: 0, windowStart: now };
    if (!buckets.has(key) && buckets.size >= MAX_BUCKETS) {
      const oldestKey = buckets.keys().next().value;
      if (oldestKey !== undefined) buckets.delete(oldestKey);
    }
    buckets.set(key, bucket);
  }
  bucket.count++;
  return {
    allowed: bucket.count <= limit,
    remaining: Math.max(0, limit - bucket.count),
    resetAt: bucket.windowStart + windowMs,
  };
}

// Only exported so tests can reset state between cases without needing a
// fresh module instance (vi.resetModules() also does this, but per-test
// isolation this way is cheaper).
export function _resetForTests(): void {
  buckets.clear();
}

// Best-effort client identifier. x-forwarded-for's first entry is set by
// Vercel's edge network itself for the connecting client, not something the
// client can override by sending its own x-forwarded-for (Vercel appends
// rather than trusts an inbound one) — but treat this as an identifier for
// a best-effort limiter, not a hardened security boundary. Falls back to a
// shared bucket if the header is absent (e.g. local dev) rather than
// throwing — worst case that makes the limit shared across all local
// clients, which is fine for dev.
export function clientKey(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return "unknown";
}

export function rateLimitResponse(result: RateLimitResult, extraHeaders: Record<string, string> = {}): Response {
  const retryAfterSec = Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000));
  return new Response(JSON.stringify({ error: "rate_limited" }), {
    status: 429,
    headers: {
      "content-type": "application/json",
      "retry-after": String(retryAfterSec),
      "x-ratelimit-remaining": String(result.remaining),
      ...extraHeaders,
    },
  });
}
