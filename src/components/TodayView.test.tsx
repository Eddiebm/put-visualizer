import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TodayView, OpportunityCard, type OpportunityPick } from "./TodayView";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: () => Promise.resolve({}) }));
});

describe("TodayView", () => {
  it("shows a scanning message, then a 'no trade today' fallback with no live data", async () => {
    render(<TodayView capital={30000} onLoadTrade={() => {}} onPicksReady={() => {}} onViewChart={() => {}} />);
    expect(screen.getByText(/Scanning \d+ stocks/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("No trade today.")).toBeInTheDocument());
  });

  it("reports scan stats via onPicksReady even when nothing qualifies", async () => {
    const onPicksReady = vi.fn();
    render(<TodayView capital={30000} onLoadTrade={() => {}} onPicksReady={onPicksReady} onViewChart={() => {}} />);
    await waitFor(() => expect(onPicksReady).toHaveBeenCalled());
    const arg = onPicksReady.mock.calls[0][0];
    expect(arg.picks).toEqual([]);
    expect(arg.totalScanned).toBeGreaterThan(0);
  });
});

const SAMPLE_PICK: OpportunityPick = {
  sym: "AAPL", name: "Apple Inc.", price: 190, strike: 185, premium: 2.5, iv: 0.28, rvol: 0.25, dte: 30,
  richness: { tag: "fair", emoji: "⚖️", headline: "fairly priced", detail: "" },
  pop: 0.7, cushion: 1.2, annYield: 18, score: 62, grade: { label: "Good", color: "#16a34a", bg: "#f0fdf4" },
  sw: 5, longStrikeVal: 180, netCredit: 1.5, collateral: 500, maxLoss: 350, canAfford: true, contracts: 1,
  capitalPct: 0.15, maxLossPct: 0.1, hasEarnings: false, earn: 150, lose: 350, collateralUsed: 500, available: true,
  cushionDesc: "notable",
};

describe("OpportunityCard", () => {
  it("calls onViewChart with the pick's ticker when its Chart link is clicked", async () => {
    const onViewChart = vi.fn();
    const user = userEvent.setup();
    render(<OpportunityCard pick={SAMPLE_PICK} capital={30000} onLoad={() => {}} onViewChart={onViewChart} />);
    await user.click(screen.getByText("🕯️ View chart"));
    expect(onViewChart).toHaveBeenCalledWith("AAPL");
  });
});
