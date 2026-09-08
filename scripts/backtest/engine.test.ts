import { describe, it, expect } from "vitest";
import { walkForward, alignByDate, type Evaluator } from "./engine";
import { alexScanEvaluator } from "./evaluators";
import { analyzeStock } from "../../src/lib/technicals";
import type { Bar } from "../../src/types";

// A flat, mildly-trending 260-day series so analyzeStock() has enough bars
// for sma200 and a real score, with a known, controllable last value.
function makeBars(n: number, opts: { start?: number; jumpAt?: number; jumpTo?: number } = {}): Bar[] {
  const { start = 100, jumpAt, jumpTo } = opts;
  const bars: Bar[] = [];
  const startDate = new Date("2020-01-01T00:00:00Z");
  for (let i = 0; i < n; i++) {
    let c = start + i * 0.05; // slow, steady uptrend
    if (jumpAt != null && jumpTo != null && i >= jumpAt) c = jumpTo;
    const date = new Date(startDate.getTime() + i * 86400000);
    bars.push({ t: date.toISOString(), o: c, h: c * 1.005, l: c * 0.995, c, v: 1_000_000 });
  }
  return bars;
}

// The default evaluator for most tests below — walkForward is generic over
// "what gets evaluated," but most of these tests are about the walk-forward
// mechanics (lookahead, stride, horizons, eligibility), not about any one
// evaluator's own logic, so they all share this one.
const ALEX = alexScanEvaluator("TEST", 5000);

describe("alignByDate", () => {
  it("matches spy bars to the same calendar date, not by array index", () => {
    const bars = makeBars(5);
    // spyBars missing the 3rd date and shifted otherwise
    const spyBars: Bar[] = [bars[0], bars[1], bars[3], bars[4]];
    const aligned = alignByDate(bars, spyBars);
    expect(aligned[0]).toBe(bars[0]);
    expect(aligned[1]).toBe(bars[1]);
    expect(aligned[2]).toBeNull(); // no SPY bar for bars[2]'s date
    expect(aligned[3]).toBe(bars[3]);
    expect(aligned[4]).toBe(bars[4]);
  });
});

