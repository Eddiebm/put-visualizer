import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { TodayView } from "./TodayView.jsx";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: () => Promise.resolve({}) }));
});

describe("TodayView", () => {
  it("shows a scanning message, then a 'no trade today' fallback with no live data", async () => {
    render(<TodayView capital={30000} onLoadTrade={() => {}} onPicksReady={() => {}} />);
    expect(screen.getByText(/Scanning \d+ stocks/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("No trade today.")).toBeInTheDocument());
  });

  it("reports scan stats via onPicksReady even when nothing qualifies", async () => {
    const onPicksReady = vi.fn();
    render(<TodayView capital={30000} onLoadTrade={() => {}} onPicksReady={onPicksReady} />);
    await waitFor(() => expect(onPicksReady).toHaveBeenCalled());
    const arg = onPicksReady.mock.calls[0][0];
    expect(arg.picks).toEqual([]);
    expect(arg.totalScanned).toBeGreaterThan(0);
  });
});
