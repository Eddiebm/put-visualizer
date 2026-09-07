import { describe, it, expect, beforeEach, vi } from "vitest";

// tasty.ts proxies to tastytrade's live production API — see the comment
// in tasty.ts for why "auth" (login) gets its own much tighter rate limit
// than the other actions: it's the one action here that doesn't need a
// valid session token first, making it the realistic credential-stuffing
// surface.
//
// Request bodies below are deliberately missing the fields each handler
// needs (login/password, rememberToken) so every under-the-limit call
// short-circuits with a 400 before ever calling fetch — that keeps these
// tests about the rate limiter's wiring, not about mocking tastytrade's
// response shape.

function req(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://x/api/tasty", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetModules();
  vi.unstubAllGlobals();
});

describe("api/tasty — rate limiting", () => {
  it("returns 429 on the auth action well before the general limit (AUTH_RATE_LIMIT)", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { default: handler } = await import("./tasty");
    const headers = { "x-forwarded-for": "9.9.9.9" };
    let last;
    for (let i = 0; i < 6; i++) {
      last = await handler(req({ action: "auth" }, headers)); // no login/password
    }
    expect(last!.status).toBe(429);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 429 on the general limit for a non-auth action (RATE_LIMIT)", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { default: handler } = await import("./tasty");
    const headers = { "x-forwarded-for": "9.9.9.9" };
    let last;
    for (let i = 0; i < 31; i++) {
      last = await handler(req({ action: "refresh" }, headers)); // no rememberToken
    }
    expect(last!.status).toBe(429);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps the auth limit and the general limit as separate buckets", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const { default: handler } = await import("./tasty");
    const headers = { "x-forwarded-for": "9.9.9.9" };
    // Exhaust the (tighter) auth limit.
    let last;
    for (let i = 0; i < 6; i++) {
      last = await handler(req({ action: "auth" }, headers));
    }
    expect(last!.status).toBe(429);
    // A different action from the same client still has budget left in
    // the general bucket (only 6 of its 30 requests have been used).
    const other = await handler(req({ action: "refresh" }, headers));
    expect(other.status).not.toBe(429);
  });
});
