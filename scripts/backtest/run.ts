// CLI entry point — validate whether this app's buy/sell recommendations
// actually predict anything, by walking forward through real historical
// data and checking whether a higher grade/score (or a "buy"/"sell"
// verdict) correlates with a better forward return than a lower one or the
// opposite verdict would have.
//
// --signal=alex-scan|holdings-entry|holdings-exit (default alex-scan)
// picks WHICH of this app's three independent recommendation systems gets
// tested (see evaluators.ts):
//   alex-scan       — src/lib/technicals.ts's analyzeStock(), the general
//                      buy-timing screener that feeds the options
//                      calculator. Has a numeric 0-100 score (decile table
//                      shown); grades Strong setup/Good setup/Watch/Weak/Avoid.
//   holdings-entry  — src/lib/holdings.ts's entryVerdict(), Holdings' own
//                      buy signal ("should I buy this stock", independent
//                      of options entirely). No numeric score (decile
//                      table skipped); verdicts buy/wait/avoid.
//   holdings-exit   — src/lib/holdings.ts's technicalVerdict(), Holdings'
//                      sell signal ("I already own this — is the trend
//                      broken"). No numeric score; verdicts sell/watch/hold.
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
// --split-date=YYYY-MM-DD — the fit/test-period check: reports the grade
// and decile tables separately for samples before vs. on-or-after that
// date, instead of one pooled report. A pattern (or the lack of one) that
// only shows up when both eras are blended together is a much weaker
// finding than one that holds in each era on its own.
//
// --sector-breakdown / --cap-breakdown / --year-breakdown — additional
// views on the SAME samples (see tickerMeta.ts and stats.ts's
// bucketByYear), not a new fetch: does the effect differ by sector, by
// market-cap tier, or hold up year by year rather than being concentrated
// in one crash or one melt-up? Off by default since they add real console
// output; turn on what you want to look at.
//
// For alex-scan specifically (the only signal with a numeric score), a
// Spearman rank correlation between score and forward return prints
// automatically — a stricter monotonicity check than the decile table
// (see stats.ts's scoreForwardReturnSpearman for why rank-based).
//
// --csp-overlay — also models what a 45-DTE, 30-delta cash-secured put
// sold that day would have paid (Black-Scholes off trailing realized vol
// as an IV proxy — see cspOverlay.ts for exactly what that does and
// doesn't capture), bucketed by grade, including the 5th-percentile
// return-on-collateral (the left tail a win rate alone can hide). Override
// the trade shape with --csp-dte, --csp-delta, --csp-iv-lookback. This is
// the sharper question a plain stock-return backtest can't ask: does a
// better grade actually pay more, or reduce tail risk, for the product
// this app actually helps someone sell?
//
// See README.md's "Backtesting this app's buy/sell signals" section for
// the full comparison and what does/doesn't fix survivorship bias.
//
// Usage:
//
//   npm run backtest:alex -- --dry-run                        # no credentials needed, synthetic data
//   npm run backtest:alex                                      # Alpaca, defaults
//   npm run backtest:alex -- --source=tiingo --years=10
//   npm run backtest:alex -- --source=norgate --norgate-dir=./norgate-export
//   npm run backtest:alex -- --source=norgate --norgate-dir=./norgate-export --universe=./sp500-constituents.csv
//   npm run backtest:alex -- --split-date=2021-01-01 --sector-breakdown --cap-breakdown
//   npm run backtest:alex -- --signal=holdings-entry --source=tiingo --years=10
//   npm run backtest:alex -- --signal=holdings-exit --tickers=AAPL,MSFT,NVDA --out=my-run.json
//   npm run backtest:alex -- --year-breakdown --csp-overlay
//   npm run backtest:alex -- --csp-overlay --csp-dte=30 --csp-delta=0.2

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
import { walkForward, type WalkForwardSample, type Evaluator } from "./engine";
import { alexScanEvaluator, holdingsEntryEvaluator, holdingsExitEvaluator } from "./evaluators";
import type { CspTradeParams } from "./cspOverlay";
import {
  bucketByGrade,
  bucketByScoreDecile,
  bucketBySector,
  bucketByCapTier,
  bucketByYear,
  bucketCspByGrade,
  scoreForwardReturnSpearman,
  splitByDate,
  type BucketStat,
  type CspBucketStat,
} from "./stats";
import { TICKER_META } from "./tickerMeta";
import {
  printGradeTable,
  printDecileTable,
  printMetaTable,
  printYearTable,
  printSpearmanTable,
  printCspTable,
  ALEX_SCAN_GRADE_ORDER,
  HOLDINGS_ENTRY_GRADE_ORDER,
  HOLDINGS_EXIT_GRADE_ORDER,
} from "./report";

type Source = "alpaca" | "tiingo" | "norgate";
type Signal = "alex-scan" | "holdings-entry" | "holdings-exit";

const GRADE_ORDER_FOR_SIGNAL: Record<Signal, string[]> = {
  "alex-scan": ALEX_SCAN_GRADE_ORDER,
  "holdings-entry": HOLDINGS_ENTRY_GRADE_ORDER,
  "holdings-exit": HOLDINGS_EXIT_GRADE_ORDER,
};

function evaluatorFor(signal: Signal, sym: string, capital: number): Evaluator {
  if (signal === "alex-scan") return alexScanEvaluator(sym, capital);
  if (signal === "holdings-entry") return holdingsEntryEvaluator();
  return holdingsExitEvaluator();
}

