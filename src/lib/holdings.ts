// ─── Holdings — tracking shares you already own ────────────────────────────
// Everything else in this app is about selling options (puts, spreads,
// strangles). This is the one place that answers two different questions:
// "should I buy this stock" and "I already own this stock — when should I
// sell it?" Independent, honest reads, not one black-box answer:
//   1. `entryVerdict`      — a plain trend/momentum read for a NEW position
//      (mirrors `technicalVerdict`, aimed the other direction)
//   2. `ruleVerdict`       — the % take-profit/stop-loss target you set yourself
//   3. `technicalVerdict`  — a plain trend/momentum read for an EXISTING one
//   4. `consensusVerdict`  — what happens when #2 and #3 agree, or don't
// None of this is a guarantee. A stop-loss % is a number you chose, not a
// law of markets; a technical read can be wrong. Two honest opinions that
// happen to agree are still just two opinions.

import type { Bar } from "../types";
import { sma, rsi } from "./technicals";

// Every verdict below carries two parallel explanations, not one: `reason`
// is the plain-English one-liner ("past your 10% stop-loss"); `detail` is
// the same read in analyst terms — the actual price, SMA, and RSI values
// and the exact thresholds compared, not just the conclusion. Neither is
// the "real" one; showing both is the point — a verdict you can't audit
// down to the numbers behind it isn't rigorous, it's just an opinion in a
// colored box.

export type Verdict = "sell" | "watch" | "hold";

export interface RuleVerdict {
  verdict: Verdict;
  reason: string;
  detail: string;
}

export type EntryVerdict = "buy" | "wait" | "avoid";

export interface EntryRead {
  verdict: EntryVerdict;
  reason: string;
  detail: string;
}

// RSI zone label, shared by the technical-read detail strings below.
function rsiZone(rsiVal: number | null): string {
  if (rsiVal == null) return "unavailable";
  if (rsiVal >= 75) return "hot / extended";
  if (rsiVal >= 70) return "overbought";
  if (rsiVal <= 30) return "oversold";
  return "neutral";
}

function smaDetail(label: string, value: number | null, price: number, minBars: number, barCount: number): string {
  if (value == null) return `${label} unavailable (needs ${minBars} trading days, have ${barCount})`;
  return `${label} $${value.toFixed(2)} — price is ${price > value ? "above" : price < value ? "below" : "at"} it`;
}

// The buy-side mirror of `technicalVerdict`: same building blocks (SMA50,
// SMA200, RSI), aimed at a different question. `technicalVerdict` asks "has
// the trend broken for a position I hold" — cautious, biased toward "hold"
// unless something is confirmed wrong. This asks "is the trend confirmed
// good enough to start a NEW position" — the bar is higher, on purpose:
// "unconfirmed" (no 200-day average yet, or above the 50-day but not the
// 200-day) is a fine reason to keep holding something you already own, but
// a poor reason to buy something you don't.
export function entryVerdict(bars: Bar[] | null | undefined): EntryRead {
  if (!bars || bars.length < 50) {
    const have = bars?.length ?? 0;
    return {
      verdict: "wait",
      reason: "Not enough price history yet for a read.",
      detail: `Only ${have} trading day${have === 1 ? "" : "s"} of history available; need at least 50 for a 50-day average, the minimum this read requires.`,
    };
  }
  const closes = bars.map((b) => b.c);
  const price = closes[closes.length - 1];
  const sma20 = sma(closes, 20);
  const sma50 = sma(closes, 50);
  const sma200 = bars.length >= 200 ? sma(closes, 200) : null;
  const rsiVal = rsi(closes, 14);

  const aboveSma50 = sma50 != null && price > sma50;
  const aboveSma200 = sma200 != null && price > sma200;
  const pullbackPct = sma20 != null && price > sma20 ? (price - sma20) / sma20 : null;

  const detail = () =>
    `Price $${price.toFixed(2)}. ${smaDetail("SMA20", sma20, price, 20, bars.length)}` +
    (pullbackPct != null ? ` (${(pullbackPct * 100).toFixed(1)}% above)` : "") +
    `. ${smaDetail("SMA50", sma50, price, 50, bars.length)}. ${smaDetail("SMA200", sma200, price, 200, bars.length)}. ` +
    `RSI(14) ${rsiVal != null ? `${rsiVal.toFixed(1)} — ${rsiZone(rsiVal)}` : "unavailable"}. ` +
    `Buy needs: confirmed uptrend (above SMA50 and SMA200) and a tight entry (≤7% above SMA20, RSI <70). ` +
    `Extended past >12% above SMA20 or RSI ≥75.`;

  if (!aboveSma50) {
    return { verdict: "avoid", reason: "Below its 50-day average — not in an uptrend right now.", detail: detail() };
  }
  if (sma200 != null && !aboveSma200) {
    return { verdict: "wait", reason: "Above its 50-day average but still below the 200-day — improving, not yet a confirmed uptrend.", detail: detail() };
  }

  // Trend is confirmed (or at least not contradicted) — now check whether
  // it's still a reasonable entry or already an extended, late one. Same
  // "distance above the 20-day average" idea Alex's scan calls pullback
  // quality, plus RSI: pulled back and not overbought is a tight entry;
  // far above the 20-day or RSI hot is chasing a move that already happened.
  const extended = (pullbackPct != null && pullbackPct > 0.12) || (rsiVal != null && rsiVal >= 75);
  const tight = pullbackPct != null && pullbackPct <= 0.07 && (rsiVal == null || rsiVal < 70);

  if (extended) {
    return { verdict: "wait", reason: "Uptrend intact, but extended — chasing it now means paying up for a move that's already happened.", detail: detail() };
  }
  if (tight) {
    return { verdict: "buy", reason: "In a confirmed uptrend and pulled back near its 20-day average — a reasonable entry, not a chase.", detail: detail() };
  }
  return { verdict: "wait", reason: "Uptrend intact but a bit extended from its 20-day average — not the tightest entry.", detail: detail() };
}

