import { describe, it, expect } from "vitest";
import {
  summarize,
  bucketByGrade,
  bucketByScoreDecile,
  bucketBySector,
  bucketByCapTier,
  bucketByYear,
  spearmanCorrelation,
  scoreForwardReturnSpearman,
  summarizeCsp,
  bucketCspByGrade,
  splitByDate,
  type TickerMeta,
} from "./stats";
import type { WalkForwardSample } from "./engine";

function sample(overrides: Partial<WalkForwardSample> = {}): WalkForwardSample {
  return {
    sym: "TEST",
    asOfDate: "2024-01-01T00:00:00Z",
    score: 50,
    grade: "Watch",
    forwardReturns: { 5: 0.01 },
    cspReturn: null,
    cspAssigned: null,
    ...overrides,
  };
}

describe("summarize", () => {
  it("computes mean, median, and win rate correctly on a known sample", () => {
    const s = summarize("test", [0.1, -0.1, 0.2]);
    expect(s.n).toBe(3);
    expect(s.meanReturn).toBeCloseTo((0.1 - 0.1 + 0.2) / 3, 10);
    expect(s.medianReturn).toBeCloseTo(0.1, 10);
    expect(s.winRate).toBeCloseTo(2 / 3, 10);
  });

  it("returns NaN fields, not a crash, for an empty sample set", () => {
    const s = summarize("empty", []);
    expect(s.n).toBe(0);
    expect(Number.isNaN(s.meanReturn)).toBe(true);
  });

  it("computes an even-length median as the average of the two middle values", () => {
    const s = summarize("test", [1, 2, 3, 4]);
    expect(s.medianReturn).toBeCloseTo(2.5, 10);
  });

  it("does not crash on a single-sample bucket (n-1 variance denominator)", () => {
    const s = summarize("one", [0.05]);
    expect(s.n).toBe(1);
    expect(s.meanReturn).toBeCloseTo(0.05, 10);
    expect(Number.isNaN(s.stdErr)).toBe(true); // undefined variance with n=1 — must not throw or divide by zero silently into a wrong number
  });
});

describe("bucketByGrade", () => {
  it("groups samples by grade label and computes per-bucket stats", () => {
    const samples: WalkForwardSample[] = [
      sample({ grade: "Strong setup", forwardReturns: { 5: 0.05 } }),
      sample({ grade: "Strong setup", forwardReturns: { 5: 0.03 } }),
      sample({ grade: "Avoid", forwardReturns: { 5: -0.04 } }),
    ];
    const buckets = bucketByGrade(samples, 5);
    expect(buckets["Strong setup"].n).toBe(2);
    expect(buckets["Strong setup"].meanReturn).toBeCloseTo(0.04, 10);
    expect(buckets["Avoid"].n).toBe(1);
    expect(buckets["Avoid"].meanReturn).toBeCloseTo(-0.04, 10);
  });

  it("skips samples with a null forward return at the requested horizon", () => {
    const samples: WalkForwardSample[] = [
      sample({ grade: "Watch", forwardReturns: { 5: 0.02, 10: null } }),
    ];
    const buckets = bucketByGrade(samples, 10);
    expect(buckets["Watch"]).toBeUndefined();
  });

  it("does not mix horizons — bucketing at horizon 5 ignores each sample's horizon-10 return", () => {
    const samples: WalkForwardSample[] = [
      sample({ grade: "Watch", forwardReturns: { 5: 0.01, 10: 0.9 } }),
    ];
    const buckets = bucketByGrade(samples, 5);
    expect(buckets["Watch"].meanReturn).toBeCloseTo(0.01, 10);
  });
});

describe("bucketByScoreDecile", () => {
  it("buckets a score of 0-9 into decile 0 and 90-100 into decile 9", () => {
    const samples: WalkForwardSample[] = [
      sample({ score: 5, forwardReturns: { 5: 0.01 } }),
      sample({ score: 95, forwardReturns: { 5: 0.09 } }),
      sample({ score: 100, forwardReturns: { 5: 0.1 } }), // score 100 must clamp into decile 9, not spill into a nonexistent decile 10
    ];
    const buckets = bucketByScoreDecile(samples, 5);
    expect(buckets[0].n).toBe(1);
    expect(buckets[9].n).toBe(2);
    expect(buckets[10]).toBeUndefined();
  });
});

const META: Map<string, TickerMeta> = new Map([
  ["AAPL", { sector: "Technology", capTier: "mega" }],
  ["MSFT", { sector: "Technology", capTier: "mega" }],
  ["JPM", { sector: "Financials", capTier: "mega" }],
]);

