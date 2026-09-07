import { describe, it, expect } from "vitest";
import { normCdf, bsPrice, bsGreeks, solveIv, realizedVol } from "./blackScholes";

describe("normCdf", () => {
  it("is 0.5 at z=0", () => {
    expect(normCdf(0)).toBeCloseTo(0.5, 3);
  });
  it("approaches 1 for large positive z and 0 for large negative z", () => {
    expect(normCdf(5)).toBeCloseTo(1, 3);
    expect(normCdf(-5)).toBeCloseTo(0, 3);
  });
  it("is symmetric: normCdf(z) + normCdf(-z) = 1", () => {
    expect(normCdf(1.3) + normCdf(-1.3)).toBeCloseTo(1, 6);
  });
});

describe("bsPrice", () => {
  it("returns intrinsic value at expiration (dte=0)", () => {
    expect(bsPrice(45, 50, 0, 0.05, 0.3, "put")).toBeCloseTo(5);
    expect(bsPrice(55, 50, 0, 0.05, 0.3, "call")).toBeCloseTo(5);
    expect(bsPrice(55, 50, 0, 0.05, 0.3, "put")).toBeCloseTo(0);
  });

  it("prices an ATM put as positive time value with dte and vol > 0", () => {
    const price = bsPrice(50, 50, 30, 0.05, 0.3, "put");
    expect(price).toBeGreaterThan(0);
  });

  it("deep out-of-the-money put is worth less than a near-the-money put", () => {
    const farOtm = bsPrice(80, 50, 30, 0.05, 0.3, "put");
    const nearAtm = bsPrice(52, 50, 30, 0.05, 0.3, "put");
    expect(farOtm).toBeLessThan(nearAtm);
  });
});

describe("bsGreeks", () => {
  it("put delta is between -1 and 0", () => {
    const { delta } = bsGreeks(50, 50, 30, 0.05, 0.3, "put");
    expect(delta).toBeGreaterThanOrEqual(-1);
    expect(delta).toBeLessThanOrEqual(0);
  });
  it("call delta is between 0 and 1", () => {
    const { delta } = bsGreeks(50, 50, 30, 0.05, 0.3, "call");
    expect(delta).toBeGreaterThanOrEqual(0);
    expect(delta).toBeLessThanOrEqual(1);
  });
  it("deep ITM put delta approaches -1 at expiration", () => {
    const { delta } = bsGreeks(10, 50, 0, 0.05, 0.3, "put");
    expect(delta).toBe(-1);
  });
});

describe("solveIv", () => {
  it("round-trips: pricing at a known vol and solving back recovers ~that vol", () => {
    const spot = 50, strike = 50, dte = 30, rate = 0.05, vol = 0.35;
    const price = bsPrice(spot, strike, dte, rate, vol, "put");
    const solved = solveIv(price, spot, strike, dte, rate, "put");
    expect(solved).toBeCloseTo(vol, 2);
  });
  it("returns null for a non-positive market price", () => {
    expect(solveIv(0, 50, 50, 30, 0.05, "put")).toBeNull();
  });
});

describe("realizedVol", () => {
  it("returns null with fewer than 3 closes", () => {
    expect(realizedVol([100, 101])).toBeNull();
  });
  it("is 0 for a perfectly flat price series", () => {
    const flat = Array(30).fill(100);
    expect(realizedVol(flat)).toBeCloseTo(0);
  });
  it("is higher for a choppier series than a smoother one", () => {
    const smooth = Array.from({ length: 30 }, (_, i) => 100 + i * 0.1);
    const choppy = Array.from({ length: 30 }, (_, i) => 100 + (i % 2 === 0 ? 5 : -5));
    expect(realizedVol(choppy)).toBeGreaterThan(realizedVol(smooth)!);
  });
});