export interface Holding {
  id: string;
  ticker: string;
  shares: number;
  costBasis: number; // per share
  acquiredAt: string; // ISO date
  takeProfitPct: number; // e.g. 20 means "sell at +20% from cost basis"
  stopLossPct: number; // e.g. 10 means "sell at -10% from cost basis"
}

export interface HoldingPnl {
  currentValue: number | null;
  gainLoss: number | null;
  gainLossPct: number | null;
}

export function holdingPnl(h: Holding, price: number | null): HoldingPnl {
  if (price == null) return { currentValue: null, gainLoss: null, gainLossPct: null };
  const currentValue = price * h.shares;
  const gainLoss = (price - h.costBasis) * h.shares;
  const gainLossPct = h.costBasis > 0 ? (price - h.costBasis) / h.costBasis : null;
  return { currentValue, gainLoss, gainLossPct };
}

// Signal 1: the target you set when you added this holding. Simple,
// user-controlled, and the one signal here that's specific to what YOU
// actually paid — not a market read at all.
export function ruleVerdict(h: Holding, price: number | null): RuleVerdict {
  if (price == null || h.costBasis <= 0) {
    return {
      verdict: "hold",
      reason: "No live price yet — can't check it against your target.",
      detail: `Cost basis $${h.costBasis.toFixed(2)} × ${h.shares} share${h.shares === 1 ? "" : "s"}. No live price to compare it against.`,
    };
  }
  const stopPrice = h.costBasis * (1 - h.stopLossPct / 100);
  const targetPrice = h.costBasis * (1 + h.takeProfitPct / 100);
  const pct = (price - h.costBasis) / h.costBasis;
  const pctStr = `${pct >= 0 ? "+" : ""}${(pct * 100).toFixed(1)}%`;
  const detail =
    `Cost basis $${h.costBasis.toFixed(2)} × ${h.shares} share${h.shares === 1 ? "" : "s"}. Live price $${price.toFixed(2)} (${pctStr}). ` +
    `Stop-loss triggers at or below $${stopPrice.toFixed(2)} (-${h.stopLossPct}%). Take-profit triggers at or above $${targetPrice.toFixed(2)} (+${h.takeProfitPct}%).`;
  if (pct <= -h.stopLossPct / 100) {
    return { verdict: "sell", reason: `${pctStr} from your cost basis — past your ${h.stopLossPct}% stop-loss.`, detail };
  }
  if (pct >= h.takeProfitPct / 100) {
    return { verdict: "sell", reason: `${pctStr} from your cost basis — past your ${h.takeProfitPct}% take-profit target.`, detail };
  }
  return { verdict: "hold", reason: `${pctStr} from your cost basis — inside your -${h.stopLossPct}%/+${h.takeProfitPct}% range.`, detail };
}

