// Shared domain types used across src/lib, src/components, and App.tsx.
// Kept in one place because the same shapes (a journal entry, a strategy
// mode, a P&L model) get passed between nearly every module in this app.

export type Mode = "put" | "spread" | "strangle" | "covered";

export interface Company {
  ticker: string;
  name: string;
  price: number;
}

// A trade logged in the journal (open or closed). Optional fields reflect
// real variation in the data: older entries may be missing collateral or
// longStrike/longPrem (see src/lib/journal.js's handling of that), and
// closedAt/closePrice/realizedPnl only exist once a trade is closed.
export interface JournalEntry {
  id: string;
  openedAt: string; // ISO date
  mode: Mode;
  ticker: string;
  expiration: string; // ISO date
  putStrike: number;
  putPrem: number;
  longStrike?: number;
  longPrem?: number;
  callStrike?: number;
  callPrem?: number;
  spot?: number;
  contracts: number;
  credit: number;
  collateral?: number;
  status: "open" | "closed";
  closedAt?: string;
  closePrice?: number;
  realizedPnl?: number;
  // Multiplier of credit collected at which Journal flags a stop-loss —
  // e.g. 2 means "close if the loss exceeds 2x what was collected".
  // User-configurable at log time (see the "Stop-loss (× credit)" calculator
  // field); optional so older entries logged before this existed still work
  // — src/components/Journal.tsx falls back to 2 when it's missing.
  stopLossMultiplier?: number;
}

// The plain-object strategy description passed to stratPnl/buildModel —
// deliberately looser than JournalEntry (no id/status/dates) since it's
// built fresh from live calculator inputs, not read back from storage.
export interface StrategyParams {
  mode: Mode;
  putStrike: number;
  putPrem: number;
  longStrike?: number;
  longPrem?: number;
  callStrike?: number;
  callPrem?: number;
  spot?: number;
  shares: number;
  iv?: number | null;
  dte?: number;
  ticker?: string;
}

export interface ScenarioCard {
  key: string;
  title: string;
  sub: string;
  pnl: number | null;
  isWorst?: boolean;
  note: string;
}

// Return shape of buildModel() — the calculator's core output, consumed by
// Chart, Ticket, the stats row, and the journal.
export interface PnlModel {
  mode: Mode;
  credit: number;
  collateral: number;
  maxGain: number;
  samples: Array<[number, number]>;
  xMin: number;
  xMax: number;
  markers: Array<{ x: number; label: string }>;
  dots: Array<{ x: number; y: number | null }>;
  scenarios: ScenarioCard[];
  breakevens: number[];
  breakevenLabel: string;
  worstLabel: string;
  worstValue: string;
  down1Pnl: number;
  down2Pnl: number;
  upPnl: number;
  loseCondition: string | null;
  probProfit: number | null;
  hasIv: boolean;
  iv: number | null | undefined;
  dte: number | undefined;
  spot: number | undefined;
}

export interface Grade {
  label: string;
  color: string;
  bg: string;
}

export interface Richness {
  tag: "rich" | "cheap" | "fair";
  emoji: string;
  headline: string;
  detail: string;
}

export interface MarketCondition {
  emoji: string;
  label: string;
  color: string;
  summary: string;
  bg?: string;
}

// A daily price bar. `v` (volume) is required by technicals.js's indicators
// but not by the realized-vol calc in blackScholes.js, which only reads `c` —
// kept optional here so both call sites can share one type.
export interface Bar {
  t?: string;
  o?: number;
  h: number;
  l: number;
  c: number;
  v?: number;
}

export interface TastySession {
  token: string;
  rememberToken?: string;
  accountNumber: string;
  nickname: string;
  buyingPower: number;
  netLiq?: number;
}

export interface TastyOrderRequest {
  mode: Mode;
  ticker: string;
  expiration: string;
  putStrike: number;
  putPrem: number;
  longStrike?: number;
  longPrem?: number;
  callStrike?: number;
  callPrem?: number;
  contracts: number;
  credit: number;
}

export interface TastyLeg {
  "instrument-type": string;
  symbol: string;
  quantity: number;
  action: string;
}

export interface TastyOrderPayload {
  "order-type": string;
  price: string;
  "price-effect": string;
  "time-in-force": string;
  legs: TastyLeg[];
}

// One pass/warn/fail row in the "checks" lists shown under a pick (both the
// options-opportunity checks in score.js and the technical checks in
// technicals.js use this same shape).
export interface Check {
  key: string;
  label: string;
  detail?: string;
  pass?: boolean;
  warn?: boolean;
  warnLabel?: string;
  fail?: string;
  manual?: boolean;
}

export interface AssignmentSummary {
  shares: number;
  totalCost: number;
  costBasisPerShare: number;
  currentValue: number | null;
  gainLoss: number | null;
  hasSpot: boolean;
}

export interface WeekSummary {
  count: number;
  wins: JournalEntry[];
  losses: JournalEntry[];
  realized: number;
  worst: number;
  avgReturnPct: number | null;
}

// Result of technicals.js's analyzeStock() — Alex's scan.
export interface TechnicalAnalysis {
  sym: string;
  name: string;
  price: number;
  sma20: number | null;
  sma50: number | null;
  sma200: number | null;
  rsiVal: number | null;
  atrVal: number | null;
  volRatio: number | null;
  aboveSma20: boolean;
  aboveSma50: boolean;
  aboveSma200: boolean;
  pullbackPct: number | null;
  relStrength: number | null;
  return10: number | null;
  spyReturn10: number | null;
  stopPrice: number;
  targetPrice: number;
  stopDist: number;
  shares: number;
  posValue: number;
  riskAmount: number;
  canAfford: boolean;
  hasEarnings: boolean | null;
  earningsDate: string | null;
  score: number;
  grade: Grade;
}
