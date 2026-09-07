import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MorningGates } from "./MorningGates";

describe("MorningGates", () => {
  it("shows a loading message while the fetch is pending", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {}))); // never resolves
    render(<MorningGates />);
    expect(screen.getByText(/Running morning checks/)).toBeInTheDocument();
  });

  it("renders nothing when the morning-data fetch fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    const { container } = render(<MorningGates />);
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("renders a summary once data comes back", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ markets: [], calendar: { today: [], week: [] }, spyGap: null }),
    }));
    const { container } = render(<MorningGates />);
    await waitFor(() => expect(container).not.toBeEmptyDOMElement());
  });
});
