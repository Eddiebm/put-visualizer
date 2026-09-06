import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AiAssistant } from "./AiAssistant.jsx";

const PLACEHOLDER = "Why AMD? What if it drops 10%?";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

describe("AiAssistant", () => {
  it("stays closed by default, opens to a greeting", async () => {
    const user = userEvent.setup();
    render(<AiAssistant context={{}} />);
    expect(screen.queryByText(/Ask me anything about today's trades/)).not.toBeInTheDocument();
    await user.click(screen.getByTitle("Ask your AI coach"));
    expect(screen.getByText(/Ask me anything about today's trades/)).toBeInTheDocument();
  });

  it("sends a message and shows the coach's reply", async () => {
    fetch.mockResolvedValue({ json: () => Promise.resolve({ available: true, reply: "Here's the plain-English answer." }) });
    const user = userEvent.setup();
    render(<AiAssistant context={{ capital: 5000 }} />);
    await user.click(screen.getByTitle("Ask your AI coach"));

    await user.type(screen.getByPlaceholderText(PLACEHOLDER), "Why this trade?{Enter}");

    await waitFor(() => expect(screen.getByText("Here's the plain-English answer.")).toBeInTheDocument());
    expect(screen.getByText("Why this trade?")).toBeInTheDocument();
  });

  it("shows a setup message when the AI isn't configured server-side", async () => {
    fetch.mockResolvedValue({ json: () => Promise.resolve({ available: false }) });
    const user = userEvent.setup();
    render(<AiAssistant context={{}} />);
    await user.click(screen.getByTitle("Ask your AI coach"));
    await user.type(screen.getByPlaceholderText(PLACEHOLDER), "test{Enter}");
    await waitFor(() => expect(screen.getByText(/isn't set up yet/)).toBeInTheDocument());
  });

  it("shows a network-error fallback message when the fetch fails", async () => {
    fetch.mockRejectedValue(new Error("network down"));
    const user = userEvent.setup();
    render(<AiAssistant context={{}} />);
    await user.click(screen.getByTitle("Ask your AI coach"));
    await user.type(screen.getByPlaceholderText(PLACEHOLDER), "test{Enter}");
    await waitFor(() => expect(screen.getByText(/Couldn't reach the AI coach/)).toBeInTheDocument());
  });
});