// Signal 2: a plain trend/momentum read on the stock itself — independent
// of what you paid for it. Deliberately simpler than Alex's scan's full
// analyzeStock() score, which is calibrated for "is this a good NEW entry"
// (position sizing, affordability, earnings risk) — none of which answers
// "should I exit a position I already hold."
export function technicalVerdict(bars: Bar[] | null | undefined): RuleVerdict {
  if (!bars || bars.length < 50) {
    const have = bars?.length ?? 0;
    return {
      verdict: "hold",
      reason: "Not enough price history yet for a technical read.",
      detail: `Only ${have} trading day${have === 1 ? "" : "s"} of history available; need at least 50 for a 50-day average, the minimum this read requires.`,
    };
  }
  const closes = bars.map((b) => b.c);
  const price = closes[closes.length - 1];
  const sma50 = sma(closes, 50);
  const sma200 = bars.length >= 200 ? sma(closes, 200) : null;
  const rsiVal = rsi(closes, 14);

  const belowSma50 = sma50 != null && price < sma50;
  const belowSma200 = sma200 != null && price < sma200;

  const detail =
    `Price $${price.toFixed(2)}. ${smaDetail("SMA50", sma50, price, 50, bars.length)}. ${smaDetail("SMA200", sma200, price, 200, bars.length)}. ` +
    `RSI(14) ${rsiVal != null ? `${rsiVal.toFixed(1)} — ${rsiZone(rsiVal)}` : "unavailable"}. ` +
    `Sell needs a CONFIRMED downtrend: below both SMA50 and SMA200 (a missing SMA200 counts as "unconfirmed," not "broken").`;

  // "Sell" requires a CONFIRMED downtrend — below both the 50- and 200-day
  // averages. A holding with under 200 days of history has no sma200 yet
  // (`sma200 == null`), and that's "unconfirmed," not "broken" — treating
  // it as a sell would punish every recently-added holding for missing
  // data it can't have yet. Being below the 50-day alone, whether or not
  // the 200-day is even known, only ever rates "watch".
  if (belowSma50 && belowSma200) {
    return { verdict: "sell", reason: "Downtrend — price is below both its 50-day and 200-day averages.", detail };
  }
  if (belowSma50) {
    return {
      verdict: "watch",
      reason: sma200 != null
        ? "Below its 50-day average — the short-term trend has turned, though it's still above the 200-day."
        : "Below its 50-day average — the short-term trend has turned. Not enough history yet to check the 200-day.",
      detail,
    };
  }
  if (rsiVal != null && rsiVal >= 75) {
    return { verdict: "watch", reason: `RSI ${rsiVal.toFixed(0)} — extended, a lot of the recent move may already be priced in.`, detail };
  }
  return { verdict: "hold", reason: "Still above its 50-day average — no technical break yet.", detail };
}

// Signal 3 (the "bottom line"): what happens when the two independent
// reads above agree, or don't. Deliberately not a vote that can be won
// 2-to-1 or averaged into a false sense of precision — two honest opinions
// that agree is still just two opinions.
export function consensusVerdict(rule: RuleVerdict, technical: RuleVerdict): RuleVerdict {
  const ruleSells = rule.verdict === "sell";
  const technicalSells = technical.verdict === "sell";
  // Not a repeat of the two rows above — this is the rule being applied to
  // combine them, spelled out so the combination itself is auditable too,
  // not just the two inputs to it.
  const detail =
    "Rule: SELL only when your target rule AND the technical read both say sell. " +
    "WATCH when they disagree, or when neither sells but at least one flags a watch. " +
    "HOLD only when both say hold. Never averaged or settled by majority — two agreeing opinions are still just two opinions.";

  if (ruleSells && technicalSells) {
    return { verdict: "sell", reason: "Both your target rule and the technical read say sell.", detail };
  }
  if (ruleSells || technicalSells) {
    const sellSide = ruleSells ? "your target rule" : "the technical read";
    const otherSide = ruleSells ? "the technical read" : "your target rule";
    return { verdict: "watch", reason: `Mixed signals — ${sellSide} says sell, ${otherSide} doesn't. Worth a closer look.`, detail };
  }
  if (rule.verdict === "watch" || technical.verdict === "watch") {
    return { verdict: "watch", reason: "No full sell signal yet, but something here is worth watching.", detail };
  }
  return { verdict: "hold", reason: "Both your target rule and the technical read say hold.", detail };
}
