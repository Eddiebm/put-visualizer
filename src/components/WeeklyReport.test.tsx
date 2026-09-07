import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { WeeklyReport } from "./WeeklyReport";
import type { JournalEntry } from "../types";

function isoDaysAgo(n: number): string { const d = new Date(); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); }

const base = { ticker: "AAPL", openedAt: "2026-08-01", expiration: "2026-09-30", putPrem: 2, credit: 200 };

describe("WeeklyReport", () => {
  it("shows an empty state when nothing has closed", () => {
    render(<WeeklyReport journal={[]} />);
    expect(screen.getByText("Nothing closed yet")).toBeInTheDocument();
  });

  it("ignores open entries entirely", () => {
    render(<WeeklyReport journal={[{ id: "1", status: "open", mode: "put", ...base, putStrike: 50, contracts: 1 }]} />);
    expect(screen.getByText("Nothing closed yet")).toBeInTheDocument();
  });

  it("shows this week's realized P&L, wins, and losses without netting", () => {
    const journal: JournalEntry[] = [
      // Both dated "today" rather than "today" + "yesterday": yesterday can
      // fall in the *previous* ISO week whenever today is a Monday, which
      // would flakily split these two entries across two different weekly
      // buckets. Same-day keeps both deterministically in "this week".
      { id: "1", status: "closed", mode: "put", ...base, putStrike: 50, contracts: 1, collateral: 5000, closedAt: isoDaysAgo(0), realizedPnl: 300 },
      { id: "2", status: "closed", mode: "put", ...base, putStrike: 50, contracts: 1, collateral: 5000, closedAt: isoDaysAgo(0), realizedPnl: -150 },
    ];
    render(<WeeklyReport journal={journal} />);
    expect(screen.getByText(/This week/)).toBeInTheDocument();
    expect(screen.getByText("+$150")).toBeInTheDocument(); // net
    expect(screen.getByText("Wins (1)")).toBeInTheDocument();
    expect(screen.getByText("Losses (1)")).toBeInTheDocument();
    expect(screen.getByText("-$150")).toBeInTheDocument(); // worst single loss
  });

  it("shows a note when there are no losses this week yet", () => {
    const journal: JournalEntry[] = [
      { id: "1", status: "closed", mode: "put", ...base, putStrike: 50, contracts: 1, collateral: 5000, closedAt: isoDaysAgo(0), realizedPnl: 300 },
    ];
    render(<WeeklyReport journal={journal} />);
    expect(screen.getByText(/No losses this week/)).toBeInTheDocument();
  });

  it("lists prior weeks separately from the current week, without duplicating rows", () => {
    const journal: JournalEntry[] = [
      { id: "1", status: "closed", mode: "put", ...base, putStrike: 50, contracts: 1, collateral: 5000, closedAt: isoDaysAgo(0), realizedPnl: 100 },
      { id: "2", status: "closed", mode: "put", ...base, putStrike: 50, contracts: 1, collateral: 5000, closedAt: isoDaysAgo(10), realizedPnl: 200 },
    ];
    render(<WeeklyReport journal={journal} />);
    expect(screen.getByText("Previous weeks")).toBeInTheDocument();
  });

  it("computes avg. return on collateral only from entries where collateral is known", () => {
    const journal: JournalEntry[] = [
      { id: "1", status: "closed", mode: "put", ...base, putStrike: 50, contracts: 1, collateral: 5000, closedAt: isoDaysAgo(0), realizedPnl: 500 }, // 10%
      { id: "2", status: "closed", mode: "strangle", ...base, putStrike: 45, callStrike: 55, contracts: 1, closedAt: isoDaysAgo(0), realizedPnl: -100 }, // uncapped, excluded
    ];
    render(<WeeklyReport journal={journal} />);
    expect(screen.getByText("10.0%")).toBeInTheDocument();
  });
});
