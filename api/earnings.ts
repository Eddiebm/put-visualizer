export const config = { runtime: "edge" };

import { corsHeaders, rejectOrigin } from "./_cors";
import { rateLimit, clientKey, rateLimitResponse } from "./_rateLimit";

// See api/quote.ts — same reasoning. Bulk mode covers the whole watchlist
// in one call, so real usage is a handful of calls per scan, not per
// symbol — this limit is mostly just a backstop.
const RATE_LIMIT = 60;
const RATE_WINDOW_MS = 5 * 60_000;

interface EarningsEvent {
  symbol: string;
  date: string;
  hour?: string | null;
}

// Bulk mode (no symbol): returns earningsMap covering all companies in the date range.
// One call per scan regardless of how many stocks we check — avoids rate limits.
// Single-symbol mode kept for direct lookups.
export default async function handler(req: Request): Promise<Response> {
  const ch = corsHeaders(req);
  const originRejection = rejectOrigin(req);
  if (originRejection) return originRejection;

  const rl = rateLimit(clientKey(req), RATE_LIMIT, RATE_WINDOW_MS);
  if (!rl.allowed) return rateLimitResponse(rl, ch);

  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get("symbol") || "").toUpperCase().replace(/[^A-Z.\-]/g, "");
  const expiration = (searchParams.get("expiration") || "").replace(/[^0-9\-]/g, "");

  const token = process.env.FINNHUB_API_KEY;
  if (!token) return json({ available: false, reason: "no_key" }, 200, ch);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expiration)) {
    return json({ error: "expiration (YYYY-MM-DD) required" }, 400, ch);
  }

  const today = new Date().toISOString().slice(0, 10);

  try {
    // Always fetch the full calendar — filter by symbol client-side.
    // This is one call no matter how many stocks we scan.
    const url = symbol
      ? `https://finnhub.io/api/v1/calendar/earnings?from=${today}&to=${expiration}&symbol=${symbol}&token=${token}`
      : `https://finnhub.io/api/v1/calendar/earnings?from=${today}&to=${expiration}&token=${token}`;

    const r = await fetch(url);
    if (!r.ok) return json({ available: false, status: r.status }, 200, ch);

    const data = await r.json();
    const events: EarningsEvent[] = data?.earningsCalendar ?? [];

    if (symbol) {
      const hit = events.find(e => e.symbol === symbol && e.date >= today && e.date <= expiration);
      return json(
        { available: true, hasEarnings: !!hit, date: hit?.date ?? null, hour: hit?.hour ?? null },
        200,
        { "cache-control": "s-maxage=3600, stale-while-revalidate=7200", ...ch }
      );
    }

    // Bulk: build a map keyed by ticker
    const earningsMap: Record<string, { hasEarnings: true; date: string; hour?: string | null }> = {};
    for (const e of events) {
      if (!e.symbol || e.date < today || e.date > expiration) continue;
      if (!earningsMap[e.symbol]) {
        earningsMap[e.symbol] = { hasEarnings: true, date: e.date, hour: e.hour };
      }
    }

    return json(
      { available: true, earningsMap },
      200,
      { "cache-control": "s-maxage=3600, stale-while-revalidate=7200", ...ch }
    );
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
