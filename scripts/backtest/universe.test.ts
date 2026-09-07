import { describe, it, expect } from "vitest";
import {
  parseConstituentsCsv,
  buildEligibilityIndex,
  isSymbolEligible,
  distinctSymbols,
  DEFAULT_UNIVERSE_COLUMNS,
} from "./universe";

describe("parseConstituentsCsv", () => {
  it("parses a standard Symbol,StartDate,EndDate export", () => {
    const csv = ["Symbol,StartDate,EndDate", "AAPL,2015-01-01,2022-06-30", "MSFT,2010-01-01,"].join("\n");
    const intervals = parseConstituentsCsv(csv);
    expect(intervals).toEqual([
      { symbol: "AAPL", startDate: "2015-01-01", endDate: "2022-06-30" },
      { symbol: "MSFT", startDate: "2010-01-01", endDate: null },
    ]);
  });

  it("treats a blank end-date cell as still-a-member (open-ended), not a parse failure", () => {
    const csv = ["Symbol,StartDate,EndDate", "MSFT,2010-01-01,"].join("\n");
    const intervals = parseConstituentsCsv(csv);
    expect(intervals[0].endDate).toBeNull();
  });

  it("matches headers case-insensitively and via aliases (Ticker/From/Added)", () => {
    const csv = ["Ticker,Added,Removed", "AAPL,2015-01-01,2022-06-30"].join("\n");
    const intervals = parseConstituentsCsv(csv);
    expect(intervals).toEqual([{ symbol: "AAPL", startDate: "2015-01-01", endDate: "2022-06-30" }]);
  });

  it("upper-cases symbols so lookups aren't case-sensitive later", () => {
    const csv = ["Symbol,StartDate,EndDate", "aapl,2015-01-01,"].join("\n");
    const intervals = parseConstituentsCsv(csv);
    expect(intervals[0].symbol).toBe("AAPL");
  });

  it("skips a row with a missing symbol or unparseable start date instead of throwing", () => {
    const csv = [
      "Symbol,StartDate,EndDate",
      ",2015-01-01,", // no symbol
      "AAPL,not-a-date,", // bad start date
      "MSFT,2010-01-01,", // good
    ].join("\n");
    const intervals = parseConstituentsCsv(csv);
    expect(intervals).toEqual([{ symbol: "MSFT", startDate: "2010-01-01", endDate: null }]);
  });

  it("throws a clear error when it can't find a symbol or start-date column", () => {
    const csv = ["Foo,Bar", "1,2"].join("\n");
    expect(() => parseConstituentsCsv(csv)).toThrow(/couldn't find a symbol or start-date column/);
  });

  it("honors an explicit column map for a nonstandard export", () => {
    const csv = ["Sym,From,To", "AAPL,2015-01-01,2022-06-30"].join("\n");
    const intervals = parseConstituentsCsv(csv, { symbol: ["sym"], startDate: ["from"], endDate: ["to"] });
    expect(intervals).toEqual([{ symbol: "AAPL", startDate: "2015-01-01", endDate: "2022-06-30" }]);
  });

  it("supports multiple non-contiguous intervals for the same symbol (dropped from the index, later re-added)", () => {
    const csv = [
      "Symbol,StartDate,EndDate",
      "AAPL,2000-01-01,2005-12-31",
      "AAPL,2015-01-01,",
    ].join("\n");
    const intervals = parseConstituentsCsv(csv);
    expect(intervals).toHaveLength(2);
  });

  it("returns an empty array for an empty file", () => {
    expect(parseConstituentsCsv("")).toEqual([]);
  });
});

describe("isSymbolEligible", () => {
  const intervals = parseConstituentsCsv(
    ["Symbol,StartDate,EndDate", "AAPL,2000-01-01,2005-12-31", "AAPL,2015-01-01,", "MSFT,2010-01-01,2020-01-01"].join("\n")
  );
  const index = buildEligibilityIndex(intervals);

  it("is eligible on the interval's start date (inclusive)", () => {
    expect(isSymbolEligible(index, "AAPL", "2000-01-01")).toBe(true);
  });

  it("is eligible on the interval's end date (inclusive)", () => {
    expect(isSymbolEligible(index, "MSFT", "2020-01-01")).toBe(true);
  });

  it("is not eligible the day before start or the day after end", () => {
    expect(isSymbolEligible(index, "AAPL", "1999-12-31")).toBe(false);
    expect(isSymbolEligible(index, "AAPL", "2006-01-01")).toBe(false);
  });

  it("is eligible again in a later, separate interval for the same symbol", () => {
    expect(isSymbolEligible(index, "AAPL", "2018-06-01")).toBe(true);
  });

  it("is not eligible in the gap between two intervals for the same symbol", () => {
    expect(isSymbolEligible(index, "AAPL", "2010-01-01")).toBe(false);
  });

  it("is eligible indefinitely for an open-ended interval (no end date)", () => {
    expect(isSymbolEligible(index, "AAPL", "2099-01-01")).toBe(true);
  });

  it("is not eligible for a symbol that was never in the universe at all", () => {
    expect(isSymbolEligible(index, "ZZZZ", "2015-01-01")).toBe(false);
  });

  it("matches symbol lookups case-insensitively", () => {
    expect(isSymbolEligible(index, "aapl", "2018-06-01")).toBe(true);
  });
});

describe("distinctSymbols", () => {
  it("dedupes and sorts, even with multiple intervals per symbol", () => {
    const intervals = parseConstituentsCsv(
      ["Symbol,StartDate,EndDate", "MSFT,2010-01-01,", "AAPL,2000-01-01,2005-12-31", "AAPL,2015-01-01,"].join("\n")
    );
    expect(distinctSymbols(intervals)).toEqual(["AAPL", "MSFT"]);
  });

  it("returns an empty array for no intervals", () => {
    expect(distinctSymbols([])).toEqual([]);
  });
});

describe("DEFAULT_UNIVERSE_COLUMNS", () => {
  it("is exported so callers can build a partial override that falls back to it", () => {
    expect(DEFAULT_UNIVERSE_COLUMNS.symbol).toContain("symbol");
  });
});
