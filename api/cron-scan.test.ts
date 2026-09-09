import { describe, it, expect, beforeEach, vi } from "vitest";

const ENV = {
  ALPACA_KEY_ID: "alpaca-id",
  ALPACA_SECRET_KEY: "alpaca-secret",
  CLOUDFLARE_ACCOUNT_ID: "acct123",
  CLOUDFLARE_D1_DATABASE_ID: "db456",
  CLOUDFLARE_API_TOKEN: "token789",
  CRON_SECRET: "cron-secret",
};

function setEnv(overrides: Record<string, string | undefined> = {}) {
  const merged = { ...ENV, ...overrides };
  for (const k of Object.keys(ENV)) delete process.env[k];
  delete process.env.CRON_WATCHLIST;
  delete process.env.FINNHUB_API_KEY;
  for (const [k, v] of Object.entries(merged)) {
    if (v !== undefined) process.env[k] = v;
  }
}

function makeAlpacaBars(n = 220) {
  const bars = [];
  const start = new Date("2024-01-01T00:00:00Z");
  for (let i = 0; i < n; i++) {
    const c = 100 + i * 0.05;
    const date = new Date(start.getTime() + i * 86400000);
    bars.push({ t: date.toISOString(), o: c - 0.1, h: c + 0.2, l: c - 0.2, c, v: 1_000_000 });
  }
  return bars;
}

function authedRequest(body?: string) {
  return new Request("http://x/api/cron-scan", {
    method: "POST",
    headers: { authorization: `Bearer ${ENV.CRON_SECRET}` },
    body,
  });
}

// Routes each fetch call by host — Alpaca (bars), Finnhub (earnings), or
// Cloudflare (D1) — and records every D1 SQL/params pair sent, so tests
// can assert on exactly what got written without a real database.
function mockUpstreams({ alpacaOk = true, finnhubEarnings = [] as Array<{ symbol: string; date: string }> } = {}) {
  const d1Calls: { sql: string; params: unknown[] }[] = [];
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    if (url.includes("data.alpaca.markets")) {
      if (!alpacaOk) return Promise.resolve({ ok: false, status: 500, json: async () => ({}) });
      return Promise.resolve({ ok: true, json: async () => ({ bars: makeAlpacaBars() }) });
    }
    if (url.includes("finnhub.io")) {
      return Promise.resolve({ ok: true, json: async () => ({ earningsCalendar: finnhubEarnings }) });
    }
    if (url.includes("api.cloudflare.com")) {
      const bodyStr = init?.body as string;
      const { sql, params } = JSON.parse(bodyStr);
      d1Calls.push({ sql, params });
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ success: true, result: [{ results: [] }] }) });
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, d1Calls };
}

beforeEach(() => {
  vi.resetModules();
  vi.unstubAllGlobals();
});

describe("api/cron-scan — not configured", () => {
  it("returns available:false and makes no fetch calls when any required env var is missing", async () => {
    setEnv({ CRON_SECRET: undefined });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { default: handler } = await import("./cron-scan");
    const res = await handler(authedRequest());
    const body = await res.json();
    expect(body.available).toBe(false);
    expect(body.reason).toBe("not_configured");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("api/cron-scan — auth", () => {
  it("rejects a missing or wrong bearer token with 401, before any upstream fetch", async () => {
    setEnv();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { default: handler } = await import("./cron-scan");
    const res = await handler(new Request("http://x/api/cron-scan", { method: "POST", headers: { authorization: "Bearer wrong" } }));
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("api/cron-scan — watchlist resolution", () => {
  it("defaults to every ticker in COMPANIES when CRON_WATCHLIST isn't set", async () => {
    setEnv();
    const { fetchMock } = mockUpstreams();
    const { COMPANIES } = await import("../src/appConstants");
    const { default: handler } = await import("./cron-scan");
    const res = await handler(authedRequest());
    const body = await res.json();
    expect(body.available).toBe(true);
    expect(body.scanned).toBe(COMPANIES.length);
    const alpacaCalls = fetchMock.mock.calls.filter((c) => (c[0] as string).includes("data.alpaca.markets"));
    // One call per COMPANIES ticker, plus one for SPY (used for relStrength).
    expect(alpacaCalls.length).toBe(COMPANIES.length + 1);
  });

  it("uses CRON_WATCHLIST instead of COMPANIES when it's set", async () => {
    setEnv({ CRON_WATCHLIST: "AAPL,MSFT,NVDA" });
    const { fetchMock } = mockUpstreams();
    const { default: handler } = await import("./cron-scan");
    const res = await handler(authedRequest());
    const body = await res.json();
    expect(body.scanned).toBe(3);
    const alpacaCalls = fetchMock.mock.calls.filter((c) => (c[0] as string).includes("data.alpaca.markets"));
    expect(alpacaCalls.length).toBe(3 + 1); // + SPY
  });
});

describe("api/cron-scan — writing the cache", () => {
  it("upserts a scan_cache row per ticker plus a market-condition sentinel row", async () => {
    setEnv({ CRON_WATCHLIST: "AAPL,MSFT" });
    const { d1Calls } = mockUpstreams();
    const { default: handler } = await import("./cron-scan");
    const res = await handler(authedRequest());
    const body = await res.json();
    expect(body.available).toBe(true);
    expect(body.scanned).toBe(2);

    const upsertCalls = d1Calls.filter((c) => c.sql.includes("INSERT INTO scan_cache"));
    expect(upsertCalls.length).toBeGreaterThan(0);
    const allParams = upsertCalls.flatMap((c) => c.params as string[]);
    expect(allParams).toContain("AAPL");
    expect(allParams).toContain("MSFT");
    expect(allParams).toContain("__MARKET_CONDITION__");
  });

  it("deletes cached rows for tickers no longer in the current watchlist", async () => {
    setEnv({ CRON_WATCHLIST: "AAPL" });
    const { d1Calls } = mockUpstreams();
    const { default: handler } = await import("./cron-scan");
    await handler(authedRequest());
    const deleteCall = d1Calls.find((c) => c.sql.includes("DELETE FROM scan_cache"));
    expect(deleteCall).toBeDefined();
    expect(deleteCall!.params).toContain("AAPL");
    expect(deleteCall!.params).toContain("__MARKET_CONDITION__");
  });

  it("skips a ticker whose Alpaca fetch fails, without failing the whole run", async () => {
    setEnv({ CRON_WATCHLIST: "AAPL,MSFT" });
    mockUpstreams({ alpacaOk: false });
    const { default: handler } = await import("./cron-scan");
    const res = await handler(authedRequest());
    const body = await res.json();
    expect(body.available).toBe(true);
    expect(body.scanned).toBe(0);
    expect(body.failed).toBe(2);
  });

  it("marks a ticker with a real earnings-calendar entry as hasEarnings, not left unknown", async () => {
    setEnv({ CRON_WATCHLIST: "AAPL", FINNHUB_API_KEY: "finnhub-token" });
    const { d1Calls } = mockUpstreams({ finnhubEarnings: [{ symbol: "AAPL", date: "2026-09-15" }] });
    const { default: handler } = await import("./cron-scan");
    await handler(authedRequest());
    const upsertCall = d1Calls.find((c) => c.sql.includes("INSERT INTO scan_cache"));
    const dataIdx = (upsertCall!.params as string[]).indexOf("AAPL") + 1;
    const stored = JSON.parse(upsertCall!.params[dataIdx] as string);
    expect(stored.hasEarnings).toBe(true);
    expect(stored.earningsDate).toBe("2026-09-15");
  });
});
