// CLI entry point — validate whether Alex's scan (src/lib/technicals.ts)
// actually predicts anything, by walking forward through real historical
// data and checking whether a higher grade/score correlates with a better
// forward return than a lower one would have.
//
// Three data sources, chosen with --source (default alpaca):
//
//   alpaca (default) — needs ALPACA_KEY_ID/ALPACA_SECRET_KEY (the same
//     credentials api/history.ts uses). Free IEX feed has no trade data
//     before 2016-01-01 — the shallowest of the three.
//   tiingo — needs TIINGO_API_KEY. Free up to 50 symbols/hour, and often
//     decades deeper history than Alpaca's free tier. Uses split/dividend-
//     adjusted prices (see dataSource.ts's docstring for why).
//   norgate — reads a directory of `<SYMBOL>.csv` files YOU export
//     yourself from the Norgate Data Updater (Windows/WSL2, paid
//     subscription, not something this script can fetch on its own —
//     see norgateSource.ts's docstring for exactly why). Pass
//     --norgate-dir=<path>, and --norgate-columns if your export's header
//     names don't match the defaults.
//
// See README.md's "Backtesting Alex's scan" section for the full
// comparison of the three and what each does and doesn't fix.
//
// Usage:
//
//   npm run backtest:alex -- --dry-run                        # no credentials needed, synthetic data
//   npm run backtest:alex                                      # Alpaca, defaults
//   npm run backtest:alex -- --source=tiingo --years=10
//   npm run backtest:alex -- --source=norgate --norgate-dir=./norgate-export
//   npm run backtest:alex -- --tickers=AAPL,MSFT,NVDA --out=my-run.json

import { writeFileSync } from "node:fs";
import type { Bar } from "../../src/types";
import { COMPANIES } from "../../src/appConstants";
import {
  alpacaCredsFromEnv,
  fetchDailyBarsAlpaca,
  tiingoKeyFromEnv,
  fetchDailyBarsTiingo,
} from "./dataSource";
import { loadNorgateBarsForSymbol, DEFAULT_NORGATE_COLUMNS, type NorgateColumnMap } from "./norgateSource";
import { generateSyntheticBars } from "./syntheticData";
import { walkForward, type WalkForwardSample } from "./engine";
import { bucketByGrade, bucketByScoreDecile, type BucketStat } from "./stats";
import { printGradeTable, printDecileTable } from "./report";

type Source = "alpaca" | "tiingo" | "norgate";

interface Args {
  source: Source;
  years: number;
  horizons: number[];
  stride: number;
  minLookback: number;
  capital: number;
  tickers: string[];
  out: string;
  dryRun: boolean;
  norgateDir?: string;
  norgateColumns?: NorgateColumnMap;
}

function parseArgs(argv: string[]): Args {
  const get = (name: string): string | undefined => {
    const prefix = `--${name}=`;
    const hit = argv.find((a) => a.startsWith(prefix));
    return hit ? hit.slice(prefix.length) : undefined;
  };

  const source = (get("source") ?? "alpaca") as Source;
  if (!["alpaca", "tiingo", "norgate"].includes(source)) {
    throw new Error(`--source must be one of alpaca, tiingo, norgate (got "${source}")`);
  }

  const columnsArg = get("norgate-columns");
  const norgateColumns: NorgateColumnMap | undefined = columnsArg
    ? parseNorgateColumnsArg(columnsArg)
    : undefined;

  return {
    source,
    years: Number(get("years") ?? 5),
    horizons: (get("horizons") ?? "5,10,20").split(",").map(Number),
    stride: Number(get("stride") ?? 5),
    minLookback: Number(get("min-lookback") ?? 250),
    capital: Number(get("capital") ?? 5000),
    tickers: (get("tickers") ?? COMPANIES.map((c) => c.ticker).join(",")).split(","),
    out: get("out") ?? "scripts/backtest/last-run.json",
    dryRun: argv.includes("--dry-run"),
    norgateDir: get("norgate-dir"),
    norgateColumns,
  };
}

