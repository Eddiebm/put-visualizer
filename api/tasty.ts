export const config = { runtime: "edge" };

import { rejectOrigin, corsHeaders } from "./_cors";
import { rateLimit, clientKey, rateLimitResponse } from "./_rateLimit";
import type { TastyOrderPayload } from "../src/types";

const PROD_BASE = "https://api.tastyworks.com";
// Tastytrade's sandbox/certification environment — a separate system that
// resets every 24h (trades/positions/balances cleared, accounts kept),
// orders never reach a real market, and quotes are always 15-min delayed.
// See https://developer.tastytrade.com/sandbox/.
const CERT_BASE = "https://api.cert.tastyworks.com";

// Only ever returns one of the two constants above — never interpolates
// `env` into a URL — so an unexpected value just falls back to prod rather
// than opening any kind of base-URL injection surface.
function baseFor(env: TastyRequestBody["env"]): string {
  return env === "cert" ? CERT_BASE : PROD_BASE;
}

// General cap across every action on this endpoint (login, accounts,
// dry-run, place, refresh) — generous for real interactive use, tight
// enough to stop this being used as a relay to hammer tastytrade's live
// API. "auth" gets its own much tighter limit below: unlike the other
// actions it doesn't need a valid session token first, so it's the one
// realistic credential-stuffing surface here — this app would otherwise
// be a free proxy for guessing tastytrade logins.
const RATE_LIMIT = 30;
const AUTH_RATE_LIMIT = 5;
const RATE_WINDOW_MS = 5 * 60_000;

interface TastyRequestBody {
  action: "auth" | "accounts" | "dry-run" | "place" | "refresh";
  login?: string;
  password?: string;
  token?: string;
  accountNumber?: string;
  order?: TastyOrderPayload;
  rememberToken?: string;
  // "cert" = Tastytrade's sandbox (see CERT_BASE above); anything else,
  // including omitted, means prod — matches every request from before
  // this field existed.
  env?: "prod" | "cert";
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405, corsHeaders(req));

  // Reject requests from unauthorized origins (stops cross-site broker proxy abuse)
  const denied = rejectOrigin(req);
  if (denied) return denied;

  const ip = clientKey(req);
  const rl = rateLimit(ip, RATE_LIMIT, RATE_WINDOW_MS);
  if (!rl.allowed) return rateLimitResponse(rl, corsHeaders(req));

  let body: TastyRequestBody;
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }

  const { action } = body;

  if (action === "auth") {
    const authRl = rateLimit(`auth:${ip}`, AUTH_RATE_LIMIT, RATE_WINDOW_MS);
    if (!authRl.allowed) return rateLimitResponse(authRl, corsHeaders(req));
    return handleAuth(body);
  }
  if (action === "accounts")    return handleAccounts(body);
  if (action === "dry-run")     return handleOrder(body, true);
  if (action === "place")       return handleOrder(body, false);
  if (action === "refresh")     return handleRefresh(body);

  return json({ error: "unknown_action" }, 400);
}

async function handleAuth({ login, password, env }: TastyRequestBody): Promise<Response> {
  if (!login || !password) return json({ error: "login and password required" }, 400);
  if (login.length > 200 || password.length > 200) return json({ error: "invalid credentials" }, 400);

  const r = await fetch(`${baseFor(env)}/sessions`, {
    method: "POST",
    headers: { "content-type": "application/json", "accept": "application/json" },
    body: JSON.stringify({ login, password, "remember-me": true }),
  });

  const data = await r.json();
  if (!r.ok) {
    const msg = data?.error?.message ?? data?.errors?.[0]?.message ?? "Invalid credentials";
    return json({ error: msg }, 401);
  }

  const token = data?.data?.["session-token"];
  const remember = data?.data?.["remember-token"];
  if (!token) return json({ error: "No session token returned" }, 500);

  return json({ token, rememberToken: remember });
}

async function handleRefresh({ rememberToken, env }: TastyRequestBody): Promise<Response> {
  if (!rememberToken) return json({ error: "rememberToken required" }, 400);

  const r = await fetch(`${baseFor(env)}/sessions`, {
    method: "POST",
    headers: { "content-type": "application/json", "accept": "application/json" },
    body: JSON.stringify({ "remember-token": rememberToken }),
  });

  const data = await r.json();
  if (!r.ok) return json({ error: "Session expired — please log in again" }, 401);

  const token = data?.data?.["session-token"];
  const remember = data?.data?.["remember-token"];
  return json({ token, rememberToken: remember });
}

async function handleAccounts({ token, env }: TastyRequestBody): Promise<Response> {
  if (!token) return json({ error: "token required" }, 400);

  const r = await fetch(`${baseFor(env)}/customers/me/accounts`, {
    headers: { "Authorization": token, "accept": "application/json" },
  });

  if (r.status === 401) return json({ error: "session_expired" }, 401);
  if (!r.ok) return json({ error: "Failed to load accounts" }, 502);

  const data = await r.json();
  const items: any[] = data?.data?.items ?? [];

  const accounts = await Promise.all(items.map(async (item) => {
    const acct = item.account ?? item;
    const num = acct["account-number"];
    if (!num) return null;

    const balR = await fetch(`${baseFor(env)}/accounts/${num}/balances`, {
      headers: { "Authorization": token, "accept": "application/json" },
    });
    const balData = balR.ok ? await balR.json() : null;
    const bal = balData?.data;

    return {
      accountNumber: num,
      nickname: acct.nickname ?? acct["account-type-name"] ?? "Account",
      netLiq: parseFloat(bal?.["net-liquidating-value"] ?? 0),
      cashBalance: parseFloat(bal?.["cash-balance"] ?? 0),
      buyingPower: parseFloat(bal?.["derivative-buying-power"] ?? bal?.["equity-buying-power"] ?? 0),
    };
  }));

  return json({ accounts: accounts.filter(Boolean) });
}

async function handleOrder({ token, accountNumber, order, env }: TastyRequestBody, dryRun: boolean): Promise<Response> {
  if (!token || !accountNumber || !order) {
    return json({ error: "token, accountNumber, and order required" }, 400);
  }

  const endpoint = dryRun
    ? `${baseFor(env)}/accounts/${accountNumber}/orders/dry-run`
    : `${baseFor(env)}/accounts/${accountNumber}/orders`;

  const r = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Authorization": token,
      "content-type": "application/json",
      "accept": "application/json",
    },
    body: JSON.stringify(order),
  });

  const data = await r.json();
  if (r.status === 401) return json({ error: "session_expired" }, 401);
  if (!r.ok) {
    const msg = data?.error?.message ?? data?.errors?.[0]?.message ?? "Order rejected";
    return json({ error: msg, details: data?.errors ?? [] }, 400);
  }

  if (dryRun) {
    const result = data?.data;
    return json({
      ok: true,
      buyingPowerEffect: result?.["buying-power-effect"],
      feeCalculation: result?.["fee-calculation"],
      order: result?.order,
    });
  }

  return json({
    ok: true,
    orderId: data?.data?.order?.id,
    status: data?.data?.order?.status,
  });
}

function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...extra },
  });
}
