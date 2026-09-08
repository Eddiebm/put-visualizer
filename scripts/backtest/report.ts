// Console + JSON reporting for the backtest — separated out so run.ts stays
// a thin orchestrator and this formatting logic can change without
// touching the sampling/stats logic it's reporting on.

import type { BucketStat } from "./stats";

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