interface Args {
  source: Source;
  signal: Signal;
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
  splitDate?: string;
  sectorBreakdown: boolean;
  capBreakdown: boolean;
  yearBreakdown: boolean;
  cspOverlay: boolean;
  cspDte: number;
  cspDelta: number;
  cspIvLookback: number;
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

  const signal = (get("signal") ?? "alex-scan") as Signal;
  if (!["alex-scan", "holdings-entry", "holdings-exit"].includes(signal)) {
    throw new Error(`--signal must be one of alex-scan, holdings-entry, holdings-exit (got "${signal}")`);
  }

  const norgateColumnsArg = get("norgate-columns");
  const universeColumnsArg = get("universe-columns");

  return {
    source,
    signal,
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
    splitDate: get("split-date"),
    sectorBreakdown: argv.includes("--sector-breakdown"),
    capBreakdown: argv.includes("--cap-breakdown"),
    yearBreakdown: argv.includes("--year-breakdown"),
    cspOverlay: argv.includes("--csp-overlay"),
    cspDte: Number(get("csp-dte") ?? 45),
    cspDelta: Number(get("csp-delta") ?? 0.3),
    cspIvLookback: Number(get("csp-iv-lookback") ?? 20),
  };
}

function cspParamsFor(args: Args): CspTradeParams {
  return { dte: args.cspDte, deltaTarget: args.cspDelta, ivLookback: args.cspIvLookback, rate: 0.05 };
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

interface Report {
  sampleCount: number;
  byGrade: Record<number, Record<string, BucketStat>>;
  byDecile: Record<number, Record<number, BucketStat>>;
  bySector?: Record<number, Record<string, BucketStat>>;
  byCapTier?: Record<number, Record<string, BucketStat>>;
  byYear?: Record<number, Record<string, BucketStat>>;
  spearman?: Record<number, number>;
  csp?: Record<string, CspBucketStat>;
}

// Builds every requested bucketing over one sample set and prints it —
// shared by the pooled (no --split-date) and per-period (--split-date)
// paths below so they can't drift out of sync with each other.
function buildAndPrintReport(samples: WalkForwardSample[], args: Args, title?: string): Report {
  const byGrade: Report["byGrade"] = {};
  const byDecile: Report["byDecile"] = {};
  const bySector: Report["bySector"] = args.sectorBreakdown ? {} : undefined;
  const byCapTier: Report["byCapTier"] = args.capBreakdown ? {} : undefined;
  const byYear: Report["byYear"] = args.yearBreakdown ? {} : undefined;
  // Only alex-scan carries a numeric score — Spearman needs one, so it's
  // meaningless (and skipped) for the other two signals the same way the
  // decile table already is below.
  const spearman: Report["spearman"] = args.signal === "alex-scan" ? {} : undefined;
  for (const h of args.horizons) {
    byGrade[h] = bucketByGrade(samples, h);
    byDecile[h] = bucketByScoreDecile(samples, h);
    if (bySector) bySector[h] = bucketBySector(samples, h, TICKER_META);
    if (byCapTier) byCapTier[h] = bucketByCapTier(samples, h, TICKER_META);
    if (byYear) byYear[h] = bucketByYear(samples, h);
    if (spearman) spearman[h] = scoreForwardReturnSpearman(samples, h);
  }
  const csp = args.cspOverlay ? bucketCspByGrade(samples) : undefined;

  if (title) console.log(`\n========== ${title} (${samples.length} samples) ==========`);
  printGradeTable(byGrade, GRADE_ORDER_FOR_SIGNAL[args.signal]);
  // Only alex-scan carries a numeric score — the other two signals leave
  // every sample's score null, so this table would just print empty
  // headers for them.
  if (args.signal === "alex-scan") printDecileTable(byDecile);
  if (spearman) printSpearmanTable(spearman);
  if (bySector) printMetaTable(bySector, "sector");
  if (byCapTier) printMetaTable(byCapTier, "cap tier");
  if (byYear) printYearTable(byYear);
  if (csp) printCspTable(csp, GRADE_ORDER_FOR_SIGNAL[args.signal], cspParamsFor(args));

  return { sampleCount: samples.length, byGrade, byDecile, bySector, byCapTier, byYear, spearman, csp };
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
    `source=${args.source} signal=${args.signal} tickers=${tickers.length} years=${args.years} ` +
      `horizons=${args.horizons.join(",")} stride=${args.stride} minLookback=${args.minLookback} capital=${args.capital}`
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
        evaluate: evaluatorFor(args.signal, sym, args.capital),
        horizons: args.horizons,
        stride: args.stride,
        minLookback: args.minLookback,
        isEligible: eligibilityIndex ? (d) => isSymbolEligible(eligibilityIndex, sym, d) : undefined,
        csp: args.cspOverlay ? cspParamsFor(args) : undefined,
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

  let output: { report: Report } | { before: Report; onOrAfter: Report };
  if (args.splitDate) {
    const { before, onOrAfter } = splitByDate(allSamples, args.splitDate);
    console.log(`\nSplitting at ${args.splitDate}: ${before.length} samples before, ${onOrAfter.length} on/after.`);
    const beforeReport = buildAndPrintReport(before, args, `Before ${args.splitDate} (fit period)`);
    const onOrAfterReport = buildAndPrintReport(onOrAfter, args, `On/after ${args.splitDate} (test period)`);
    output = { before: beforeReport, onOrAfter: onOrAfterReport };
  } else {
    output = { report: buildAndPrintReport(allSamples, args) };
  }

  writeFileSync(
    args.out,
    JSON.stringify({ args: { ...args }, tickers, generatedAt: new Date().toISOString(), ...output }, null, 2)
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
