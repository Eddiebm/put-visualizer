import { describe, it, expect } from "vitest";
import { roundStrike, round2, spreadWidthFor, stratPnl, legLabel, buildModel, assignmentSummary } from "./pnl.js";

describe("roundStrike", () => {
  it("rounds high-priced stocks to the nearest $5", () => {
    expect(roundStrike(283)).toBe(285);
    expect(roundStrike(202)).toBe(200);
  });
  it("rounds mid-priced stocks to the nearest $1", () => {
    expect(roundStrike(48.6)).toBe(49);
  });
  it("rounds low-priced stocks to the nearest $0.50", () => {
    expect(roundStrike(12.3)).toBe(12.5);
    expect(roundStrike(12.1)).toBe(12);
  });
});

describe("round2", () => {
  it("rounds to 2 decimal places", () => {
    expect(round2(3.14159)).toBe(3.14);
    expect(round2(2.005)).toBeCloseTo(2.01, 2);
  });
});

describe("spreadWidthFor", () => {
  it("widens with price tier", () => {
    expect(spreadWidthFor(15)).toBe(1);
    expect(spreadWidthFor(35)).toBe(2.5);
    expect(spreadWidthFor(300)).toBe(5);
  });
});

describe("stratPnl — cash-secured put", () => {
  const p = { mode: "put", putStrike: 50, putPrem: 2, shares: 100 };

  it("keeps the full premium when the stock stays above the strike", () => {
    expect(stratPnl(55, p)).toBeCloseTo(200);
    expect(stratPnl(50, p)).toBeCloseTo(200); // right at the strike — still worthless
  });

  it("loses money once the stock falls below breakeven (strike - premium)", () => {
    // breakeven is 48; at 40 you're down (40-48)*100 = -800
    expect(stratPnl(40, p)).toBeCloseTo(-800);
  });

  it("has no floor — loss grows linearly as price keeps falling", () => {
    const lossAt30 = stratPnl(30, p);
    const lossAt10 = stratPnl(10, p);
    expect(lossAt10).toBeLessThan(lossAt30);
  });
});

describe("stratPnl — put credit spread", () => {
  // sell 50 put, buy 45 put, net credit 1.00 (2.00 - 1.00), 1 contract
  const p = { mode: "spread", putStrike: 50, putPrem: 2, longStrike: 45, longPrem: 1, shares: 100 };

  it("keeps the net credit above the short strike", () => {
    expect(stratPnl(55, p)).toBeCloseTo(100);
  });

  it("caps the loss at the spread width minus net credit, even far below the long strike", () => {
    // max loss = (50-45-1)*100 = 400, and it should NOT get worse below 45
    const atLongStrike = stratPnl(45, p);
    const wayBelow = stratPnl(10, p);
    expect(atLongStrike).toBeCloseTo(-400);
    expect(wayBelow).toBeCloseTo(-400);
  });

  it("is the exact regression case for the longStrike/longPrem journal bug — must not be NaN", () => {
    // This mirrors a real logged+closed spread entry: if longStrike/longPrem
    // were ever missing (the bug this app used to have), this would be NaN.
    expect(Number.isFinite(stratPnl(42, p))).toBe(true);
  });
});

describe("stratPnl — short strangle (uncapped upside risk)", () => {
  const p = { mode: "strangle", putStrike: 45, putPrem: 1.5, callStrike: 55, callPrem: 1.5, shares: 100 };

  it("keeps both premiums between the strikes", () => {
    expect(stratPnl(50, p)).toBeCloseTo(300);
  });

  it("has no ceiling on the upside loss", () => {
    const at100 = stratPnl(100, p);
    const at200 = stratPnl(200, p);
    expect(at200).toBeLessThan(at100);
    expect(at100).toBeLessThan(0);
  });
});

describe("legLabel", () => {
  it("shows just the put strike for a plain put", () => {
    expect(legLabel({ mode: "put", putStrike: 50 })).toBe("$50.00P");
  });
  it("shows both legs for two-sided strategies", () => {
    expect(legLabel({ mode: "strangle", putStrike: 45, callStrike: 55 })).toBe("$45.00P / $55.00C");
  });
});

describe("buildModel", () => {
  const base = {
    mode: "put", putStrike: 50, putPrem: 2, longStrike: 0, longPrem: 0,
    callStrike: 0, callPrem: 0, spot: 52, shares: 100, iv: null, dte: 30,
  };

  it("computes collateral as strike × shares for a cash-secured put", () => {
    const m = buildModel(base, 20);
    expect(m.collateral).toBeCloseTo(5000);
  });

  it("computes max gain as the full premium collected", () => {
    const m = buildModel(base, 20);
    expect(m.maxGain).toBeCloseTo(200);
  });

  it("produces a worse worst-case scenario at a bigger drop percentage", () => {
    const mild = buildModel(base, 10);
    const severe = buildModel(base, 40);
    expect(severe.worstValue).not.toBe(mild.worstValue);
  });

  it("finds a breakeven below the strike for a plain put", () => {
    const m = buildModel(base, 20);
    expect(m.breakevens.length).toBeGreaterThan(0);
    expect(m.breakevens[0]).toBeLessThan(base.putStrike);
  });

  it("caps spread collateral at the spread width, not the full strike", () => {
    const spread = { ...base, mode: "spread", longStrike: 45, longPrem: 1, putPrem: 2 };
    const m = buildModel(spread, 20);
    expect(m.collateral).toBeCloseTo(500); // (50-45)*100
  });
});

describe("assignmentSummary", () => {
  it("returns null when there's no real position (no strike or no contracts)", () => {
    expect(assignmentSummary({ putStrike: 0, putPrem: 2, spot: 50, contracts: 1 })).toBeNull();
    expect(assignmentSummary({ putStrike: 50, putPrem: 2, spot: 50, contracts: 0 })).toBeNull();
  });

  it("computes shares, total cost, and cost basis after premium", () => {
    const s = assignmentSummary({ putStrike: 50, putPrem: 2, spot: 55, contracts: 2 });
    expect(s.shares).toBe(200);
    expect(s.totalCost).toBeCloseTo(10000); // 50 * 200
    expect(s.costBasisPerShare).toBeCloseTo(48); // 50 - 2
  });

  it("shows a gain when spot is above cost basis, a loss when below", () => {
    const up = assignmentSummary({ putStrike: 50, putPrem: 2, spot: 55, contracts: 1 });
    const down = assignmentSummary({ putStrike: 50, putPrem: 2, spot: 40, contracts: 1 });
    expect(up.gainLoss).toBeGreaterThan(0);
    expect(down.gainLoss).toBeLessThan(0);
  });

  it("leaves gainLoss/currentValue null when there's no live spot price, rather than guessing", () => {
    const s = assignmentSummary({ putStrike: 50, putPrem: 2, spot: 0, contracts: 1 });
    expect(s.hasSpot).toBe(false);
    expect(s.currentValue).toBeNull();
    expect(s.gainLoss).toBeNull();
  });

  it("treats a missing premium as zero rather than throwing", () => {
    const s = assignmentSummary({ putStrike: 50, putPrem: undefined, spot: 55, contracts: 1 });
    expect(s.costBasisPerShare).toBe(50);
  });
});
