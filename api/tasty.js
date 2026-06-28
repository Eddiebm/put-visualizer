export const config = { runtime: "edge" };

const BASE = "https://api.tastyworks.com";

export default async function handler(req) {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let body;
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }

  const { action } = body;

  if (action === "auth")        return handleAuth(body);
  if (action === "accounts")    return handleAccounts(body);
  if (action === "dry-run")     return handleOrder(body, true);
  if (action === "place")       return handleOrder(body, false);
  if (action === "refresh")     return handleRefresh(body);

  return json({ error: "unknown_action" }, 400);
}

async function handleAuth({ login, password }) {
  if (!login || !password) return json({ error: "login and password required" }, 400);

  const r = await fetch(`${BASE}/sessions`, {
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

async function handleRefresh({ rememberToken }) {
  if (!rememberToken) return json({ error: "rememberToken required" }, 400);

  const r = await fetch(`${BASE}/sessions`, {
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

async function handleAccounts({ token }) {
  if (!token) return json({ error: "token required" }, 400);

  const r = await fetch(`${BASE}/customers/me/accounts`, {
    headers: { "Authorization": token, "accept": "application/json" },
  });

  if (r.status === 401) return json({ error: "session_expired" }, 401);
  if (!r.ok) return json({ error: "Failed to load accounts" }, 502);

  const data = await r.json();
  const items = data?.data?.items ?? [];

  const accounts = await Promise.all(items.map(async (item) => {
    const acct = item.account ?? item;
    const num = acct["account-number"];
    if (!num) return null;

    const balR = await fetch(`${BASE}/accounts/${num}/balances`, {
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

async function handleOrder({ token, accountNumber, order }, dryRun) {
  if (!token || !accountNumber || !order) {
    return json({ error: "token, accountNumber, and order required" }, 400);
  }

  const endpoint = dryRun
    ? `${BASE}/accounts/${accountNumber}/orders/dry-run`
    : `${BASE}/accounts/${accountNumber}/orders`;

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

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
