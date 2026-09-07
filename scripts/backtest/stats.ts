// Bucketing and summary statistics over walk-forward samples — pure, unit
// tested (stats.test.ts). Separate from engine.ts so the "does the score
// mean anything" question (this file) stays independent of "did we compute
// the score honestly" (engine.ts's no-lookahead guarantee).
//
// Caveat that belongs right up front, not buried in a code comment nobody
// reads: consecutive samples from the same ticker (especially at a small
// `stride`) share most of their trailing bars and overlap in their forward
// windows, so they are NOT independent observations. The standard error
// below is the naive iid formula — it understates the true uncertainty for
// overlapping samples. Treat `stdErr` as a rough guide to "is this bucket's
// mean based on a handful of samples or a few hundred," not as a rigorous
// confidence interval. report.ts repeats this caveat next to the numbers.

import type { WalkForwardSample } from "./engine";

export interface BucketStat {
  label: string;
  n: number;
  meanReturn: number;
  medianReturn: number;
  winRate: number; // fraction of samples with a positive forward return
  stdErr: number; // naive iid standard error — see the caveat above
}

export function summarize(label: string, returns: number[]): BucketStat {
  const n = returns.length;
  if (n === 0) return { label, n: 0, meanReturn: NaN, medianReturn: NaN, winRate: NaN, stdErr: NaN };
  const meanReturn = returns.reduce((a, b) => a + b, 0) / n;
  const sorted = [...returns].sort((a, b) => a - b);
  const medianReturn =
    n % 2 === 1 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
  const winRate = returns.filter((r) => r > 0).length / n;
  const variance =
    n > 1 ? returns.reduce((a, b) => a + (b - meanReturn) ** 2, 0) / (n - 1) : 0;
  const stdErr = n > 1 ? Math.sqrt(variance / n) : NaN;
  return { label, n, meanReturn, medianReturn, winRate, stdErr };
}

// Buckets by grade.label — the actual decision surface a user sees ("Strong
// setup" vs "Avoid"), not just the raw 0-100 score, since that's what this
// backtest is really asking: does trusting the grade the app shows you
// actually correlate with a better forward return than ignoring it?
export function bucketByGrade(
  samples: WalkForwardSample[],
  horizon: number
): Record<string, BucketStat> {
  const groups = new Map<string, number[]>();
  for (const s of samples) {
    const r = s.forwardReturns[horizon];
    if (r == null) continue;
    if (!groups.has(s.grade)) groups.set(s.grade, []);
    groups.get(s.grade)!.push(r);
  }
  const out: Record<string, BucketStat> = {};
  for (const [label, returns] of groups) out[label] = summarize(label, returns);
  return out;
}

// Buckets by raw-score decile (0-9, i.e. score 0-9 -> decile 0, ..., 90-100
// -> decile 9) — a finer-grained monotonicity check than the 5 named
// grades: if the scoring actually tracks something real, mean forward
// return should trend upward decile by decile, not just differ between the
// top and bottom grade.
export function bucketByScoreDecile(
  samples: WalkForwardSample[],
  horizon: number
): Record<number, BucketStat> {
  const groups = new Map<number, number[]>();
  for (const s of samples) {
    const r = s.forwardReturns[horizon];
    if (r == null) continue;
    const decile = Math.min(9, Math.floor(s.score / 10));
    if (!groups.has(decile)) groups.set(decile, []);
    groups.get(decile)!.push(r);
  }
  const out: Record<number, BucketStat> = {};
  for (const [decile, returns] of groups) out[decile] = summarize(`decile ${decile}`, returns);
  return out;
}
