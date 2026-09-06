import { describe, it, expect } from "vitest";
import { opportunityScore, scoreGrade, marketCondition } from "./score";
import type { Richness } from "../types";

const goodInputs = {
  richness: { tag: "rich" as const, emoji: "✅", headline: "", detail: "" },
  pop: 0.85, cushion: 1.6, canAfford: true,
  capitalPct: 0.3, annYield: 30, maxLossPct: 0.2, hasEarnings: false,
};

describe("opportunityScore", () => {
  it("scores 0 when the position isn't affordable, regardless of everything else", () => {
    expect(opportunityScore({ ...goodInputs, canAfford: false })).toBe(0);
  });

  it("scores 0 when earnings fall before expiration — a hard disqualifier", () => {
    expect(opportunityScore({ ...goodInputs, hasEarnings: true })).toBe(0);
  });

  it("scores high for a well-priced, high-probability, well-cushioned, affordable trade", () => {
    expect(opportunityScore(goodInputs)).toBeGreaterThanOrEqual(80);
  });

  it("scores lower as probability of profit drops, all else equal", () => {
    const high = opportunityScore({ ...goodInputs, pop: 0.85 });
    const low = opportunityScore({ ...goodInputs, pop: 0.52 });
    expect(low).toBeLessThan(high);
  });

  it("caps the score when max loss is catastrophic relative to the account", () => {
    const capped = opportunityScore({ ...goodInputs, maxLossPct: 0.9 });
    expect(capped).toBeLessThanOrEqual(30);
  });

  it("never exceeds 100", () => {
    expect(opportunityScore(goodInputs)).toBeLessThanOrEqual(100);
  });
});

describe("scoreGrade", () => {
  it("labels the boundary scores correctly", () => {
    expect(scoreGrade(80).label).toBe("Excellent");
    expect(scoreGrade(65).label).toBe("Good");
    expect(scoreGrade(50).label).toBe("Average");
    expect(scoreGrade(35).label).toBe("Weak");
    expect(scoreGrade(0).label).toBe("Avoid");
  });
});

describe("marketCondition", () => {
  it("returns null for an empty set of richness tags", () => {
    expect(marketCondition([])).toBeNull();
  });
  it("reads 'good' conditions when a large share of scanned stocks are rich", () => {
    const tags: Array<Richness["tag"]> = Array(10).fill("rich");
    expect(marketCondition(tags)!.label).toMatch(/good/i);
  });
  it("reads 'no edge' when nothing scanned is rich", () => {
    const tags: Array<Richness["tag"]> = Array(10).fill("cheap");
    expect(marketCondition(tags)!.label).toMatch(/no edge/i);
  });
});
