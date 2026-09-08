import { describe, it, expect } from "vitest";
import { alexScanEvaluator, holdingsEntryEvaluator, holdingsExitEvaluator } from "./evaluators";
import { analyzeStock } from "../../src/lib/technicals";
import { entryVerdict, technicalVerdict } from "../../src/lib/holdings";
import type { Bar } from "../../src/types";

function makeBars(n: number, start = 100): Bar[] {
  const bars: Bar[] = [];
  const startDate = new Date("2020-01-01T00:00:00Z");
  for (let i = 0; i < n; i++) {
    const c = start + i * 0.05; // slow, steady uptrend — enough for a real read, not testing any specific verdict here
    const date = new Date(startDate.getTime() + i * 86400000);
    bars.push({ t: date.toISOString(), o: c, h: c * 1.005, l: c * 0.995, c, v: 1_000_000 });
  }
  return bars;
}

describe("alexScanEvaluator", () => {
  it("returns null below analyzeStock's own 50-bar floor", () => {
    const bars = makeBars(40);
    const evaluate = alexScanEvaluator("TEST", 5000);
    expect(evaluate(bars, bars)).toBeNull();
  });

  it("matches calling analyzeStock directly with the same inputs", () => {
    const bars = makeBars(260);
    const spyBars = makeBars(260, 90);
    const evaluate = alexScanEvaluator("TEST", 5000);
    const result = evaluate(bars, spyBars);
    const expected = analyzeStock({ sym: "TEST", name: "TEST", bars, capital: 5000, hasEarnings: false, spyBars });
    expect(result).toEqual({ grade: expected!.grade.label, score: expected!.score });
  });
});

describe("holdingsEntryEvaluator", () => {
  it("returns null below the 50-bar floor, even though entryVerdict itself would return a real verdict object", () => {
    const bars = makeBars(40);
    // Confirm entryVerdict does NOT itself return null here — it returns a
    // "wait, not enough data" verdict instead — so the evaluator's null is
    // its own guard, not just passing through entryVerdict's own result.
    expect(entryVerdict(bars).verdict).toBe("wait");
    const evaluate = holdingsEntryEvaluator();
    expect(evaluate(bars, [])).toBeNull();
  });

  it("matches entryVerdict's own verdict once there's enough history, with a null score", () => {
    const bars = makeBars(260);
    const evaluate = holdingsEntryEvaluator();
    const result = evaluate(bars, []);
    const expected = entryVerdict(bars);
    expect(result).toEqual({ grade: expected.verdict, score: null });
  });
});

describe("holdingsExitEvaluator", () => {
  it("returns null below the 50-bar floor, even though technicalVerdict itself would return a real verdict object", () => {
    const bars = makeBars(40);
    expect(technicalVerdict(bars).verdict).toBe("hold");
    const evaluate = holdingsExitEvaluator();
    expect(evaluate(bars, [])).toBeNull();
  });

  it("matches technicalVerdict's own verdict once there's enough history, with a null score", () => {
    const bars = makeBars(260);
    const evaluate = holdingsExitEvaluator();
    const result = evaluate(bars, []);
    const expected = technicalVerdict(bars);
    expect(result).toEqual({ grade: expected.verdict, score: null });
  });
});
