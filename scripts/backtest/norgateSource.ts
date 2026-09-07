// Norgate Data — deliberately NOT an HTTP fetcher like dataSource.ts's
// Alpaca/Tiingo functions, because Norgate has no REST API to call. Data
// only reaches this machine via the Norgate Data Updater (NDU), a
// Windows-only desktop application (Windows or WSL2) that requires a paid
// subscription and its own running process; the only supported
// programmatic access is a Python package (`norgatedata`) that talks to a
// *locally running* NDU instance — there is no cloud endpoint, no API key
// you can hand a `fetch()` call, and no Node/JS client library for it.
// None of that is available in this sandbox (no Windows/WSL2, no NDU, no
// subscription), so this can't be "wired in" the way Tiingo was.
//
// What CAN be wired in, and is: NDU has a built-in Export Task Manager
// that writes each symbol's history to a plain CSV file — a normal,
// documented workflow for feeding Norgate data into a non-Python tool.
// This module reads exactly that: a directory of `<SYMBOL>.csv` files that
// you export from NDU yourself (Windows/WSL2 machine, active Norgate
// subscription required — none of which this script provides).
//
// NDU's Export Wizard lets you choose which columns to include and their
// order, so there's no single fixed layout to hard-code against. The
// parser below matches columns by *header name* (case-insensitive, a
// handful of common aliases per field) rather than by position, and
// --norgate-columns lets you override the expected header names outright
// if your export uses something this doesn't already recognize.

import { readFileSync } from "node:fs";
import type { Bar } from "../../src/types";

export interface NorgateColumnMap {
  date: string[];
  open: string[];
  high: string[];
  low: string[];
  close: string[];
  volume: string[];
}

export const DEFAULT_NORGATE_COLUMNS: NorgateColumnMap = {
  date: ["date", "datetime", "time"],
  open: ["open"],
  high: ["high"],
  low: ["low"],
  close: ["close", "adjclose", "adjusted close", "last"],
  volume: ["volume", "vol"],
};

// Splits one CSV line into fields, honoring double-quoted fields that may
// contain commas (NDU's exports are typically plain numeric/date and
// wouldn't need this, but a quoted symbol/date field is cheap to support
// correctly rather than silently mis-splitting one if it shows up).
function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      fields.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  fields.push(cur);
  return fields;
}

function findColumnIndex(headers: string[], aliases: string[]): number {
  const normalized = headers.map((h) => h.trim().toLowerCase());
  for (const alias of aliases) {
    const idx = normalized.indexOf(alias);
    if (idx !== -1) return idx;
  }
  return -1;
}

// Pure: parses NDU-exported CSV text into Bar[]. Rows with a non-positive
// or unparseable close are skipped (mirrors dataSource.ts's `c > 0` filter
// for the other providers) rather than producing a bad bar silently.
export function parseNorgateCsv(csvText: string, columns: NorgateColumnMap = DEFAULT_NORGATE_COLUMNS): Bar[] {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];

  const headers = splitCsvLine(lines[0]);
  const idx = {
    date: findColumnIndex(headers, columns.date),
    open: findColumnIndex(headers, columns.open),
    high: findColumnIndex(headers, columns.high),
    low: findColumnIndex(headers, columns.low),
    close: findColumnIndex(headers, columns.close),
    volume: findColumnIndex(headers, columns.volume),
  };
  if (idx.date === -1 || idx.close === -1) {
    throw new Error(
      `parseNorgateCsv: couldn't find a date or close column in header row [${headers.join(", ")}] — ` +
        "pass an explicit column map (see --norgate-columns) matching your NDU export's actual headers."
    );
  }

  const bars: Bar[] = [];
  for (let i = 1; i < lines.length; i++) {
    const fields = splitCsvLine(lines[i]);
    const close = Number(fields[idx.close]);
    if (!(close > 0)) continue;
    const dateField = fields[idx.date];
    const date = new Date(dateField);
    if (Number.isNaN(date.getTime())) continue; // unparseable date — skip rather than push a bad bar

    bars.push({
      t: date.toISOString(),
      o: idx.open !== -1 ? Number(fields[idx.open]) : close,
      h: idx.high !== -1 ? Number(fields[idx.high]) : close,
      l: idx.low !== -1 ? Number(fields[idx.low]) : close,
      c: close,
      v: idx.volume !== -1 ? Number(fields[idx.volume]) : 0,
    });
  }
  return bars;
}

// Reads `<dir>/<symbol>.csv` (NDU's typical one-file-per-symbol export
// layout) and parses it.
export function loadNorgateBarsForSymbol(
  dir: string,
  symbol: string,
  columns: NorgateColumnMap = DEFAULT_NORGATE_COLUMNS
): Bar[] {
  const path = `${dir.replace(/\/+$/, "")}/${symbol}.csv`;
  const text = readFileSync(path, "utf8");
  return parseNorgateCsv(text, columns);
}
