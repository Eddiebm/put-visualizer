export const config = { runtime: "edge" };

import { corsHeaders, rejectOrigin } from "./_cors";
import { rateLimit, clientKey, rateLimitResponse } from "./_rateLimit";

// See api/quote.ts — same reasoning. Called once per page load, not per
// symbol, so this limit is a generous backstop.
const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 5 * 60_000;

// ─── Symbol map — one Yahoo Finance batch call covers everything ──────────────
interface YfEntry {
  sym: string;
  label: string;
  group: string;
  region?: string;
  geoRisk?: boolean;
}

const YF: Record<string, YfEntry> = {
  // International
  nikkei:   { sym: "%5EN225",  label: "Nikkei",       group: "intl",      region: "Asia"   },
  hangseng: { sym: "%5EHSI",   label: "Hang Seng",    group: "intl",      region: "Asia"   },
  dax:      { sym: "%5EGDAXI", label: "DAX",          group: "intl",      region: "Europe" },
  ftse:     { sym: "%5EFTSE",  label: "FTSE 100",     group: "intl",      region: "Europe" },
  futures:  { sym: "ES%3DF",   label: "S&P Futures",  group: "intl",      region: "US"     },
  // Fear gauge
  vix:      { sym: "%5EVIX",   label: "VIX",          group: "vix"    },
  // Major US indexes
  sp500:    { sym: "%5EGSPC",  label: "S&P 500",      group: "index"  },
  nasdaq:   { sym: "%5EIXIC",  label: "Nasdaq",       group: "index"  },
  russell:  { sym: "%5ERUT",   label: "Russell 2000", group: "index"  },
  dow:      { sym: "%5EDJI",   label: "Dow Jones",    group: "index"  },
  // Bonds & Dollar
  yield10:  { sym: "%5ETNX",   label: "10yr Yield",   group: "bonds"  },
  dollar:   { sym: "DX-Y.NYB", label: "Dollar",       group: "bonds"  },
  tlt:      { sym: "TLT",      label: "Long Bonds",   group: "bonds"  },
  // Sector ETFs
  xlk:      { sym: "XLK",      label: "Tech",         group: "sector" },
  xlf:      { sym: "XLF",      label: "Banks",        group: "sector" },
  xle:      { sym: "XLE",      label: "Energy",       group: "sector" },
  xlu:      { sym: "XLU",      label: "Utilities",    group: "sector" },
  xlv:      { sym: "XLV",      label: "Healthcare",   group: "sector" },
  // Commodities
  oil:      { sym: "CL%3DF",   label: "Oil",          group: "commodity", geoRisk: true },
  gold:     { sym: "GC%3DF",   label: "Gold",         group: "commodity", geoRisk: true },
  natgas:   { sym: "NG%3DF",   label: "Natural Gas",  group: "commodity", geoRisk: true },
  wheat:    { sym: "ZW%3DF",   label: "Wheat",        group: "commodity", geoRisk: true },
};

// High-impact macro events that BLOCK trading
const BLOCK_TERMS = [
  "non-farm", "nonfarm", "payroll",
  "consumer price index", "cpi m/m", "cpi y/y", "core cpi",
  "pce", "personal consumption",
  "gdp", "gross domestic",
  "fomc", "federal reserve", "fed funds rate", "interest rate decision", "rate decision",
  "ppi m/m", "ppi y/y", "core ppi", "producer price",
];

// Medium-impact events that WARN
const WARN_TERMS = [
  "jobless claims", "initial claims", "continuing claims",
  "adp nonfarm", "adp employment",
  "jolts", "job openings",
  "ism manufacturing", "ism services", "ism non-manufacturing",
  "pmi", "purchasing managers",
  "retail sales",
  "consumer confidence", "consumer sentiment", "michigan",
  "durable goods",
  "housing starts", "building permits", "existing home",
  "industrial production", "capacity utilization",
  "trade balance", "current account",
  "unemployment rate",
];

// Our full watchlist for earnings detection
const WATCHLIST = [
  "SPY","QQQ","IWM","GLD","EEM","XLE","XLF",
  "AAPL","MSFT","NVDA","AMZN","GOOGL","META","NFLX","CRM",
  "TSLA","AMD","PLTR","COIN","UBER","PYPL","SNAP",
  "JPM","BAC","GS","WFC","KO","MCD","WMT","HD","NKE",
  "XOM","CVX","JNJ","UNH","PFE","MRNA","F","SOFI","T","INTC",
];

interface MarketQuote {
  key: string;
  label: string;
  group: string;
  region: string | null;
  geoRisk: boolean;
  price: number | null;
  changePct: number | null;
  change: number | null;
  available: boolean;
}

interface CalendarEvent {
  event: string;
  date: string;
  time: string | null;
  impact: unknown;
  actual: unknown;
  estimate: unknown;
  prev: unknown;
  severity: "block" | "warn" | "info";
}

interface EarningsWeekEntry {
  sym: string;
  date: string;
  hour: string | null;
}

interface SpyGap {
  prev: number;
  open: number;
  gapPct: number;
}

