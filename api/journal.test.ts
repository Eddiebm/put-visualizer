import { describe, it, expect, beforeEach, vi } from "vitest";

const ENV = {
  CLOUDFLARE_ACCOUNT_ID: "acct123",
  CLOUDFLARE_D1_DATABASE_ID: "db456",
  CLOUDFLARE_API_TOKEN: "token789",
  JOURNAL_ACCESS_KEY: "secret-key",
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

beforeEach(() => {
  vi.resetModules();
  vi.unstubAllGlobals();
});

describe("api/journal — not configured", () => {
  it("returns available:false when Cloudflare/access-key env vars are missing, on GET", async () => {
    setEnv({ JOURNAL_ACCESS_KEY: undefined });
    const { default: handler } = await import("./journal");
    const res = await handler(new Request("http://x/api/journal"));
    const body = await res.json();
    expect(body.available).toBe(false);
    expect(body.reason).toBe("not_configured");
  });
});

describe("api/journal — auth", () => {
  it("rejects a missing or wrong x-journal-key with 401", async () => {
    setEnv();
    const { default: handler } = await import("./journal");
    const res = await handler(new Request("http://x/api/journal", { headers: { "x-journal-key": "wrong" } }));
    expect(res.status).toBe(401);
  });
});

describe("api/journal — rate limiting", () => {
  it("returns 429 after RATE_LIMIT requests from the same client", async () => {
    setEnv();
    const { default: handler } = await import("./journal");
    const headers = { "x-forwarded-for": "9.9.9.9", "x-journal-key": "wrong" };
    let last;
    for (let i = 0; i < 61; i++) {
      last = await handler(new Request("http://x/api/journal", { headers }));
    }
    expect(last!.status).toBe(429);
  });
});

describe("api/journal — GET", () => {
  it("returns parsed entries from the D1 response", async () => {
    setEnv();
    const rows = [{ data: JSON.stringify({ id: "e1", status: "open", ticker: "AAPL" }) }];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(d1Response(rows)));
    const { default: handler } = await import("./journal");
    const res = await handler(new Request("http://x/api/journal", { headers: { "x-journal-key": "secret-key" } }));
    const body = await res.json();
    expect(body.available).toBe(true);
    expect(body.entries).toEqual([{ id: "e1", status: "open", ticker: "AAPL" }]);
  });
});

describe("api/journal — POST sync", () => {
  it("rejects a malformed body", async () => {
    setEnv();
    const { default: handler } = await import("./journal");
    const res = await handler(new Request("http://x/api/journal", {
      method: "POST",
      headers: { "x-journal-key": "secret-key", "content-type": "application/json" },
      body: JSON.stringify({ action: "sync", entries: "not-an-array" }),
    }));
    expect(res.status).toBe(400);
  });

  it("rejects an oversized payload without calling D1 at all", async () => {
    setEnv();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { default: handler } = await import("./journal");
    const entries = Array.from({ length: 5001 }, (_, i) => ({ id: String(i), status: "open" }));
    const res = await handler(new Request("http://x/api/journal", {
      method: "POST",
      headers: { "x-journal-key": "secret-key", "content-type": "application/json" },
      body: JSON.stringify({ action: "sync", entries }),
    }));
    expect(res.status).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("issues one upsert per entry followed by a DELETE...NOT IN", async () => {
    setEnv();
    const calls: any[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, opts: { body: string }) => {
      calls.push(JSON.parse(opts.body));
      return d1Response([]);
    }));
    const { default: handler } = await import("./journal");
    const entries = [
      { id: "e1", status: "open", ticker: "AAPL" },
      { id: "e2", status: "closed", ticker: "NVDA" },
    ];
    const res = await handler(new Request("http://x/api/journal", {
      method: "POST",
      headers: { "x-journal-key": "secret-key", "content-type": "application/json" },
      body: JSON.stringify({ action: "sync", entries }),
    }));
    const body = await res.json();
    expect(body.available).toBe(true);
    expect(body.count).toBe(2);

    // Upserts run before the delete — a failed upsert then leaves the old
    // rows in place instead of losing data (see the comment in journal.ts).
    expect(calls.length).toBe(3); // 2 upserts + 1 delete
    expect(calls[0].sql).toMatch(/INSERT INTO journal_entries/);
    expect(calls[0].sql).toMatch(/ON CONFLICT/);
    expect(calls[1].sql).toMatch(/INSERT INTO journal_entries/);
    expect(calls[1].sql).toMatch(/ON CONFLICT/);
    expect(calls[2].sql).toMatch(/DELETE FROM journal_entries WHERE id NOT IN/);
    expect(calls[2].params).toEqual(["e1", "e2"]);
  });

  it("upserts every entry across multiple concurrency batches, not just the first batch (regression)", async () => {
    // Upserts run in bounded-concurrency batches now instead of one D1
    // round-trip at a time, to avoid an edge-function timeout on a large
    // real journal. 30 entries spans two batches at the current batch size
    // (25) — this guards against an off-by-one that silently drops or
    // duplicates entries at a batch boundary.
    setEnv();
    const calls: any[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, opts: { body: string }) => {
      calls.push(JSON.parse(opts.body));
      return d1Response([]);
    }));
    const { default: handler } = await import("./journal");
    const entries = Array.from({ length: 30 }, (_, i) => ({ id: `e${i}`, status: "open", ticker: "AAPL" }));
    const res = await handler(new Request("http://x/api/journal", {
      method: "POST",
      headers: { "x-journal-key": "secret-key", "content-type": "application/json" },
      body: JSON.stringify({ action: "sync", entries }),
    }));
    const body = await res.json();
    expect(body.available).toBe(true);
    expect(body.count).toBe(30);

    const upserts = calls.filter((c) => /INSERT INTO journal_entries/.test(c.sql));
    const deletes = calls.filter((c) => /DELETE FROM journal_entries/.test(c.sql));
    expect(upserts).toHaveLength(30);
    expect(deletes).toHaveLength(1);
    const upsertedIds = upserts.map((c) => c.params[0]).sort();
    expect(upsertedIds).toEqual(entries.map((e) => e.id).sort());
  });

  it("deletes everything when synced with an empty array", async () => {
    setEnv();
    const calls: any[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, opts: { body: string }) => {
      calls.push(JSON.parse(opts.body));
      return d1Response([]);
    }));
    const { default: handler } = await import("./journal");
    const res = await handler(new Request("http://x/api/journal", {
      method: "POST",
      headers: { "x-journal-key": "secret-key", "content-type": "application/json" },
      body: JSON.stringify({ action: "sync", entries: [] }),
    }));
    expect(res.status).toBe(200);
    expect(calls[0].sql).toBe("DELETE FROM journal_entries");
    expect(calls[0].params).toEqual([]);
  });

  it("surfaces a D1 failure as available:true with an error, not a crash", async () => {
    setEnv();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false, status: 500, json: async () => ({ success: false, errors: [{ message: "boom" }] }),
    }));
    const { default: handler } = await import("./journal");
    const res = await handler(new Request("http://x/api/journal", {
      method: "POST",
      headers: { "x-journal-key": "secret-key", "content-type": "application/json" },
      body: JSON.stringify({ action: "sync", entries: [{ id: "e1", status: "open" }] }),
    }));
    const body = await res.json();
    expect(res.status).toBe(502);
    expect(body.available).toBe(true);
    expect(body.error).toMatch(/boom/);
  });
});