describe("bucketBySector", () => {
  it("groups samples by each ticker's sector via the metadata map", () => {
    const samples: WalkForwardSample[] = [
      sample({ sym: "AAPL", forwardReturns: { 5: 0.02 } }),
      sample({ sym: "MSFT", forwardReturns: { 5: 0.04 } }),
      sample({ sym: "JPM", forwardReturns: { 5: -0.01 } }),
    ];
    const buckets = bucketBySector(samples, 5, META);
    expect(buckets["Technology"].n).toBe(2);
    expect(buckets["Technology"].meanReturn).toBeCloseTo(0.03, 10);
    expect(buckets["Financials"].n).toBe(1);
  });

  it("buckets a ticker missing from the metadata map under 'Unknown' rather than dropping it", () => {
    const samples: WalkForwardSample[] = [sample({ sym: "ZZZZ", forwardReturns: { 5: 0.02 } })];
    const buckets = bucketBySector(samples, 5, META);
    expect(buckets["Unknown"].n).toBe(1);
  });
});

describe("bucketByCapTier", () => {
  it("groups by capTier, independent of sector", () => {
    const samples: WalkForwardSample[] = [
      sample({ sym: "AAPL", forwardReturns: { 5: 0.02 } }),
      sample({ sym: "MSFT", forwardReturns: { 5: 0.04 } }),
      sample({ sym: "JPM", forwardReturns: { 5: 0.06 } }),
    ];
    const buckets = bucketByCapTier(samples, 5, META);
    expect(buckets["mega"].n).toBe(3); // all three are "mega" here regardless of differing sectors
  });
});

describe("bucketByYear", () => {
  it("groups samples by the first 4 characters of asOfDate", () => {
    const samples: WalkForwardSample[] = [
      sample({ asOfDate: "2020-03-01T00:00:00Z", forwardReturns: { 5: 0.01 } }),
      sample({ asOfDate: "2020-11-01T00:00:00Z", forwardReturns: { 5: 0.03 } }),
      sample({ asOfDate: "2021-01-01T00:00:00Z", forwardReturns: { 5: -0.02 } }),
    ];
    const buckets = bucketByYear(samples, 5);
    expect(buckets["2020"].n).toBe(2);
    expect(buckets["2020"].meanReturn).toBeCloseTo(0.02, 10);
    expect(buckets["2021"].n).toBe(1);
  });

  it("skips samples with a null forward return at the requested horizon", () => {
    const samples: WalkForwardSample[] = [sample({ asOfDate: "2020-01-01T00:00:00Z", forwardReturns: { 10: null } })];
    const buckets = bucketByYear(samples, 10);
    expect(buckets["2020"]).toBeUndefined();
  });
});

describe("spearmanCorrelation", () => {
  it("is +1 for a perfectly monotonic increasing relationship", () => {
    expect(spearmanCorrelation([1, 2, 3, 4, 5], [10, 20, 30, 40, 50])).toBeCloseTo(1, 10);
  });

  it("is -1 for a perfectly monotonic decreasing relationship", () => {
    expect(spearmanCorrelation([1, 2, 3, 4, 5], [50, 40, 30, 20, 10])).toBeCloseTo(-1, 10);
  });

  it("is robust to a nonlinear (but still monotonic) relationship — unlike a Pearson correlation would be", () => {
    // y = x^3, wildly nonlinear, but every step is still strictly increasing.
    expect(spearmanCorrelation([1, 2, 3, 4, 5], [1, 8, 27, 64, 125])).toBeCloseTo(1, 10);
  });

  it("handles tied values via averaged ranks rather than crashing or biasing on tie order", () => {
    // Two x's tied at 2; their averaged rank keeps this symmetric rather
    // than arbitrarily favoring whichever tied sample came first.
    const rho = spearmanCorrelation([1, 2, 2, 3], [10, 20, 20, 30]);
    expect(rho).toBeCloseTo(1, 10);
  });

  it("returns NaN for a constant series (undefined correlation, not zero)", () => {
    expect(Number.isNaN(spearmanCorrelation([1, 1, 1], [1, 2, 3]))).toBe(true);
  });

  it("returns NaN for fewer than 2 samples", () => {
    expect(Number.isNaN(spearmanCorrelation([1], [1]))).toBe(true);
    expect(Number.isNaN(spearmanCorrelation([], []))).toBe(true);
  });

  it("throws on mismatched lengths rather than silently misaligning pairs", () => {
    expect(() => spearmanCorrelation([1, 2], [1])).toThrow();
  });
});

