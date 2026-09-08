// Console + JSON reporting for the backtest — separated out so run.ts stays
// a thin orchestrator and this formatting logic can change without
// touching the sampling/stats logic it's reporting on.

import type { BucketStat, CspBucketStat } from "./stats";
import type { CspTradeParams } from "./cspOverlay";

// One order per signal (see evaluators.ts) — each has its own grade/verdict
// vocabulary, so there's no single fixed order that works for all three.
export const ALEX_SCAN_GRADE_ORDER = ["Strong setup", "Good setup", "Watch", "Weak", "Avoid"];
export const HOLDINGS_ENTRY_GRADE_ORDER = ["buy", "wait", "avoid"];
export const HOLDINGS_EXIT_GRADE_ORDER = ["sell", "watch", "hold"];

function pct(n: number): string {
  return Number.isFinite(n) ? `${(n * 100).toFixed(2)}%` : "n/a";
}

export function printGradeTable(
  byHorizon: Record<number, Record<string, BucketStat>>,
  order: string[] = ALEX_SCAN_GRADE_ORDER,
  title?: string
): void {
  if (title) console.log(`\n### ${title} ###`);
  for (const horizon of Object.keys(byHorizon).map(Number).sort((a, b) => a - b)) {
    const buckets = byHorizon[horizon];
    console.log(`\n── ${horizon}-trading-day forward return, by grade ──`);
    console.log(
      ["Grade".padEnd(14), "n".padStart(6), "mean".padStart(9), "median".padStart(9), "win%".padStart(8), "±SE".padStart(9)].join("  ")
    );
    for (const label of order) {
      const b = buckets[label];
      if (!b) continue;
      console.log(
        [
          label.padEnd(14),
          String(b.n).padStart(6),
          pct(b.meanReturn).padStart(9),
          pct(b.medianReturn).padStart(9),
          pct(b.winRate).padStart(8),
          (Number.isFinite(b.stdErr) ? pct(b.stdErr) : "n/a").padStart(9),
        ].join("  ")
      );
    }
  }
  console.log(
    "\nNote: samples overlap in time (same ticker, shared trailing bars, overlapping\n" +
      "forward windows) — they are not independent. Treat ±SE as a rough guide to\n" +
      "sample size, not a rigorous confidence interval. hasEarnings is fixed to\n" +
      "false throughout (no historical earnings calendar wired up), so the\n" +
      "earnings-blackout rule is not exercised by this backtest."
  );
}

export function printDecileTable(byHorizon: Record<number, Record<number, BucketStat>>, title?: string): void {
  if (title) console.log(`\n### ${title} ###`);
  for (const horizon of Object.keys(byHorizon).map(Number).sort((a, b) => a - b)) {
    const buckets = byHorizon[horizon];
    console.log(`\n── ${horizon}-trading-day forward return, by score decile (monotonicity check) ──`);
    console.log(["Decile".padEnd(10), "n".padStart(6), "mean".padStart(9), "win%".padStart(8)].join("  "));
    for (let d = 0; d <= 9; d++) {
      const b = buckets[d];
      if (!b) continue;
      console.log(
        [
          `${d * 10}-${d * 10 + 9}`.padEnd(10),
          String(b.n).padStart(6),
          pct(b.meanReturn).padStart(9),
          pct(b.winRate).padStart(8),
        ].join("  ")
      );
    }
  }
}

// score-vs-forward-return Spearman rank correlation, one horizon per line —
// a stricter monotonicity check than the decile table above (see
// scoreForwardReturnSpearman's own docstring in stats.ts for why rank-based
// rather than a plain Pearson correlation).
export function printSpearmanTable(byHorizon: Record<number, number>): void {
  console.log("\n── Spearman rank correlation, score vs forward return ──");
  console.log(
    "(-1 = higher score means a WORSE forward return, 0 = no monotonic\n" +
      " relationship, +1 = higher score means a better forward return)"
  );
  for (const horizon of Object.keys(byHorizon).map(Number).sort((a, b) => a - b)) {
    const rho = byHorizon[horizon];
    console.log(`  ${String(horizon).padStart(3)}d:  ρ = ${Number.isFinite(rho) ? rho.toFixed(3) : "n/a"}`);
  }
}