export default async function handler(req: Request): Promise<Response> {
  const ch = corsHeaders(req);
  const originRejection = rejectOrigin(req);
  if (originRejection) return originRejection;

  const rl = rateLimit(clientKey(req), RATE_LIMIT, RATE_WINDOW_MS);
  if (!rl.allowed) return rateLimitResponse(rl, ch);

  const today   = new Date().toISOString().slice(0, 10);
  const weekOut = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

  const [markets, calendar, earnings, spyGap] = await Promise.all([
    fetchAllMarkets(),
    fetchCalendar(today, weekOut),
    fetchEarningsWeek(today, weekOut),
    fetchSpyGap(),
  ]);

  return json({ markets, calendar, earnings, spyGap }, 200, {
    "cache-control": "s-maxage=300, stale-while-revalidate=600",
    ...ch,
  });
}

// ─── Yahoo Finance — single batch call ────────────────────────────────────────

async function fetchAllMarkets(): Promise<MarketQuote[] | null> {
  try {
    const syms = Object.values(YF).map(v => v.sym).join(",");
    const r = await fetch(
      `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${syms}`,
      { headers: { "User-Agent": "Mozilla/5.0", "Accept": "application/json" } }
    );
    if (!r.ok) return null;
    const data    = await r.json();
    const results: Array<Record<string, unknown>> = data?.quoteResponse?.result ?? [];

    const out: Record<string, MarketQuote> = {};
    for (const [key, meta] of Object.entries(YF)) {
      const decoded = decodeURIComponent(meta.sym);
      const q = results.find(r => r.symbol === decoded);
      out[key] = {
        key,
        label:     meta.label,
        group:     meta.group,
        region:    meta.region  ?? null,
        geoRisk:   meta.geoRisk ?? false,
        price:     (q?.regularMarketPrice as number)        ?? null,
        changePct: (q?.regularMarketChangePercent as number) ?? null,
        change:    (q?.regularMarketChange as number)        ?? null,
        available: !!q,
      };
    }
    return Object.values(out);
  } catch {
    return null;
  }
}

// ─── Finnhub economic calendar ────────────────────────────────────────────────

function classifyEvent(name: string | undefined): "block" | "warn" | "info" {
  const n = (name || "").toLowerCase();
  if (BLOCK_TERMS.some(t => n.includes(t))) return "block";
  if (WARN_TERMS.some(t => n.includes(t)))  return "warn";
  return "info";
}

async function fetchCalendar(from: string, to: string): Promise<{ today: CalendarEvent[]; week: CalendarEvent[] }> {
  const token = process.env.FINNHUB_API_KEY;
  if (!token) return { today: [], week: [] };
  try {
    const r = await fetch(
      `https://finnhub.io/api/v1/calendar/economic?from=${from}&to=${to}&token=${token}`
    );
    if (!r.ok) return { today: [], week: [] };
    const data   = await r.json();
    const events: CalendarEvent[] = (data?.economicCalendar ?? [])
      .filter((e: { country: string }) => e.country === "US")
      .map((e: { event: string; time?: string; impact: unknown; actual?: unknown; estimate?: unknown; prev?: unknown }) => ({
        event:    e.event,
        date:     e.time?.slice(0, 10) ?? from,
        time:     e.time?.slice(11, 16) ?? null,
        impact:   e.impact,
        actual:   e.actual   ?? null,
        estimate: e.estimate ?? null,
        prev:     e.prev     ?? null,
        severity: classifyEvent(e.event),
      }));

    const todayEvents = events.filter(e => e.date === from);
    const weekEvents  = events.filter(e => e.date > from)
      .filter(e => e.severity !== "info")
      .slice(0, 12);

    return { today: todayEvents, week: weekEvents };
  } catch {
    return { today: [], week: [] };
  }
}

// ─── Finnhub earnings calendar ────────────────────────────────────────────────

async function fetchEarningsWeek(from: string, to: string): Promise<EarningsWeekEntry[]> {
  const token = process.env.FINNHUB_API_KEY;
  if (!token) return [];
  try {
    const r = await fetch(
      `https://finnhub.io/api/v1/calendar/earnings?from=${from}&to=${to}&token=${token}`
    );
    if (!r.ok) return [];
    const data = await r.json();
    return (data?.earningsCalendar ?? [])
      .filter((e: { symbol: string }) => WATCHLIST.includes(e.symbol))
      .map((e: { symbol: string; date: string; hour: string | null }) => ({ sym: e.symbol, date: e.date, hour: e.hour }))
      .sort((a: EarningsWeekEntry, b: EarningsWeekEntry) => a.date.localeCompare(b.date));
  } catch {
    return [];
  }
}

// ─── Alpaca — SPY open gap ────────────────────────────────────────────────────

async function fetchSpyGap(): Promise<SpyGap | null> {
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
    const bars: Array<{ c: number; o: number }> = data?.bars ?? [];
    if (bars.length < 2) return null;
    const prev = bars[bars.length - 2].c;
    const open = bars[bars.length - 1].o;
    return { prev, open, gapPct: ((open - prev) / prev) * 100 };
  } catch {
    return null;
  }
}

function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...extra },
  });
}
