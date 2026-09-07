// Tiny, dependency-free CSV helpers shared by norgateSource.ts (per-symbol
// OHLCV exports) and universe.ts (index-constituent exports) — both read
// files a user exports themselves from NDU's Export Task Manager, whose
// column choice/order is configurable, so both need the same "match by
// header name, not position" parsing approach.

// Splits one CSV line into fields, honoring double-quoted fields that may
// contain commas. NDU's exports are typically plain numeric/date and
// wouldn't need this, but a quoted field is cheap to support correctly
// rather than silently mis-splitting one if it shows up.
export function splitCsvLine(line: string): string[] {
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

// Case-insensitive lookup of a header's column index by a list of accepted
// aliases (checked in order) — returns -1 if none of them appear.
export function findColumnIndex(headers: string[], aliases: string[]): number {
  const normalized = headers.map((h) => h.trim().toLowerCase());
  for (const alias of aliases) {
    const idx = normalized.indexOf(alias);
    if (idx !== -1) return idx;
  }
  return -1;
}

// Splits raw CSV text into non-empty lines — the first split every one of
// these parsers does before touching headers/rows.
export function csvLines(csvText: string): string[] {
  return csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
}
