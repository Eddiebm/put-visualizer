// Live Alpaca fetching — the one part of this backtest that needs real
// credentials and network access, kept isolated from engine.ts/stats.ts so
// those stay unit-testable without either.
//
// Deliberately calls Alpaca directly rather than going through
// api/history.ts: that endpoint caps `days` at 400 (a live-app design
// choice — every real caller only ever needs ~220 days), but a multi-year
// walk-forward backtest needs far more trailing history than any single
// live request does. Alpaca itself has no such cap.

import type { Bar } from "../../src/types";

export interface AlpacaCreds {
  keyId: string;
  secret: string;
}

export function credsFromEnv(): AlpacaCreds | null {
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

// Fetches up to `years` of daily bars for `symbol`, following Alpaca's
// page_token pagination until it's exhausted.
export async function fetchDailyBars(
  symbol: string,
  years: number,
  creds: AlpacaCreds
): Promise<Bar[]> {
  const end = new Date();
  const start = new Date();
  start.setFullYear(start.getFullYear() - years);

  const base =
    `https://data.alpaca.markets/v2/stocks/${encodeURIComponent(symbol)}/bars` +
    `?timeframe=1Day&start=${start.toISOString().slice(0, 10)}&end=${end.toISOString().slice(0, 10)}` +
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
      if (b.c > 0) bars.push({ t: b.t, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v });
    }
    if (!data.next_page_token) break;
    pageUrl = `${base}&page_token=${encodeURIComponent(data.next_page_token)}`;
  }
  return bars;
}
