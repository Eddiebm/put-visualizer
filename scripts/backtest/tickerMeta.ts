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
  XLK: { sector: "ETF", capTier: "etf" },
  XLI: { sector: "ETF", capTier: "etf" },
  XLU: { sector: "ETF", capTier: "etf" },
  XLV: { sector: "ETF", capTier: "etf" },
  XLP: { sector: "ETF", capTier: "etf" },
  XLY: { sector: "ETF", capTier: "etf" },
  XLB: { sector: "ETF", capTier: "etf" },
  XLRE: { sector: "ETF", capTier: "etf" },

  // Big Tech
  AAPL: { sector: "Technology", capTier: "mega" },
  MSFT: { sector: "Technology", capTier: "mega" },
  NVDA: { sector: "Technology", capTier: "mega" },
  AMZN: { sector: "Consumer Discretionary", capTier: "mega" },
  GOOGL: { sector: "Communication Services", capTier: "mega" },
  META: { sector: "Communication Services", capTier: "mega" },
  NFLX: { sector: "Communication Services", capTier: "mega" },
  CRM: { sector: "Technology", capTier: "large" },
  ORCL: { sector: "Technology", capTier: "mega" },
  ADBE: { sector: "Technology", capTier: "large" },
  NOW: { sector: "Technology", capTier: "large" },
  AVGO: { sector: "Technology", capTier: "mega" },
  QCOM: { sector: "Technology", capTier: "large" },
  TXN: { sector: "Technology", capTier: "large" },
  MU: { sector: "Technology", capTier: "large" },

  // Growth / High Vol
  TSLA: { sector: "Consumer Discretionary", capTier: "mega" },
  AMD: { sector: "Technology", capTier: "large" },
  PLTR: { sector: "Technology", capTier: "large" },
  COIN: { sector: "Financials", capTier: "mid" },
  UBER: { sector: "Industrials", capTier: "large" },
  PYPL: { sector: "Financials", capTier: "large" },
  SNAP: { sector: "Communication Services", capTier: "mid" },

  // Industrials
  BA: { sector: "Industrials", capTier: "large" },
  CAT: { sector: "Industrials", capTier: "large" },
  HON: { sector: "Industrials", capTier: "large" },
  GE: { sector: "Industrials", capTier: "large" },
  UPS: { sector: "Industrials", capTier: "large" },

  // Value / Income
  JPM: { sector: "Financials", capTier: "mega" },
  BAC: { sector: "Financials", capTier: "mega" },
  GS: { sector: "Financials", capTier: "large" },
  WFC: { sector: "Financials", capTier: "large" },
  MS: { sector: "Financials", capTier: "large" },
  C: { sector: "Financials", capTier: "large" },
  AXP: { sector: "Financials", capTier: "large" },
  V: { sector: "Financials", capTier: "mega" },
  MA: { sector: "Financials", capTier: "mega" },
  KO: { sector: "Consumer Staples", capTier: "mega" },
  MCD: { sector: "Consumer Discretionary", capTier: "mega" },
  WMT: { sector: "Consumer Staples", capTier: "mega" },
  HD: { sector: "Consumer Discretionary", capTier: "mega" },
  NKE: { sector: "Consumer Discretionary", capTier: "large" },
  PG: { sector: "Consumer Staples", capTier: "mega" },
  COST: { sector: "Consumer Staples", capTier: "mega" },
  PEP: { sector: "Consumer Staples", capTier: "mega" },
  DIS: { sector: "Communication Services", capTier: "large" },
  SBUX: { sector: "Consumer Discretionary", capTier: "large" },
  TGT: { sector: "Consumer Discretionary", capTier: "large" },
  LOW: { sector: "Consumer Discretionary", capTier: "mega" },
  YUM: { sector: "Consumer Discretionary", capTier: "large" },
  CMCSA: { sector: "Communication Services", capTier: "mega" },
  TMUS: { sector: "Communication Services", capTier: "mega" },

  // Financials (more)
  SCHW: { sector: "Financials", capTier: "large" },
  BLK: { sector: "Financials", capTier: "mega" },

  // Industrials (more)
  LMT: { sector: "Industrials", capTier: "large" },
  DE: { sector: "Industrials", capTier: "large" },

  // Materials
  FCX: { sector: "Materials", capTier: "large" },
  NEM: { sector: "Materials", capTier: "large" },

  // Real Estate
  O: { sector: "Real Estate", capTier: "large" },
  PLD: { sector: "Real Estate", capTier: "large" },
  SPG: { sector: "Real Estate", capTier: "large" },

  // Utilities
  NEE: { sector: "Utilities", capTier: "mega" },
  DUK: { sector: "Utilities", capTier: "large" },
  SO: { sector: "Utilities", capTier: "large" },

  // Energy
  XOM: { sector: "Energy", capTier: "mega" },
  CVX: { sector: "Energy", capTier: "mega" },

  // Healthcare
  JNJ: { sector: "Healthcare", capTier: "mega" },
  UNH: { sector: "Healthcare", capTier: "mega" },
  PFE: { sector: "Healthcare", capTier: "large" },
  MRNA: { sector: "Healthcare", capTier: "mid" },
  ABBV: { sector: "Healthcare", capTier: "mega" },
  LLY: { sector: "Healthcare", capTier: "mega" },
  MRK: { sector: "Healthcare", capTier: "large" },
  TMO: { sector: "Healthcare", capTier: "large" },
  GILD: { sector: "Healthcare", capTier: "large" },
  BMY: { sector: "Healthcare", capTier: "large" },
  CVS: { sector: "Healthcare", capTier: "large" },

  // Speculative / Small
  F: { sector: "Consumer Discretionary", capTier: "mid" },
  SOFI: { sector: "Financials", capTier: "mid" },
  T: { sector: "Communication Services", capTier: "large" },
  INTC: { sector: "Technology", capTier: "large" },
};

export const TICKER_META: Map<string, TickerMeta> = new Map(Object.entries(RAW));
