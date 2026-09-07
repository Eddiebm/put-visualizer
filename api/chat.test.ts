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

function req(headers: Record<string, string> = {}, body: unknown = { messages: [{ role: "user", content: "hi" }] }) {
  return new Request("http://x/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetModules();
  vi.unstubAllGlobals();
});

describe("api/chat — not configured", () => {
  it("returns available:false, reason:no_key when ANTHROPIC_API_KEY is missing", async () => {
    setEnv({ ANTHROPIC_API_KEY: undefined });
    const { default: handler } = await import("./chat");
    const res = await handler(req());
    const body = await res.json();
    expect(body.available).toBe(false);
    expect(body.reason).toBe("no_key");
  });

  it("returns available:false, reason:not_configured when AI_ACCESS_KEY is missing", async () => {
    // This is the vulnerability this test guards against: without an
    // AI_ACCESS_KEY requirement, the endpoint would proxy to Anthropic on
    // this app's own key for anyone who finds the URL. Staying unavailable
    // by default (rather than open) until an owner sets AI_ACCESS_KEY is
    // the fix.
    setEnv({ AI_ACCESS_KEY: undefined });
    const { default: handler } = await import("./chat");
    const res = await handler(req());
    const body = await res.json();
    expect(body.available).toBe(false);
    expect(body.reason).toBe("not_configured");
  });
});

describe("api/chat — auth", () => {
  it("rejects a missing or wrong x-ai-key with 401", async () => {
    setEnv();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { default: handler } = await import("./chat");
    const res = await handler(req({ "x-ai-key": "wrong" }));
    expect(res.status).toBe(401);
    // A rejected request must never reach the Anthropic API.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("allows a request with the correct x-ai-key through to Anthropic", async () => {
    setEnv();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(anthropicResponse("Here's the answer.")));
    const { default: handler } = await import("./chat");
    const res = await handler(req({ "x-ai-key": "secret-ai-key" }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.reply).toBe("Here's the answer.");
  });
});
