import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AiAssistant } from "./AiAssistant";

const PLACEHOLDER = "Why AMD? What if it drops 10%?";

// `fetch` is stubbed globally per-test with a fresh vi.fn(); keep a typed
// handle to it so tests can drive its resolved/rejected value the same way
// the untyped .jsx version did (by calling methods directly on `fetch`).
let fetch: Mock;

beforeEach(() => {
  fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
});

describe("AiAssistant", () => {
  it("stays closed by default, opens to a greeting", async () => {
    const user = userEvent.setup();
    render(<AiAssistant context={{}} aiKey="test-ai-key" />);
    expect(screen.queryByText(/Ask me anything about today's trades/)).not.toBeInTheDocument();
    await user.click(screen.getByTitle("Ask your AI coach"));
    expect(screen.getByText(/Ask me anything about today's trades/)).toBeInTheDocument();
  });

  it("sends a message and shows the coach's reply", async () => {
    fetch.mockResolvedValue({ json: () => Promise.resolve({ available: true, reply: "Here's the plain-English answer." }) });
    const user = userEvent.setup();
    render(<AiAssistant context={{ capital: 5000 }} aiKey="test-ai-key" />);
    await user.click(screen.getByTitle("Ask your AI coach"));

    await user.type(screen.getByPlaceholderText(PLACEHOLDER), "Why this trade?{Enter}");

    await waitFor(() => expect(screen.getByText("Here's the plain-English answer.")).toBeInTheDocument());
    expect(screen.getByText("Why this trade?")).toBeInTheDocument();
  });

  it("sends the aiKey prop as the x-ai-key header", async () => {
    fetch.mockResolvedValue({ json: () => Promise.resolve({ available: true, reply: "ok" }) });
    const user = userEvent.setup();
    render(<AiAssistant context={{}} aiKey="my-secret-key" />);
    await user.click(screen.getByTitle("Ask your AI coach"));
    await user.type(screen.getByPlaceholderText(PLACEHOLDER), "test{Enter}");
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    const [, opts] = fetch.mock.calls[0];
    expect(opts.headers["x-ai-key"]).toBe("my-secret-key");
  });

  it("shows a setup message when the AI isn't configured server-side", async () => {
    fetch.mockResolvedValue({ json: () => Promise.resolve({ available: false }) });
    const user = userEvent.setup();
    render(<AiAssistant context={{}} aiKey="test-ai-key" />);
    await user.click(screen.getByTitle("Ask your AI coach"));
    await user.type(screen.getByPlaceholderText(PLACEHOLDER), "test{Enter}");
    await waitFor(() => expect(screen.getByText(/isn't set up yet/)).toBeInTheDocument());
  });

  it("shows a key-mismatch message on a 401 response", async () => {
    fetch.mockResolvedValue({ status: 401, json: () => Promise.resolve({ error: "unauthorized" }) });
    const user = userEvent.setup();
    render(<AiAssistant context={{}} aiKey="wrong-key" />);
    await user.click(screen.getByTitle("Ask your AI coach"));
    await user.type(screen.getByPlaceholderText(PLACEHOLDER), "test{Enter}");
    await waitFor(() => expect(screen.getByText(/doesn't match what's set on the server/)).toBeInTheDocument());
  });

  it("shows a network-error fallback message when the fetch fails", async () => {
    fetch.mockRejectedValue(new Error("network down"));
    const user = userEvent.setup();
    render(<AiAssistant context={{}} aiKey="test-ai-key" />);
    await user.click(screen.getByTitle("Ask your AI coach"));
    await user.type(screen.getByPlaceholderText(PLACEHOLDER), "test{Enter}");
    await waitFor(() => expect(screen.getByText(/Couldn't reach the AI coach/)).toBeInTheDocument());
  });
});
