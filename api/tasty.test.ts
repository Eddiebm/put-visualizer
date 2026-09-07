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

// Tastytrade's sandbox/certification environment (api.cert.tastyworks.com)
// — a separate system for testing order flow with no real money. Every
// action must route to the matching base URL for whatever `env` the
// request carries, and default to prod (unchanged from before this field
// existed) when env is omitted entirely.
describe("api/tasty — sandbox environment routing", () => {
  function mockFetchOk(data: unknown) {
    return vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve(data) });
  }

  it("routes auth to the cert base when env is \"cert\"", async () => {
    const fetchMock = mockFetchOk({ data: { "session-token": "t", "remember-token": "r" } });
    vi.stubGlobal("fetch", fetchMock);
    const { default: handler } = await import("./tasty");
    const res = await handler(req(
      { action: "auth", login: "a@b.com", password: "hunter2", env: "cert" },
      { "x-forwarded-for": "1.1.1.1" }
    ));
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith("https://api.cert.tastyworks.com/sessions", expect.anything());
  });

  it("routes auth to the prod base when env is \"prod\"", async () => {
    const fetchMock = mockFetchOk({ data: { "session-token": "t", "remember-token": "r" } });
    vi.stubGlobal("fetch", fetchMock);
    const { default: handler } = await import("./tasty");
    await handler(req(
      { action: "auth", login: "a@b.com", password: "hunter2", env: "prod" },
      { "x-forwarded-for": "1.1.1.2" }
    ));
    expect(fetchMock).toHaveBeenCalledWith("https://api.tastyworks.com/sessions", expect.anything());
  });

  it("defaults to the prod base when env is omitted entirely — matches every session from before this field existed", async () => {
    const fetchMock = mockFetchOk({ data: { "session-token": "t", "remember-token": "r" } });
    vi.stubGlobal("fetch", fetchMock);
    const { default: handler } = await import("./tasty");
    await handler(req({ action: "auth", login: "a@b.com", password: "hunter2" }, { "x-forwarded-for": "1.1.1.3" }));
    expect(fetchMock).toHaveBeenCalledWith("https://api.tastyworks.com/sessions", expect.anything());
  });

  it("routes accounts (and the per-account balances call) to the cert base when env is \"cert\"", async () => {
    const fetchMock = mockFetchOk({ data: { items: [] } }); // empty items — no secondary balances call needed
    vi.stubGlobal("fetch", fetchMock);
    const { default: handler } = await import("./tasty");
    await handler(req({ action: "accounts", token: "tok", env: "cert" }, { "x-forwarded-for": "1.1.1.4" }));
    expect(fetchMock).toHaveBeenCalledWith("https://api.cert.tastyworks.com/customers/me/accounts", expect.anything());
  });

  it("routes a dry-run order to the cert base's dry-run endpoint when env is \"cert\"", async () => {
    const fetchMock = mockFetchOk({ data: { order: {} } });
    vi.stubGlobal("fetch", fetchMock);
    const { default: handler } = await import("./tasty");
    await handler(req(
      { action: "dry-run", token: "tok", accountNumber: "5WX00001", order: {}, env: "cert" },
      { "x-forwarded-for": "1.1.1.5" }
    ));
    expect(fetchMock).toHaveBeenCalledWith("https://api.cert.tastyworks.com/accounts/5WX00001/orders/dry-run", expect.anything());
  });

  it("routes a live place order to the prod base's orders endpoint, not dry-run, when env is \"prod\"", async () => {
    const fetchMock = mockFetchOk({ data: { order: { id: "1", status: "Live" } } });
    vi.stubGlobal("fetch", fetchMock);
    const { default: handler } = await import("./tasty");
    await handler(req(
      { action: "place", token: "tok", accountNumber: "5WX00001", order: {}, env: "prod" },
      { "x-forwarded-for": "1.1.1.6" }
    ));
    expect(fetchMock).toHaveBeenCalledWith("https://api.tastyworks.com/accounts/5WX00001/orders", expect.anything());
  });

  it("routes refresh to the cert base when env is \"cert\"", async () => {
    const fetchMock = mockFetchOk({ data: { "session-token": "t2", "remember-token": "r2" } });
    vi.stubGlobal("fetch", fetchMock);
    const { default: handler } = await import("./tasty");
    await handler(req({ action: "refresh", rememberToken: "r", env: "cert" }, { "x-forwarded-for": "1.1.1.7" }));
    expect(fetchMock).toHaveBeenCalledWith("https://api.cert.tastyworks.com/sessions", expect.anything());
  });
});
