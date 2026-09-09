export const config = { runtime: "edge" };

import { corsHeaders, rejectOrigin } from "./_cors";
import { timingSafeEqual } from "./_auth";
import { d1CredsFromEnv, d1Query, type D1Creds } from "./_d1";
import { alpacaCredsFromEnv, fetchAlpacaBars, type AlpacaCreds } from "./_alpacaBars";
import { analyzeStock, technicalMarketCondition } from "../src/lib/technicals";
import { COMPANIES } from "../src/appConstants";
import { targetExpiration } from "../src/lib/dates";

// Stored as a sentinel row in the same scan_cache table (ticker
// "__MARKET_CONDITION__") rather than a second table — the market
// condition banner (technicalMarketCondition) needs SPY's raw bars, which
// this endpoint already fetches for relStrength; recomputing it once here
// and caching the result means AlexScan.tsx doesn't need its own separate
// endpoint or a second D1 round-trip just for one banner. scan-cache.ts
// pulls this row out of the results array before returning it.
const MARKET_CONDITION_KEY = "__MARKET_CONDITION__";

// Scheduled (Vercel Cron) full-universe technical scan — Tier 1 of the
// two-tier scan design (see README's "Scanning beyond the live-fetch
// ceiling" section). Alex's scan can afford to be a few hours stale — it's
// a daily-bar technical read (SMA/RSI/trend), not live pricing — so this
// endpoint does the expensive part (one fetch per ticker) on a schedule
// instead of per page visit, and writes results to D1 for
// api/scan-cache.ts to serve back instantly. Today's picks stays fully
// live; see TodayView.tsx's own comment for why this cache is only used
// there as a candidate shortlist, never a price source.
//
// Watchlist: CRON_WATCHLIST (comma-separated tickers, optional env var) if
// set, else every ticker in COMPANIES (src/appConstants.ts). Deliberately
// NOT hardcoded to "the S&P 500" or any other named index — this project
// has no way to verify real, current index-membership data from inside
// this environment, and shipping a stale or wrong list under that name
// would be exactly the kind of unearned claim the rest of this app tries
// hard not to make (see README's "Backtesting this app's buy/sell
// signals" section for the same principle applied elsewhere). Point
// CRON_WATCHLIST at a real, maintained ticker list if you want broader
// coverage than COMPANIES.
//
// capital is fixed at $5,000 for every ticker here, not per-viewer — there
// is no "the current user" in a scheduled job. That number feeds into a
// small (5-point-of-100) canAfford component of Alex's scan's score
// (src/lib/technicals.ts), so the cached score's canAfford slice reflects
// a $5,000 hypothetical account, not any specific real viewer's — a real,
// if minor, accuracy gap worth naming rather than silently accepting.
//
// Auth: requires CRON_SECRET, checked against the `Authorization: Bearer`
// header Vercel Cron sends automatically once CRON_SECRET is configured
// (see Vercel's cron-job docs on securing cron jobs). Without CRON_SECRET
// set, this endpoint refuses to run at all — never an open, unauthenticated
// trigger for an expensive scan loop.
//
// NOT verified against a live deployment from this environment — no
// Vercel Cron, Alpaca, Finnhub, or D1 credentials are available here to
// test an actual scheduled run end to end (same caveat api/journal.ts's
// own D1 code carries). Test a real invocation (POST with the right
// bearer token) after deploying, before trusting this in production.

const SCAN_DAYS = 220; // enough trailing history for a real sma200 read
const CHUNK_SIZE = 10; // concurrent Alpaca requests per batch — bounds connection fan-out; does not itself pace against Alpaca's account-level rate limit, see README

interface ScanEnv {
  alpaca: AlpacaCreds;
  d1: D1Creds;
  cronSecret: string;
}

function loadEnv(): ScanEnv | null {
  const alpaca = alpacaCredsFromEnv();
  const d1 = d1CredsFromEnv();
  const cronSecret = process.env.CRON_SECRET;
  if (!alpaca || !d1 || !cronSecret) return null;
  return { alpaca, d1, cronSecret };
}

function resolveWatchlist(): string[] {
  const raw = process.env.CRON_WATCHLIST;
  if (raw && raw.trim()) {
    return [...new Set(raw.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean))];
  }
  return COMPANIES.map((c) => c.ticker);
}

