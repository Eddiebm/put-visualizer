import { describe, it, expect } from "vitest";
import { popFromDelta, expectedMove, cushionSigma, popPlain, cushionPlain } from "./probability";
import type { Mode } from "../types";

describe("popFromDelta", () => {
  it("put: probability of profit is 1 minus |delta|", () => {
    expect(popFromDelta("put", { shortPutDelta: -0.3 })).toBeCloseTo(0.7);
  });
  it("spread: uses the short put's delta the same way as a plain put", () => {
    expect(popFromDelta("spread", { shortPutDelta: -0.2 })).toBeCloseTo(0.8);
  });
  it("strangle: combines both legs' deltas", () => {
    expect(popFromDelta("strangle", { putDelta: -0.2, callDelta: 0.15 })).toBeCloseTo(0.65);
  });
  it("covered: returns a split of keep-premium vs assignment-risk", () => {
    const r = popFromDelta("covered", { putDelta: -0.25, callDelta: 0.3 }) as { keepPremium: number; assignmentRisk: number };
    expect(r.keepPremium).toBeCloseTo(0.7);
    expect(r.assignmentRisk).toBeCloseTo(0.25);
  });
  it("returns null for an unrecognized strategy", () => {
    expect(popFromDelta("unknown" as Mode, {})).toBeNull();
  });
});

describe("expectedMove", () => {
  it("is 0 when any input is missing or non-positive", () => {
    expect(expectedMove(0, 0.3, 30)).toBe(0);
    expect(expectedMove(50, 0, 30)).toBe(0);
    expect(expectedMove(50, 0.3, 0)).toBe(0);
  });
  it("scales with the square root of time", () => {
    const move30 = expectedMove(50, 0.3, 30);
    const move120 = expectedMove(50, 0.3, 120);
    expect(move120).toBeCloseTo(move30 * 2, 5); // sqrt(120/30) = 2
  });
});

describe("cushionSigma", () => {
  it("is 0 when expected move is not positive", () => {
    expect(cushionSigma(50, 45, 0)).toBe(0);
  });
  it("is positive when the strike is below spot (typical short put)", () => {
    expect(cushionSigma(50, 45, 5)).toBeCloseTo(1);
  });
  it("is negative when the strike is already above spot", () => {
    expect(cushionSigma(50, 55, 5)).toBeCloseTo(-1);
  });
});

describe("popPlain / cushionPlain", () => {
  it("returns null for missing/NaN input rather than a bogus sentence", () => {
    expect(popPlain(null)).toBeNull();
    expect(popPlain(NaN)).toBeNull();
    expect(cushionPlain(null)).toBeNull();
  });
  it("produces a plain-English string for a valid pop", () => {
    expect(typeof popPlain(0.75)).toBe("string");
  });
});
