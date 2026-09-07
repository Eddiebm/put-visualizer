import { describe, it, expect, beforeEach, vi } from "vitest";

// See quote.test.ts for why origin-gating matters here (no auth key, public
// market-data proxy). Guards the same rejectOrigin()-imported-but-unused
// regression class. morning.ts always calls out to Yahoo regardless of any
// API key, so fetch is mocked in both cases to avoid a real network call.

beforeEach(() => {
  vi.resetModules();
  vi.unstubAllGlobals();
});

describe("api/morning — origin gating", () => {
  it("rejects a disallowed Origin with 403 before making any upstream call", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { default: handler } = await import("./morning");
    const res = await handler(new Request("http://x/api/morning", {
      headers: { origin: "https://evil.example.com" },
    }));
    expect(res.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("proceeds for a same-origin request (no Origin header)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network disabled in test")));
    const { default: handler } = await import("./morning");
    const res = await handler(new Request("http://x/api/morning"));
    expect(res.status).not.toBe(403);
  });
});

describe("api/morning — rate limiting", () => {
  it("returns 429 after RATE_LIMIT requests from the same client", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network disabled in test")));
    const { default: handler } = await import("./morning");
    let last;
    for (let i = 0; i < 31; i++) {
      last = await handler(new Request("http://x/api/morning", {
        headers: { "x-forwarded-for": "9.9.9.9" },
      }));
    }
    expect(last!.status).toBe(429);
  });
});
