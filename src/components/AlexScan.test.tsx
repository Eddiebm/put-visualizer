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
});