describe("scoreForwardReturnSpearman", () => {
  it("matches calling spearmanCorrelation directly on the same score/return pairs", () => {
    const samples: WalkForwardSample[] = [
      sample({ score: 10, forwardReturns: { 5: -0.02 } }),
      sample({ score: 50, forwardReturns: { 5: 0.01 } }),
      sample({ score: 90, forwardReturns: { 5: 0.05 } }),
    ];
    const rho = scoreForwardReturnSpearman(samples, 5);
    expect(rho).toBeCloseTo(spearmanCorrelation([10, 50, 90], [-0.02, 0.01, 0.05]), 10);
  });

  it("skips samples with a null score or null forward return at this horizon", () => {
    const samples: WalkForwardSample[] = [
      sample({ score: 10, forwardReturns: { 5: -0.02 } }),
      sample({ score: null, forwardReturns: { 5: 0.5 } }), // no score — must not pollute the correlation
      sample({ score: 90, forwardReturns: { 5: null } }), // no return at this horizon
      sample({ score: 50, forwardReturns: { 5: 0.01 } }),
    ];
    const rho = scoreForwardReturnSpearman(samples, 5);
    expect(rho).toBeCloseTo(spearmanCorrelation([10, 50], [-0.02, 0.01]), 10);
  });
});

describe("summarizeCsp", () => {
  it("computes mean/median/p05/win rate/assigned rate on a known sample", () => {
    const outcomes = [
      { returnOnCollateral: 0.02, assigned: false },
      { returnOnCollateral: 0.02, assigned: false },
      { returnOnCollateral: 0.02, assigned: false },
      { returnOnCollateral: -0.3, assigned: true }, // one big loss in the tail
    ];
    const s = summarizeCsp("test", outcomes);
    expect(s.n).toBe(4);
    expect(s.winRate).toBeCloseTo(0.75, 10);
    expect(s.assignedRate).toBeCloseTo(0.25, 10);
    expect(s.meanReturn).toBeCloseTo((0.02 * 3 - 0.3) / 4, 10);
    // p05 (5th percentile) should sit down in the loss, not among the wins,
    // since it's the worst outcome in a 4-sample set.
    expect(s.p05Return).toBeLessThan(0);
  });

  it("returns NaN fields, not a crash, for an empty bucket", () => {
    const s = summarizeCsp("empty", []);
    expect(s.n).toBe(0);
    expect(Number.isNaN(s.meanReturn)).toBe(true);
    expect(Number.isNaN(s.p05Return)).toBe(true);
  });
});

describe("bucketCspByGrade", () => {
  it("groups by grade and skips samples with no modeled CSP outcome", () => {
    const samples: WalkForwardSample[] = [
      sample({ grade: "Strong setup", cspReturn: 0.03, cspAssigned: false }),
      sample({ grade: "Strong setup", cspReturn: -0.1, cspAssigned: true }),
      sample({ grade: "Avoid", cspReturn: 0.01, cspAssigned: false }),
      sample({ grade: "Avoid", cspReturn: null, cspAssigned: null }), // opts.csp wasn't requested for this sample — skipped, not a zero
    ];
    const buckets = bucketCspByGrade(samples);
    expect(buckets["Strong setup"].n).toBe(2);
    expect(buckets["Avoid"].n).toBe(1);
  });
});

describe("splitByDate", () => {
  it("splits samples into before/onOrAfter the given ISO date, inclusive on the later side", () => {
    const samples: WalkForwardSample[] = [
      sample({ asOfDate: "2020-01-01T00:00:00Z" }),
      sample({ asOfDate: "2021-06-01T00:00:00Z" }),
      sample({ asOfDate: "2021-06-01T12:00:00Z" }), // same calendar day as the split, later time — still "onOrAfter"
      sample({ asOfDate: "2022-01-01T00:00:00Z" }),
    ];
    const { before, onOrAfter } = splitByDate(samples, "2021-06-01");
    expect(before).toHaveLength(1);
    expect(onOrAfter).toHaveLength(3);
  });

  it("returns all samples in 'before' when the split date is after every sample", () => {
    const samples: WalkForwardSample[] = [sample({ asOfDate: "2020-01-01T00:00:00Z" })];
    const { before, onOrAfter } = splitByDate(samples, "2030-01-01");
    expect(before).toHaveLength(1);
    expect(onOrAfter).toHaveLength(0);
  });
});
