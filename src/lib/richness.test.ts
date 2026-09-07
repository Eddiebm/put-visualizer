import { describe, it, expect } from "vitest";
import { richnessSignal } from "./richness";

describe("richnessSignal", () => {
  it("returns null when either input is missing", () => {
    expect(richnessSignal(0, 0.2)).toBeNull();
    expect(richnessSignal(0.3, 0)).toBeNull();
  });

  it("tags 'rich' when implied vol is well above realized (market overpaying)", () => {
    const r = richnessSignal(0.40, 0.25)!; // 15pt gap
    expect(r.tag).toBe("rich");
  });

  it("tags 'cheap' when implied vol is below realized (market underpaying)", () => {
    const r = richnessSignal(0.20, 0.30)!; // -10pt gap
    expect(r.tag).toBe("cheap");
  });

  it("tags 'fair' for a small gap either way", () => {
    const r = richnessSignal(0.28, 0.27)!; // 1pt gap
    expect(r.tag).toBe("fair");
  });

  it("every tag comes with a plain-English headline and detail", () => {
    const r = richnessSignal(0.40, 0.25)!;
    expect(typeof r.headline).toBe("string");
    expect(typeof r.detail).toBe("string");
  });
});
