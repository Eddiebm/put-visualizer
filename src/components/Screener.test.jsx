import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Screener } from "./Screener.jsx";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: () => Promise.resolve({}) }));
});

describe("Screener", () => {
  it("lets selecting up to 6 tickers and disables Compare until at least one is picked", async () => {
    const user = userEvent.setup();
    render(<Screener expiration="2026-09-18" dropPct={20} capital={30000} mode="put" onLoad={() => {}} />);
    expect(screen.getByText("Compare stocks", { selector: "button" })).toBeDisabled();
    await user.click(screen.getByText("SPY"));
    expect(screen.getByText("Compare 1 stock", { selector: "button" })).not.toBeDisabled();
  });

  it("falls back to snapshot prices when the API is unavailable, and shows the no-live-premiums warning", async () => {
    const user = userEvent.setup();
    render(<Screener expiration="2026-09-18" dropPct={20} capital={30000} mode="put" onLoad={() => {}} />);
    await user.click(screen.getByText("SPY"));
    await user.click(screen.getByText("Compare 1 stock"));
    await waitFor(() => expect(screen.getByText(/No live premiums/)).toBeInTheDocument());
    expect(screen.getAllByText("SPY").length).toBeGreaterThan(1); // chip + results row
  });

  it("calls onLoad with the ticker, strike, and premium when Load is clicked", async () => {
    fetch.mockImplementation((url) => {
      if (url.includes("/api/quote")) return Promise.resolve({ ok: true, json: () => Promise.resolve({ price: 580, source: "live" }) });
      if (url.includes("/api/option")) return Promise.resolve({ ok: true, json: () => Promise.resolve({ available: true, premium: 4.2 }) });
      return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
    });
    const onLoad = vi.fn();
    const user = userEvent.setup();
    render(<Screener expiration="2026-09-18" dropPct={20} capital={30000} mode="put" onLoad={onLoad} />);
    await user.click(screen.getByText("SPY"));
    await user.click(screen.getByText("Compare 1 stock"));
    await waitFor(() => expect(screen.getAllByText("Load ↑").length).toBeGreaterThan(0));
    await user.click(screen.getAllByText("Load ↑")[0]);
    expect(onLoad).toHaveBeenCalledWith("SPY", expect.any(Number), 4.2);
  });

  it("clears the selection when Clear is clicked", async () => {
    const user = userEvent.setup();
    render(<Screener expiration="2026-09-18" dropPct={20} capital={30000} mode="put" onLoad={() => {}} />);
    await user.click(screen.getByText("SPY"));
    await user.click(screen.getByText("Clear"));
    expect(screen.getByText("Compare stocks", { selector: "button" })).toBeDisabled();
  });
});
