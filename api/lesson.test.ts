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

function req(headers: Record<string, string> = {}, body: unknown = { dayNumber: 0, topicIndex: 0 }) {
  return new Request("http://x/api/lesson", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetModules();
  vi.unstubAllGlobals();
});

describe("api/lesson — not configured", () => {
  it("returns available:false, reason:no_key when ANTHROPIC_API_KEY is missing", async () => {
    setEnv({ ANTHROPIC_API_KEY: undefined });
    const { default: handler } = await import("./lesson");
    const res = await handler(req());
    const body = await res.json();
    expect(body.available).toBe(false);
    expect(body.reason).toBe("no_key");
  });

  it("returns available:false, reason:not_configured when AI_ACCESS_KEY is missing", async () => {
    // api/lesson.ts previously had no auth or origin gating at all — see
    // api/chat.ts's comment for the underlying proxy-abuse concern this
    // guards against.
    setEnv({ AI_ACCESS_KEY: undefined });
    const { default: handler } = await import("./lesson");
    const res = await handler(req());
    const body = await res.json();
    expect(body.available).toBe(false);
    expect(body.reason).toBe("not_configured");
  });
});

describe("api/lesson — auth", () => {
  it("rejects a missing or wrong x-ai-key with 401", async () => {
    setEnv();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { default: handler } = await import("./lesson");
    const res = await handler(req({ "x-ai-key": "wrong" }));
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a non-POST method", async () => {
    setEnv();
    const { default: handler } = await import("./lesson");
    const res = await handler(new Request("http://x/api/lesson", { method: "GET" }));
    expect(res.status).toBe(405);
  });

  it("allows a request with the correct x-ai-key through to Anthropic", async () => {
    setEnv();
    const payload = JSON.stringify({
      what: "w", analogy: "a", todayExample: "t", whyItMatters: "y",
      mistakeToAvoid: "m", watchTomorrow: "wt", jargon: [],
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(anthropicResponse(payload)));
    const { default: handler } = await import("./lesson");
    const res = await handler(req({ "x-ai-key": "secret-ai-key" }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.what).toBe("w");
  });
});

describe("api/lesson — rate limiting", () => {
  it("returns 429 after RATE_LIMIT requests from the same client", async () => {
    setEnv();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { default: handler } = await import("./lesson");
    const headers = { "x-forwarded-for": "9.9.9.9", "x-ai-key": "wrong" };
    let last;
    for (let i = 0; i < 11; i++) last = await handler(req(headers));
    expect(last!.status).toBe(429);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
