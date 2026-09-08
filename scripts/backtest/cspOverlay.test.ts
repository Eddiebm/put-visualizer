import { describe, it, expect } from "vitest";
import { strikeForPutDelta, tradingDaysForDte, modelCspTrade, DEFAULT_CSP_PARAMS } from "./cspOverlay";
import { bsGreeks } from "../../src/lib/blackScholes";
import type { Bar } from "../../src/types";

function makeBars(n: number, opts: { start?: number; vol?: number; endValue?: number } = {}): Bar[] {
  const { start = 100, vol = 0, endValue } = opts;
  const bars: Bar[] = [];
  const startDate = new Date("2020-01-01T00:00:00Z");
  for (let i = 0; i < n; i++) {
    // Deterministic wobble so realizedVol has something nonzero to compute
    // without pulling in a real RNG.
    let c = start + Math.sin(i / 3) * start * vol;
    if (endValue != null && i === n - 1) c = endValue;
    const date = new Date(startDate.getTime() + i * 86400000);
    bars.push({ t: date.toISOString(), o: c, h: c * 1.005, l: c * 0.995, c, v: 1_000_000 });
  }
  return bars;
}

describe("strikeForPutDelta", () => {
  it("finds a strike whose Black-Scholes put delta matches the target, within tolerance", () => {
    const spot = 100;
    const dte = 45;
    const rate = 0.05;
    const vol = 0.3;
    const strike = strikeForPutDelta(spot, dte, rate, vol, 0.3)!;
    expect(strike).not.toBeNull();
    const { delta } = bsGreeks(spot, strike, dte, rate, vol, "put");
    expect(delta).toBeCloseTo(-0.3, 3);
  });

  it("returns a lower strike for a smaller target delta magnitude (further OTM)", () => {
    const spot = 100;
    const dte = 45;
    const rate = 0.05;
    const vol = 0.3;
    const strike10 = strikeForPutDelta(spot, dte, rate, vol, 0.1)!;
    const strike40 = strikeForPutDelta(spot, dte, rate, vol, 0.4)!;
    expect(strike10).toBeLessThan(strike40);
  });

  it("returns null for nonsensical inputs rather than looping forever or a garbage strike", () => {
    expect(strikeForPutDelta(0, 45, 0.05, 0.3, 0.3)).toBeNull();
    expect(strikeForPutDelta(100, 0, 0.05, 0.3, 0.3)).toBeNull();
    expect(strikeForPutDelta(100, 45, 0.05, 0, 0.3)).toBeNull();
    expect(strikeForPutDelta(100, 45, 0.05, 0.3, 0)).toBeNull();
    expect(strikeForPutDelta(100, 45, 0.05, 0.3, 1)).toBeNull();
  });
});

describe("tradingDaysForDte", () => {
  it("scales roughly by 252/365", () => {
    expect(tradingDaysForDte(365)).toBe(252);
    expect(tradingDaysForDte(45)).toBe(Math.round(45 * (252 / 365)));
  });
});

describe("modelCspTrade", () => {
  it("returns null when there isn't enough trailing history for the vol lookback", () => {
    const bars = makeBars(100, { vol: 0.02 });
    const result = modelCspTrade(bars, 5, DEFAULT_CSP_PARAMS); // i=5 < ivLookback=20
    expect(result).toBeNull();
  });

  it("returns null when there isn't enough forward history to reach expiration", () => {
    const bars = makeBars(40, { vol: 0.02 }); // too short for 45 DTE (~31 trading days) past a late i
    const result = modelCspTrade(bars, 35, DEFAULT_CSP_PARAMS);
    expect(result).toBeNull();
  });

  it("models a worthless expiration (OTM put, no assignment) when price rises through expiration", () => {
    const bars = makeBars(100, { vol: 0.02 });
    const i = 50;
    const expiryIdx = i + tradingDaysForDte(DEFAULT_CSP_PARAMS.dte);
    bars[expiryIdx] = { ...bars[expiryIdx], c: bars[i].c * 1.5 }; // way up — put finishes deep OTM
    const result = modelCspTrade(bars, i, DEFAULT_CSP_PARAMS)!;
    expect(result).not.toBeNull();
    expect(result.assigned).toBe(false);
    expect(result.netPL).toBeCloseTo(result.premium, 10); // full premium kept, nothing given back
    expect(result.returnOnCollateral).toBeGreaterThan(0);
  });

  it("models assignment (ITM put) when price crashes through the strike by expiration", () => {
    const bars = makeBars(100, { vol: 0.02 });
    const i = 50;
    const expiryIdx = i + tradingDaysForDte(DEFAULT_CSP_PARAMS.dte);
    // First compute the strike so we can crash well below it.
    const probe = modelCspTrade(bars, i, DEFAULT_CSP_PARAMS)!;
    bars[expiryIdx] = { ...bars[expiryIdx], c: probe.strike * 0.5 }; // deep crash — well past the strike
    const result = modelCspTrade(bars, i, DEFAULT_CSP_PARAMS)!;
    expect(result.assigned).toBe(true);
    expect(result.netPL).toBeLessThan(result.premium); // the assignment loss ate into the premium
    expect(result.netPL).toBeCloseTo(result.premium - (result.strike - probe.strike * 0.5), 6);
  });

  it("only ever looks at bars[0..i] to size the trade — a future price swing changes the expiry outcome, not the strike/premium", () => {
    const barsA = makeBars(100, { vol: 0.02 });
    const barsB = barsA.map((b) => ({ ...b }));
    const i = 50;
    const expiryIdx = i + tradingDaysForDte(DEFAULT_CSP_PARAMS.dte);
    barsB[expiryIdx] = { ...barsB[expiryIdx], c: barsB[expiryIdx].c * 3 }; // only the future bar differs
    const resultA = modelCspTrade(barsA, i, DEFAULT_CSP_PARAMS)!;
    const resultB = modelCspTrade(barsB, i, DEFAULT_CSP_PARAMS)!;
    expect(resultA.strike).toBeCloseTo(resultB.strike, 10);
    expect(resultA.premium).toBeCloseTo(resultB.premium, 10);
  });
});
