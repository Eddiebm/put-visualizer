import { describe, it, expect, beforeEach, vi } from "vitest";

const ENV = {
  ANTHROPIC_API_KEY: "anthropic-key",
  AI_ACCESS_KEY: "secret-ai-key",
};

function setEnv(overrides: Record<string, string | undefined> = {}) {
  const merged = { ...ENV, ...overrides };
  for (const k of Object.keys(ENV)) delete process.env[k];
  for (const [k, v] of Object.entries(merged)) {
    if (v !== undefined) process.env[k] = v;
  }
}

function anthropicResponse(text: string) {
  return { ok: true, json: async () => ({ content: [{ text }] }) };
}

const STOCKS = [{ sym: "AAPL", name: "Apple", price: 200, strike: 190 }];

function req(headers: Record<string, string> = {}, body: unknown = { stocks: STOCKS, capital: 5000 }) {
  return new Request("http://x/api/analyze", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetModules();
  vi.unstubAllGlobals();
});

describe("api/analyze — not configured", () => {
  it("returns available:false, reason:no_key when ANTHROPIC_API_KEY is missing", async () => {
    setEnv({ ANTHROPIC_API_KEY: undefined });
    const { default: handler } = await import("./analyze");
    const res = await handler(req());
    const body = await res.json();
    expect(body.available).toBe(false);
    expect(body.reason).toBe("no_key");
  });

  it("returns available:false, reason:not_configured when AI_ACCESS_KEY is missing", async () => {
    // Same proxy-abuse concern as api/chat.ts — see that test file's comment.
    setEnv({ AI_ACCESS_KEY: undefined });
    const { default: handler } = await import("./analyze");
    const res = await handler(req());
    const body = await res.json();
    expect(body.available).toBe(false);
    expect(body.reason).toBe("not_configured");
  });
});

describe("api/analyze — auth", () => {
  it("rejects a missing or wrong x-ai-key with 401", async () => {
    setEnv();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { default: handler } = await import("./analyze");
    const res = await handler(req({ "x-ai-key": "wrong" }));
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("allows a request with the correct x-ai-key through to Anthropic", async () => {
    setEnv();
    const payload = JSON.stringify({ verdicts: [{ sym: "AAPL", verdict: "FAVORABLE", reason: "r", flag: "f" }], caveat: "c" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(anthropicResponse(payload)));
    const { default: handler } = await import("./analyze");
    const res = await handler(req({ "x-ai-key": "secret-ai-key" }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.available).toBe(true);
    expect(body.verdicts[0].sym).toBe("AAPL");
  });
});