async function fetchEarningsMap(expiration: string): Promise<Record<string, { date: string }> | null> {
  const token = process.env.FINNHUB_API_KEY;
  if (!token) return null;
  const today = new Date().toISOString().slice(0, 10);
  try {
    const r = await fetch(`https://finnhub.io/api/v1/calendar/earnings?from=${today}&to=${expiration}&token=${token}`);
    if (!r.ok) return null;
    const data = await r.json();
    const events: Array<{ symbol: string; date: string }> = data?.earningsCalendar ?? [];
    const map: Record<string, { date: string }> = {};
    for (const e of events) {
      if (!e.symbol || e.date < today || e.date > expiration) continue;
      if (!map[e.symbol]) map[e.symbol] = { date: e.date };
    }
    return map;
  } catch {
    return null;
  }
}

export default async function handler(req: Request): Promise<Response> {
  const ch = corsHeaders(req);
  const originRejection = rejectOrigin(req);
  if (originRejection) return originRejection;

  const env = loadEnv();
  if (!env) return json({ available: false, reason: "not_configured" }, 200, ch);

  const providedAuth = req.headers.get("authorization") ?? "";
  if (!(await timingSafeEqual(providedAuth, `Bearer ${env.cronSecret}`))) {
    return json({ error: "unauthorized" }, 401, ch);
  }

  const tickers = resolveWatchlist();
  const nameByTicker = new Map(COMPANIES.map((c) => [c.ticker, c.name]));
  const exp30 = targetExpiration(30);
  const earningsMap = await fetchEarningsMap(exp30);
  const spyBars = await fetchAlpacaBars("SPY", SCAN_DAYS, env.alpaca);

  const results: { ticker: string; analysis: unknown }[] = [];
  const failedTickers: string[] = [];

  for (let i = 0; i < tickers.length; i += CHUNK_SIZE) {
    const chunk = tickers.slice(i, i + CHUNK_SIZE);
    const chunkResults = await Promise.all(
      chunk.map(async (sym) => {
        const bars = await fetchAlpacaBars(sym, SCAN_DAYS, env.alpaca);
        if (!bars || bars.length < 50) return { sym, analysis: null };
        const entry = earningsMap?.[sym];
        const analysis = analyzeStock({
          sym,
          name: nameByTicker.get(sym) ?? sym, // a CRON_WATCHLIST ticker beyond COMPANIES has no known display name
          bars,
          capital: 5000, // fixed, shared across every ticker — see module docstring
          hasEarnings: entry ? true : earningsMap ? false : null,
          earningsDate: entry?.date ?? null,
          spyBars: spyBars ?? undefined,
        });
        return { sym, analysis };
      })
    );
    for (const r of chunkResults) {
      if (r.analysis) results.push({ ticker: r.sym, analysis: r.analysis });
      else failedTickers.push(r.sym);
    }
  }

  // "scanned" in the response means real tickers, not this sentinel row —
  // captured before pushing it so the count reported back stays accurate.
  const scannedCount = results.length;

  const condition = technicalMarketCondition(spyBars);
  if (condition) results.push({ ticker: MARKET_CONDITION_KEY, analysis: condition });

  if (results.length === 0) {
    return json({ available: true, scanned: 0, failed: failedTickers.length }, 200, ch);
  }

  try {
    const now = new Date().toISOString();
    const UPSERT_BATCH_SIZE = 25; // same batching rationale as journal.ts's own upsert loop
    for (let i = 0; i < results.length; i += UPSERT_BATCH_SIZE) {
      const batch = results.slice(i, i + UPSERT_BATCH_SIZE);
      const sql = ["BEGIN TRANSACTION;"];
      const params: unknown[] = [];
      for (const r of batch) {
        sql.push(
          "INSERT INTO scan_cache (ticker, data, scanned_at) VALUES (?, ?, ?) " +
            "ON CONFLICT(ticker) DO UPDATE SET data = excluded.data, scanned_at = excluded.scanned_at;"
        );
        params.push(r.ticker, JSON.stringify(r.analysis), now);
      }
      sql.push("COMMIT;");
      await d1Query(env.d1, sql.join(" "), params);
    }

    // Drop cached rows for tickers no longer in the current watchlist, so
    // a shrunk CRON_WATCHLIST/COMPANIES doesn't leave stale entries
    // showing up in scan-cache.ts's reads forever.
    const scannedTickers = results.map((r) => r.ticker);
    const placeholders = scannedTickers.map(() => "?").join(",");
    await d1Query(env.d1, `DELETE FROM scan_cache WHERE ticker NOT IN (${placeholders})`, scannedTickers);

    return json({ available: true, scanned: scannedCount, failed: failedTickers.length }, 200, ch);
  } catch (err) {
    return json({ available: true, error: err instanceof Error ? err.message : "cache write failed" }, 502, ch);
  }
}

function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...extra },
  });
}
