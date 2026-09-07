import { describe, it, expect, beforeEach, vi } from "vitest";

// This endpoint has no auth key (it's public market-data, unlike chat/journal),
// so origin-gating is the only defense against someone hammering it directly
// with curl and eating into the app owner's Alpaca quota. This test guards
// the regression where rejectOrigin() was imported but never called (the
// same gap chat.ts/analyze.ts had before AI_ACCESS_KEY was added).

beforeEach(() => {
  vi.resetModules();
  vi.unstubAllGlobals();
});

describe("api/quote — origin gating", () => {
  it("rejects a disallowed Origin with 403 before making any upstream call", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { default: handler } = await import("./quote");
    const res = await handler(new Request("http://x/api/quote?symbol=AAPL", {
      headers: { origin: "https://evil.example.com" },
    }));
    expect(res.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("proceeds for a same-origin request (no Origin header)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    const { default: handler } = await import("./quote");
    const res = await handler(new Request("http://x/api/quote?symbol=AAPL"));
    expect(res.status).not.toBe(403);
  });
});

describe("api/quote — rate limiting", () => {
  it("returns 429 after RATE_LIMIT requests from the same client", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    const { default: handler } = await import("./quote");
    let last;
    for (let i = 0; i < 151; i++) {
      last = await handler(new Request("http://x/api/quote?symbol=AAPL", {
        headers: { "x-forwarded-for": "9.9.9.9" },
      }));
    }
    expect(last!.status).toBe(429);
  });
});
