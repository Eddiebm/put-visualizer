// Shared constants and localStorage-loading helpers used across App.jsx and
// the components in src/components/. No React, but not fully "pure" either
// (loadInputs/loadJournal touch localStorage) — kept out of src/lib/ for
// that reason.

import type { Company, JournalEntry, Mode } from "./types";

export const STORAGE_KEY = "csp_visualizer_inputs_v1";
export const JOURNAL_KEY = "csp_journal_v1";
export const TOUR_KEY = "csp_tour_done_v1";

// Tastytrade talks to the LIVE production API (api.tastyworks.com) — there is
// no sandbox/paper mode. The acknowledgment below has to be re-confirmed on a
// schedule (not just once, ever) so it can't be forgotten after a long gap.
export const TASTY_LIVE_ACK_KEY = "tasty_live_ack_at";
export const TASTY_LIVE_ACK_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// Optional server-side backup of the journal (see api/journal.js). The key
// entered here must match JOURNAL_ACCESS_KEY on the server; without one set
// here, everything works exactly as before — localStorage only.
export const JOURNAL_SYNC_KEY_STORAGE = "journal_sync_key";

// Gates the three AI endpoints (chat, analyze, lesson) — all three proxy to
// the Anthropic API using a server-side key, and without this they're
// callable by anyone who finds the URL, at this app owner's expense. The
// key entered here must match AI_ACCESS_KEY on the server; until both are
// set, the AI features report unavailable rather than silently staying
// open (see the "not_configured" handling in each api/*.js file).
export const AI_ACCESS_KEY_STORAGE = "ai_access_key";

