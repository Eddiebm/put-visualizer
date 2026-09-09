// Shared Alpaca daily-bars fetch for Edge functions. Files starting with _
// are not routed by Vercel.
//
// A near-duplicate of history.ts's own inline fetch — extracted here for
// cron-scan.ts, which needs the exact same URL/header shape looped over
// many tickers instead of one per request. Left history.ts's own copy
// alone rather than forcing it onto this shared helper: it's already
// shipped and tested, and its {available:false, status} shape on a
// non-2xx differs slightly from this helper's "just return null" contract
// (a scheduled scan over many tickers wants "skip this one," not a status
// code per ticker) — not worth the risk of touching working code to save
// one duplicated URL string.

import type { Bar } from "../src/types";

export interface AlpacaCreds {
  id: string;
  secret: string;
}

export function alpacaCredsFromEnv(): AlpacaCreds | null {
  const id = process.env.ALPACA_KEY_ID;
  const secret = process.env.ALPACA_SECRET_KEY;
  return id && secret ? { id, secret } : null;
}

// Returns null on ANY failure (network error, non-2xx, empty body) rather
// than throwing — a scheduled scan over many tickers wants to skip a bad
// symbol and keep going, not abort the whole run.
export async function fetchAlpacaBars(symbol: string, days: number, creds: AlpacaCreds): Promise<Bar[] | null> {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - Math.round(days * 1.6 + 15));

  const url =
    `https://data.alpaca.markets/v2/stocks/${symbol}/bars` +
    `?timeframe=1Day&start=${start.toISOString().slice(0, 10)}&end=${end.toISOString().slice(0, 10)}&limit=${days}&feed=iex&adjustment=raw`;

  try {
    const r = await fetch(url, {
      headers: { "APCA-API-KEY-ID": creds.id, "APCA-API-SECRET-KEY": creds.secret },
    });
    if (!r.ok) return null;
    const data = await r.json();
    const bars: Bar[] = (data?.bars ?? [])
      .filter((b: { c: number }) => b.c > 0)
      .map((b: { t: string; o: number; h: number; l: number; c: number; v: number }) => ({ t: b.t, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v }));
    return bars;
  } catch {
    return null;
  }
}
