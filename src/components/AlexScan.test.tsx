import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AlexScan } from "./AlexScan";
import { COMPANIES } from "../appConstants";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: () => Promise.resolve({}) }));
});

function makeBars(n: number) {
  const bars = [];
  const start = new Date("2024-01-01T00:00:00Z");
  for (let i = 0; i < n; i++) {
    const c = 100 + i * 0.1;
    const date = new Date(start.getTime() + i * 86400000);
    bars.push({ t: date.toISOString(), o: c - 0.2, h: c + 0.3, l: c - 0.3, c, v: 1_000_000 });
  }
  return bars;
}

describe("AlexScan", () => {
  it("shows a scanning message, then a no-data fallback when the API is unavailable", async () => {
    render(<AlexScan capital={30000} onLoad={() => {}} onViewChart={() => {}} />);
    expect(screen.getByText(/Alex is scanning/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/No price history came back/)).toBeInTheDocument());
  });

  it("shows the backtest disclosure regardless of scan results", async () => {
    render(<AlexScan capital={30000} onLoad={() => {}} onViewChart={() => {}} />);
    await waitFor(() => expect(screen.getByText(/Backtested, not proven/)).toBeInTheDocument());
    expect(screen.getByText(/does not show a reliable edge/)).toBeInTheDocument();
  });

  it("lets the user re-run the scan", async () => {
    render(<AlexScan capital={30000} onLoad={() => {}} onViewChart={() => {}} />);
    await waitFor(() => screen.getByText("Refresh ↺"));
    const user = userEvent.setup();
    const callsBefore = vi.mocked(fetch).mock.calls.length;
    await user.click(screen.getByText("Refresh ↺"));
    await waitFor(() => expect(vi.mocked(fetch).mock.calls.length).toBeGreaterThan(callsBefore));
  });

  it("calls onViewChart with a row's ticker when its Chart link is clicked", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url.includes("/api/history")) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ available: true, bars: makeBars(220) }) });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) }); // /api/earnings — no map, hasEarnings stays unknown
      })
    );
    const onViewChart = vi.fn();
    const user = userEvent.setup();
    render(<AlexScan capital={30000} onLoad={() => {}} onViewChart={onViewChart} />);

    await waitFor(() => expect(screen.getAllByText("🕯️ View chart").length).toBeGreaterThan(0));
    await user.click(screen.getAllByText("🕯️ View chart")[0]);
    // Rows are sorted by score, so the first button isn't necessarily
    // COMPANIES[0] — just confirm it's called with a real ticker from the
    // scanned watchlist, exactly once.
    expect(onViewChart).toHaveBeenCalledTimes(1);
    expect(COMPANIES.map((c) => c.ticker)).toContain(onViewChart.mock.calls[0][0]);
  });

  describe("scheduled-scan cache", () => {
    const CACHED_ROW = {
      sym: "ZZZZ", name: "Not In COMPANIES", price: 42, score: 77,
      grade: { label: "Good setup", color: "#22c55e", bg: "#f7fdf9" },
      sma20: null, sma50: null, sma200: null, rsiVal: null, atrVal: null, volRatio: null,
      aboveSma20: true, aboveSma50: true, aboveSma200: true, pullbackPct: null, relStrength: null,
      return10: null, spyReturn10: null, stopPrice: 40, targetPrice: 45, stopDist: 2, shares: 1,
      posValue: 42, riskAmount: 50, canAfford: true, hasEarnings: false, earningsDate: null,
    };

    function mockCacheAvailable() {
      vi.stubGlobal(
        "fetch",
        vi.fn((url: string) => {
          if (url.includes("/api/scan-cache")) {
            return Promise.resolve({
              ok: true,
              json: () => Promise.resolve({
                available: true,
                results: [CACHED_ROW],
                condition: { emoji: "🟢", label: "Bull market", summary: "Above the long-term average.", color: "#16a34a", bg: "#f0fdf4" },
                scannedAt: "2026-09-08T12:00:00.000Z",
              }),
            });
          }
          throw new Error(`unexpected fetch in cache-hit test: ${url}`);
        })
      );
    }

    it("uses the cache instead of a live per-ticker scan when it's available, including a ticker beyond COMPANIES", async () => {
      mockCacheAvailable();
      render(<AlexScan capital={30000} onLoad={() => {}} onViewChart={() => {}} />);
      await waitFor(() => expect(screen.getByText("ZZZZ")).toBeInTheDocument());
      // Only the one /api/scan-cache request — no per-ticker /api/history
      // calls, proving the live loop never ran.
      expect(vi.mocked(fetch).mock.calls).toHaveLength(1);
      expect(vi.mocked(fetch).mock.calls[0][0]).toContain("/api/scan-cache");
    });

    it("labels the run as a cached scan, with its own timestamp, not a live one", async () => {
      mockCacheAvailable();
      render(<AlexScan capital={30000} onLoad={() => {}} onViewChart={() => {}} />);
      await waitFor(() => expect(screen.getByText(/cached scan from/)).toBeInTheDocument());
      expect(screen.queryByText(/needs an Alpaca market-data key/)).not.toBeInTheDocument();
    });
  });
});
