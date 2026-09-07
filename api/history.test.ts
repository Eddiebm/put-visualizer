import { describe, it, expect, beforeEach, vi } from "vitest";

// See quote.test.ts for why origin-gating matters here (no auth key, public
// market-data proxy). Guards the same rejectOrigin()-imported-but-unused
// regression class.

beforeEach(() => {
  vi.resetModules();
  vi.unstubAllGlobals();
  delete process.env.ALPACA_KEY_ID;
  delete process.env.ALPACA_SECRET_KEY;
});

describe("api/history — origin gating", () => {
  it("rejects a disallowed Origin with 403 before making any upstream call", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { default: handler } = await import("./history");
    const res = await handler(new Request("http://x/api/history?symbol=AAPL", {
      headers: { origin: "https://evil.example.com" },
    }));
    expect(res.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("proceeds for a same-origin request (no Origin header)", async () => {
    const { default: handler } = await import("./history");
    const res = await handler(new Request("http://x/api/history?symbol=AAPL"));
    expect(res.status).not.toBe(403);
  });
});

describe("api/history — rate limiting", () => {
  it("returns 429 after RATE_LIMIT requests from the same client", async () => {
    const { default: handler } = await import("./history");
    let last;
    for (let i = 0; i < 201; i++) {
      last = await handler(new Request("http://x/api/history?symbol=AAPL", {
        headers: { "x-forwarded-for": "9.9.9.9" },
      }));
    }
    expect(last!.status).toBe(429);
  });
});
