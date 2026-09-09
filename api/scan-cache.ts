export const config = { runtime: "edge" };

import { corsHeaders, rejectOrigin } from "./_cors";
import { rateLimit, clientKey, rateLimitResponse } from "./_rateLimit";
import { d1CredsFromEnv, d1Query } from "./_d1";
import type { TechnicalAnalysis, MarketCondition } from "../src/types";

// Written by cron-scan.ts as a sentinel row alongside the real per-ticker
// results — see that file's own comment for why (avoids a second table or
// D1 round-trip just for the market-condition banner, which needs SPY's
// raw bars rather than a per-ticker TechnicalAnalysis).
const MARKET_CONDITION_KEY = "__MARKET_CONDITION__";

// Reads back what cron-scan.ts last wrote — one fast request instead of
// AlexScan.tsx (and, as a shortlist source, TodayView.tsx) doing one
// /api/history fetch per ticker themselves. Public read, no access key:
// this is a derived technical-scan cache over public market data, not
// personal data (unlike journal.ts's own D1 table, which does require
// one) — still rate-limited and origin-gated like every other public
// market-data proxy in this app (api/history.ts, api/quote.ts).
//
// {available:false} when D1 isn't configured, or when the cache is empty
// (cron-scan.ts has never successfully run) — both cases the caller
// (AlexScan.tsx, TodayView.tsx) already knows how to fall back from: scan
// COMPANIES live itself, exactly like before this cache existed. This
// endpoint is a pure optional accelerant, never a hard dependency.
const RATE_LIMIT = 200;
const RATE_WINDOW_MS = 5 * 60_000;

interface ScanCacheRow {
  ticker: string;
  data: string;
  scanned_at: string;
}

export default async function handler(req: Request): Promise<Response> {
  const ch = corsHeaders(req);
  const originRejection = rejectOrigin(req);
  if (originRejection) return originRejection;

  const rl = rateLimit(clientKey(req), RATE_LIMIT, RATE_WINDOW_MS);
  if (!rl.allowed) return rateLimitResponse(rl, ch);

  const d1 = d1CredsFromEnv();
  if (!d1) return json({ available: false, reason: "not_configured" }, 200, ch);

  try {
    const rows = (await d1Query(d1, "SELECT ticker, data, scanned_at FROM scan_cache")) as unknown as ScanCacheRow[];
    if (rows.length === 0) return json({ available: false, reason: "empty" }, 200, ch);

    const results: TechnicalAnalysis[] = [];
    let condition: MarketCondition | null = null;
    let scannedAt: string | null = null;
    for (const row of rows) {
      try {
        const parsed = JSON.parse(row.data);
        if (row.ticker === MARKET_CONDITION_KEY) condition = parsed;
        else results.push(parsed);
        if (!scannedAt || row.scanned_at > scannedAt) scannedAt = row.scanned_at;
      } catch {
        // One malformed row (shouldn't happen — cron-scan.ts is the only
        // writer) doesn't invalidate the rest of a real scan.
      }
    }
    if (results.length === 0) return json({ available: false, reason: "empty" }, 200, ch);

    return json({ available: true, results, condition, scannedAt }, 200, {
      "cache-control": "s-maxage=300, stale-while-revalidate=600",
      ...ch,
    });
  } catch (err) {
    return json({ available: false, error: err instanceof Error ? err.message : "cache read failed" }, 200, ch);
  }
}

function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...extra },
  });
}
