import { describe, it, expect } from "vitest";
import { mapAlpacaBar, mapTiingoBar } from "./dataSource";

describe("mapAlpacaBar", () => {
  it("carries every field straight through", () => {
    const bar = mapAlpacaBar({ t: "2024-01-02T05:00:00Z", o: 100, h: 101, l: 99, c: 100.5, v: 123456 });
    expect(bar).toEqual({ t: "2024-01-02T05:00:00Z", o: 100, h: 101, l: 99, c: 100.5, v: 123456 });
  });
});

describe("mapTiingoBar", () => {
  it("prefers adjusted OHLC over raw when both are present", () => {
    const bar = mapTiingoBar({
      date: "2024-01-02T00:00:00.000Z",
      open: 100, high: 101, low: 99, close: 100.5, volume: 1000,
      adjOpen: 25, adjHigh: 25.25, adjLow: 24.75, adjClose: 25.125, adjVolume: 4000,
    });
    // A 4:1 split scenario: adjusted values are ~1/4 of raw — mapTiingoBar
    // must return the adjusted ones, not silently fall back to raw.
    expect(bar).toEqual({ t: "2024-01-02T00:00:00.000Z", o: 25, h: 25.25, l: 24.75, c: 25.125, v: 4000 });
  });

  it("falls back to raw OHLC when adjusted fields are null", () => {
    const bar = mapTiingoBar({
      date: "2024-01-02T00:00:00.000Z",
      open: 100, high: 101, low: 99, close: 100.5, volume: 1000,
      adjOpen: null, adjHigh: null, adjLow: null, adjClose: null, adjVolume: null,
    });
    expect(bar).toEqual({ t: "2024-01-02T00:00:00.000Z", o: 100, h: 101, l: 99, c: 100.5, v: 1000 });
  });

  it("returns null for a non-positive close, rather than pushing a bad bar", () => {
    const bar = mapTiingoBar({
      date: "2024-01-02T00:00:00.000Z",
      open: 100, high: 101, low: 99, close: 0, volume: 1000,
      adjOpen: null, adjHigh: null, adjLow: null, adjClose: null, adjVolume: null,
    });
    expect(bar).toBeNull();
  });
});
