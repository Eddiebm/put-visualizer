import { describe, it, expect } from "vitest";
import { COMPANIES } from "./appConstants";

describe("COMPANIES", () => {
  it("has no duplicate tickers", () => {
    const tickers = COMPANIES.map((c) => c.ticker);
    expect(new Set(tickers).size).toBe(tickers.length);
  });

  it("every entry has a positive snapshot price", () => {
    for (const c of COMPANIES) {
      expect(c.price, `${c.ticker} price`).toBeGreaterThan(0);
    }
  });

  // Guardrail, not an arbitrary number — see README's "Watchlist size" note.
  // Today's picks and Alex's scan both call /api/history once per ticker,
  // and both can run inside the same 5-minute rate-limit window
  // (api/history.ts, 200 requests/5min, shared across every caller of that
  // endpoint), so the two scans' combined /api/history calls are roughly
  // 2 * COMPANIES.length + 1 (the +1 is Alex's scan's own SPY fetch). This
  // test fails loudly if that math would exceed the limit, rather than
  // letting the watchlist silently grow past a size the live app can
  // actually serve without 429s — a real architecture change (a
  // scheduled/cached pre-scan) is required to go bigger than this, not
  // just more rows in COMPANIES.
  it("stays small enough that Today's picks + Alex's scan together can't exceed /api/history's rate limit in one window", () => {
    const HISTORY_RATE_LIMIT = 200; // must match api/history.ts's RATE_LIMIT
    const worstCaseHistoryCalls = 2 * COMPANIES.length + 1;
    expect(worstCaseHistoryCalls).toBeLessThan(HISTORY_RATE_LIMIT);
  });
});
