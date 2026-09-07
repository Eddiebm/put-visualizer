import { describe, it, expect, beforeEach } from "vitest";
import { rateLimit, clientKey, rateLimitResponse, _resetForTests } from "./_rateLimit";

beforeEach(() => {
  _resetForTests();
});

describe("rateLimit", () => {
  it("allows requests up to the limit", () => {
    const now = 1_000_000;
    for (let i = 1; i <= 5; i++) {
      const r = rateLimit("k", 5, 60_000, now);
      expect(r.allowed).toBe(true);
      expect(r.remaining).toBe(5 - i);
    }
  });

  it("denies the request that exceeds the limit", () => {
    const now = 1_000_000;
    for (let i = 0; i < 5; i++) rateLimit("k", 5, 60_000, now);
    const r = rateLimit("k", 5, 60_000, now);
    expect(r.allowed).toBe(false);
    expect(r.remaining).toBe(0);
  });

  it("resets the count once the window has elapsed", () => {
    const start = 1_000_000;
    for (let i = 0; i < 5; i++) rateLimit("k", 5, 60_000, start);
    expect(rateLimit("k", 5, 60_000, start).allowed).toBe(false);

    // Just under the window boundary — still the same window, still denied.
    expect(rateLimit("k", 5, 60_000, start + 59_999).allowed).toBe(false);
    // At/after the window boundary — a fresh window.
    const fresh = rateLimit("k", 5, 60_000, start + 60_000);
    expect(fresh.allowed).toBe(true);
    expect(fresh.remaining).toBe(4);
  });

  it("tracks separate keys independently", () => {
    const now = 1_000_000;
    for (let i = 0; i < 5; i++) rateLimit("a", 5, 60_000, now);
    expect(rateLimit("a", 5, 60_000, now).allowed).toBe(false);
    // A different key has its own untouched bucket.
    expect(rateLimit("b", 5, 60_000, now).allowed).toBe(true);
  });
});

describe("clientKey", () => {
  it("uses the first entry of x-forwarded-for", () => {
    const req = new Request("http://x", { headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" } });
    expect(clientKey(req)).toBe("1.2.3.4");
  });

  it("falls back to a shared key when the header is absent", () => {
    const req = new Request("http://x");
    expect(clientKey(req)).toBe("unknown");
  });
});

describe("rateLimitResponse", () => {
  it("returns 429 with a retry-after header", async () => {
    const res = rateLimitResponse({ allowed: false, remaining: 0, resetAt: Date.now() + 30_000 });
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
    const body = await res.json();
    expect(body.error).toBe("rate_limited");
  });
});
