import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TastyOrderConfirm } from "./Tastytrade.jsx";

// The other half of the safety story: even after connecting and passing the
// dry-run, an actual "place" call requires typing PLACE exactly. Before this,
// a single click on "Yes — Place This Order" was enough.

const order = { mode: "put", ticker: "AAPL", expiration: "2026-09-18", putStrike: 280, putPrem: 3.5, contracts: 1 };
const tasty = { token: "t", accountNumber: "5WX00001", nickname: "Main", rememberToken: "r" };

function mockFetchSequence(responses) {
  let i = 0;
  return vi.fn(() => {
    const r = responses[Math.min(i, responses.length - 1)];
    i++;
    return Promise.resolve({ ok: r.ok !== false, status: r.status ?? 200, json: () => Promise.resolve(r.body ?? {}) });
  });
}

describe("TastyOrderConfirm", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetchSequence([{ body: { buyingPowerEffect: {}, feeCalculation: {} } }]));
  });

  it("shows a validating state, then the confirm screen once the dry-run succeeds", async () => {
    render(<TastyOrderConfirm order={order} tasty={tasty} onClose={() => {}} onRefreshSession={() => {}} />);
    expect(screen.getByText(/Validating order/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Confirm your order")).toBeInTheDocument());
  });

  it("keeps the place-order button disabled until PLACE is typed exactly", async () => {
    const user = userEvent.setup();
    render(<TastyOrderConfirm order={order} tasty={tasty} onClose={() => {}} onRefreshSession={() => {}} />);
    await waitFor(() => screen.getByText("Confirm your order"));

    const placeBtn = screen.getByText("Yes — Place This Order");
    const input = screen.getByPlaceholderText("PLACE");
    expect(placeBtn).toBeDisabled();

    await user.type(input, "plac");
    expect(placeBtn).toBeDisabled();

    await user.clear(input);
    await user.type(input, "PLACEX");
    expect(placeBtn).toBeDisabled();
  });

  it("accepts PLACE case-insensitively and enables the button", async () => {
    const user = userEvent.setup();
    render(<TastyOrderConfirm order={order} tasty={tasty} onClose={() => {}} onRefreshSession={() => {}} />);
    await waitFor(() => screen.getByText("Confirm your order"));

    await user.type(screen.getByPlaceholderText("PLACE"), "place");
    expect(screen.getByText("Yes — Place This Order")).not.toBeDisabled();
  });

  it("places the order only after typing PLACE and clicking the button", async () => {
    const fetchMock = mockFetchSequence([
      { body: { buyingPowerEffect: {}, feeCalculation: {} } }, // dry-run
      { body: { orderId: "ORD-123" } }, // place
    ]);
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<TastyOrderConfirm order={order} tasty={tasty} onClose={() => {}} onRefreshSession={() => {}} />);
    await waitFor(() => screen.getByText("Confirm your order"));

    await user.type(screen.getByPlaceholderText("PLACE"), "PLACE");
    await user.click(screen.getByText("Yes — Place This Order"));

    await waitFor(() => expect(screen.getByText("Order sent")).toBeInTheDocument());
    expect(screen.getByText(/ORD-123/)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("shows the error stage instead of confirm when the dry-run itself fails", async () => {
    vi.stubGlobal("fetch", mockFetchSequence([{ body: { error: "insufficient buying power" } }]));
    render(<TastyOrderConfirm order={order} tasty={tasty} onClose={() => {}} onRefreshSession={() => {}} />);
    await waitFor(() => expect(screen.getByText("Order not placed")).toBeInTheDocument());
    expect(screen.getByText("insufficient buying power")).toBeInTheDocument();
  });
});
