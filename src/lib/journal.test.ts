import { describe, it, expect } from "vitest";
import { entryCollateral, entryRiskNote, entryBadWeekPnl, summarizeWeek } from "./journal";

describe("entryCollateral", () => {
  it("uses the stored collateral snapshot when present", () => {
    expect(entryCollateral({ collateral: 12345 })).toBe(12345);
  });

  it("reconstructs collateral for a plain put when no snapshot was stored", () => {
    expect(entryCollateral({ mode: "put", putStrike: 50, contracts: 2 })).toBeCloseTo(10000);
  });

  it("reconstructs collateral for a covered strangle (shares + put collateral)", () => {
    expect(entryCollateral({ mode: "covered", putStrike: 50, spot: 55, contracts: 1 })).toBeCloseTo(10500);
  });

  it("reconstructs collateral for a spread when the long strike was recorded", () => {
    expect(entryCollateral({ mode: "spread", putStrike: 50, longStrike: 45, contracts: 1 })).toBeCloseTo(500);
  });

  it("returns null for a naked strangle — risk is genuinely uncapped", () => {
    expect(entryCollateral({ mode: "strangle", putStrike: 45, callStrike: 55, contracts: 1 })).toBeNull();
  });

  it("returns null for a strangle even when a stored collateral snapshot exists (regression)", () => {
    // buildModel() always stores a finite `collateral` on every logged entry
    // — for a strangle it's just the put side's cash requirement, the same
    // number the live calculator's "Collateral" stat shows. Mode has to
    // take precedence over that stored value here, or a logged strangle
    // silently reads as a defined-risk position with the call side's
    // unlimited loss hidden — exactly the kind of thing this app's ethos
    // says never to do.
    expect(entryCollateral({ mode: "strangle", putStrike: 45, callStrike: 55, contracts: 1, collateral: 4500 })).toBeNull();
  });

  it("returns null for a legacy spread entry missing its long strike (regression case)", () => {
    // This is exactly the shape a spread entry had before the logTrade() fix.
    expect(entryCollateral({ mode: "spread", putStrike: 50, contracts: 1 })).toBeNull();
  });
});

describe("entryRiskNote", () => {
  it("is null when collateral is computable", () => {
    expect(entryRiskNote({ mode: "put", putStrike: 50, contracts: 1 })).toBeNull();
  });
  it("explains uncapped risk for a strangle", () => {
    expect(entryRiskNote({ mode: "strangle" })).toMatch(/no defined max loss/i);
  });
  it("explains the legacy-data gap for an old spread entry", () => {
    expect(entryRiskNote({ mode: "spread", putStrike: 50, contracts: 1 })).toMatch(/older entry/i);
  });
});

describe("entryBadWeekPnl", () => {
  it("returns null wherever collateral is undefined (uncapped risk)", () => {
    expect(entryBadWeekPnl({ mode: "strangle", putStrike: 45, callStrike: 55, contracts: 1 }, 20)).toBeNull();
  });

  it("computes a negative P&L for a put after a big enough drop", () => {
    const e = { mode: "put" as const, putStrike: 50, putPrem: 2, contracts: 1 };
    const pnl = entryBadWeekPnl(e, 30); // 30% drop puts it well past breakeven
    expect(pnl).toBeLessThan(0);
  });

  it("returns null instead of NaN when collateral is known but putPrem is missing", () => {
    // Regression case: collateral was persisted on the entry but putPrem
    // wasn't (or was stripped), so stratPnl would compute NaN. The UI must
    // show '—', never a literal '$NaN'.
    const e = { mode: "put" as const, putStrike: 50, collateral: 5000, contracts: 1 };
    expect(entryBadWeekPnl(e, 20)).toBeNull();
  });

  it("stays finite for a spread entry that does have its long leg recorded", () => {
    const e = { mode: "spread" as const, putStrike: 50, putPrem: 2, longStrike: 45, longPrem: 1, contracts: 1 };
    expect(Number.isFinite(entryBadWeekPnl(e, 20))).toBe(true);
  });
});

describe("summarizeWeek", () => {
  it("sums realized P&L across wins and losses without netting them away individually", () => {
    const entries = [
      { realizedPnl: 300, mode: "put" as const, putStrike: 50, contracts: 1 },
      { realizedPnl: -150, mode: "put" as const, putStrike: 50, contracts: 1 },
    ];
    const s = summarizeWeek(entries);
    expect(s.realized).toBe(150);
    expect(s.wins).toHaveLength(1);
    expect(s.losses).toHaveLength(1);
    expect(s.worst).toBe(-150);
  });

  it("reports no losses as an empty array, not a zero placeholder", () => {
    const s = summarizeWeek([{ realizedPnl: 100, mode: "put" as const, putStrike: 50, contracts: 1 }]);
    expect(s.losses).toHaveLength(0);
    expect(s.worst).toBe(0);
  });

  it("averages return on collateral only over entries where collateral is known", () => {
    const entries = [
      { realizedPnl: 500, mode: "put" as const, putStrike: 50, contracts: 1 }, // collateral 5000 -> 10%
      { realizedPnl: -100, mode: "strangle" as const, putStrike: 45, callStrike: 55, contracts: 1 }, // uncapped, excluded
    ];
    const s = summarizeWeek(entries);
    expect(s.avgReturnPct).toBeCloseTo(10);
  });

  it("returns null avg return when no entry has computable collateral", () => {
    const s = summarizeWeek([{ realizedPnl: -100, mode: "strangle" as const, putStrike: 45, callStrike: 55, contracts: 1 }]);
    expect(s.avgReturnPct).toBeNull();
  });
});
