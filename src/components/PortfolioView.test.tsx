import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { PortfolioView } from "./PortfolioView";
import type { JournalEntry } from "../types";

function isoDaysFromNow(n: number): string { const d = new Date(); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ available: false }) }));
});

describe("PortfolioView", () => {
  it("shows an empty state with no open positions", () => {
    render(<PortfolioView journal={[]} dropPct={20} onOpenJournal={() => {}} />);
    expect(screen.getByText("No open positions")).toBeInTheDocument();
  });

  it("ignores closed entries when computing open-position totals", () => {
    const journal: JournalEntry[] = [
      { id: "1", status: "closed", mode: "put", ticker: "NVDA", putStrike: 195, putPrem: 4, credit: 400, contracts: 1, realizedPnl: -100, expiration: isoDaysFromNow(-5), openedAt: "2026-08-01" },
    ];
    render(<PortfolioView journal={journal} dropPct={20} onOpenJournal={() => {}} />);
    expect(screen.getByText("No open positions")).toBeInTheDocument();
  });

  it("sums collateral across open positions with defined risk", async () => {
    const journal: JournalEntry[] = [
      { id: "1", status: "open", mode: "put", ticker: "AAPL", putStrike: 280, putPrem: 3, credit: 300, contracts: 1, collateral: 28000, expiration: isoDaysFromNow(5), openedAt: "2026-09-01" },
      { id: "2", status: "open", mode: "put", ticker: "MSFT", putStrike: 100, putPrem: 2, credit: 200, contracts: 1, collateral: 10000, expiration: isoDaysFromNow(10), openedAt: "2026-09-02" },
    ];
    render(<PortfolioView journal={journal} dropPct={20} onOpenJournal={() => {}} />);
    await waitFor(() => expect(screen.getByText("$38,000")).toBeInTheDocument());
    expect(screen.getByText("2")).toBeInTheDocument(); // open positions count
  });

  it("excludes uncapped-risk positions from totals and calls it out", async () => {
    const journal: JournalEntry[] = [
      { id: "1", status: "open", mode: "strangle", ticker: "TSLA", putStrike: 350, putPrem: 5, credit: 500, callStrike: 420, contracts: 1, expiration: isoDaysFromNow(5), openedAt: "2026-09-01" },
    ];
    render(<PortfolioView journal={journal} dropPct={20} onOpenJournal={() => {}} />);
    await waitFor(() => expect(screen.getByText(/carries undefined or uncapped risk/)).toBeInTheDocument());
    expect(screen.getAllByText("$0").length).toBeGreaterThan(0); // collateral locked, excluding the strangle
    expect(screen.getByText(/Naked strangle/)).toBeInTheDocument();
  });

  it("flags the soonest expiration in red when it's 3 days or fewer out", async () => {
    const journal: JournalEntry[] = [
      { id: "1", status: "open", mode: "put", ticker: "AAPL", putStrike: 280, putPrem: 3, credit: 300, contracts: 1, collateral: 28000, expiration: isoDaysFromNow(2), openedAt: "2026-09-01" },
    ];
    render(<PortfolioView journal={journal} dropPct={20} onOpenJournal={() => {}} />);
    await waitFor(() => expect(screen.getAllByText("2d").length).toBeGreaterThan(0));
  });
});