// Bundled snapshot prices — used instantly on selection and as the offline
// fallback when the live /api/quote endpoint is unreachable. Editable; the UI
// labels these clearly as approximate so they're never mistaken for live data.
export const SNAPSHOT_DATE = "Jun 27, 2026";
// 76 tickers as of the last expansion (41 -> 76) — see README's "Watchlist
// size" note for exactly why this isn't bigger: Today's picks and Alex's
// scan both call /api/history per ticker, and that endpoint's rate limit
// (api/history.ts, 200 requests/5min, shared across every scan that hits
// it) is the actual ceiling on how large this list can safely get without
// a caching/scheduled-scan redesign. Going meaningfully past ~100 needs
// that redesign first, not just more rows here.
export const COMPANIES: Company[] = [
  // ETFs (broad) — deepest options liquidity, no earnings risk
  { ticker: "SPY",  name: "S&P 500 ETF",       price: 580 },
  { ticker: "QQQ",  name: "Nasdaq 100 ETF",     price: 490 },
  { ticker: "IWM",  name: "Russell 2000 ETF",   price: 210 },
  { ticker: "GLD",  name: "Gold ETF",           price: 315 },
  { ticker: "EEM",  name: "Emerging Markets ETF", price: 42 },
  // ETFs (sector) — same liquidity/no-earnings-risk reasoning, broader coverage
  { ticker: "XLE",  name: "Energy Sector ETF",  price: 90 },
  { ticker: "XLF",  name: "Financials ETF",     price: 50 },
  { ticker: "XLK",  name: "Technology ETF",     price: 250 },
  { ticker: "XLI",  name: "Industrials ETF",    price: 150 },
  { ticker: "XLU",  name: "Utilities ETF",      price: 85 },
  { ticker: "XLV",  name: "Health Care ETF",    price: 145 },
  { ticker: "XLP",  name: "Consumer Staples ETF", price: 80 },
  { ticker: "XLY",  name: "Consumer Discretionary ETF", price: 225 },
  { ticker: "XLB",  name: "Materials ETF",      price: 95 },
  { ticker: "XLRE", name: "Real Estate ETF",    price: 42 },
  // Big Tech
  { ticker: "AAPL", name: "Apple",              price: 284 },
  { ticker: "MSFT", name: "Microsoft",          price: 373 },
  { ticker: "NVDA", name: "NVIDIA",             price: 193 },
  { ticker: "AMZN", name: "Amazon",             price: 233 },
  { ticker: "GOOGL", name: "Alphabet",          price: 337 },
  { ticker: "META", name: "Meta",               price: 550 },
  { ticker: "NFLX", name: "Netflix",            price: 1250 },
  { ticker: "CRM",  name: "Salesforce",         price: 320 },
  { ticker: "ORCL", name: "Oracle",             price: 180 },
  { ticker: "ADBE", name: "Adobe",              price: 450 },
  { ticker: "NOW",  name: "ServiceNow",         price: 950 },
  { ticker: "AVGO", name: "Broadcom",           price: 180 },
  { ticker: "QCOM", name: "Qualcomm",           price: 170 },
  { ticker: "TXN",  name: "Texas Instruments",  price: 200 },
  { ticker: "MU",   name: "Micron",             price: 110 },
  // Growth / High Vol
  { ticker: "TSLA", name: "Tesla",              price: 380 },
  { ticker: "AMD",  name: "AMD",                price: 170 },
  { ticker: "PLTR", name: "Palantir",           price: 113 },
  { ticker: "COIN", name: "Coinbase",           price: 280 },
  { ticker: "UBER", name: "Uber",               price: 90 },
  { ticker: "PYPL", name: "PayPal",             price: 75 },
  { ticker: "SNAP", name: "Snap",               price: 12 },
  // Industrials
  { ticker: "BA",   name: "Boeing",             price: 180 },
  { ticker: "CAT",  name: "Caterpillar",        price: 380 },
  { ticker: "HON",  name: "Honeywell",          price: 220 },
  { ticker: "GE",   name: "GE Aerospace",       price: 200 },
  { ticker: "UPS",  name: "UPS",                price: 130 },
  // Value / Income
  { ticker: "JPM",  name: "JPMorgan",           price: 329 },
  { ticker: "BAC",  name: "Bank of America",    price: 48 },
  { ticker: "GS",   name: "Goldman Sachs",      price: 650 },
  { ticker: "WFC",  name: "Wells Fargo",        price: 78 },
  { ticker: "MS",   name: "Morgan Stanley",     price: 135 },
  { ticker: "C",    name: "Citigroup",          price: 75 },
  { ticker: "AXP",  name: "American Express",   price: 300 },
  { ticker: "V",    name: "Visa",               price: 330 },
  { ticker: "MA",   name: "Mastercard",         price: 530 },
  { ticker: "KO",   name: "Coca-Cola",          price: 83 },
  { ticker: "MCD",  name: "McDonald's",         price: 325 },
  { ticker: "WMT",  name: "Walmart",            price: 98 },
  { ticker: "HD",   name: "Home Depot",         price: 410 },
  { ticker: "NKE",  name: "Nike",               price: 62 },
  { ticker: "PG",   name: "Procter & Gamble",   price: 165 },
  { ticker: "COST", name: "Costco",             price: 950 },
  { ticker: "PEP",  name: "PepsiCo",            price: 135 },
  { ticker: "DIS",  name: "Disney",             price: 110 },
  { ticker: "SBUX", name: "Starbucks",          price: 95 },
  // Energy
  { ticker: "XOM",  name: "ExxonMobil",         price: 118 },
  { ticker: "CVX",  name: "Chevron",            price: 155 },
  // Healthcare
  { ticker: "JNJ",  name: "Johnson & Johnson",  price: 165 },
  { ticker: "UNH",  name: "UnitedHealth",       price: 310 },
  { ticker: "PFE",  name: "Pfizer",             price: 24 },
  { ticker: "MRNA", name: "Moderna",            price: 38 },
  { ticker: "ABBV", name: "AbbVie",             price: 190 },
  { ticker: "LLY",  name: "Eli Lilly",          price: 800 },
  { ticker: "MRK",  name: "Merck",              price: 85 },
  { ticker: "TMO",  name: "Thermo Fisher",      price: 450 },
  { ticker: "GILD", name: "Gilead Sciences",    price: 110 },
  // Speculative / Small
  { ticker: "F",    name: "Ford",               price: 14 },
  { ticker: "SOFI", name: "SoFi",               price: 18 },
  { ticker: "T",    name: "AT&T",               price: 23 },
  { ticker: "INTC", name: "Intel",              price: 22 },
];

export interface ModeOption {
  key: Mode;
  label: string;
}

export const MODES: ModeOption[] = [
  { key: "put", label: "Cash-secured put" },
  { key: "spread", label: "Put credit spread" },
  { key: "strangle", label: "Short strangle" },
  { key: "covered", label: "Covered strangle" },
];

export interface Defaults {
  mode: Mode;
  strike: number;
  premium: number;
  longStrike: number;
  longPremium: number;
  callStrike: number;
  callPremium: number;
  spot: number;
  contracts: number;
  dropPct: number;
  capital: number;
  iv: number | null;
  stopLossMultiplier: number;
}

export const DEFAULTS: Defaults = {
  mode: "put",
  strike: 50,
  premium: 1.5,
  longStrike: 45,
  longPremium: 0.5,
  callStrike: 60,
  callPremium: 1.2,
  spot: 55,
  contracts: 2,
  dropPct: 20,
  capital: 500,
  iv: null,
  stopLossMultiplier: 2,
};

export function loadInputs(): Defaults {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw);
    return { ...DEFAULTS, ...parsed };
  } catch {
    return DEFAULTS;
  }
}

export function loadJournal(): JournalEntry[] {
  try {
    const raw = localStorage.getItem(JOURNAL_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
