// Point-in-time index membership — this is the piece that actually closes
// the survivorship-bias gap the README flags: Alex's scan's watchlist
// (`COMPANIES`) is today's ~76 large caps/ETFs, so backtesting against
// only those names — no matter how deep the price history is — silently
// excludes every stock that would have been in scope back then but later
// got delisted, acquired, or went to zero. A scan actually running live in
// 2010 would have seen those names; a backtest that only ever looks at
// today's survivors is answering an easier question than the real one.
//
// Norgate's own `norgatedata` package exposes exactly this (e.g. S&P 500
// membership back to 1957) — but, like its price data, only through the
// locally-running NDU process (see norgateSource.ts's docstring), not a
// fetchable endpoint. NDU's Export Task Manager can export index
// constituent history to CSV, same as it does for price bars, so this
// module reads that: a CSV of membership intervals — which symbol was a
// constituent, from when, to when (blank/absent = still a member) — built
// the same way norgateSource.ts's OHLCV parser is: match columns by header
// name (case-insensitive aliases), not position, since the export layout
// is user-configurable.
//
// This is deliberately a general point-in-time-universe mechanism, not
// Norgate-specific plumbing: `--universe` works with any --source, because
// "was this symbol even eligible on this date" is a question independent
// of where its price bars came from. What it does NOT solve on its own is
// getting *price history for a delisted name* — Alpaca and Tiingo
// generally don't carry data for tickers that no longer trade, so a
// genuinely survivorship-bias-free run realistically needs Norgate's own
// per-symbol CSVs (which do include delisted securities) for the price
// side too. See README.md's "Backtesting Alex's scan" section.

import { readFileSync } from "node:fs";
import { csvLines, splitCsvLine, findColumnIndex } from "./csv";

export interface MembershipInterval {
  symbol: string;
  startDate: string; // ISO yyyy-mm-dd
  endDate: string | null; // null = open-ended (still a member as of the export)
}

export interface UniverseColumnMap {
  symbol: string[];
  startDate: string[];
  endDate: string[];
}

export const DEFAULT_UNIVERSE_COLUMNS: UniverseColumnMap = {
  symbol: ["symbol", "ticker"],
  startDate: ["startdate", "start date", "from", "added", "start"],
  endDate: ["enddate", "end date", "to", "removed", "end"],
};

function toIsoDate(raw: string): string | null {
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

// Pure: parses a membership-intervals CSV into MembershipInterval[]. A row
// with an unparseable symbol/start date is skipped (mirrors the other
// parsers' bad-row handling) rather than producing a bogus interval; a
// blank/missing end-date cell means "still a member."
export function parseConstituentsCsv(
  csvText: string,
  columns: UniverseColumnMap = DEFAULT_UNIVERSE_COLUMNS
): MembershipInterval[] {
  const lines = csvLines(csvText);
  if (lines.length === 0) return [];

  const headers = splitCsvLine(lines[0]);
  const idx = {
    symbol: findColumnIndex(headers, columns.symbol),
    startDate: findColumnIndex(headers, columns.startDate),
    endDate: findColumnIndex(headers, columns.endDate),
  };
  if (idx.symbol === -1 || idx.startDate === -1) {
    throw new Error(
      `parseConstituentsCsv: couldn't find a symbol or start-date column in header row [${headers.join(", ")}] — ` +
        "pass an explicit column map (see --universe-columns) matching your export's actual headers."
    );
  }

  const intervals: MembershipInterval[] = [];
  for (let i = 1; i < lines.length; i++) {
    const fields = splitCsvLine(lines[i]);
    const symbol = fields[idx.symbol]?.trim();
    if (!symbol) continue;
    const startDate = toIsoDate(fields[idx.startDate]);
    if (!startDate) continue;
    const endRaw = idx.endDate !== -1 ? fields[idx.endDate]?.trim() : "";
    const endDate = endRaw ? toIsoDate(endRaw) : null;
    intervals.push({ symbol: symbol.toUpperCase(), startDate, endDate });
  }
  return intervals;
}

// Groups intervals by symbol so a per-day eligibility check only has to
// scan that one symbol's (typically handful of) intervals, not the whole
// universe — matters because this gets called once per candidate
// evaluation day, potentially millions of times across a full backtest.
export function buildEligibilityIndex(intervals: MembershipInterval[]): Map<string, MembershipInterval[]> {
  const index = new Map<string, MembershipInterval[]>();
  for (const iv of intervals) {
    if (!index.has(iv.symbol)) index.set(iv.symbol, []);
    index.get(iv.symbol)!.push(iv);
  }
  return index;
}

// dateIso must be a plain "yyyy-mm-dd" — plain ISO-date strings compare
// correctly with `<=`/`>=`, no Date parsing needed on the hot path.
export function isSymbolEligible(
  index: Map<string, MembershipInterval[]>,
  symbol: string,
  dateIso: string
): boolean {
  const intervals = index.get(symbol.toUpperCase());
  if (!intervals) return false;
  const d = dateIso.slice(0, 10);
  return intervals.some((iv) => d >= iv.startDate && (iv.endDate === null || d <= iv.endDate));
}

// The full set of symbols that were ever a constituent, sorted — used to
// default --tickers to the real historical universe when --universe is
// given without an explicit --tickers, since the whole point is to
// include names that have since dropped off today's watchlist.
export function distinctSymbols(intervals: MembershipInterval[]): string[] {
  return [...new Set(intervals.map((iv) => iv.symbol))].sort();
}

export function loadConstituentsFromFile(
  path: string,
  columns: UniverseColumnMap = DEFAULT_UNIVERSE_COLUMNS
): MembershipInterval[] {
  const text = readFileSync(path, "utf8");
  return parseConstituentsCsv(text, columns);
}
