export const config = { runtime: "edge" };

// Fetches ~35 daily closing prices for realized-vol computation.
// Cached for 1 hour — this data doesn't need to be fresh.
export default async function handler(req) {
  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get("symbol") || "").toUpperCase().replace(/[^A-Z.\-]/g, "");

  const id = process.env.ALPACA_KEY_ID;
  const secret = process.env.ALPACA_SECRET_KEY;
  if (!id || !secret) return json({ available: false, reason: "no_key" });
  if (!symbol) return json({ error: "symbol required" }, 400);

  // ~55 calendar days back gives 35+ trading days
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 55);

  const url =
    `https://data.alpaca.markets/v2/stocks/${symbol}/bars` +
    `?timeframe=1Day&start=${start.toISOString().slice(0, 10)}&end=${end.toISOString().slice(0, 10)}&limit=40&feed=iex&adjustment=raw`;

  try {
    const r = await fetch(url, {
      headers: { "APCA-API-KEY-ID": id, "APCA-API-SECRET-KEY": secret },
    });
    if (!r.ok) return json({ available: false, status: r.status });

    const data = await r.json();
    const closes = (data?.bars ?? []).map((b) => b.c).filter((c) => c > 0);

    return json({ available: true, closes }, 200, {
      "cache-control": "s-maxage=3600, stale-while-revalidate=7200",
    });
  } catch {
    return json({ available: false });
  }
}

function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...extra },
  });
}
