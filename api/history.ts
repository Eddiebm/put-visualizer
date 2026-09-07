export const config = { runtime: "edge" };

import { corsHeaders, rejectOrigin } from "./_cors";
import type { Bar } from "../src/types";

// Fetches daily bars for realized-vol computation (default ~35 trading days)
// or, with ?days=N, enough history for longer technical reads (e.g. SMA200).
// Cached for 1 hour — this data doesn't need to be fresh.
export default async function handler(req: Request): Promise<Response> {
  const ch = corsHeaders(req);
  const originRejection = rejectOrigin(req);
  if (originRejection) return originRejection;

  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get("symbol") || "").toUpperCase().replace(/[^A-Z.\-]/g, "");
  const days = Math.min(400, Math.max(10, parseInt(searchParams.get("days") || "40", 10) || 40));

  const id = process.env.ALPACA_KEY_ID;
  const secret = process.env.ALPACA_SECRET_KEY;
  if (!id || !secret) return json({ available: false, reason: "no_key" }, 200, ch);
  if (!symbol) return json({ error: "symbol required" }, 400, ch);

  // Trading days ≈ calendar days × 5/7, plus slack for holidays.
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - Math.round(days * 1.6 + 15));

  const url =
    `https://data.alpaca.markets/v2/stocks/${symbol}/bars` +
    `?timeframe=1Day&start=${start.toISOString().slice(0, 10)}&end=${end.toISOString().slice(0, 10)}&limit=${days}&feed=iex&adjustment=raw`;

  try {
    const r = await fetch(url, {
      headers: { "APCA-API-KEY-ID": id, "APCA-API-SECRET-KEY": secret },
    });
    if (!r.ok) return json({ available: false, status: r.status }, 200, ch);

    const data = await r.json();
    const bars: Bar[] = (data?.bars ?? [])
      .filter((b: { c: number }) => b.c > 0)
      .map((b: { t: string; o: number; h: number; l: number; c: number; v: number }) => ({ t: b.t, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v }));
    const closes = bars.map((b) => b.c);

    return json({ available: true, closes, bars }, 200, {
      "cache-control": "s-maxage=3600, stale-while-revalidate=7200",
      ...ch,
    });
  } catch {
    return json({ available: false }, 200, ch);
  }
}

function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...extra },
  });
}
