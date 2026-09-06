import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TastyConnect } from "./Tastytrade.jsx";
import { TASTY_LIVE_ACK_KEY, TASTY_LIVE_ACK_TTL_MS } from "../appConstants.js";

// This is the single most safety-critical UI in the app: it gates the only
// path to placing a real order with real money. Every assertion here is
// protecting against that gate silently regressing to "one click connects."

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: () => Promise.resolve({}) }));
});

describe("TastyConnect — disconnected, never acknowledged", () => {
  it("shows the live-trading warning gate, not the login form, on first open", async () => {
    const user = userEvent.setup();
    render(<TastyConnect tasty={null} onConnect={() => {}} onDisconnect={() => {}} />);
    await user.click(screen.getByText("🔗 Connect Tastytrade"));

    expect(screen.getByText(/This is live trading, not a demo/)).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Email")).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Password")).not.toBeInTheDocument();
  });

  it("keeps the continue button disabled until the acknowledgment checkbox is checked", async () => {
    const user = userEvent.setup();
    render(<TastyConnect tasty={null} onConnect={() => {}} onDisconnect={() => {}} />);
    await user.click(screen.getByText("🔗 Connect Tastytrade"));

    const continueBtn = screen.getByText("I understand, continue");
    expect(continueBtn).toBeDisabled();

    await user.click(screen.getByRole("checkbox"));
    expect(continueBtn).not.toBeDisabled();
  });

  it("reveals the login form only after checking the box AND clicking continue", async () => {
    const user = userEvent.setup();
    render(<TastyConnect tasty={null} onConnect={() => {}} onDisconnect={() => {}} />);
    await user.click(screen.getByText("🔗 Connect Tastytrade"));
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByText("I understand, continue"));

    expect(screen.getByPlaceholderText("Email")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Password")).toBeInTheDocument();
    expect(screen.queryByText(/This is live trading, not a demo/)).not.toBeInTheDocument();
  });

  it("persists the acknowledgment to localStorage so it isn't asked again immediately", async () => {
    const user = userEvent.setup();
    render(<TastyConnect tasty={null} onConnect={() => {}} onDisconnect={() => {}} />);
    await user.click(screen.getByText("🔗 Connect Tastytrade"));
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByText("I understand, continue"));

    const stored = localStorage.getItem(TASTY_LIVE_ACK_KEY);
    expect(stored).not.toBeNull();
    expect(Date.now() - parseInt(stored, 10)).toBeLessThan(5000);
  });

  it("Cancel closes the panel without acknowledging", async () => {
    const user = userEvent.setup();
    render(<TastyConnect tasty={null} onConnect={() => {}} onDisconnect={() => {}} />);
    await user.click(screen.getByText("🔗 Connect Tastytrade"));
    await user.click(screen.getByText("Cancel"));

    expect(screen.queryByText(/This is live trading, not a demo/)).not.toBeInTheDocument();
    expect(localStorage.getItem(TASTY_LIVE_ACK_KEY)).toBeNull();
  });
});

describe("TastyConnect — acknowledgment freshness", () => {
  it("skips the gate and shows the login form directly when acknowledged recently", async () => {
    localStorage.setItem(TASTY_LIVE_ACK_KEY, String(Date.now() - 1000)); // 1s ago
    const user = userEvent.setup();
    render(<TastyConnect tasty={null} onConnect={() => {}} onDisconnect={() => {}} />);
    await user.click(screen.getByText("🔗 Connect Tastytrade"));

    expect(screen.queryByText(/This is live trading, not a demo/)).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText("Email")).toBeInTheDocument();
  });

  it("re-shows the gate once the acknowledgment is older than the TTL", async () => {
    localStorage.setItem(TASTY_LIVE_ACK_KEY, String(Date.now() - TASTY_LIVE_ACK_TTL_MS - 1000));
    const user = userEvent.setup();
    render(<TastyConnect tasty={null} onConnect={() => {}} onDisconnect={() => {}} />);
    await user.click(screen.getByText("🔗 Connect Tastytrade"));

    expect(screen.getByText(/This is live trading, not a demo/)).toBeInTheDocument();
  });
});

describe("TastyConnect — connected state", () => {
  it("shows a LIVE badge and lets the user disconnect", async () => {
    const onDisconnect = vi.fn();
    const user = userEvent.setup();
    render(
      <TastyConnect
        tasty={{ nickname: "Main", buyingPower: 5000, accountNumber: "5WX00001", token: "t" }}
        onConnect={() => {}}
        onDisconnect={onDisconnect}
      />
    );
    expect(screen.getByText("LIVE")).toBeInTheDocument();
    expect(screen.getByText(/Tastytrade connected/)).toBeInTheDocument();

    await user.click(screen.getByText("Disconnect"));
    expect(onDisconnect).toHaveBeenCalledOnce();
  });
});

describe("TastyConnect — login form disables Connect until both fields are filled", () => {
  it("disables Connect with empty fields, enables it once both are filled", async () => {
    const user = userEvent.setup();
    render(<TastyConnect tasty={null} onConnect={() => {}} onDisconnect={() => {}} />);
    await user.click(screen.getByText("🔗 Connect Tastytrade"));
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByText("I understand, continue"));

    const connectBtn = screen.getByText("Connect →");
    expect(connectBtn).toBeDisabled();

    await user.type(screen.getByPlaceholderText("Email"), "me@example.com");
    expect(connectBtn).toBeDisabled(); // still missing password

    await user.type(screen.getByPlaceholderText("Password"), "hunter2");
    expect(connectBtn).not.toBeDisabled();
  });
});
