import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Ticket } from "./Ticket.jsx";

const base = {
  mode: "put", ticker: "AAPL", expiration: "2026-09-18", putStrike: 280, putPrem: 3.5,
  longStrike: 0, longPrem: 0, callStrike: 0, callPrem: 0, contracts: 1, collateral: 28000,
  tastyConnected: false, onPlaceOrder: () => {},
};

describe("Ticket", () => {
  it("shows a single Sell-to-Open leg for a cash-secured put", () => {
    render(<Ticket {...base} />);
    expect(screen.getByText(/Sell to Open.*AAPL.*280\.00 Put/)).toBeInTheDocument();
  });

  it("shows two legs for a put credit spread", () => {
    render(<Ticket {...base} mode="spread" longStrike={260} longPrem={1} />);
    expect(screen.getByText(/Sell to Open.*280\.00 Put/)).toBeInTheDocument();
    expect(screen.getByText(/Buy to Open.*260\.00 Put/)).toBeInTheDocument();
  });

  it("adds a call leg for a strangle", () => {
    render(<Ticket {...base} mode="strangle" callStrike={300} callPrem={2} />);
    expect(screen.getByText(/300\.00 Call/)).toBeInTheDocument();
  });

  it("copies the order text to the clipboard and shows confirmation", async () => {
    // userEvent.setup() installs its own clipboard stub, so the custom one
    // must be defined AFTER setup() or it gets silently overwritten.
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<Ticket {...base} />);
    await user.click(screen.getByText("Copy"));
    expect(writeText).toHaveBeenCalledOnce();
    expect(screen.getByText("Copied ✓")).toBeInTheDocument();
  });

  it("hints at connecting Tastytrade when not connected", () => {
    render(<Ticket {...base} tastyConnected={false} />);
    expect(screen.getByText(/Connect Tastytrade \(bottom-right\)/)).toBeInTheDocument();
  });

  it("shows a place-order button when Tastytrade is connected, and calls onPlaceOrder", async () => {
    const onPlaceOrder = vi.fn();
    const user = userEvent.setup();
    render(<Ticket {...base} tastyConnected={true} onPlaceOrder={onPlaceOrder} />);
    expect(screen.queryByText(/Connect Tastytrade \(bottom-right\)/)).not.toBeInTheDocument();
    await user.click(screen.getByText("Place Order in Tastytrade →"));
    expect(onPlaceOrder).toHaveBeenCalledOnce();
  });
});
