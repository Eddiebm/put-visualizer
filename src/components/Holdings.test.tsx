import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Holdings } from "./Holdings";

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ available: false }) }));
});

async function addHolding(shares = "10", costBasis = "100") {
  const user = userEvent.setup();
  render(<Holdings />);
  await user.type(screen.getByPlaceholderText("AAPL"), "aapl");
  await user.type(screen.getByPlaceholderText("100"), shares);
  await user.type(screen.getByPlaceholderText("150.00"), costBasis);
  await user.click(screen.getByText("Add holding"));
  return user;
}

describe("Holdings — empty state", () => {
  it("shows an empty state with no holdings tracked", () => {
    render(<Holdings />);
    expect(screen.getByText("No holdings tracked yet")).toBeInTheDocument();
  });
});

describe("Holdings — adding a position", () => {
  it("adds a holding from the form and shows it in the list", async () => {
    await addHolding("10", "100");
    expect(screen.getByText(/AAPL · 10 shares @ \$100\.00/)).toBeInTheDocument();
  });

  it("uppercases a lowercase-typed ticker", async () => {
    await addHolding();
    expect(screen.queryByText(/aapl/)).not.toBeInTheDocument();
    expect(screen.getByText(/AAPL/)).toBeInTheDocument();
  });

  it("ignores a submit with no shares or cost basis entered", async () => {
    const user = userEvent.setup();
    render(<Holdings />);
    await user.type(screen.getByPlaceholderText("AAPL"), "aapl");
    await user.click(screen.getByText("Add holding"));
    expect(screen.getByText("No holdings tracked yet")).toBeInTheDocument();
  });

  it("persists holdings to localStorage across a re-render", async () => {
    await addHolding("5", "50");
    const saved = JSON.parse(localStorage.getItem("csp_holdings_v1") || "[]");
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ ticker: "AAPL", shares: 5, costBasis: 50 });
  });
});

describe("Holdings — removing a position", () => {
  it("removes a holding when its ✕ button is clicked", async () => {
    const user = await addHolding();
    expect(screen.getByText(/AAPL/)).toBeInTheDocument();
    await user.click(screen.getByTitle("Remove holding"));
    expect(screen.getByText("No holdings tracked yet")).toBeInTheDocument();
  });
});

describe("Holdings — live data and verdicts", () => {
  function mockQuoteAndHistory(price: number, bars: Array<{ h: number; l: number; c: number }>) {
    vi.stubGlobal("fetch", vi.fn((url: string) => {
      if (url.includes("/api/quote")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ symbol: "AAPL", price, source: "test" }) });
      }
      if (url.includes("/api/history")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ available: true, bars }) });
      }
      return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
    }));
  }

  it("shows a HOLD verdict and current value once price and history load", async () => {
    // Flat 60-bar history at the cost basis itself, price unchanged —
    // squarely inside the default -10%/+20% rule range, and not below its
    // own (identical) 50-day average.
    const bars = Array.from({ length: 60 }, () => ({ h: 100, l: 100, c: 100 }));
    mockQuoteAndHistory(100, bars);
    await addHolding("10", "100");
    await waitFor(() => expect(screen.getByText(/Now \$100\.00/)).toBeInTheDocument());
    expect(screen.getAllByText("HOLD").length).toBeGreaterThan(0);
  });

  it("flags a SELL on the rule row once price drops past the stop-loss", async () => {
    const bars = Array.from({ length: 60 }, () => ({ h: 85, l: 85, c: 85 }));
    mockQuoteAndHistory(85, bars); // -15% from a $100 cost basis, past the default -10% stop
    await addHolding("10", "100");
    await waitFor(() => expect(screen.getByText(/past your 10% stop-loss/)).toBeInTheDocument());
    expect(screen.getAllByText("SELL").length).toBeGreaterThan(0);
  });

  it("shows 'Price unavailable' when the quote fetch fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: () => Promise.resolve({}) }));
    await addHolding();
    await waitFor(() => expect(screen.getByText("Price unavailable")).toBeInTheDocument());
  });
});
