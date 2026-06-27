export const config = { runtime: "edge" };

// Real put-option premium from Alpaca's options market data (indicative feed,
// ~15-min delayed on the free tier). Given an underlying, an expiration date,
// and a target strike, it returns the put whose strike is closest to the
// target, priced at the bid/ask midpoint (falling back to the last trade).
//
// If no Alpaca key is configured it returns { available: false } so the client
// can keep the premium as a manual input instead of surfacing an error.
export default async function handler(req) {
  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get("symbol") || "").toUpperCase().replace(/[^A-Z.\-]/g, "");
  const expiration = (searchParams.get("expiration") || "").replace(/[^0-9\-]/g, "");
  const targetStrike = parseFloat(searchParams.get("strike"));

  const id = process.env.ALPACA_KEY_ID;
  const secret = process.env.ALPACA_SECRET_KEY;
  if (!id || !secret) {
    return json({ available: false, reason: "no_key" }, 200);
  }
  if (!symbol || !/^\d{4}-\d{2}-\d{2}$/.test(expiration) || !Number.isFinite(targetStrike)) {
    return json({ error: "symbol, expiration (YYYY-MM-DD) and strike are required" }, 400);
  }

  try {
    const url =
      `https://data.alpaca.markets/v1beta1/options/snapshots/${symbol}` +
      `?feed=indicative&type=put&expiration_date=${expiration}&limit=1000`;
    const r = await fetch(url, {
      headers: { "APCA-API-KEY-ID": id, "APCA-API-SECRET-KEY": secret },
    });
    if (!r.ok) return json({ error: "options data unavailable", status: r.status }, 502);

    const data = await r.json();
    const snapshots = data?.snapshots || {};

    let best = null;
    for (const [occ, snap] of Object.entries(snapshots)) {
      const strike = strikeFromOcc(occ);
      if (!Number.isFinite(strike)) continue;
      const dist = Math.abs(strike - targetStrike);
      if (!best || dist < best.dist) best = { occ, strike, snap, dist };
    }

    if (!best) return json({ error: "no put contracts for that expiration" }, 404);

    const bid = best.snap?.latestQuote?.bp;
    const ask = best.snap?.latestQuote?.ap;
    const last = best.snap?.latestTrade?.p;
    const mid = Number.isFinite(bid) && Number.isFinite(ask) && (bid > 0 || ask > 0)
      ? (bid + ask) / 2
      : null;
    const premium = Number.isFinite(mid) ? mid : Number.isFinite(last) ? last : null;

    if (!Number.isFinite(premium) || premium <= 0) {
      return json({ error: "no priced quote for the nearest contract" }, 404);
    }

    return json(
      {
        available: true,
        symbol,
        expiration,
        contract: best.occ,
        strike: best.strike,
        requestedStrike: targetStrike,
        premium,
        bid: Number.isFinite(bid) ? bid : null,
        ask: Number.isFinite(ask) ? ask : null,
        source: "alpaca",
      },
      200,
      { "cache-control": "s-maxage=120, stale-while-revalidate=300" }
    );
  } catch {
    return json({ error: "options data unavailable" }, 502);
  }
}

// OCC option symbol: ROOT + YYMMDD + C/P + strike*1000 (8 digits).
// e.g. "AAPL250117P00200000" -> strike 200.
function strikeFromOcc(occ) {
  const m = /[A-Z]+\d{6}[CP](\d{8})$/.exec(occ);
  if (!m) return NaN;
  return parseInt(m[1], 10) / 1000;
}

function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...extraHeaders },
  });
}
