export const config = { runtime: "edge" };

// Live share price. Prefers Alpaca (IEX feed) when ALPACA_KEY_ID /
// ALPACA_SECRET_KEY are set; otherwise falls back to Yahoo's keyless chart
// endpoint. The client further falls back to a bundled snapshot if neither is
// reachable (e.g. local `npm run dev`, which doesn't run this function).
export default async function handler(req) {
  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get("symbol") || "")
    .toUpperCase()
    .replace(/[^A-Z.\-]/g, "");

  if (!symbol) return json({ error: "symbol required" }, 400);

  const fromAlpaca = await alpacaQuote(symbol);
  if (fromAlpaca) return json(fromAlpaca, 200, CACHE);

  const fromYahoo = await yahooQuote(symbol);
  if (fromYahoo) return json(fromYahoo, 200, CACHE);

  return json({ error: "quote unavailable" }, 502);
}

async function alpacaQuote(symbol) {
  const id = process.env.ALPACA_KEY_ID;
  const secret = process.env.ALPACA_SECRET_KEY;
  if (!id || !secret) return null;
  try {
    const r = await fetch(
      `https://data.alpaca.markets/v2/stocks/${symbol}/trades/latest?feed=iex`,
      { headers: { "APCA-API-KEY-ID": id, "APCA-API-SECRET-KEY": secret } }
    );
    if (!r.ok) return null;
    const d = await r.json();
    const price = d?.trade?.p;
    if (!Number.isFinite(price) || price <= 0) return null;
    return { symbol, price, date: d?.trade?.t?.slice(0, 10), source: "alpaca" };
  } catch {
    return null;
  }
}

async function yahooQuote(symbol) {
  try {
    const r = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`,
      { headers: { "user-agent": "Mozilla/5.0", accept: "application/json" } }
    );
    if (!r.ok) return null;
    const d = await r.json();
    const meta = d?.chart?.result?.[0]?.meta;
    const price = meta?.regularMarketPrice;
    if (!Number.isFinite(price) || price <= 0) return null;
    const date = meta?.regularMarketTime
      ? new Date(meta.regularMarketTime * 1000).toISOString().slice(0, 10)
      : undefined;
    return { symbol, price, date, source: "yahoo" };
  } catch {
    return null;
  }
}

const CACHE = { "cache-control": "s-maxage=300, stale-while-revalidate=600" };

function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...extraHeaders },
  });
}
