import { describe, it, expect } from "vitest";
import { parseNorgateCsv, DEFAULT_NORGATE_COLUMNS } from "./norgateSource";

describe("parseNorgateCsv", () => {
  it("parses a standard Date,Open,High,Low,Close,Volume export", () => {
    const csv = [
      "Date,Open,High,Low,Close,Volume",
      "2024-01-02,100,101,99,100.5,123456",
      "2024-01-03,100.5,102,100,101.5,150000",
    ].join("\n");
    const bars = parseNorgateCsv(csv);
    expect(bars).toHaveLength(2);
    expect(bars[0]).toEqual({ t: new Date("2024-01-02").toISOString(), o: 100, h: 101, l: 99, c: 100.5, v: 123456 });
    expect(bars[1].c).toBe(101.5);
  });

  it("matches headers case-insensitively and in any column order", () => {
    const csv = ["VOLUME,close,DATE,Low,High,Open", "1000,50.5,2024-06-01,49,51,50"].join("\n");
    const bars = parseNorgateCsv(csv);
    expect(bars).toHaveLength(1);
    expect(bars[0]).toMatchObject({ o: 50, h: 51, l: 49, c: 50.5, v: 1000 });
  });

  it("recognizes 'Adj Close' style aliases for the close column via the default alias list", () => {
    const csv = ["Date,Open,High,Low,AdjClose,Volume", "2024-01-02,100,101,99,100.5,1000"].join("\n");
    const bars = parseNorgateCsv(csv, DEFAULT_NORGATE_COLUMNS);
    expect(bars).toHaveLength(1);
    expect(bars[0].c).toBe(100.5);
  });

  it("skips a row with a non-positive close instead of pushing a bad bar", () => {
    const csv = [
      "Date,Open,High,Low,Close,Volume",
      "2024-01-02,100,101,99,0,1000", // bad — close is 0
      "2024-01-03,100,101,99,100.5,1000", // good
    ].join("\n");
    const bars = parseNorgateCsv(csv);
    expect(bars).toHaveLength(1);
    expect(bars[0].c).toBe(100.5);
  });

  it("skips a row with an unparseable date instead of throwing", () => {
    const csv = [
      "Date,Open,High,Low,Close,Volume",
      "not-a-date,100,101,99,100.5,1000",
      "2024-01-03,100,101,99,101.5,1000",
    ].join("\n");
    const bars = parseNorgateCsv(csv);
    expect(bars).toHaveLength(1);
    expect(bars[0].c).toBe(101.5);
  });

  it("throws a clear error when it can't find a date or close column at all", () => {
    const csv = ["Foo,Bar", "1,2"].join("\n");
    expect(() => parseNorgateCsv(csv)).toThrow(/couldn't find a date or close column/);
  });

  it("honors an explicit column map override for a nonstandard export", () => {
    const csv = ["Symbol,D,O,H,L,C,V", "AAPL,2024-01-02,100,101,99,100.5,1000"].join("\n");
    const bars = parseNorgateCsv(csv, { date: ["d"], open: ["o"], high: ["h"], low: ["l"], close: ["c"], volume: ["v"] });
    expect(bars).toHaveLength(1);
    expect(bars[0]).toMatchObject({ o: 100, h: 101, l: 99, c: 100.5, v: 1000 });
  });

  it("handles quoted fields containing commas without mis-splitting columns", () => {
    const csv = ['Date,Open,High,Low,Close,Volume,"Note"', '2024-01-02,100,101,99,100.5,1000,"a, note"'].join("\n");
    const bars = parseNorgateCsv(csv);
    expect(bars).toHaveLength(1);
    expect(bars[0]).toMatchObject({ o: 100, h: 101, l: 99, c: 100.5, v: 1000 });
  });

  it("defaults missing open/high/low/volume columns rather than crashing", () => {
    const csv = ["Date,Close", "2024-01-02,100.5"].join("\n");
    const bars = parseNorgateCsv(csv);
    expect(bars).toHaveLength(1);
    expect(bars[0]).toEqual({ t: new Date("2024-01-02").toISOString(), o: 100.5, h: 100.5, l: 100.5, c: 100.5, v: 0 });
  });

  it("returns an empty array for an empty file", () => {
    expect(parseNorgateCsv("")).toEqual([]);
  });
});
