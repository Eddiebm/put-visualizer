import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TastyConnect } from "./Tastytrade";
import { TASTY_LIVE_ACK_KEY, TASTY_LIVE_ACK_TTL_MS } from "../appConstants";

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
    expect(Date.now() - parseInt(stored!, 10)).toBeLessThan(5000);
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

  it("shows a SANDBOX badge, not LIVE, for a session connected to the cert environment", () => {
    render(
      <TastyConnect
        tasty={{ nickname: "Main", buyingPower: 5000, accountNumber: "5WX00001", token: "t", env: "cert" }}
        onConnect={() => {}}
        onDisconnect={() => {}}
      />
    );
    expect(screen.getByText("SANDBOX")).toBeInTheDocument();
    expect(screen.queryByText("LIVE")).not.toBeInTheDocument();
  });
});

describe("TastyConnect — sandbox mode", () => {
  it("skips the live-trading warning gate entirely when Sandbox is selected, even with no prior acknowledgment", async () => {
    const user = userEvent.setup();
    render(<TastyConnect tasty={null} onConnect={() => {}} onDisconnect={() => {}} />);
    await user.click(screen.getByText("🔗 Connect Tastytrade"));
    await user.click(screen.getByRole("button", { name: "Sandbox" }));

    expect(screen.queryByText(/This is live trading, not a demo/)).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText("Email")).toBeInTheDocument();
    expect(screen.getByText("(sandbox)")).toBeInTheDocument();
  });

  it("switching back to Live re-shows the gate if it still hasn't been acknowledged", async () => {
    const user = userEvent.setup();
    render(<TastyConnect tasty={null} onConnect={() => {}} onDisconnect={() => {}} />);
    await user.click(screen.getByText("🔗 Connect Tastytrade"));
    await user.click(screen.getByRole("button", { name: "Sandbox" }));
    expect(screen.getByPlaceholderText("Email")).toBeInTheDocument(); // sandbox: no gate

    await user.click(screen.getByRole("button", { name: "Live" }));
    expect(screen.getByText(/This is live trading, not a demo/)).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Email")).not.toBeInTheDocument();
  });

  it("sends env: \"cert\" on both the auth and accounts calls, and includes it in the connected session", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ token: "tok", rememberToken: "rem" }) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ accounts: [{ accountNumber: "5WX00001", nickname: "Sandbox acct", buyingPower: 1000, netLiq: 1000 }] }) });
    vi.stubGlobal("fetch", fetchMock);
    const onConnect = vi.fn();
    const user = userEvent.setup();
    render(<TastyConnect tasty={null} onConnect={onConnect} onDisconnect={() => {}} />);
    await user.click(screen.getByText("🔗 Connect Tastytrade"));
    await user.click(screen.getByRole("button", { name: "Sandbox" }));
    await user.type(screen.getByPlaceholderText("Email"), "me@example.com");
    await user.type(screen.getByPlaceholderText("Password"), "hunter2");
    await user.click(screen.getByText("Connect →"));

    const [, authOpts] = fetchMock.mock.calls[0];
    const [, acctOpts] = fetchMock.mock.calls[1];
    expect(JSON.parse(authOpts.body).env).toBe("cert");
    expect(JSON.parse(acctOpts.body).env).toBe("cert");
    expect(onConnect).toHaveBeenCalledWith(expect.objectContaining({ env: "cert" }));
  });

  it("connecting on Live (the default) still sends env: \"prod\"", async () => {
    localStorage.setItem(TASTY_LIVE_ACK_KEY, String(Date.now())); // skip the gate for this test
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ token: "tok", rememberToken: "rem" }) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ accounts: [{ accountNumber: "5WX00001", nickname: "Main", buyingPower: 5000, netLiq: 5000 }] }) });
    vi.stubGlobal("fetch", fetchMock);
    const onConnect = vi.fn();
    const user = userEvent.setup();
    render(<TastyConnect tasty={null} onConnect={onConnect} onDisconnect={() => {}} />);
    await user.click(screen.getByText("🔗 Connect Tastytrade"));
    await user.type(screen.getByPlaceholderText("Email"), "me@example.com");
    await user.type(screen.getByPlaceholderText("Password"), "hunter2");
    await user.click(screen.getByText("Connect →"));

    const [, authOpts] = fetchMock.mock.calls[0];
    expect(JSON.parse(authOpts.body).env).toBe("prod");
    expect(onConnect).toHaveBeenCalledWith(expect.objectContaining({ env: "prod" }));
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
