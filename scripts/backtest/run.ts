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
// Independent of --source: --universe=<path> gates evaluation to a
// point-in-time index universe (see universe.ts) — a CSV of which symbol
// was eligible from when to when, closing the survivorship-bias gap in
// COMPANIES (today's ~40 large caps/ETFs) by including names that have
// since been delisted/dropped from the watchlist. When given without an
// explicit --tickers, the ticker list defaults to every symbol that
// *ever* appears in the universe file, not just today's COMPANIES.
// --universe-columns overrides its header names, same idea as
// --norgate-columns. Getting delisted names' actual *price* data still
// generally requires --source=norgate — Alpaca/Tiingo don't carry it.
//
// See README.md's "Backtesting Alex's scan" section for the full
// comparison and what does/doesn't fix survivorship bias.
//
// Usage:
//
//   npm run backtest:alex -- --dry-run                        # no credentials needed, synthetic data
//   npm run backtest:alex                                      # Alpaca, defaults
//   npm run backtest:alex -- --source=tiingo --years=10
//   npm run backtest:alex -- --source=norgate --norgate-dir=./norgate-export
//   npm run backtest:alex -- --source=norgate --norgate-dir=./norgate-export --universe=./sp500-constituents.csv
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
import {
  loadConstituentsFromFile,
  buildEligibilityIndex,
  isSymbolEligible,
  distinctSymbols,
  DEFAULT_UNIVERSE_COLUMNS,
  type UniverseColumnMap,
  type MembershipInterval,
} from "./universe";
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
  tickersArg?: string; // raw --tickers value, unresolved — see resolveTickers()
  out: string;
  dryRun: boolean;
  norgateDir?: string;
  norgateColumns?: NorgateColumnMap;
  universe?: string;
  universeColumns?: UniverseColumnMap;
}

// Overrides only the fields present in `arg` ("field:header,field:header"),
// keeping every other field's default alias list — shared by
// --norgate-columns and --universe-columns, which differ only in which
// fields they have. Works on the loose Record shape and gets cast back to
// the caller's real column-map type at the two call sites below: both
// NorgateColumnMap and UniverseColumnMap are plain "every field is a
// string[]" interfaces with no index signature, which TS won't unify with
// a generic Record<string, string[]> constraint on its own.
function parseColumnOverridesRaw(arg: string, defaults: Record<string, string[]>): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(defaults)) map[k] = [...v];
  for (const pair of arg.split(",")) {
    const [field, header] = pair.split(":");
    if (!field || !header) continue;
    if (field in map) map[field] = [header.trim().toLowerCase()];
  }
  return map;
}

function parseNorgateColumnOverrides(arg: string): NorgateColumnMap {
  return parseColumnOverridesRaw(arg, DEFAULT_NORGATE_COLUMNS as unknown as Record<string, string[]>) as unknown as NorgateColumnMap;
}

function parseUniverseColumnOverrides(arg: string): UniverseColumnMap {
  return parseColumnOverridesRaw(arg, DEFAULT_UNIVERSE_COLUMNS as unknown as Record<string, string[]>) as unknown as UniverseColumnMap;
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

  const norgateColumnsArg = get("norgate-columns");
  const universeColumnsArg = get("universe-columns");

  return {
    source,
    years: Number(get("years") ?? 5),
    horizons: (get("horizons") ?? "5,10,20").split(",").map(Number),
    stride: Number(get("stride") ?? 5),
    minLookback: Number(get("min-lookback") ?? 250),
    capital: Number(get("capital") ?? 5000),
    tickersArg: get("tickers"),
    out: get("out") ?? "scripts/backtest/last-run.json",
    dryRun: argv.includes("--dry-run"),
    norgateDir: get("norgate-dir"),
    norgateColumns: norgateColumnsArg ? parseNorgateColumnOverrides(norgateColumnsArg) : undefined,
    universe: get("universe"),
    universeColumns: universeColumnsArg ? parseUniverseColumnOverrides(universeColumnsArg) : undefined,
  };
}

// Explicit --tickers wins; otherwise, with --universe given, every symbol
// that ever appears in it (the whole point — today's COMPANIES watchlist
// would silently drop back to survivors-only); otherwise COMPANIES.
function resolveTickers(args: Args, universeIntervals: MembershipInterval[] | null): string[] {
  if (args.tickersArg) return args.tickersArg.split(",");
  if (universeIntervals) return distinctSymbols(universeIntervals);
  return COMPANIES.map((c) => c.ticker);
}

async function fetchBarsFor(sym: string, tickers: string[], args: Args): Promise<Bar[]> {
  if (args.dryRun) {
    // Distinct seed per ticker so a --dry-run doesn't compare a ticker
    // against an identical copy of itself.
    const seed = tickers.indexOf(sym) + 2;
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

  let universeIntervals: MembershipInterval[] | null = null;
  if (args.universe) {
    try {
      universeIntervals = loadConstituentsFromFile(args.universe, args.universeColumns ?? DEFAULT_UNIVERSE_COLUMNS);
    } catch (err) {
      fail(`Couldn't load --universe=${args.universe}: ${(err as Error).message}`);
    }
    console.log(`universe: ${universeIntervals!.length} membership intervals, ${distinctSymbols(universeIntervals!).length} distinct symbols`);
  }
  const eligibilityIndex = universeIntervals ? buildEligibilityIndex(universeIntervals) : null;

  const tickers = resolveTickers(args, universeIntervals);

  console.log(
    `source=${args.source} tickers=${tickers.length} years=${args.years} horizons=${args.horizons.join(",")} ` +
      `stride=${args.stride} minLookback=${args.minLookback} capital=${args.capital}`
  );

  const spyBars = await fetchBarsFor("SPY", tickers, args);
  console.log(`SPY: ${spyBars.length} bars`);

  const allSamples: WalkForwardSample[] = [];
  for (const sym of tickers) {
    try {
      const bars = await fetchBarsFor(sym, tickers, args);
      if (bars.length < args.minLookback) {
        console.warn(`  ${sym}: only ${bars.length} bars, below minLookback=${args.minLookback} — skipped`);
        continue;
      }
      const samples = walkForward(sym, bars, spyBars, {
        capital: args.capital,
        horizons: args.horizons,
        stride: args.stride,
        minLookback: args.minLookback,
        isEligible: eligibilityIndex ? (d) => isSymbolEligible(eligibilityIndex, sym, d) : undefined,
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
    JSON.stringify(
      { args: { ...args }, tickers, generatedAt: new Date().toISOString(), byGrade, byDecile, sampleCount: allSamples.length },
      null,
      2
    )
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
