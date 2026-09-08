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

// Linear-interpolation percentile over an already-ascending-sorted array —
// used by summarizeCsp's p05 (the left-tail number that matters for a
// short-put strategy, where a high win rate can hide a small number of
// large losses that a mean or median alone won't show).
function percentile(sortedAsc: number[], p: number): number {
  const n = sortedAsc.length;
  if (n === 0) return NaN;
  if (n === 1) return sortedAsc[0];
  const rank = p * (n - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return sortedAsc[lo];
  const frac = rank - lo;
  return sortedAsc[lo] * (1 - frac) + sortedAsc[hi] * frac;
}

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
// Evaluators without a numeric score (Holdings' entryVerdict/technicalVerdict
// — see evaluators.ts) leave `score: null` on every sample; there's nothing
// to bucket by decile for those, so such samples are skipped here rather
// than crashing or silently landing in decile 0.
export function bucketByScoreDecile(
  samples: WalkForwardSample[],
  horizon: number
): Record<number, BucketStat> {
  const groups = new Map<number, number[]>();
  for (const s of samples) {
    const r = s.forwardReturns[horizon];
    if (r == null) continue;
    if (s.score == null) continue;
    const decile = Math.min(9, Math.floor(s.score / 10));
    if (!groups.has(decile)) groups.set(decile, []);
    groups.get(decile)!.push(r);
  }
  const out: Record<number, BucketStat> = {};
  for (const [decile, returns] of groups) out[decile] = summarize(`decile ${decile}`, returns);
  return out;
}

// Per-ticker metadata used only for stratifying results after the fact
// (sector, rough market-cap tier) — never fed into analyzeStock() itself,
// so it can't influence the score being tested. Hand-classified, approximate
// as of this app's own snapshot data (see appConstants.ts's own disclaimer)
// — good enough for "does the effect look different in tech vs financials,"
// not a claim of precise or current market caps.
export interface TickerMeta {
  sector: string;
  capTier: string;
}

function bucketByMetaField(
  samples: WalkForwardSample[],
  horizon: number,
  meta: Map<string, TickerMeta>,
  field: keyof TickerMeta
): Record<string, BucketStat> {
  const groups = new Map<string, number[]>();
  for (const s of samples) {
    const r = s.forwardReturns[horizon];
    if (r == null) continue;
    const key = meta.get(s.sym)?.[field] ?? "Unknown";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }
  const out: Record<string, BucketStat> = {};
  for (const [key, returns] of groups) out[key] = summarize(key, returns);
  return out;
}

// Is the (lack of an) effect uniform across sectors, or concentrated/absent
// in particular ones? A ticker missing from `meta` buckets under "Unknown"
// rather than being silently dropped, so a stale metadata table shows up as
// a visible bucket instead of quietly shrinking the sample.
export function bucketBySector(
  samples: WalkForwardSample[],
  horizon: number,
  meta: Map<string, TickerMeta>
): Record<string, BucketStat> {
  return bucketByMetaField(samples, horizon, meta, "sector");
}

// Same question, by rough market-cap tier — does a mega-cap-only watchlist
// hide an effect (or a lack of one) that shows up differently in smaller,
// less efficiently-priced names?
export function bucketByCapTier(
  samples: WalkForwardSample[],
  horizon: number,
  meta: Map<string, TickerMeta>
): Record<string, BucketStat> {
  return bucketByMetaField(samples, horizon, meta, "capTier");
}

// Does the (lack of an) effect hold up year by year, or is it concentrated
// in a handful of unusual years (a single crash, a single melt-up) that
// dominate the pooled mean? asOfDate's first 4 characters are the calendar
// year in every source this harness fetches from (Alpaca/Tiingo/Norgate
// all hand back ISO-8601 dates), so this is a plain substring, not a Date
// parse — same idea as splitByDate's own pure-string comparison below.
export function bucketByYear(samples: WalkForwardSample[], horizon: number): Record<string, BucketStat> {
  const groups = new Map<string, number[]>();
  for (const s of samples) {
    const r = s.forwardReturns[horizon];
    if (r == null) continue;
    const year = s.asOfDate.slice(0, 4);
    if (!groups.has(year)) groups.set(year, []);
    groups.get(year)!.push(r);
  }
  const out: Record<string, BucketStat> = {};
  for (const [year, returns] of groups) out[year] = summarize(year, returns);
  return out;
}

// Rank-based (Spearman) correlation: does a HIGHER score correlate with a
// BETTER forward return, monotonically — a stricter question than
// bucketByGrade ("do the top and bottom buckets differ") or
// bucketByScoreDecile ("does the mean trend upward decile by decile on
// average"). Rank-based rather than Pearson so it doesn't assume a linear
// relationship or get distorted by a handful of extreme-return outliers —
// the standard choice for "does this score predict rank order" questions
// in the trading-signal literature this was ported from (see README.md).
//
// Ties (repeated scores, or repeated returns) get the AVERAGE of the ranks
// they'd occupy — the standard tie-handling method. Without it, samples
// tied on score would be ranked arbitrarily among themselves, which biases
// the correlation when there are many ties (e.g. a discrete 0-100 score
// with a large sample size will have plenty).
function rankWithTies(values: number[]): number[] {
  const n = values.length;
  const order = values.map((_, i) => i).sort((a, b) => values[a] - values[b]);
  const ranks = new Array<number>(n);
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && values[order[j + 1]] === values[order[i]]) j++;
    const avgRank = (i + j) / 2 + 1; // 1-based rank, averaged across the tied block
    for (let k = i; k <= j; k++) ranks[order[k]] = avgRank;
    i = j + 1;
  }
  return ranks;
}

