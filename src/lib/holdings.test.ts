import { describe, it, expect } from "vitest";
import { holdingPnl, ruleVerdict, technicalVerdict, consensusVerdict, type Holding } from "./holdings";
import type { Bar } from "../types";

const HOLDING: Holding = {
  id: "h1", ticker: "AAPL", shares: 10, costBasis: 100,
  acquiredAt: "2026-01-01", takeProfitPct: 20, stopLossPct: 10,
};

function flatBars(n: number, close: number): Bar[] {
  return Array.from({ length: n }, () => ({ h: close, l: close, c: close }));
}

// Bars trending from `start` to `end` over n days — used to build a real
// SMA50/SMA200 spread rather than a flat line (flat closes make sma50 ===
// sma200 === price, which can't exercise the below/above branches).
function trendBars(n: number, start: number, end: number): Bar[] {
  return Array.from({ length: n }, (_, i) => {
    const c = start + (end - start) * (i / (n - 1));
    return { h: c, l: c, c };
  });
}

// Alternates between two prices — unlike a flat series (every step reads
// as a zero-change "loss" to rsi()'s avgLoss===0 branch, which returns 100
// even though nothing actually happened), this produces equal real gains
// and losses, landing RSI near a genuinely neutral 50.
function zigzagBars(n: number): Bar[] {
  return Array.from({ length: n }, (_, i) => {
    const c = i % 2 === 0 ? 100 : 101;
    return { h: c, l: c, c };
  });
}

describe("holdingPnl", () => {
  it("computes current value, gain/loss, and gain/loss % from a live price", () => {
    const r = holdingPnl(HOLDING, 120);
    expect(r.currentValue).toBe(1200);
    expect(r.gainLoss).toBe(200);
    expect(r.gainLossPct).toBeCloseTo(0.2);
  });

  it("returns all nulls when no live price is available", () => {
    const r = holdingPnl(HOLDING, null);
    expect(r).toEqual({ currentValue: null, gainLoss: null, gainLossPct: null });
  });
});

describe("ruleVerdict", () => {
  it("holds when no live price is available", () => {
    expect(ruleVerdict(HOLDING, null).verdict).toBe("hold");
  });

  it("sells at or past the stop-loss threshold", () => {
    // -10% of 100 cost basis = 90
    expect(ruleVerdict(HOLDING, 90).verdict).toBe("sell");
    expect(ruleVerdict(HOLDING, 85).verdict).toBe("sell");
  });

  it("sells at or past the take-profit threshold", () => {
    // +20% of 100 cost basis = 120
    expect(ruleVerdict(HOLDING, 120).verdict).toBe("sell");
    expect(ruleVerdict(HOLDING, 130).verdict).toBe("sell");
  });

  it("holds strictly inside the -10%/+20% range", () => {
    expect(ruleVerdict(HOLDING, 91).verdict).toBe("hold");
    expect(ruleVerdict(HOLDING, 100).verdict).toBe("hold");
    expect(ruleVerdict(HOLDING, 119).verdict).toBe("hold");
  });
});

describe("technicalVerdict", () => {
  it("holds when there isn't enough price history", () => {
    expect(technicalVerdict(flatBars(20, 100)).verdict).toBe("hold");
    expect(technicalVerdict(null).verdict).toBe("hold");
  });

  it("sells when price is below both the 50- and 200-day averages (real downtrend)", () => {
    // 220 bars falling from 150 to 80 — price ends well below both SMAs.
    const bars = trendBars(220, 150, 80);
    expect(technicalVerdict(bars).verdict).toBe("sell");
  });

  it("watches when only the 50-day average has broken (200-day not available yet)", () => {
    // 60 bars: high for the first 50, then a sharp recent drop — SMA50 (an
    // average of a still-mostly-high window) sits above the current price,
    // but there aren't 200 bars yet so SMA200 is null (never "broken").
    const bars = [...flatBars(50, 150), ...flatBars(10, 100)];
    const v = technicalVerdict(bars);
    expect(v.verdict).toBe("watch");
    expect(v.reason).toMatch(/50-day/);
  });

  it("holds when price is above its 50-day average and RSI isn't extended", () => {
    // Alternating 100/101 for 60 bars: the last close (101, an "up" tick)
    // sits above the 50-day average of the alternating series (~100.5),
    // and equal real up/down moves keep RSI near a neutral 50.
    const bars = zigzagBars(60);
    expect(technicalVerdict(bars).verdict).toBe("hold");
  });

  it("watches on an extended RSI even while still above the 50-day average", () => {
    // A strong, steady climb: price stays above its rising SMA50 throughout
    // (so the trend checks don't fire "sell"/"watch"), but 14 straight up
    // days push RSI to 100 — extended.
    const bars = trendBars(60, 100, 200);
    const v = technicalVerdict(bars);
    expect(v.verdict).toBe("watch");
    expect(v.reason).toMatch(/RSI/);
  });
});

describe("consensusVerdict", () => {
  const sell: import("./holdings").RuleVerdict = { verdict: "sell", reason: "s" };
  const watch: import("./holdings").RuleVerdict = { verdict: "watch", reason: "w" };
  const hold: import("./holdings").RuleVerdict = { verdict: "hold", reason: "h" };

  it("sells only when both signals sell", () => {
    expect(consensusVerdict(sell, sell).verdict).toBe("sell");
  });

  it("calls it mixed (watch) when only one signal sells", () => {
    expect(consensusVerdict(sell, hold).verdict).toBe("watch");
    expect(consensusVerdict(hold, sell).verdict).toBe("watch");
  });

  it("watches when neither sells but at least one is watching", () => {
    expect(consensusVerdict(watch, hold).verdict).toBe("watch");
    expect(consensusVerdict(hold, watch).verdict).toBe("watch");
    expect(consensusVerdict(watch, watch).verdict).toBe("watch");
  });

  it("holds only when both signals hold", () => {
    expect(consensusVerdict(hold, hold).verdict).toBe("hold");
  });
});
