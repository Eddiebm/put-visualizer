import { describe, it, expect } from "vitest";
import { TICKER_META } from "./tickerMeta";
import { COMPANIES } from "../../src/appConstants";

describe("TICKER_META", () => {
  it("has an entry for every ticker in COMPANIES, so a watchlist change can't silently go unclassified", () => {
    const missing = COMPANIES.map((c) => c.ticker).filter((t) => !TICKER_META.has(t));
    expect(missing).toEqual([]);
  });

  it("doesn't carry stale entries for tickers no longer in COMPANIES", () => {
    const companySymbols = new Set(COMPANIES.map((c) => c.ticker));
    const stale = [...TICKER_META.keys()].filter((t) => !companySymbols.has(t));
    expect(stale).toEqual([]);
  });

  it("every entry has a non-empty sector and capTier", () => {
    for (const [sym, meta] of TICKER_META) {
      expect(meta.sector, `${sym} sector`).not.toBe("");
      expect(meta.capTier, `${sym} capTier`).not.toBe("");
    }
  });
});
