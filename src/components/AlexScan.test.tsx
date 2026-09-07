import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AlexScan } from "./AlexScan";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: () => Promise.resolve({}) }));
});

describe("AlexScan", () => {
  it("shows a scanning message, then a no-data fallback when the API is unavailable", async () => {
    render(<AlexScan capital={30000} onLoad={() => {}} />);
    expect(screen.getByText(/Alex is scanning/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/No price history came back/)).toBeInTheDocument());
  });

  it("lets the user re-run the scan", async () => {
    render(<AlexScan capital={30000} onLoad={() => {}} />);
    await waitFor(() => screen.getByText("Refresh ↺"));
    const user = userEvent.setup();
    const callsBefore = vi.mocked(fetch).mock.calls.length;
    await user.click(screen.getByText("Refresh ↺"));
    await waitFor(() => expect(vi.mocked(fetch).mock.calls.length).toBeGreaterThan(callsBefore));
  });
});
