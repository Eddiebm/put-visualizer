import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Journal, JournalRow } from "./Journal";
import type { JournalEntry } from "../types";

function entry(overrides: Partial<JournalEntry> = {}): JournalEntry {
  return {
    id: "1", openedAt: "2026-09-01", mode: "put", ticker: "AAPL", expiration: "2026-09-30",
    putStrike: 280, putPrem: 3.5, callStrike: 0, callPrem: 0, spot: 284, contracts: 1,
    credit: 350, status: "open",
    ...overrides,
  };
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
});

function closedEntry(overrides: Partial<JournalEntry> = {}) {
  return entry({ status: "closed", closedAt: "2026-09-10", closePrice: 290, ...overrides });
}

describe("Journal", () => {
  it("shows the empty state with no trades", () => {
    render(<Journal journal={[]} onLog={() => {}} onClose={() => {}} onDelete={() => {}} />);
    expect(screen.getByText(/No trades logged yet/)).toBeInTheDocument();
  });

  it("calls onLog when 'Log current trade' is clicked", async () => {
    const onLog = vi.fn();
    const user = userEvent.setup();
    render(<Journal journal={[]} onLog={onLog} onClose={() => {}} onDelete={() => {}} />);
    await user.click(screen.getByText("+ Log current trade"));
    expect(onLog).toHaveBeenCalledOnce();
  });

  it("sums realized P&L across wins and losses without netting them individually", () => {
    const journal = [
      closedEntry({ id: "a", realizedPnl: 300 }),
      closedEntry({ id: "b", realizedPnl: -150 }),
    ];
    render(<Journal journal={journal} onLog={() => {}} onClose={() => {}} onDelete={() => {}} />);
    expect(screen.getByText("+$150")).toBeInTheDocument(); // net realized — unique
    expect(screen.getByText("Wins (1)")).toBeInTheDocument();
    expect(screen.getByText("Losses (1)")).toBeInTheDocument();
    // +$300 (win sum) and −$150 (loss sum + worst loss + row) each appear more
    // than once (summary stats + the row itself) — just confirm they're present.
    expect(screen.getAllByText("+$300").length).toBeGreaterThan(0);
    expect(screen.getAllByText("−$150").length).toBeGreaterThan(0);
  });

  it("shows the 'no losses yet' note only when there are closed trades but no losses", () => {
    const journal = [closedEntry({ id: "a", realizedPnl: 300 })];
    render(<Journal journal={journal} onLog={() => {}} onClose={() => {}} onDelete={() => {}} />);
    expect(screen.getByText(/keep logging the bad weeks too/)).toBeInTheDocument();
  });

  it("does not show the 'no losses' note when a loss exists", () => {
    const journal = [closedEntry({ id: "a", realizedPnl: -100 })];
    render(<Journal journal={journal} onLog={() => {}} onClose={() => {}} onDelete={() => {}} />);
    expect(screen.queryByText(/keep logging the bad weeks too/)).not.toBeInTheDocument();
  });
});

describe("JournalRow", () => {
  it("shows a close-price input and Close button for an open trade", () => {
    render(<JournalRow e={entry()} onClose={() => {}} onDelete={() => {}} />);
    expect(screen.getByPlaceholderText("price")).toBeInTheDocument();
    expect(screen.getByText("Close")).toBeInTheDocument();
  });

  it("calls onClose with the entry id and typed price", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<JournalRow e={entry()} onClose={onClose} onDelete={() => {}} />);
    await user.type(screen.getByPlaceholderText("price"), "290");
    await user.click(screen.getByText("Close"));
    expect(onClose).toHaveBeenCalledWith("1", "290");
  });

  it("does not call onClose when the price field is empty", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<JournalRow e={entry()} onClose={onClose} onDelete={() => {}} />);
    await user.click(screen.getByText("Close"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("calls onDelete with the entry id", async () => {
    const onDelete = vi.fn();
    const user = userEvent.setup();
    render(<JournalRow e={entry()} onClose={() => {}} onDelete={onDelete} />);
    await user.click(screen.getByLabelText("delete"));
    expect(onDelete).toHaveBeenCalledWith("1");
  });

  it("shows realized P&L (not a close form) for a closed trade, colored by win/loss", () => {
    const { rerender } = render(<JournalRow e={entry({ status: "closed", realizedPnl: 200, closedAt: "2026-09-10", closePrice: 290 })} onClose={() => {}} onDelete={() => {}} />);
    expect(screen.queryByPlaceholderText("price")).not.toBeInTheDocument();
    const winValue = screen.getByText("+$200");
    expect(winValue.style.color).toBe("rgb(58, 165, 107)"); // #3aa56b

    rerender(<JournalRow e={entry({ status: "closed", realizedPnl: -200, closedAt: "2026-09-10", closePrice: 260 })} onClose={() => {}} onDelete={() => {}} />);
    const lossValue = screen.getByText("−$200");
    expect(lossValue.style.color).toBe("rgb(225, 76, 76)"); // #e14c4c
  });

  it("flags a stop-loss hit once the unrealized loss exceeds 2x the credit collected", async () => {
    vi.stubGlobal("fetch", vi.fn((url) => {
      if (url.includes("/api/option")) {
        // credit was 350 (contracts=1); a $8 option price -> unrealized loss of 350 - 800 = -450, past 2x350=700? No: -450 > -700, so NOT hit.
        // Use a bigger premium to blow past the stop-loss: 350 - 12*100 = -850, which IS past -700.
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ available: true, premium: 12 }) });
      }
      return Promise.resolve({ ok: false });
    }));
    render(<JournalRow e={entry()} onClose={() => {}} onDelete={() => {}} />);
    await waitFor(() => expect(screen.getByText(/Stop-loss hit/)).toBeInTheDocument());
  });

  it("shows the plain stop-loss rule note (no warning) when nothing has been fetched yet", () => {
    render(<JournalRow e={entry()} onClose={() => {}} onDelete={() => {}} />);
    expect(screen.getByText(/Stop-loss rule: close if loss exceeds/)).toBeInTheDocument();
  });

  it("falls back to a 2x multiplier for entries logged before stopLossMultiplier existed", () => {
    render(<JournalRow e={entry()} onClose={() => {}} onDelete={() => {}} />); // no stopLossMultiplier on the entry
    // credit=350 -> limit = $700 at the default 2x
    expect(screen.getByText(/close if loss exceeds \$700 \(2× credit collected\)/)).toBeInTheDocument();
  });

  it("honors a per-entry stopLossMultiplier in the limit shown", () => {
    // credit=350, multiplier=1 -> limit is $350, not the default $700
    render(<JournalRow e={entry({ stopLossMultiplier: 1 })} onClose={() => {}} onDelete={() => {}} />);
    expect(screen.getByText(/close if loss exceeds \$350 \(1× credit collected\)/)).toBeInTheDocument();
  });

  it("triggers a stop-loss at a tighter multiplier where the default 2x would not have fired yet", async () => {
    vi.stubGlobal("fetch", vi.fn((url) => {
      // credit=350 (contracts=1); an $8 option price -> unrealized loss of 350 - 800 = -450.
      // At the default 2x (limit $700), -450 is not past -700 — no hit. At a 1x
      // multiplier (limit $350), -450 IS past -350 — a hit.
      if (url.includes("/api/option")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ available: true, premium: 8 }) });
      }
      return Promise.resolve({ ok: false });
    }));
    render(<JournalRow e={entry({ stopLossMultiplier: 1 })} onClose={() => {}} onDelete={() => {}} />);
    await waitFor(() => expect(screen.getByText(/Stop-loss hit/)).toBeInTheDocument());
  });
});
