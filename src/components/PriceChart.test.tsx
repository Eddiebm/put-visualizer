import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PriceChart } from "./PriceChart";
import type { Bar } from "../types";

function makeBars(n: number): Bar[] {
  const bars: Bar[] = [];
  const start = new Date("2024-01-01T00:00:00Z");
  for (let i = 0; i < n; i++) {
    const c = 100 + i;
    const date = new Date(start.getTime() + i * 86400000);
    bars.push({ t: date.toISOString(), o: c - 0.5, h: c + 1, l: c - 1, c, v: 1_000_000 + i * 1000 });
  }
  return bars;
}

function mockFetchOnce(bars: Bar[] | null) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(bars ? { available: true, bars } : { available: false }),
    })
  );
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe("PriceChart — form", () => {
  it("renders a ticker field and day-range buttons, defaulting to 180d", () => {
    render(<PriceChart />);
    expect(screen.getByPlaceholderText("AAPL")).toBeInTheDocument();
    expect(screen.getByText("90d")).toBeInTheDocument();
    expect(screen.getByText("180d")).toBeInTheDocument();
    expect(screen.getByText("365d")).toBeInTheDocument();
    expect(screen.getByText("180d")).toHaveAttribute("aria-pressed", "true");
  });

  it("prefills the ticker field from initialTicker", () => {
    render(<PriceChart initialTicker="MSFT" />);
    expect(screen.getByPlaceholderText("AAPL")).toHaveValue("MSFT");
  });

  it("switches the selected day range on click", async () => {
    const user = userEvent.setup();
    render(<PriceChart />);
    await user.click(screen.getByText("365d"));
    expect(screen.getByText("365d")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("180d")).toHaveAttribute("aria-pressed", "false");
  });

  it("does not fetch when the ticker field is submitted empty", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const user = userEvent.setup();
    render(<PriceChart />);
    await user.click(screen.getByText("Load"));
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("PriceChart — loading real data", () => {
  it("fetches /api/history with the typed ticker and selected days, and renders candlesticks", async () => {
    const bars = makeBars(30);
    mockFetchOnce(bars);
    const user = userEvent.setup();
    render(<PriceChart />);
    await user.type(screen.getByPlaceholderText("AAPL"), "nvda");
    await user.click(screen.getByText("Load"));

    await waitFor(() => expect(screen.getByRole("img", { name: /NVDA candlestick chart/i })).toBeInTheDocument());
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/api/history?symbol=NVDA&days=180"));
    expect(screen.getByText("NVDA · 30 daily bars")).toBeInTheDocument();
  });

  it("shows an error state when the API reports data unavailable", async () => {
    mockFetchOnce(null);
    const user = userEvent.setup();
    render(<PriceChart />);
    await user.type(screen.getByPlaceholderText("AAPL"), "zzzz");
    await user.click(screen.getByText("Load"));

    await waitFor(() => expect(screen.getByText(/Couldn't load price history for ZZZZ/)).toBeInTheDocument());
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("shows an error state when fetch itself throws", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    const user = userEvent.setup();
    render(<PriceChart />);
    await user.type(screen.getByPlaceholderText("AAPL"), "aapl");
    await user.click(screen.getByText("Load"));

    await waitFor(() => expect(screen.getByText(/Couldn't load price history for AAPL/)).toBeInTheDocument());
  });

  it("renders one body rect and one volume rect per bar", async () => {
    const bars = makeBars(12);
    mockFetchOnce(bars);
    const user = userEvent.setup();
    const { container } = render(<PriceChart />);
    await user.type(screen.getByPlaceholderText("AAPL"), "aapl");
    await user.click(screen.getByText("Load"));

    await waitFor(() => expect(screen.getByRole("img")).toBeInTheDocument());
    // Each bar draws a body rect and a (translucent) volume rect — 12 of each.
    const rects = Array.from(container.querySelectorAll("svg > g > rect"));
    const bodyRects = rects.filter((r) => !r.hasAttribute("opacity"));
    const volumeRects = rects.filter((r) => r.hasAttribute("opacity"));
    expect(bodyRects).toHaveLength(12);
    expect(volumeRects).toHaveLength(12);
  });

  it("colors an up bar (close >= open) green and a down bar red", async () => {
    const bars: Bar[] = [
      { t: "2024-01-01T00:00:00Z", o: 100, h: 102, l: 99, c: 101, v: 1000 }, // up
      { t: "2024-01-02T00:00:00Z", o: 101, h: 102, l: 98, c: 99, v: 1000 }, // down
    ];
    mockFetchOnce(bars);
    const user = userEvent.setup();
    const { container } = render(<PriceChart />);
    await user.type(screen.getByPlaceholderText("AAPL"), "aapl");
    await user.click(screen.getByText("Load"));

    await waitFor(() => expect(screen.getByRole("img")).toBeInTheDocument());
    const bodyRects = Array.from(container.querySelectorAll("svg > g > rect")).filter(
      (r) => Number(r.getAttribute("opacity") ?? "1") === 1
    );
    expect(bodyRects).toHaveLength(2);
    expect(bodyRects[0]).toHaveAttribute("fill", "#3aa56b");
    expect(bodyRects[1]).toHaveAttribute("fill", "#e14c4c");
  });

  it("falls back to close price when a bar has no open (doesn't crash)", async () => {
    const bars: Bar[] = [{ t: "2024-01-01T00:00:00Z", h: 102, l: 98, c: 100, v: 500 }];
    mockFetchOnce(bars);
    const user = userEvent.setup();
    render(<PriceChart />);
    await user.type(screen.getByPlaceholderText("AAPL"), "aapl");
    await user.click(screen.getByText("Load"));
    await waitFor(() => expect(screen.getByRole("img")).toBeInTheDocument());
  });
});
