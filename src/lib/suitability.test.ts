import { describe, it, expect } from "vitest";
import { suitabilityVerdict, type SuitabilityInput } from "./suitability";

function input(overrides: Partial<SuitabilityInput> = {}): SuitabilityInput {
  return {
    canAfford: true,
    hasEarnings: false,
    richnessTag: "fair",
    worstCaseAccepted: true,
    ...overrides,
  };
}

describe("suitabilityVerdict", () => {
  it("is 'pick' only when every fact is known and satisfied, including an explicit ownership confirmation", () => {
    const { verdict, checks } = suitabilityVerdict(input());
    expect(verdict).toBe("pick");
    expect(checks.every((c) => c.pass === true)).toBe(true);
  });

  it("is never 'pick' when ownership hasn't been confirmed, even if every other fact passes", () => {
    const { verdict } = suitabilityVerdict(input({ worstCaseAccepted: null }));
    expect(verdict).toBe("manual-check-needed");
  });

  it("is 'dont-pick' when the person says they would not own it at strike, regardless of the other facts", () => {
    const { verdict, checks } = suitabilityVerdict(input({ worstCaseAccepted: false }));
    expect(verdict).toBe("dont-pick");
    expect(checks.find((c) => c.key === "ownership")!.pass).toBe(false);
  });

  it("is 'dont-pick' when the trade can't be afforded", () => {
    const { verdict } = suitabilityVerdict(input({ canAfford: false }));
    expect(verdict).toBe("dont-pick");
  });

  it("is 'dont-pick' when earnings land before expiration", () => {
    const { verdict } = suitabilityVerdict(input({ hasEarnings: true }));
    expect(verdict).toBe("dont-pick");
  });

  it("is 'dont-pick' when the option is priced cheap vs. realized vol (not being paid enough)", () => {
    const { verdict } = suitabilityVerdict(input({ richnessTag: "cheap" }));
    expect(verdict).toBe("dont-pick");
  });

  it("treats 'rich' the same as 'fair' — both mean adequately paid", () => {
    const { verdict } = suitabilityVerdict(input({ richnessTag: "rich" }));
    expect(verdict).toBe("pick");
  });

  it("is 'manual-check-needed', not 'pick' or a silent 'dont-pick', when earnings data is unavailable", () => {
    const { verdict, checks } = suitabilityVerdict(input({ hasEarnings: null }));
    expect(verdict).toBe("manual-check-needed");
    expect(checks.find((c) => c.key === "earnings")!.pass).toBeNull();
  });

  it("is 'manual-check-needed' when richness data is unavailable", () => {
    const { verdict } = suitabilityVerdict(input({ richnessTag: null }));
    expect(verdict).toBe("manual-check-needed");
  });

  it("a hard fail (known-bad fact) always wins over a merely-unknown one", () => {
    const { verdict } = suitabilityVerdict(input({ canAfford: false, hasEarnings: null }));
    expect(verdict).toBe("dont-pick");
  });

  it("never uses win rate, POP, yield, or a mixed score — only reads exactly these four checks", () => {
    const { checks } = suitabilityVerdict(input());
    expect(checks.map((c) => c.key).sort()).toEqual(["afford", "earnings", "ownership", "richness"]);
  });
});
