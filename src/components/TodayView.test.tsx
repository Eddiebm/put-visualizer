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
    expect(screen.getByText("Scanning stocks…")).toBeInTheDocument();
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

  describe("scheduled-scan cache shortlist", () => {
    // 25 fabricated cached results (more than SHORTLIST_SIZE=20), scored
    // so ranking is unambiguous: TICK00 highest, TICK24 lowest.
    const CACHED_RESULTS = Array.from({ length: 25 }, (_, i) => ({
      sym: `TICK${String(i).padStart(2, "0")}`, name: `Ticker ${i}`, price: 100,
      score: 100 - i, grade: { label: "x", color: "#000", bg: "#fff" },
    }));

    function mockCacheAndTrackLiveFetches() {
      const liveSymbolsRequested = new Set<string>();
      vi.stubGlobal(
        "fetch",
        vi.fn((url: string) => {
          if (url.includes("/api/scan-cache")) {
            return Promise.resolve({ ok: true, json: () => Promise.resolve({ available: true, results: CACHED_RESULTS }) });
          }
          if (url.includes("/api/earnings")) {
            return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
          }
          // /api/quote, /api/history, /api/option all carry ?symbol=
          const m = /[?&]symbol=([^&]+)/.exec(url);
          if (m) liveSymbolsRequested.add(m[1]);
          return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
        })
      );
      return liveSymbolsRequested;
    }

    it("only does a live fetch for the top SHORTLIST_SIZE cached tickers by score, not the whole cached universe", async () => {
      const liveSymbolsRequested = mockCacheAndTrackLiveFetches();
      const onPicksReady = vi.fn();
      render(<TodayView capital={30000} onLoadTrade={() => {}} onPicksReady={onPicksReady} onViewChart={() => {}} />);
      await waitFor(() => expect(onPicksReady).toHaveBeenCalled());

      expect(onPicksReady.mock.calls[0][0].totalScanned).toBe(20);
      expect(liveSymbolsRequested.size).toBe(20);
      expect(liveSymbolsRequested.has("TICK00")).toBe(true); // highest score
      expect(liveSymbolsRequested.has("TICK19")).toBe(true); // 20th-highest — the cutoff
      expect(liveSymbolsRequested.has("TICK20")).toBe(false); // 21st — just past the cutoff
      expect(liveSymbolsRequested.has("TICK24")).toBe(false); // lowest score
    });
  });
});

const SAMPLE_PICK: OpportunityPick = {
  sym: "AAPL", name: "Apple Inc.", price: 190, strike: 185, premium: 2.5, iv: 0.28, rvol: 0.25, dte: 30,
  richness: { tag: "fair", emoji: "⚖️", headline: "fairly priced", detail: "" }, richnessTag: "fair",
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

  it("shows 'Confirm to see' rather than a bare score/grade until the worst-case checkbox is checked, even though every fact passes", () => {
    render(<OpportunityCard pick={SAMPLE_PICK} capital={30000} onLoad={() => {}} onViewChart={() => {}} />);
    expect(screen.getByText("❓ Confirm to see")).toBeInTheDocument();
    expect(screen.queryByText("✅ Pick")).not.toBeInTheDocument();
    // The score still shows, but demoted and explicitly labeled "tape".
    expect(screen.getByText(/tape: 62 · Good/)).toBeInTheDocument();
  });

  it("flips to 'Pick' once the worst-case checkbox is checked, with every other fact already passing", async () => {
    const user = userEvent.setup();
    render(<OpportunityCard pick={SAMPLE_PICK} capital={30000} onLoad={() => {}} onViewChart={() => {}} />);
    await user.click(screen.getByRole("checkbox"));
    expect(screen.getByText("✅ Pick")).toBeInTheDocument();
  });

  it("shows 'Don't pick' when the person explicitly declines the worst case, not just 'Confirm to see'", async () => {
    const user = userEvent.setup();
    render(<OpportunityCard pick={SAMPLE_PICK} capital={30000} onLoad={() => {}} onViewChart={() => {}} />);
    await user.click(screen.getByText("No, I wouldn't"));
    expect(screen.getByText("🚫 Don't pick")).toBeInTheDocument();
  });

  it("shows 'Don't pick' when the trade can't be afforded, even with the checkbox checked", async () => {
    const user = userEvent.setup();
    render(<OpportunityCard pick={{ ...SAMPLE_PICK, canAfford: false }} capital={30000} onLoad={() => {}} onViewChart={() => {}} />);
    await user.click(screen.getByRole("checkbox"));
    expect(screen.getByText("🚫 Don't pick")).toBeInTheDocument();
  });

  it("shows the backtest disclosure banner alongside the tape score", () => {
    render(<OpportunityCard pick={SAMPLE_PICK} capital={30000} onLoad={() => {}} onViewChart={() => {}} />);
    expect(screen.getByText(/Backtested, not proven/)).toBeInTheDocument();
  });

  it("relabels the CTA to 'See the trade anyway' rather than 'Show Me The Trade' once the verdict is a hard don't-pick", async () => {
    const user = userEvent.setup();
    render(<OpportunityCard pick={{ ...SAMPLE_PICK, canAfford: false }} capital={30000} onLoad={() => {}} onViewChart={() => {}} />);
    await user.click(screen.getByRole("checkbox"));
    expect(screen.getByText("See the trade anyway →")).toBeInTheDocument();
    expect(screen.queryByText("Show Me The Trade →")).not.toBeInTheDocument();
  });
});
