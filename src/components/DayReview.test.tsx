import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DayReview } from "./DayReview";
import { today } from "../lib/dates";
import type { JournalEntry } from "../types";

describe("DayReview", () => {
  it("renders the review heading with no trades logged", () => {
    render(<DayReview journal={[]} scanStats={{}} capital={30000} />);
    expect(screen.getByText("Today's review")).toBeInTheDocument();
    expect(screen.getByText(/No trades logged yet/)).toBeInTheDocument();
  });

  it("gives full discipline score for sitting out with no scan data", () => {
    render(<DayReview journal={[]} scanStats={{}} capital={30000} />);
    expect(screen.getByText("100")).toBeInTheDocument();
  });

  it("counts a trade opened today, and shows today's realized P&L", () => {
    const journal: JournalEntry[] = [
      { id: "1", openedAt: today(), status: "closed", closedAt: today(), realizedPnl: 200, mode: "put", ticker: "AAPL", expiration: "2026-09-30", putStrike: 50, putPrem: 2, contracts: 1, credit: 200 },
    ];
    const { container } = render(<DayReview journal={journal} scanStats={{ totalScanned: 40, qualified: 3, condition: null }} capital={30000} />);
    expect(container.textContent).toContain("+$200");
  });

  it("does not count a trade opened on a different day as today's", () => {
    const journal: JournalEntry[] = [
      { id: "1", openedAt: "2020-01-01", status: "open", mode: "put", ticker: "AAPL", expiration: "2026-09-30", putStrike: 50, putPrem: 2, contracts: 1, credit: 200 },
    ];
    const { container } = render(<DayReview journal={journal} scanStats={{}} capital={30000} />);
    expect(container.textContent).not.toContain("Open positions (logged today)");
  });
});