// -1 = higher rank in x means a WORSE rank in y, 0 = no monotonic
// relationship, +1 = higher x means better y. NaN for fewer than 2 samples
// or a constant series (rank variance of zero — correlation is undefined,
// not zero, when every value is identical).
export function spearmanCorrelation(xs: number[], ys: number[]): number {
  if (xs.length !== ys.length) throw new Error("spearmanCorrelation: xs and ys must be the same length");
  const n = xs.length;
  if (n < 2) return NaN;
  const rx = rankWithTies(xs);
  const ry = rankWithTies(ys);
  const meanRx = rx.reduce((a, b) => a + b, 0) / n;
  const meanRy = ry.reduce((a, b) => a + b, 0) / n;
  let cov = 0;
  let varX = 0;
  let varY = 0;
  for (let i = 0; i < n; i++) {
    const dx = rx[i] - meanRx;
    const dy = ry[i] - meanRy;
    cov += dx * dy;
    varX += dx * dx;
    varY += dy * dy;
  }
  if (varX === 0 || varY === 0) return NaN;
  return cov / Math.sqrt(varX * varY);
}

// Score-vs-forward-return Spearman for one horizon — skips samples with no
// numeric score (Holdings' entryVerdict/technicalVerdict leave every
// sample's score null; same guard as bucketByScoreDecile) or no forward
// return at this horizon.
export function scoreForwardReturnSpearman(samples: WalkForwardSample[], horizon: number): number {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const s of samples) {
    const r = s.forwardReturns[horizon];
    if (r == null || s.score == null) continue;
    xs.push(s.score);
    ys.push(r);
  }
  return spearmanCorrelation(xs, ys);
}

// Summary stats for a modeled CSP overlay bucket (see cspOverlay.ts) — a
// distinct shape from BucketStat because a CSP trade has no "horizon" (its
// DTE is fixed independent of the stock-return horizons being tested) and
// carries return-on-collateral / assignment-rate concepts a plain forward
// return doesn't.
export interface CspBucketStat {
  label: string;
  n: number;
  meanReturn: number; // mean return on collateral
  medianReturn: number;
  p05Return: number; // 5th-percentile return on collateral — the left tail
  winRate: number; // fraction with netPL > 0 (premium exceeded any assignment loss)
  assignedRate: number; // fraction that finished ITM (modeled as assigned)
}

export function summarizeCsp(
  label: string,
  outcomes: { returnOnCollateral: number; assigned: boolean }[]
): CspBucketStat {
  const n = outcomes.length;
  if (n === 0) {
    return { label, n: 0, meanReturn: NaN, medianReturn: NaN, p05Return: NaN, winRate: NaN, assignedRate: NaN };
  }
  const returns = outcomes.map((o) => o.returnOnCollateral);
  const sorted = [...returns].sort((a, b) => a - b);
  const meanReturn = returns.reduce((a, b) => a + b, 0) / n;
  const medianReturn = percentile(sorted, 0.5);
  const p05Return = percentile(sorted, 0.05);
  const winRate = outcomes.filter((o) => o.returnOnCollateral > 0).length / n;
  const assignedRate = outcomes.filter((o) => o.assigned).length / n;
  return { label, n, meanReturn, medianReturn, p05Return, winRate, assignedRate };
}

// Buckets the modeled CSP overlay by grade — does "Strong setup" actually
// pay better, or reduce tail risk (p05), relative to "Avoid"? This is the
// question the external report's CSP overlay actually answered (it did
// not: Strong setup did not reduce the ~-9% left tail). Samples without a
// modeled CSP outcome (opts.csp not requested, or modelCspTrade returned
// null for that day — see cspOverlay.ts) are skipped, not counted as a
// zero.
export function bucketCspByGrade(samples: WalkForwardSample[]): Record<string, CspBucketStat> {
  const groups = new Map<string, { returnOnCollateral: number; assigned: boolean }[]>();
  for (const s of samples) {
    if (s.cspReturn == null || s.cspAssigned == null) continue;
    if (!groups.has(s.grade)) groups.set(s.grade, []);
    groups.get(s.grade)!.push({ returnOnCollateral: s.cspReturn, assigned: s.cspAssigned });
  }
  const out: Record<string, CspBucketStat> = {};
  for (const [label, outcomes] of groups) out[label] = summarizeCsp(label, outcomes);
  return out;
}

// Splits samples chronologically at `splitDateIso` (inclusive on the "on or
// after" side) — the fit/test-period check: does whatever pattern (or lack
// of one) shows up in the pooled data hold up separately in an earlier era
// and a later one, or does it only exist when the two are blended together?
// Pure string comparison on ISO dates — no Date parsing needed since
// WalkForwardSample.asOfDate is already an ISO string.
export function splitByDate(
  samples: WalkForwardSample[],
  splitDateIso: string
): { before: WalkForwardSample[]; onOrAfter: WalkForwardSample[] } {
  const before: WalkForwardSample[] = [];
  const onOrAfter: WalkForwardSample[] = [];
  for (const s of samples) {
    (s.asOfDate < splitDateIso ? before : onOrAfter).push(s);
  }
  return { before, onOrAfter };
}