describe("walkForward", () => {
  it("never leaks a future bar into the score at day i (no-lookahead regression test)", () => {
    // 300 identical days, then a massive price jump at day 260 onward.
    // Evaluating at i=259 (before the jump) must produce the exact same
    // score as evaluating the same bars.slice(0, 260) directly — if the
    // walk-forward loop ever handed the evaluator a longer slice than it
    // should have, this score would reflect the jump and diverge.
    const bars = makeBars(300, { jumpAt: 260, jumpTo: 100000 });
    const spyBars = makeBars(300);

    const samples = walkForward("TEST", bars, spyBars, {
      evaluate: ALEX,
      horizons: [5],
      stride: 1,
      minLookback: 250,
    });

    const sampleAt259 = samples.find((s) => s.asOfDate === bars[259].t);
    expect(sampleAt259).toBeDefined();

    // Recompute independently via the same slice a correct implementation
    // would have used, and confirm they match.
    const expected = analyzeStock({
      sym: "TEST",
      name: "TEST",
      bars: bars.slice(0, 260),
      capital: 5000,
      hasEarnings: false,
      spyBars: spyBars.slice(0, 260),
    });
    expect(sampleAt259!.score).toBe(expected!.score);

    // And a sample AFTER the jump (i=265) must NOT match that same
    // pre-jump score — sanity check that the jump is real and detectable,
    // i.e. this test isn't just trivially passing because nothing changes.
    const sampleAt265 = samples.find((s) => s.asOfDate === bars[265].t);
    expect(sampleAt265).toBeDefined();
    expect(sampleAt265!.score).not.toBe(sampleAt259!.score);
  });

  it("computes forward returns over each requested horizon from the as-of day's close", () => {
    const bars = makeBars(260);
    const spyBars = makeBars(260);
    const samples = walkForward("TEST", bars, spyBars, {
      evaluate: ALEX,
      horizons: [5, 10],
      stride: 50,
      minLookback: 250,
    });
    expect(samples.length).toBeGreaterThan(0);
    for (const s of samples) {
      const i = bars.findIndex((b) => b.t === s.asOfDate);
      const expected5 = (bars[i + 5].c - bars[i].c) / bars[i].c;
      const expected10 = (bars[i + 10].c - bars[i].c) / bars[i].c;
      expect(s.forwardReturns[5]).toBeCloseTo(expected5, 10);
      expect(s.forwardReturns[10]).toBeCloseTo(expected10, 10);
    }
  });

  it("stops once there isn't enough forward data for the longest horizon, rather than padding with nulls", () => {
    const bars = makeBars(300);
    const spyBars = makeBars(300);
    const samples = walkForward("TEST", bars, spyBars, {
      evaluate: ALEX,
      horizons: [20],
      stride: 1,
      minLookback: 250,
    });
    const lastAsOfIndex = bars.findIndex((b) => b.t === samples[samples.length - 1].asOfDate);
    expect(lastAsOfIndex + 20).toBeLessThan(bars.length);
    // one more stride step would have needed data past the end of `bars`
    expect(lastAsOfIndex + 1 + 20).toBeGreaterThanOrEqual(bars.length);
  });

  it("respects stride — evaluating every Nth day, not every day", () => {
    const bars = makeBars(260);
    const spyBars = makeBars(260);
    const samples = walkForward("TEST", bars, spyBars, {
      evaluate: ALEX,
      horizons: [5],
      stride: 10,
      minLookback: 250,
    });
    const indices = samples.map((s) => bars.findIndex((b) => b.t === s.asOfDate));
    for (let k = 1; k < indices.length; k++) {
      expect(indices[k] - indices[k - 1]).toBe(10);
    }
  });

  it("throws if called with no horizons — a silently-empty report would be worse", () => {
    const bars = makeBars(260);
    expect(() => walkForward("TEST", bars, bars, { evaluate: ALEX, horizons: [], stride: 1, minLookback: 250 })).toThrow();
  });

  it("skips days isEligible rejects, but doesn't stop the walk — a symbol can be eligible again later", () => {
    const bars = makeBars(300);
    const spyBars = makeBars(300);
    // Eligible only in a narrow middle window (indices ~260-270 by date),
    // even though there's plenty of trailing/forward data outside it.
    const eligibleStart = bars[260].t as string;
    const eligibleEnd = bars[270].t as string;
    const samples = walkForward("TEST", bars, spyBars, {
      evaluate: ALEX,
      horizons: [5],
      stride: 1,
      minLookback: 250,
      isEligible: (d) => d >= eligibleStart && d <= eligibleEnd,
    });
    expect(samples.length).toBeGreaterThan(0);
    for (const s of samples) {
      expect(s.asOfDate >= eligibleStart && s.asOfDate <= eligibleEnd).toBe(true);
    }
  });

  it("produces no samples at all when isEligible rejects every day", () => {
    const bars = makeBars(300);
    const samples = walkForward("TEST", bars, bars, {
      evaluate: ALEX,
      horizons: [5],
      stride: 1,
      minLookback: 250,
      isEligible: () => false,
    });
    expect(samples).toEqual([]);
  });

  it("skips a day the evaluator returns null for, rather than crashing or faking a grade", () => {
    // A trivial custom evaluator (not analyzeStock) — proves the engine is
    // genuinely generic, not just happening to work because it's secretly
    // still calling analyzeStock somewhere.
    const bars = makeBars(260);
    let calls = 0;
    const alternating: Evaluator = () => {
      calls++;
      return calls % 2 === 0 ? { grade: "even", score: null } : null;
    };
    const samples = walkForward("TEST", bars, bars, {
      evaluate: alternating,
      horizons: [5],
      stride: 1,
      minLookback: 250,
    });
    expect(samples.length).toBeGreaterThan(0);
    expect(samples.every((s) => s.grade === "even")).toBe(true);
  });

  it("carries a null score through untouched for an evaluator with no numeric score", () => {
    const bars = makeBars(260);
    const noScore: Evaluator = () => ({ grade: "buy", score: null });
    const samples = walkForward("TEST", bars, bars, {
      evaluate: noScore,
      horizons: [5],
      stride: 50,
      minLookback: 250,
    });
    expect(samples.length).toBeGreaterThan(0);
    expect(samples.every((s) => s.score === null && s.grade === "buy")).toBe(true);
  });

  it("leaves cspReturn/cspAssigned null on every sample when opts.csp isn't given", () => {
    const bars = makeBars(400);
    const spyBars = makeBars(400);
    const samples = walkForward("TEST", bars, spyBars, {
      evaluate: ALEX,
      horizons: [5],
      stride: 50,
      minLookback: 250,
    });
    expect(samples.length).toBeGreaterThan(0);
    expect(samples.every((s) => s.cspReturn === null && s.cspAssigned === null)).toBe(true);
  });

  it("attaches a modeled CSP outcome per sample when opts.csp is given", () => {
    const bars = makeBars(400);
    const spyBars = makeBars(400);
    const samples = walkForward("TEST", bars, spyBars, {
      evaluate: ALEX,
      horizons: [5],
      stride: 50,
      minLookback: 250,
      csp: { dte: 45, deltaTarget: 0.3, ivLookback: 20, rate: 0.05 },
    });
    expect(samples.length).toBeGreaterThan(0);
    // Not every sample necessarily gets a CSP outcome (modelCspTrade has
    // its own forward-history requirement independent of this run's
    // horizons), but at least the early ones — with plenty of both
    // trailing and forward bars — should.
    expect(samples.some((s) => s.cspReturn !== null)).toBe(true);
    for (const s of samples) {
      expect(s.cspReturn === null || typeof s.cspReturn === "number").toBe(true);
      expect(s.cspAssigned === null || typeof s.cspAssigned === "boolean").toBe(true);
    }
  });
});
