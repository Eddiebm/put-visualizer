// Live data fetching for the backtest — the only parts of this harness that
// need real credentials and network access, kept isolated from
// engine.ts/stats.ts so those stay unit-testable without either. Each
// provider's raw-record -> Bar mapping is a separate, pure, exported
// function so it can be unit tested (dataSource.test.ts) without mocking
// fetch — only the fetch/pagination wrapper itself is untestable offline.
//
// Two providers, deliberately not going through this app's own
// api/history.ts: that endpoint caps `days` at 400 (a live-app design
// choice — every real caller only ever needs ~220 days), but a multi-year
// walk-forward backtest needs far more trailing history than any single
// live request does.
//
// See scripts/backtest/norgateSource.ts for a third, file-based source —
// Norgate Data has no REST API at all (see that file's docstring), so it
// can't live here alongside two real HTTP fetchers.

import type { Bar } from "../../src/types";

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// ─── Alpaca ─────────────────────────────────────────────────────────────

export interface AlpacaCreds {
  keyId: string;
  secret: string;
}

export function alpacaCredsFromEnv(): AlpacaCreds | null {
  const keyId = process.env.ALPACA_KEY_ID;
  const secret = process.env.ALPACA_SECRET_KEY;
  if (!keyId || !secret) return null;
  return { keyId, secret };
}

interface AlpacaBarRaw {
  t: string;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

interface AlpacaBarsResponse {
  bars?: AlpacaBarRaw[];
  next_page_token?: string | null;
}

export function mapAlpacaBar(b: AlpacaBarRaw): Bar {
  return { t: b.t, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v };
}

// Fetches up to `years` of daily bars for `symbol`, following Alpaca's
// page_token pagination until it's exhausted. Uses `adjustment=raw`
// (unadjusted prices) — the same setting api/history.ts uses live, so a
// backtest run against Alpaca stays consistent with what the app itself
// would have shown a user that day. (Tiingo's fetcher below uses adjusted
// prices instead — see its own docstring for why that's the more
// defensible default for a from-scratch backtest, and don't average
// results across the two sources without accounting for that difference.)
export async function fetchDailyBarsAlpaca(
  symbol: string,
  years: number,
  creds: AlpacaCreds
): Promise<Bar[]> {
  const end = new Date();
  const start = new Date();
  start.setFullYear(start.getFullYear() - years);

  const base =
    `https://data.alpaca.markets/v2/stocks/${encodeURIComponent(symbol)}/bars` +
    `?timeframe=1Day&start=${isoDate(start)}&end=${isoDate(end)}` +
    `&limit=10000&feed=iex&adjustment=raw`;

  const bars: Bar[] = [];
  let pageUrl = base;
  for (let page = 0; page < 50; page++) {
    // 50-page hard stop — at 10,000 bars/page that's 500,000 bars, far more
    // than any realistic request; guards against an infinite loop if
    // Alpaca ever echoed a page token back forever.
    const r = await fetch(pageUrl, {
      headers: { "APCA-API-KEY-ID": creds.keyId, "APCA-API-SECRET-KEY": creds.secret },
    });
    if (!r.ok) throw new Error(`Alpaca ${symbol}: HTTP ${r.status}`);
    const data: AlpacaBarsResponse = await r.json();
    for (const b of data.bars ?? []) {
      if (b.c > 0) bars.push(mapAlpacaBar(b));
    }
    if (!data.next_page_token) break;
    pageUrl = `${base}&page_token=${encodeURIComponent(data.next_page_token)}`;
  }
  return bars;
}

// ─── Tiingo ─────────────────────────────────────────────────────────────
// Free up to 50 symbols/hour, and — for a ticker Tiingo has covered a long
// time — far deeper history than Alpaca's free IEX feed, which has no
// trade data before 2016-01-01. See README.md's "Backtesting Alex's scan"
// section for the fuller comparison of sources.

export function tiingoKeyFromEnv(): string | null {
  return process.env.TIINGO_API_KEY || null;
}

interface TiingoPriceRaw {
  date: string;
  close: number;
  high: number;
  low: number;
  open: number;
  volume: number;
  adjClose: number | null;
  adjHigh: number | null;
  adjLow: number | null;
  adjOpen: number | null;
  adjVolume: number | null;
}

// Uses Tiingo's split/dividend-adjusted OHLC (adjClose etc.) rather than
// raw — a stock's raw historical price series has discontinuities at every
// split (a 4:1 split makes the close look like it dropped 75% overnight),
// which would show up to analyzeStock() as a fake, enormous single-day
// move. Adjusted prices are the correct choice for a from-scratch
// backtest; Alpaca's fetcher above uses raw only because that's what the
// live app already does (see its own docstring) — don't mix the two
// without accounting for the difference.
export function mapTiingoBar(p: TiingoPriceRaw): Bar | null {
  const c = p.adjClose ?? p.close;
  if (!(c > 0)) return null;
  return {
    t: new Date(p.date).toISOString(),
    o: p.adjOpen ?? p.open,
    h: p.adjHigh ?? p.high,
    l: p.adjLow ?? p.low,
    c,
    v: p.adjVolume ?? p.volume,
  };
}

export async function fetchDailyBarsTiingo(
  symbol: string,
  years: number,
  apiKey: string
): Promise<Bar[]> {
  const end = new Date();
  const start = new Date();
  start.setFullYear(start.getFullYear() - years);

  const url =
    `https://api.tiingo.com/tiingo/daily/${encodeURIComponent(symbol)}/prices` +
    `?startDate=${isoDate(start)}&endDate=${isoDate(end)}&format=json&resampleFreq=daily`;

  const r = await fetch(url, {
    headers: { Authorization: `Token ${apiKey}`, "content-type": "application/json" },
  });
  if (!r.ok) throw new Error(`Tiingo ${symbol}: HTTP ${r.status}`);
  const data: TiingoPriceRaw[] = await r.json();
  const bars: Bar[] = [];
  for (const p of data) {
    const bar = mapTiingoBar(p);
    if (bar) bars.push(bar);
  }
  return bars;
}