// Same samples as printGradeTable, broken out by calendar year instead of
// by grade — sorted chronologically (not by sample count, unlike
// printMetaTable) since the point is seeing the pattern move through time,
// not ranking which year has the most data.
export function printYearTable(byHorizon: Record<number, Record<string, BucketStat>>): void {
  for (const horizon of Object.keys(byHorizon).map(Number).sort((a, b) => a - b)) {
    const buckets = byHorizon[horizon];
    console.log(`\n── ${horizon}-trading-day forward return, by year ──`);
    console.log(["Year".padEnd(8), "n".padStart(6), "mean".padStart(9), "win%".padStart(8)].join("  "));
    for (const year of Object.keys(buckets).sort()) {
      const b = buckets[year];
      console.log(
        [year.padEnd(8), String(b.n).padStart(6), pct(b.meanReturn).padStart(9), pct(b.winRate).padStart(8)].join("  ")
      );
    }
  }
}

// The modeled cash-secured-put overlay (see cspOverlay.ts), bucketed by
// grade — does a better grade actually pay more, or (the sharper question)
// reduce the left tail (p05), relative to a worse one?
export function printCspTable(byGrade: Record<string, CspBucketStat>, order: string[], params: CspTradeParams): void {
  console.log(
    `\n── Modeled cash-secured put overlay: ${params.dte}-DTE, ${Math.round(params.deltaTarget * 100)}-delta, ` +
      `premium via Black-Scholes off trailing ${params.ivLookback}-day realized vol ──`
  );
  console.log(
    [
      "Grade".padEnd(14),
      "n".padStart(6),
      "mean ROC".padStart(10),
      "median".padStart(9),
      "p05 (tail)".padStart(11),
      "win%".padStart(8),
      "assigned%".padStart(11),
    ].join("  ")
  );
  for (const label of order) {
    const b = byGrade[label];
    if (!b) continue;
    console.log(
      [
        label.padEnd(14),
        String(b.n).padStart(6),
        pct(b.meanReturn).padStart(10),
        pct(b.medianReturn).padStart(9),
        pct(b.p05Return).padStart(11),
        pct(b.winRate).padStart(8),
        pct(b.assignedRate).padStart(11),
      ].join("  ")
    );
  }
  console.log(
    "\nReturn on collateral (ROC) = net P/L ÷ strike, the capital a cash-secured put\n" +
      "actually locks up. p05 is the 5th-percentile ROC (roughly a 1-in-20 outcome) —\n" +
      "the left tail a high win rate can hide. NOT a real quote: no historical options\n" +
      "chain exists here, so premium is modeled off trailing realized vol as an IV\n" +
      "proxy — see cspOverlay.ts's docstring for exactly what that does and doesn't\n" +
      "capture."
  );
}

// Generic printer for bucketBySector/bucketByCapTier output — arbitrary
// string-keyed groups rather than the fixed grade/decile orders above, so
// this sorts by sample size descending (the groups with enough data to
// mean anything come first) rather than assuming a known label order.
export function printMetaTable(
  byHorizon: Record<number, Record<string, BucketStat>>,
  heading: string
): void {
  for (const horizon of Object.keys(byHorizon).map(Number).sort((a, b) => a - b)) {
    const buckets = byHorizon[horizon];
    console.log(`\n── ${horizon}-trading-day forward return, by ${heading} ──`);
    console.log(["Group".padEnd(24), "n".padStart(6), "mean".padStart(9), "win%".padStart(8)].join("  "));
    const rows = Object.values(buckets).sort((a, b) => b.n - a.n);
    for (const b of rows) {
      console.log(
        [b.label.padEnd(24), String(b.n).padStart(6), pct(b.meanReturn).padStart(9), pct(b.winRate).padStart(8)].join("  ")
      );
    }
  }
}
