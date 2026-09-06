import { describe, it, expect } from "vitest";
import { computeDte, entryDaysTo, weekStartIso, weekLabel, defaultExpiration, targetExpiration } from "./dates.js";

describe("computeDte", () => {
  it("returns a floor of 1 for an invalid or past date, never 0 or negative", () => {
    expect(computeDte("not-a-date")).toBe(30);
  });
  it("computes whole days to a future ISO date", () => {
    const d = new Date();
    d.setDate(d.getDate() + 10);
    const iso = d.toISOString().slice(0, 10);
    expect(computeDte(iso)).toBeGreaterThanOrEqual(9);
    expect(computeDte(iso)).toBeLessThanOrEqual(11);
  });
});

describe("entryDaysTo", () => {
  it("returns null for a missing/invalid date, unlike computeDte's 30-day fallback", () => {
    expect(entryDaysTo(undefined)).toBeNull();
    expect(entryDaysTo("garbage")).toBeNull();
  });
  it("goes negative for a date already in the past — the point of this helper", () => {
    const d = new Date();
    d.setDate(d.getDate() - 5);
    const iso = d.toISOString().slice(0, 10);
    expect(entryDaysTo(iso)).toBeLessThan(0);
  });
});

describe("weekStartIso", () => {
  it("maps any day in a week to that week's Monday", () => {
    // 2026-06-27 is a Saturday; that week's Monday is 2026-06-22.
    expect(weekStartIso("2026-06-27")).toBe("2026-06-22");
  });
  it("leaves a Monday unchanged", () => {
    expect(weekStartIso("2026-06-22")).toBe("2026-06-22");
  });
  it("rolls a Sunday back to the same week's Monday, not the next one", () => {
    expect(weekStartIso("2026-06-28")).toBe("2026-06-22");
  });
});

describe("weekLabel", () => {
  it("formats a Mon-Sun range within the same month", () => {
    expect(weekLabel("2026-06-22")).toBe("Jun 22–Jun 28, 2026");
  });
  it("formats correctly across a month boundary", () => {
    // 2026-06-29 is a Monday; that week runs into July.
    expect(weekLabel("2026-06-29")).toBe("Jun 29–Jul 5, 2026");
  });
});

describe("expiration helpers", () => {
  it("defaultExpiration always lands on a Friday", () => {
    const iso = defaultExpiration();
    const d = new Date(iso + "T12:00:00Z");
    expect(d.getUTCDay()).toBe(5);
  });
  it("targetExpiration always lands on a Friday, at least targetDays out", () => {
    const iso = targetExpiration(30);
    const d = new Date(iso + "T12:00:00Z");
    expect(d.getUTCDay()).toBe(5);
    expect((d - Date.now()) / 86400000).toBeGreaterThanOrEqual(29);
  });
});
