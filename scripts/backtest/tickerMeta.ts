// Sector and rough market-cap tier for every ticker in COMPANIES
// (src/appConstants.ts) — used only to stratify backtest results after the
// fact (see stats.ts's bucketBySector/bucketByCapTier), never fed into
// analyzeStock() itself, so it can't influence the score being tested.
//
// Hand-classified from general knowledge, not pulled from a live data
// source — capTier especially is a rough bucket, not a precise or current
// market cap (several of these names, particularly the smaller/more
// volatile ones, have moved between tiers over the years this backtest
// covers). Good enough for "does the effect look different in tech vs
// financials, or in mega-caps vs mid-caps" — not a claim of precision.
// tickerMeta.test.ts asserts every COMPANIES ticker has an entry here, so
// this can't silently go stale (missing entries) if the watchlist changes
// without this file being updated too.

import type { TickerMeta } from "./stats";

const RAW: Record<string, TickerMeta> = {
  // ETFs — not individual companies, so sector/cap-tier don't really apply;
  // tagged distinctly rather than force-fit into a stock sector.
  SPY: { sector: "ETF", capTier: "etf" },
  QQQ: { sector: "ETF", capTier: "etf" },
  IWM: { sector: "ETF", capTier: "etf" },
  GLD: { sector: "ETF", capTier: "etf" },
  EEM: { sector: "ETF", capTier: "etf" },
  XLE: { sector: "ETF", capTier: "etf" },
  XLF: { sector: "ETF", capTier: "etf" },

  // Big Tech
  AAPL: { sector: "Technology", capTier: "mega" },
  MSFT: { sector: "Technology", capTier: "mega" },
  NVDA: { sector: "Technology", capTier: "mega" },
  AMZN: { sector: "Consumer Discretionary", capTier: "mega" },
  GOOGL: { sector: "Communication Services", capTier: "mega" },
  META: { sector: "Communication Services", capTier: "mega" },
  NFLX: { sector: "Communication Services", capTier: "mega" },
  CRM: { sector: "Technology", capTier: "large" },

  // Growth / High Vol
  TSLA: { sector: "Consumer Discretionary", capTier: "mega" },
  AMD: { sector: "Technology", capTier: "large" },
  PLTR: { sector: "Technology", capTier: "large" },
  COIN: { sector: "Financials", capTier: "mid" },
  UBER: { sector: "Industrials", capTier: "large" },
  PYPL: { sector: "Financials", capTier: "large" },
  SNAP: { sector: "Communication Services", capTier: "mid" },

  // Value / Income
  JPM: { sector: "Financials", capTier: "mega" },
  BAC: { sector: "Financials", capTier: "mega" },
  GS: { sector: "Financials", capTier: "large" },
  WFC: { sector: "Financials", capTier: "large" },
  KO: { sector: "Consumer Staples", capTier: "mega" },
  MCD: { sector: "Consumer Discretionary", capTier: "mega" },
  WMT: { sector: "Consumer Staples", capTier: "mega" },
  HD: { sector: "Consumer Discretionary", capTier: "mega" },
  NKE: { sector: "Consumer Discretionary", capTier: "large" },

  // Energy
  XOM: { sector: "Energy", capTier: "mega" },
  CVX: { sector: "Energy", capTier: "mega" },

  // Healthcare
  JNJ: { sector: "Healthcare", capTier: "mega" },
  UNH: { sector: "Healthcare", capTier: "mega" },
  PFE: { sector: "Healthcare", capTier: "large" },
  MRNA: { sector: "Healthcare", capTier: "mid" },

  // Speculative / Small
  F: { sector: "Consumer Discretionary", capTier: "mid" },
  SOFI: { sector: "Financials", capTier: "mid" },
  T: { sector: "Communication Services", capTier: "large" },
  INTC: { sector: "Technology", capTier: "large" },
};

export const TICKER_META: Map<string, TickerMeta> = new Map(Object.entries(RAW));
