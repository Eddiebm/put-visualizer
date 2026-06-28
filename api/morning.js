export const config = { runtime: "edge" };

// International indices + VIX via Yahoo Finance (no key needed)
// Economic calendar via Finnhub (existing key)
// SPY gap via Alpaca (existing key)

const INDICES = [
  { key: "nikkei",   yf: "%5EN225",  label: "Nikkei",    region: "Asia" },
  { key: "hangseng", yf: "%5EHSI",   label: "Hang Seng", region: "Asia" },
  { key: "dax",      yf: "%5EGDAXI", label: "DAX",       region: "Europe" },
  { key: "ftse",     yf: "%5EFTSE",  label: "FTSE 100",  region: "Europe" },
  { key: "futures",  yf: "ES%3DF",   label: "S&P Futures", region: "US" },
  { key: "vix",      yf: "%5EVIX",   label: "VIX",       region: "US" },
];

export default async function handler(req) {
  const today = new Date().toISOString().slice(0, 10);

  const [markets, calendar, spyGap] = await Promise.all([
    fetchMarkets(),
    fetchCalendar(today),
    fetchSpyGap(),
  ]);

  return json({ markets, calendar, spyGap }, 200, {
    "cache-control": "s-maxage=300, stale-while-revalidate=600",
  });
}

async function fetchMarkets() {
  try {
    const syms = INDICES.map(i => i.yf).join(",");
    const r = await fetch(
      `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${syms}`,
      { headers: { "User-Agent": "Mozilla/5.0", "Accept": "application/json" } }
    );
    if (!r.ok) return null;
    const data = await r.json();
    const results = data?.quoteResponse?.result ?? [];

    return INDICES.map(({ key, yf, label, region }) => {
      const decoded = decodeURIComponent(yf);
      const q = results.find(r => r.symbol === decoded);
      return {
        key, label, region,
        price:     q?.regularMarketPrice ?? null,
        changePct: q?.regularMarketChangePercent ?? null,
        available: !!q,
      };
    });
  } catch {
    return null;
  }
}

async function fetchCalendar(today) {
  const token = process.env.FINNHUB_API_KEY;
  if (!token) return [];
  try {
    const r = await fetch(
      `https://finnhub.io/api/v1/calendar/economic?from=${today}&to=${today}&token=${token}`
    );
    if (!r.ok) return [];
    const data = await r.json();
    return (data?.economicCalendar ?? [])
      .filter(e => e.country === "US" && (e.impact === "high" || e.impact === "medium"))
      .map(e => ({ event: e.event, time: e.time, impact: e.impact }));
  } catch {
    return [];
  }
}

async function fetchSpyGap() {
  const id     = process.env.ALPACA_KEY_ID;
  const secret = process.env.ALPACA_SECRET_KEY;
  if (!id || !secret) return null;
  try {
    const r = await fetch(
      "https://data.alpaca.markets/v2/stocks/SPY/bars?timeframe=1Day&limit=2&feed=iex&adjustment=raw",
      { headers: { "APCA-API-KEY-ID": id, "APCA-API-SECRET-KEY": secret } }
    );
    if (!r.ok) return null;
    const data = await r.json();
    const bars = data?.bars ?? [];
    if (bars.length < 2) return null;
    const prev  = bars[bars.length - 2].c;
    const today = bars[bars.length - 1].o;
    return { prev, open: today, gapPct: ((today - prev) / prev) * 100 };
  } catch {
    return null;
  }
}

function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...extra },
  });
}