// Parses `date:D,open:O,high:H,low:L,close:C,volume:V` into a NorgateColumnMap,
// overriding only the fields given — any field left unspecified keeps its
// default alias list.
function parseNorgateColumnsArg(arg: string): NorgateColumnMap {
  const map: NorgateColumnMap = {
    date: [...DEFAULT_NORGATE_COLUMNS.date],
    open: [...DEFAULT_NORGATE_COLUMNS.open],
    high: [...DEFAULT_NORGATE_COLUMNS.high],
    low: [...DEFAULT_NORGATE_COLUMNS.low],
    close: [...DEFAULT_NORGATE_COLUMNS.close],
    volume: [...DEFAULT_NORGATE_COLUMNS.volume],
  };
  for (const pair of arg.split(",")) {
    const [field, header] = pair.split(":");
    if (!field || !header) continue;
    if (field in map) map[field as keyof NorgateColumnMap] = [header.trim().toLowerCase()];
  }
  return map;
}

async function fetchBarsFor(sym: string, args: Args): Promise<Bar[]> {
  if (args.dryRun) {
    // Distinct seed per ticker so a --dry-run doesn't compare a ticker
    // against an identical copy of itself.
    const seed = args.tickers.indexOf(sym) + 2;
    return generateSyntheticBars(50 + seed * 7, tradingDaysFor(args.years), seed);
  }
  if (args.source === "alpaca") {
    return fetchDailyBarsAlpaca(sym, args.years, alpacaCredsFromEnv()!);
  }
  if (args.source === "tiingo") {
    return fetchDailyBarsTiingo(sym, args.years, tiingoKeyFromEnv()!);
  }
  // norgate
  return loadNorgateBarsForSymbol(args.norgateDir!, sym, args.norgateColumns ?? DEFAULT_NORGATE_COLUMNS);
}

function checkCredentials(args: Args): void {
  if (args.dryRun) return;
  if (args.source === "alpaca" && !alpacaCredsFromEnv()) {
    fail(
      "ALPACA_KEY_ID and ALPACA_SECRET_KEY are not set. This is the same live Alpaca\n" +
        "credentials the deployed app uses (see api/history.ts)."
    );
  }
  if (args.source === "tiingo" && !tiingoKeyFromEnv()) {
    fail("TIINGO_API_KEY is not set. Get a free key at https://www.tiingo.com/ and export it.");
  }
  if (args.source === "norgate" && !args.norgateDir) {
    fail(
      "--norgate-dir=<path> is required for --source=norgate — a directory of\n" +
        "<SYMBOL>.csv files exported from the Norgate Data Updater (Windows/WSL2, a\n" +
        "paid subscription, and NDU actually running are all required on your end —\n" +
        "see norgateSource.ts's docstring for why this can't be a live fetch)."
    );
  }
}

function fail(message: string): never {
  console.error(`${message}\nRun with --dry-run first to sanity-check the harness with synthetic data,\nno credentials required.`);
  process.exit(1);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.dryRun) {
    console.log("── DRY RUN — synthetic data, NOT a validation of Alex's scan ──");
    console.log("This only proves the harness's plumbing runs end-to-end. See run.ts's\ndocstring for how to run it for real.\n");
  } else {
    checkCredentials(args);
  }

  console.log(
    `source=${args.source} tickers=${args.tickers.length} years=${args.years} horizons=${args.horizons.join(",")} ` +
      `stride=${args.stride} minLookback=${args.minLookback} capital=${args.capital}`
  );

  const spyBars = await fetchBarsFor("SPY", args);
  console.log(`SPY: ${spyBars.length} bars`);

  const allSamples: WalkForwardSample[] = [];
  for (const sym of args.tickers) {
    try {
      const bars = await fetchBarsFor(sym, args);
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
