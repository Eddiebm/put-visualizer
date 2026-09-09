import { describe, it, expect, beforeEach, vi } from "vitest";

const ENV = {
  CLOUDFLARE_ACCOUNT_ID: "acct123",
  CLOUDFLARE_D1_DATABASE_ID: "db456",
  CLOUDFLARE_API_TOKEN: "token789",
};

function setEnv(overrides: Record<string, string | undefined> = {}) {
  const merged = { ...ENV, ...overrides };
  for (const k of Object.keys(ENV)) delete process.env[k];
  for (const [k, v] of Object.entries(merged)) {
    if (v !== undefined) process.env[k] = v;
  }
}

function d1Response(results: unknown[] = []) {
  return { ok: true, status: 200, json: async () => ({ success: true, result: [{ results }] }) };
}

function row(ticker: string, data: unknown, scannedAt = "2026-09-08T12:00:00.000Z") {
  return { ticker, data: JSON.stringify(data), scanned_at: scannedAt };
}

beforeEach(() => {
  vi.resetModules();
  vi.unstubAllGlobals();
});

describe("api/scan-cache — not configured", () => {
  it("returns available:false when Cloudflare env vars are missing", async () => {
    setEnv({ CLOUDFLARE_ACCOUNT_ID: undefined });
    const { default: handler } = await import("./scan-cache");
    const res = await handler(new Request("http://x/api/scan-cache"));
    const body = await res.json();
    expect(body.available).toBe(false);
    expect(body.reason).toBe("not_configured");
  });
});

describe("api/scan-cache — origin gating", () => {
  it("rejects a disallowed Origin with 403 before making any D1 call", async () => {
    setEnv();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { default: handler } = await import("./scan-cache");
    const res = await handler(new Request("http://x/api/scan-cache", { headers: { origin: "https://evil.example.com" } }));
    expect(res.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("api/scan-cache — rate limiting", () => {
  it("returns 429 after RATE_LIMIT requests from the same client", async () => {
    setEnv();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(d1Response([])));
    const { default: handler } = await import("./scan-cache");
    let last;
    for (let i = 0; i < 201; i++) {
      last = await handler(new Request("http://x/api/scan-cache", { headers: { "x-forwarded-for": "9.9.9.9" } }));
    }
    expect(last!.status).toBe(429);
  });
});

describe("api/scan-cache — reads", () => {
  it("returns available:false, reason:empty when the cache has no rows", async () => {
    setEnv();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(d1Response([])));
    const { default: handler } = await import("./scan-cache");
    const res = await handler(new Request("http://x/api/scan-cache"));
    const body = await res.json();
    expect(body.available).toBe(false);
    expect(body.reason).toBe("empty");
  });

  it("separates the market-condition sentinel row from the per-ticker results", async () => {
    setEnv();
    const analysis = { sym: "AAPL", name: "Apple", price: 190, score: 70, grade: { label: "Good", color: "#000", bg: "#fff" } };
    const condition = { emoji: "🟢", label: "Bull market", summary: "...", color: "#16a34a", bg: "#f0fdf4" };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        d1Response([row("AAPL", analysis), row("__MARKET_CONDITION__", condition)])
      )
    );
    const { default: handler } = await import("./scan-cache");
    const res = await handler(new Request("http://x/api/scan-cache"));
    const body = await res.json();
    expect(body.available).toBe(true);
    expect(body.results).toEqual([analysis]);
    expect(body.condition).toEqual(condition);
  });

  it("reports the most recent scanned_at across rows", async () => {
    setEnv();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        d1Response([
          row("AAPL", { sym: "AAPL" }, "2026-09-08T10:00:00.000Z"),
          row("MSFT", { sym: "MSFT" }, "2026-09-08T12:00:00.000Z"), // latest
          row("NVDA", { sym: "NVDA" }, "2026-09-08T11:00:00.000Z"),
        ])
      )
    );
    const { default: handler } = await import("./scan-cache");
    const res = await handler(new Request("http://x/api/scan-cache"));
    const body = await res.json();
    expect(body.scannedAt).toBe("2026-09-08T12:00:00.000Z");
  });

  it("skips a malformed row rather than failing the whole response", async () => {
    setEnv();
    const good = { sym: "AAPL", name: "Apple" };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        d1Response([
          { ticker: "BAD", data: "{not json", scanned_at: "2026-09-08T12:00:00.000Z" },
          row("AAPL", good),
        ])
      )
    );
    const { default: handler } = await import("./scan-cache");
    const res = await handler(new Request("http://x/api/scan-cache"));
    const body = await res.json();
    expect(body.available).toBe(true);
    expect(body.results).toEqual([good]);
  });

  it("returns available:false rather than throwing when the D1 request itself fails", async () => {
    setEnv();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({ success: false, errors: [{ message: "boom" }] }) }));
    const { default: handler } = await import("./scan-cache");
    const res = await handler(new Request("http://x/api/scan-cache"));
    expect(res.status).toBe(200); // never surfaces a hard failure to the caller — see the module docstring
    const body = await res.json();
    expect(body.available).toBe(false);
  });
});
