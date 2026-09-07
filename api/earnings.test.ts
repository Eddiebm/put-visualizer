import { describe, it, expect, beforeEach, vi } from "vitest";

// This endpoint previously had no CORS/origin handling of any kind (not even
// corsHeaders()) — the same gap api/lesson.ts had before AI_ACCESS_KEY was
// added. Guards the regression.

beforeEach(() => {
  vi.resetModules();
  vi.unstubAllGlobals();
  delete process.env.FINNHUB_API_KEY;
});

describe("api/earnings — origin gating", () => {
  it("rejects a disallowed Origin with 403 before making any upstream call", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { default: handler } = await import("./earnings");
    const res = await handler(new Request("http://x/api/earnings?expiration=2026-01-16", {
      headers: { origin: "https://evil.example.com" },
    }));
    expect(res.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("proceeds for a same-origin request (no Origin header)", async () => {
    const { default: handler } = await import("./earnings");
    const res = await handler(new Request("http://x/api/earnings?expiration=2026-01-16"));
    expect(res.status).not.toBe(403);
  });
});

describe("api/earnings — rate limiting", () => {
  it("returns 429 after RATE_LIMIT requests from the same client", async () => {
    const { default: handler } = await import("./earnings");
    let last;
    for (let i = 0; i < 61; i++) {
      last = await handler(new Request("http://x/api/earnings?expiration=2026-01-16", {
        headers: { "x-forwarded-for": "9.9.9.9" },
      }));
    }
    expect(last!.status).toBe(429);
  });
});
