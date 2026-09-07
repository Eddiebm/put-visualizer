// CLI entry point — validate whether Alex's scan (src/lib/technicals.ts)
// actually predicts anything, by walking forward through real historical
// data and checking whether a higher grade/score correlates with a better
// forward return than a lower one would have.
//
// Usage (once a live deployment exists, i.e. ALPACA_KEY_ID/ALPACA_SECRET_KEY
// are set to real, working credentials):
//
//   npm run backtest:alex
//   npm run backtest:alex -- --years=5 --horizons=5,10,20 --stride=5
//   npm run backtest:alex -- --tickers=AAPL,MSFT,NVDA --out=my-run.json
//
// Before you have real credentials, sanity-check the harness itself with
// synthetic data (no network, no credentials required):
//
//   npm run backtest:alex -- --dry-run
//
// See README.md's "Still open" section for the full writeup of what this
// does and doesn't validate.

import { writeFileSync } from "node:fs";
import { COMPANIES } from "../../src/appConstants";
import { credsFromEnv, fetchDailyBars } from "./dataSource";
import { generateSyntheticBars } from "./syntheticData";
import { walkForward, type WalkForwardSample } from "./engine";
import { bucketByGrade, bucketByScoreDecile, type BucketStat } from "./stats";
import { printGradeTable, printDecileTable } from "./report";

interface Args {
  years: number;
  horizons: number[];
  stride: number;
  minLookback: number;
  capital: number;
  tickers: string[];
  out: string;
  dryRun: boolean;
}

function parseArgs(argv: string[]): Args {
  const get = (name: string): string | undefined => {
    const prefix = `--${name}=`;
    const hit = argv.find((a) => a.startsWith(prefix));
    return hit ? hit.slice(prefix.length) : undefined;
  };
  return {
    years: Number(get("years") ?? 5),
    horizons: (get("horizons") ?? "5,10,20").split(",").map(Number),
    stride: Number(get("stride") ?? 5),
    minLookback: Number(get("min-lookback") ?? 250),
    capital: Number(get("capital") ?? 5000),
    tickers: (get("tickers") ?? COMPANIES.map((c) => c.ticker).join(",")).split(","),
    out: get("out") ?? "scripts/backtest/last-run.json",
    dryRun: argv.includes("--dry-run"),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.dryRun) {
    console.log("── DRY RUN — synthetic data, NOT a validation of Alex's scan ──");
    console.log("This only proves the harness's plumbing runs end-to-end. See run.ts's\ndocstring for how to run it for real.\n");
  } else {
    const creds = credsFromEnv();
    if (!creds) {
      console.error(
        "ALPACA_KEY_ID and ALPACA_SECRET_KEY are not set. This backtest needs the\n" +
          "same live Alpaca credentials the deployed app uses (see api/history.ts).\n" +
          "Run with --dry-run first to sanity-check the harness with synthetic data,\n" +
          "no credentials required."
      );
      process.exit(1);
    }
  }

  console.log(
    `tickers=${args.tickers.length} years=${args.years} horizons=${args.horizons.join(",")} ` +
      `stride=${args.stride} minLookback=${args.minLookback} capital=${args.capital}`
  );

  const spyBars = args.dryRun
    ? generateSyntheticBars(400, tradingDaysFor(args.years), 1)
    : await fetchDailyBars("SPY", args.years, credsFromEnv()!);
  console.log(`SPY: ${spyBars.length} bars`);

  const allSamples: WalkForwardSample[] = [];
  for (const [idx, sym] of args.tickers.entries()) {
    try {
      const bars = args.dryRun
        ? generateSyntheticBars(50 + idx * 7, tradingDaysFor(args.years), idx + 2) // distinct seed per ticker
        : await fetchDailyBars(sym, args.years, credsFromEnv()!);
      if (bars.length < args.minLookback) {
        console.warn(`  ${sym}: only ${bars.length} bars, below minLookback=${args.minLookback} — skipped`);
        continue;
      }
      const samples = walkForward(sym, bars, spyBars, {
        capital: args.capital,
        horizons: args.horizons,
        stride: args.stride,
        minLookback: args.minLookback,
      });
      allSamples.push(...samples);
      console.log(`  ${sym}: ${bars.length} bars -> ${samples.length} samples`);
    } catch (err) {
      console.warn(`  ${sym}: fetch failed (${(err as Error).message}) — skipped`);
    }
  }

  console.log(`\nTotal samples across all tickers: ${allSamples.length}`);
  if (allSamples.length === 0) {
    console.error("No samples produced — nothing to report.");
    process.exit(1);
  }

  const byGrade: Record<number, Record<string, BucketStat>> = {};
  const byDecile: Record<number, Record<number, BucketStat>> = {};
  for (const h of args.horizons) {
    byGrade[h] = bucketByGrade(allSamples, h);
    byDecile[h] = bucketByScoreDecile(allSamples, h);
  }

  printGradeTable(byGrade);
  printDecileTable(byDecile);

  writeFileSync(
    args.out,
    JSON.stringify({ args, generatedAt: new Date().toISOString(), byGrade, byDecile, sampleCount: allSamples.length }, null, 2)
  );
  console.log(`\nFull results written to ${args.out}`);
}

// Rough trading-day count for `years` of history — used only to size the
// synthetic series in --dry-run mode.
function tradingDaysFor(years: number): number {
  return Math.round(years * 252);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
