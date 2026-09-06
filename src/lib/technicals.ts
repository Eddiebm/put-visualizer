// Technical stock/ETF screener — ported from the `stock-coach` scanner and
// adapted for this app. This is deliberately independent from ./score.js:
// score.js asks "is this option priced richly enough to sell?" (options
// premium). This file asks "is this stock/ETF in a good technical setup
// right now?" (trend + pullback + relative strength) — a plain stock scan
// that feeds candidates into the options calculator, it doesn't price
// anything itself.

import type { Bar, TechnicalAnalysis, Grade, Check, MarketCondition } from "../types";

export function sma(values: number[] | null | undefined, period: number): number | null {
  if (!values || values.length < period) return null;
  const slice = values.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

export function rsi(closes: number[] | null | undefined, period = 14): number | null {
  if (!closes || closes.length < period + 1) return null;
  const recent = closes.slice(-(period + 1));
  let gains = 0, losses = 0;
  for (let i = 1; i < recent.length; i++) {
    const change = recent[i] - recent[i - 1];
    if (change > 0) gains += change;
    else losses += -change;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  return 100 - (100 / (1 + avgGain / avgLoss));
}

export function atr(bars: Bar[] | null | undefined, period = 14): number | null {
  if (!bars || bars.length < period + 1) return null;
  const recent = bars.slice(-(period + 1));
  const trs: number[] = [];
  for (let i = 1; i < recent.length; i++) {
    const cur = recent[i];
    const prev = recent[i - 1];
    trs.push(Math.max(cur.h - cur.l, Math.abs(cur.h - prev.c), Math.abs(cur.l - prev.c)));
  }
  return trs.reduce((a, b) => a + b, 0) / period;
}

export function volumeRatio(bars: Bar[] | null | undefined, period = 20): number | null {
  if (!bars || bars.length < period + 1) return null;
  const vols = bars.map((b) => b.v ?? 0);
  const avg = sma(vols.slice(0, -1), period);
  const today = vols[vols.length - 1];
  return avg ? today / avg : null;
}

// ─── Scoring (100 pts) ────────────────────────────────────────────────────
// 1. Long-term trend     (20 pts) — SMA50 + SMA200
// 2. Pullback quality    (25 pts) — how close is price to SMA20 (dynamic support)
// 3. Relative strength   (20 pts) — 10-day return vs SPY
// 4. RSI momentum        (20 pts) — 45-60 sweet spot
// 5. Volume              (10 pts) — confirms buyers are showing up
// 6. Affordability       ( 5 pts) — a 1%-risk position fits the account

interface AnalyzeStockInput {
  sym: string;
  name: string;
  bars: Bar[];
  capital: number;
  hasEarnings: boolean | null;
  earningsDate?: string | null;
  spyBars?: Bar[];
}

export function analyzeStock({ sym, name, bars, capital, hasEarnings, earningsDate, spyBars }: AnalyzeStockInput): TechnicalAnalysis | null {
  if (!bars || bars.length < 50) return null;

  const closes = bars.map((b) => b.c);
  const price = closes[closes.length - 1];

  const sma20 = sma(closes, 20);
  const sma50 = sma(closes, 50);
  const sma200 = bars.length >= 200 ? sma(closes, 200) : null;
  const rsiVal = rsi(closes, 14);
  const atrVal = atr(bars, 14);
  const volRat = volumeRatio(bars, 20);

  const return10 = bars.length >= 11
    ? (price - closes[closes.length - 11]) / closes[closes.length - 11]
    : null;
  const spyCloses = spyBars?.map((b) => b.c) ?? [];
  const spyReturn10 = spyCloses.length >= 11
    ? (spyCloses[spyCloses.length - 1] - spyCloses[spyCloses.length - 11]) / spyCloses[spyCloses.length - 11]
    : null;
  const relStrength = (return10 != null && spyReturn10 != null) ? return10 - spyReturn10 : null;

  const pullbackPct = (sma20 && price > sma20) ? (price - sma20) / sma20 : null;

  const aboveSma20 = sma20 != null && price > sma20;
  const aboveSma50 = sma50 != null && price > sma50;
  const aboveSma200 = sma200 != null && price > sma200;

  const stopDist = atrVal ?? price * 0.03;
  const stopPrice = price - stopDist;
  const targetPrice = price + stopDist * 2;
  const riskAmount = capital * 0.01;
  const shares = Math.max(1, Math.floor(riskAmount / stopDist));
  const posValue = shares * price;
  const canAfford = posValue <= capital * 0.30;

  let score = 0;

  if (price > (sma200 ?? 0)) score += 10;
  if (price > (sma50 ?? 0)) score += 10;

  if (pullbackPct !== null) {
    if (pullbackPct <= 0.03) score += 25;
    else if (pullbackPct <= 0.07) score += 15;
    else if (pullbackPct <= 0.12) score += 5;
  }

  if (relStrength !== null) {
    if (relStrength >= 0.02) score += 20;
    else if (relStrength >= 0) score += 12;
  }

  if (rsiVal != null) {
    if (rsiVal >= 45 && rsiVal <= 60) score += 20;
    else if (rsiVal >= 40 && rsiVal < 45) score += 10;
    else if (rsiVal > 60 && rsiVal <= 70) score += 10;
  }

  if (volRat != null) {
    if (volRat >= 1.5) score += 10;
    else if (volRat >= 1.1) score += 5;
  }

  if (canAfford && shares >= 1) score += 5;

  if (hasEarnings === true) score = 0;

  score = Math.min(100, Math.round(score));

  return {
    sym, name, price,
    sma20, sma50, sma200, rsiVal, atrVal, volRatio: volRat,
    aboveSma20, aboveSma50, aboveSma200,
    pullbackPct, relStrength, return10, spyReturn10,
    stopPrice, targetPrice, stopDist,
    shares, posValue, riskAmount, canAfford,
    hasEarnings, earningsDate: earningsDate ?? null,
    score, grade: technicalGrade(score),
  };
}

export function technicalGrade(score: number): Grade {
  if (score >= 80) return { label: "Strong setup", color: "#16a34a", bg: "#f0fdf4" };
  if (score >= 65) return { label: "Good setup", color: "#22c55e", bg: "#f7fdf9" };
  if (score >= 50) return { label: "Watch", color: "#d97706", bg: "#fffbeb" };
  if (score >= 35) return { label: "Weak", color: "#f97316", bg: "#fff7ed" };
  return { label: "Avoid", color: "#e14c4c", bg: "#fff5f5" };
}

interface StockChecksInput {
  sma20: number | null;
  sma50: number | null;
  sma200: number | null;
  rsiVal: number | null;
  volRatio: number | null;
  canAfford: boolean;
  hasEarnings: boolean | null;
  earningsDate?: string | null;
  aboveSma20: boolean;
  aboveSma50: boolean;
  aboveSma200: boolean;
  pullbackPct: number | null;
  relStrength: number | null;
}

export function stockChecks({ sma20, sma50, sma200, rsiVal, volRatio, canAfford,
  hasEarnings, earningsDate, aboveSma20, aboveSma50, aboveSma200, pullbackPct, relStrength }: StockChecksInput): Check[] {
  return [
    {
      key: "trend",
      label: "In a long-term uptrend",
      detail: "Price is above its 50-day and 200-day averages — the two lines institutional money watches most closely. Above both, the big money is still bullish.",
      pass: aboveSma50 && aboveSma200,
      warn: aboveSma50 && !aboveSma200,
      warnLabel: "Above the 50-day but below the 200-day — improving but not fully confirmed.",
      fail: "Below its long-term averages — this is a downtrend, not a pullback.",
    },
    {
      key: "pullback",
      label: "Pulled back to support, not chasing a high",
      detail: "The 20-day average acts like a floor. Buying within 3% of it gives a tight, defined entry. Buying 15% above it means you're late.",
      pass: pullbackPct !== null && pullbackPct <= 0.03,
      warn: pullbackPct !== null && pullbackPct > 0.03 && pullbackPct <= 0.07,
      warnLabel: pullbackPct !== null ? `${(pullbackPct * 100).toFixed(1)}% above the 20-day average — a bit extended.` : "Can't compute — need more price history.",
      fail: pullbackPct === null || !aboveSma20
        ? "Below the 20-day average — the short-term trend is weakening."
        : `${(pullbackPct * 100).toFixed(1)}% above the 20-day average — too extended, risk of a sharp pullback.`,
    },
    {
      key: "relstrength",
      label: "Outperforming the market over the last 10 days",
      detail: "If SPY is up 2% this week and this stock is up 4%, money is flowing into it specifically — not just rising with the tide.",
      pass: relStrength !== null && relStrength >= 0.02,
      warn: relStrength !== null && relStrength >= 0 && relStrength < 0.02,
      warnLabel: "Matching the market but not leading it.",
      fail: relStrength === null ? "SPY data not available." : `Underperforming SPY by ${(Math.abs(relStrength) * 100).toFixed(1)}% — money is leaving this one.`,
    },
    {
      key: "momentum",
      label: "Momentum is healthy — not too hot, not too cold",
      detail: "RSI measures buying speed 0-100. Below 40, nobody's interested. Above 70, everyone already bought and it's vulnerable. The sweet spot is 45-60.",
      pass: rsiVal != null && rsiVal >= 45 && rsiVal <= 60,
      warn: rsiVal != null && ((rsiVal >= 40 && rsiVal < 45) || (rsiVal > 60 && rsiVal <= 70)),
      warnLabel: rsiVal != null && rsiVal > 60
        ? `RSI ${Math.round(rsiVal)} — getting extended.`
        : `RSI ${rsiVal != null ? Math.round(rsiVal) : "?"} — momentum is soft.`,
      fail: rsiVal != null && rsiVal > 70
        ? `RSI ${Math.round(rsiVal)} — overbought.`
        : "RSI very low — no buying pressure yet.",
    },
    {
      key: "volume",
      label: "Buyers showing up in above-average numbers",
      detail: "Volume confirms the move. A bounce on low volume means sellers just paused; a bounce on rising volume means real buyers stepped in.",
      pass: volRatio != null && volRatio >= 1.5,
      warn: volRatio != null && volRatio >= 1.1 && volRatio < 1.5,
      warnLabel: "Above-average but not surging.",
      fail: "Volume is below average — the move isn't confirmed.",
    },
    {
      key: "affordable",
      label: "A 1%-risk position fits your account",
      detail: "At 1% risk per trade, the position stays under 30% of the account — one bad trade can't do serious damage.",
      pass: canAfford,
      fail: "Too large at 1% risk for this account size.",
    },
    hasEarnings === null
      ? { key: "earnings", label: "Checking earnings dates…", manual: true,
          detail: "Earnings cause gap moves that a stop-loss can't protect against." }
      : hasEarnings
      ? { key: "earnings", label: earningsDate ? `Earnings on ${earningsDate} — high gap risk` : "Earnings coming up",
          detail: "Sell before earnings or skip this one. Gaps can jump right past a stop.",
          pass: false,
          fail: earningsDate ? `Earnings on ${earningsDate}.` : "Earnings in the near-term window." }
      : { key: "earnings", label: "No earnings in the near-term window",
          detail: "No earnings scheduled in the next 30 days.", pass: true },
  ];
}

export function technicalMarketCondition(spyBars: Bar[] | null | undefined): MarketCondition | null {
  if (!spyBars?.length) return null;
  const closes = spyBars.map((b) => b.c);
  const price = closes[closes.length - 1];
  const s50 = sma(closes, 50);
  const s200 = sma(closes, 200);
  if (s200 && price > s200) return {
    label: "Bull market — conditions favor buyers",
    summary: "The broad market is above its long-term average. Look for pullbacks to the 20-day average in stocks outperforming SPY.",
    color: "#16a34a", bg: "#f0fdf4", emoji: "🟢",
  };
  if (s50 && price > s50) return {
    label: "Mixed market — be selective",
    summary: "Choppy zone. Only the highest-scoring setups are worth it here; size down.",
    color: "#d97706", bg: "#fffbeb", emoji: "🟡",
  };
  return {
    label: "Bear market — stay cautious",
    summary: "SPY is below its major averages. Cash is a position too.",
    color: "#e14c4c", bg: "#fff5f5", emoji: "🔴",
  };
}
