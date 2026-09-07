import { describe, it, expect } from "vitest";
import { sma, rsi, atr, volumeRatio, analyzeStock, technicalGrade, technicalMarketCondition } from "./technicals";
import type { Bar } from "../types";

interface MakeBarsOpts {
  high?: number[] | null;
  low?: number[] | null;
  vol?: number | number[];
}

function makeBars(closes: number[], { high = null, low = null, vol = 1_000_000 }: MakeBarsOpts = {}): Bar[] {
  return closes.map((c, i) => ({
    c,
    h: high ? high[i] : c * 1.01,
    l: low ? low[i] : c * 0.99,
    v: Array.isArray(vol) ? vol[i] : vol,
  }));
}

describe("sma", () => {
  it("returns null when there isn't enough data", () => {
    expect(sma([1, 2, 3], 5)).toBeNull();
  });
  it("averages exactly the trailing window", () => {
    expect(sma([1, 2, 3, 4, 5], 3)).toBeCloseTo(4); // avg(3,4,5)
  });
});

describe("rsi", () => {
  it("is 100 for a series with only gains", () => {
    const closes = Array.from({ length: 20 }, (_, i) => 100 + i);
    expect(rsi(closes, 14)).toBe(100);
  });
  it("is bounded between 0 and 100 for a mixed series", () => {
    const closes = [100, 102, 101, 103, 99, 98, 101, 104, 103, 105, 102, 100, 99, 101, 103];
    const v = rsi(closes, 14)!;
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThanOrEqual(100);
  });
});

describe("atr", () => {
  it("returns null with insufficient bars", () => {
    expect(atr(makeBars([1, 2]), 14)).toBeNull();
  });
  it("is positive for bars with real high-low range", () => {
    const bars = makeBars(Array.from({ length: 20 }, (_, i) => 100 + i));
    expect(atr(bars, 14)).toBeGreaterThan(0);
  });
});

describe("volumeRatio", () => {
  it("is >1 when today's volume is above the trailing average", () => {
    const vols = Array(20).fill(1_000_000).concat([3_000_000]);
    const bars = makeBars(Array(21).fill(100), { vol: vols });
    expect(volumeRatio(bars, 20)).toBeGreaterThan(1);
  });
});

describe("analyzeStock", () => {
  it("returns null with fewer than 50 bars — not enough for the model", () => {
    expect(analyzeStock({ sym: "X", name: "X", bars: makeBars([100, 101]), capital: 1000, hasEarnings: null })).toBeNull();
  });

  it("hard-zeroes the score when earnings fall in the window, regardless of setup quality", () => {
    // Build a textbook-good uptrend + pullback setup...
    const closes = Array.from({ length: 220 }, (_, i) => 80 + i * 0.3);
    const bars = makeBars(closes);
    const withEarnings = analyzeStock({ sym: "X", name: "X", bars, capital: 10000, hasEarnings: true })!;
    expect(withEarnings.score).toBe(0);
  });

  it("does not award SMA200 trend points when SMA200 isn't computable yet (50-199 bars, regression)", () => {
    // Same trailing 100 bars in both calls, so every other scoring factor
    // (SMA20/50, RSI, ATR, volume, pullback, 10-day return, affordability)
    // is identical between them — the only thing that can differ is the
    // SMA200 contribution.
    const trailing = Array.from({ length: 100 }, (_, i) => 100 + i * 0.1);
    const shortHistory = makeBars(trailing); // 100 bars — SMA200 not computable
    // Prepend a steep decline from 400 down to where `trailing` starts, so
    // once there's enough history the 200-bar window averages well above
    // the ending price — an unambiguous "below its 200-day average" stock.
    const decline = Array.from({ length: 120 }, (_, i) => 400 - i * (300 / 119));
    const longHistory = makeBars([...decline, ...trailing]); // 220 bars — SMA200 real, above price

    const short = analyzeStock({ sym: "X", name: "X", bars: shortHistory, capital: 10000, hasEarnings: false })!;
    const long = analyzeStock({ sym: "X", name: "X", bars: longHistory, capital: 10000, hasEarnings: false })!;

    expect(short.sma200).toBeNull();
    expect(long.sma200).not.toBeNull();
    expect(long.aboveSma200).toBe(false); // engineered: SMA200 sits well above the current price

    // Before the fix, `price > (sma200 ?? 0)` treated a null SMA200 as 0,
    // so `short` silently got +10 points no real 200-day trend justified —
    // the same +10 a stock genuinely below its SMA200 (`long`) correctly
    // does NOT get. With every other factor identical, the scores must
    // match exactly now that the null case is excluded correctly.
    expect(short.score).toBe(long.score);
  });

  it("scores a clean long-term uptrend above a flat/declining series", () => {
    const uptrend = Array.from({ length: 220 }, (_, i) => 80 + i * 0.3);
    const decline = Array.from({ length: 220 }, (_, i) => 200 - i * 0.3);
    const up = analyzeStock({ sym: "UP", name: "UP", bars: makeBars(uptrend), capital: 10000, hasEarnings: false })!;
    const down = analyzeStock({ sym: "DOWN", name: "DOWN", bars: makeBars(decline), capital: 10000, hasEarnings: false })!;
    expect(up.score).toBeGreaterThan(down.score);
  });

  it("attaches a grade consistent with the score", () => {
    const closes = Array.from({ length: 220 }, (_, i) => 80 + i * 0.3);
    const r = analyzeStock({ sym: "X", name: "X", bars: makeBars(closes), capital: 10000, hasEarnings: false })!;
    expect(r.grade).toEqual(technicalGrade(r.score));
  });
});

describe("technicalGrade", () => {
  it("labels boundary scores correctly", () => {
    expect(technicalGrade(80).label).toBe("Strong setup");
    expect(technicalGrade(50).label).toBe("Watch");
    expect(technicalGrade(0).label).toBe("Avoid");
  });
});

describe("technicalMarketCondition", () => {
  it("returns null with no SPY data", () => {
    expect(technicalMarketCondition([])).toBeNull();
    expect(technicalMarketCondition(null)).toBeNull();
  });
  it("reads bullish when price is above its 200-day average", () => {
    const bars = makeBars(Array.from({ length: 220 }, (_, i) => 400 + i));
    expect(technicalMarketCondition(bars)!.label).toMatch(/bull/i);
  });
  it("reads bearish when price is below both major averages", () => {
    const bars = makeBars(Array.from({ length: 220 }, (_, i) => 600 - i * 1.2));
    expect(technicalMarketCondition(bars)!.label).toMatch(/bear/i);
  });
});
