import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ─── App.tsx integration tests ─────────────────────────────────────────────
//
// Every child component here already has its own thorough test file (see
// src/components/*.test.tsx) — re-testing their internals would be
// redundant and would drag in ~76 companies' worth of network calls from
// TodayView/AlexScan alone. Instead every child is replaced with a small
// stub that exposes just enough surface (a testid, and buttons that call
// the real prop callbacks App.tsx passed down) to exercise what only
// App.tsx itself owns: tab switching, localStorage persistence, the
// journal-sync pull/push gating, the Tastytrade buying-power sync, the
// tour, and the calculator's own handlers (logTrade/closeTrade/deleteTrade,
// fetchPremium, selectCompany).

vi.mock("./components/Chart", () => ({
  Chart: () => <div data-testid="chart-mock" />,
}));

vi.mock("./components/CalculatorControls", () => ({
  ModeToggle: ({ onChange }: { mode: string; onChange: (m: string) => void }) => (
    <div data-testid="mode-toggle-mock">
      <button type="button" onClick={() => onChange("spread")}>spread mode</button>
    </div>
  ),
  Field: ({ label, value, onChange }: { label: string; value: unknown; onChange: (v: string) => void }) => (
    <label>
      {label}
      <input aria-label={label} value={String(value)} onChange={(e) => onChange(e.target.value)} />
    </label>
  ),
  CompanyPicker: ({ onSelect, onFetchPremium }: { onSelect: (s: string) => void; onFetchPremium: () => void }) => (
    <div data-testid="company-picker-mock">
      <button type="button" onClick={() => onSelect("AAPL")}>pick AAPL</button>
      <button type="button" onClick={onFetchPremium}>fetch premium</button>
    </div>
  ),
  SizingHint: () => <div data-testid="sizing-hint-mock" />,
}));

vi.mock("./components/Ticket", () => ({
  Ticket: ({ onPlaceOrder }: { onPlaceOrder: () => void }) => (
    <button type="button" data-testid="place-order-mock" onClick={onPlaceOrder}>Place order</button>
  ),
}));

vi.mock("./components/Journal", () => ({
  Journal: ({ journal, onLog, onClose, onDelete }: {
    journal: Array<{ id: string; status: string }>;
    onLog: () => void;
    onClose: (id: string, closePrice: string) => void;
    onDelete: (id: string) => void;
  }) => (
    <div data-testid="journal-mock">
      <div data-testid="journal-count">{journal.length}</div>
      <button type="button" onClick={onLog}>log trade</button>
      {journal.map((e) => (
        <div key={e.id} data-testid={`journal-entry-${e.id}`}>
          {e.status}
          <button type="button" onClick={() => onClose(e.id, "3.5")}>close {e.id}</button>
          <button type="button" onClick={() => onDelete(e.id)}>delete {e.id}</button>
        </div>
      ))}
    </div>
  ),
}));

vi.mock("./components/ChartExtras", () => ({
  InsightCard: () => <div data-testid="insight-card-mock" />,
  Scenarios: () => <div data-testid="scenarios-mock" />,
}));

vi.mock("./components/shared", () => ({
  Stat: ({ label, value }: { label: string; value: unknown }) => (
    <div data-testid="stat-mock">{label}: {String(value)}</div>
  ),
}));

vi.mock("./components/Tour", () => ({
  Tour: ({ onNext, onDone, onSkip }: { onNext: () => void; onDone: () => void; onSkip: () => void }) => (
    <div data-testid="tour-mock">
      <button type="button" onClick={onNext}>tour next</button>
      <button type="button" onClick={onDone}>tour done</button>
      <button type="button" onClick={onSkip}>tour skip</button>
    </div>
  ),
  buildTourSteps: () => [],
}));

vi.mock("./components/Tastytrade", () => ({
  TastyConnect: ({ tasty, onConnect, onDisconnect }: {
    tasty: { nickname: string } | null;
    onConnect: (t: unknown) => void;
    onDisconnect: () => void;
  }) => (
    <div data-testid="tasty-connect-mock">
      <div data-testid="tasty-nickname">{tasty?.nickname ?? "none"}</div>
      <button
        type="button"
        onClick={() => onConnect({ token: "tok", accountNumber: "5WX00001", nickname: "Main", buyingPower: 12345.67 })}
      >
        connect tasty
      </button>
      <button type="button" onClick={onDisconnect}>disconnect tasty</button>
    </div>
  ),
  TastyOrderConfirm: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="tasty-order-confirm-mock">
      <button type="button" onClick={onClose}>close order</button>
    </div>
  ),
}));

vi.mock("./components/JournalSync", () => ({
  JournalSync: ({ syncKey, status, onSetKey }: { syncKey: string; status: string; onSetKey: (k: string) => void }) => (
    <div data-testid="journal-sync-mock">
      <div data-testid="sync-status">{status}</div>
      <div data-testid="sync-key">{syncKey}</div>
      <button type="button" onClick={() => onSetKey("team-secret")}>set sync key</button>
      <button type="button" onClick={() => onSetKey("")}>clear sync key</button>
    </div>
  ),
}));

vi.mock("./components/AiKeySettings", () => ({
  AiKeySettings: () => <div data-testid="ai-key-settings-mock" />,
}));

vi.mock("./components/AiAssistant", () => ({
  AiAssistant: () => <div data-testid="ai-assistant-mock" />,
}));

vi.mock("./components/TodayView", () => ({
  TodayView: ({ onLoadTrade, onPicksReady, onViewChart }: {
    onLoadTrade: (pick: unknown) => void;
    onPicksReady: (ctx: unknown) => void;
    onViewChart: (sym: string) => void;
  }) => (
    <div data-testid="today-view-mock">
      <button
        type="button"
        onClick={() =>
          onLoadTrade({
            sym: "MSFT",
            strike: 300,
            premium: 5.5,
            longStrikeVal: 280,
            netCredit: 2.25,
            iv: 0.28,
          })
        }
      >
        load MSFT pick
      </button>
      <button
        type="button"
        onClick={() => onPicksReady({ picks: [{ sym: "MSFT" }], condition: null, totalScanned: 39, qualified: 4 })}
      >
        report picks
      </button>
      <button type="button" onClick={() => onViewChart("MSFT")}>view MSFT chart</button>
    </div>
  ),
}));

vi.mock("./components/Screener", () => ({
  Screener: ({ onLoad }: { onLoad: (sym: string, strike: number, prem: number) => void }) => (
    <div data-testid="screener-mock">
      <button type="button" onClick={() => onLoad("NVDA", 190, 4.2)}>load NVDA</button>
    </div>
  ),
}));

vi.mock("./components/AlexScan", () => ({
  AlexScan: ({ onLoad, onViewChart }: { onLoad: (sym: string) => void; onViewChart: (sym: string) => void }) => (
    <div data-testid="alex-scan-mock">
      <button type="button" onClick={() => onLoad("TSLA")}>load TSLA</button>
      <button type="button" onClick={() => onViewChart("TSLA")}>view TSLA chart</button>
    </div>
  ),
}));

vi.mock("./components/PortfolioView", () => ({
  PortfolioView: ({ journal, onOpenJournal }: { journal: unknown[]; onOpenJournal: () => void }) => (
    <div data-testid="portfolio-view-mock">
      <div data-testid="portfolio-count">{journal.length}</div>
      <button type="button" onClick={onOpenJournal}>open journal</button>
    </div>
  ),
}));

vi.mock("./components/WeeklyReport", () => ({
  WeeklyReport: ({ journal }: { journal: unknown[] }) => (
    <div data-testid="weekly-report-mock">{journal.length}</div>
  ),
}));

vi.mock("./components/DayReview", () => ({
  DayReview: () => <div data-testid="day-review-mock" />,
}));

vi.mock("./components/LearnView", () => ({
  LearnView: () => <div data-testid="learn-view-mock" />,
}));

vi.mock("./components/Holdings", () => ({
  Holdings: ({ onViewChart }: { onViewChart: (sym: string) => void }) => (
    <div data-testid="holdings-mock">
      <button type="button" onClick={() => onViewChart("GOOGL")}>view GOOGL chart</button>
    </div>
  ),
}));

vi.mock("./components/PriceChart", () => ({
  PriceChart: ({ initialTicker }: { initialTicker: string }) => (
    <div data-testid="price-chart-mock">initialTicker: {initialTicker || "(none)"}</div>
  ),
}));

vi.mock("./components/AssignmentView", () => ({
  AssignmentView: () => <div data-testid="assignment-view-mock" />,
}));

import App from "./App";
import { STORAGE_KEY, JOURNAL_KEY, TOUR_KEY, JOURNAL_SYNC_KEY_STORAGE } from "./appConstants";

// Fetch-response helper — App.tsx's own handlers (fetchPremium, selectCompany,
// the journal-sync pull/push effects) are real code and do call fetch, so a
// safe catch-all stub is needed for every path this suite doesn't care about;
// tests that DO care about a path pass their own handler for it.
function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) };
}

function mockFetch(handlers: Record<string, (url: string, init?: RequestInit) => unknown> = {}) {
  const fn = vi.fn((url: string, init?: RequestInit) => {
    for (const prefix of Object.keys(handlers)) {
      if (url.startsWith(prefix)) return Promise.resolve(handlers[prefix](url, init));
    }
    return Promise.resolve(jsonResponse(200, { available: false }));
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

let fetchMock: Mock;

beforeEach(() => {
  fetchMock = mockFetch();
});

describe("App", () => {
  it("shows the Today tab by default, with calculator-only content hidden", () => {
    render(<App />);
    expect(screen.getByTestId("today-view-mock")).toBeInTheDocument();
    expect(screen.queryByTestId("chart-mock")).not.toBeInTheDocument();
    expect(screen.queryByTestId("journal-mock")).not.toBeInTheDocument();
  });

  it("switches tabs, and only shows calculator content on the Calculator tab", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "💼 Holdings" }));
    expect(screen.getByTestId("holdings-mock")).toBeInTheDocument();
    expect(screen.queryByTestId("chart-mock")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Calculator" }));
    expect(screen.getByTestId("chart-mock")).toBeInTheDocument();
    expect(screen.getByTestId("journal-mock")).toBeInTheDocument();
    expect(screen.queryByTestId("holdings-mock")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "📈 Elena's report" }));
    expect(screen.getByTestId("weekly-report-mock")).toBeInTheDocument();
    expect(screen.queryByTestId("chart-mock")).not.toBeInTheDocument();
  });

  it("jumps to the Chart tab, pre-loaded with the ticker, from Alex's scan / Holdings / Today's picks", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "🔭 Alex's scan" }));
    await user.click(screen.getByText("view TSLA chart"));
    expect(screen.getByRole("button", { name: "🕯️ Chart" })).toBeInTheDocument();
    expect(screen.getByTestId("price-chart-mock")).toHaveTextContent("initialTicker: TSLA");

    await user.click(screen.getByRole("button", { name: "💼 Holdings" }));
    await user.click(screen.getByText("view GOOGL chart"));
    expect(screen.getByTestId("price-chart-mock")).toHaveTextContent("initialTicker: GOOGL");

    await user.click(screen.getByRole("button", { name: "Today's picks" }));
    await user.click(screen.getByText("view MSFT chart"));
    expect(screen.getByTestId("price-chart-mock")).toHaveTextContent("initialTicker: MSFT");
  });

  it("logs a trade with the calculator's configured stop-loss multiplier, not just the default", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Calculator" }));

    // fireEvent.change (one shot) rather than user.type (char-by-char): typing
    // a decimal point into this number-backed field round-trips through num()
    // on every keystroke, which coerces "1." back to the number 1 before the
    // "5" is ever typed — a real quirk of a controlled numeric input, not
    // something this test is trying to exercise.
    const stopLossField = screen.getByLabelText("Stop-loss (× credit)");
    fireEvent.change(stopLossField, { target: { value: "1.5" } });

    await user.click(screen.getByRole("button", { name: "log trade" }));
    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem(JOURNAL_KEY) ?? "[]");
      expect(stored[0].stopLossMultiplier).toBe(1.5);
    });
  });

  it("persists calculator inputs to localStorage as they change", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Calculator" }));

    const capitalField = screen.getByLabelText("Cash available");
    await user.clear(capitalField);
    await user.type(capitalField, "9000");

    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
      expect(stored.capital).toBe(9000);
    });
  });

  it("logs a trade to the journal and persists it, then closes and deletes it", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Calculator" }));

    await user.click(screen.getByRole("button", { name: "log trade" }));
    expect(screen.getByTestId("journal-count")).toHaveTextContent("1");
    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem(JOURNAL_KEY) ?? "[]");
      expect(stored).toHaveLength(1);
      expect(stored[0].status).toBe("open");
      expect(stored[0].stopLossMultiplier).toBe(2); // the calculator's default
    });

    const storedAfterLog = JSON.parse(localStorage.getItem(JOURNAL_KEY) ?? "[]");
    const id = storedAfterLog[0].id;

    await user.click(screen.getByRole("button", { name: `close ${id}` }));
    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem(JOURNAL_KEY) ?? "[]");
      expect(stored[0].status).toBe("closed");
      expect(stored[0].closePrice).toBe(3.5);
      expect(typeof stored[0].realizedPnl).toBe("number");
    });

    await user.click(screen.getByRole("button", { name: `delete ${id}` }));
    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem(JOURNAL_KEY) ?? "[]");
      expect(stored).toHaveLength(0);
    });
    expect(screen.getByTestId("journal-count")).toHaveTextContent("0");
  });

  it("pulls the server journal on a sync key and adopts it — even an empty array", async () => {
    fetchMock = mockFetch({
      "/api/journal": (url, init) => {
        if (!init || init.method === undefined) {
          // GET (pull)
          return jsonResponse(200, { available: true, entries: [] });
        }
        return jsonResponse(200, { available: true, ok: true });
      },
    });

    const user = userEvent.setup();
    render(<App />);
    // seed a local trade before syncing, so the pull's empty array has
    // something real to override — this is the exact regression this app
    // hit before: an empty server array being ignored in favor of stale
    // local data.
    await user.click(screen.getByRole("button", { name: "Calculator" }));
    await user.click(screen.getByRole("button", { name: "log trade" }));
    expect(screen.getByTestId("journal-count")).toHaveTextContent("1");

    await user.click(screen.getByRole("button", { name: "set sync key" }));

    await waitFor(() => expect(screen.getByTestId("sync-status")).toHaveTextContent("synced"));
    await waitFor(() => expect(screen.getByTestId("journal-count")).toHaveTextContent("0"));

    const getCalls = fetchMock.mock.calls.filter(([u]) => String(u).startsWith("/api/journal"));
    expect(getCalls.length).toBeGreaterThanOrEqual(1);
    const [, getInit] = getCalls[0];
    expect((getInit as RequestInit).headers).toMatchObject({ "x-journal-key": "team-secret" });
  });

  it("pushes journal changes after the pull resolves, without echoing the pull itself as a push", async () => {
    let postBodies: string[] = [];
    fetchMock = mockFetch({
      "/api/journal": (url, init) => {
        if (init?.method === "POST") {
          postBodies.push(String(init.body));
          return jsonResponse(200, { available: true, ok: true });
        }
        return jsonResponse(200, { available: true, entries: [] });
      },
    });

    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "set sync key" }));
    await waitFor(() => expect(screen.getByTestId("sync-status")).toHaveTextContent("synced"));

    // The pull just resolved with an empty array — it must NOT have
    // triggered a POST echoing that same empty state back.
    expect(postBodies).toHaveLength(0);

    await user.click(screen.getByRole("button", { name: "Calculator" }));
    await user.click(screen.getByRole("button", { name: "log trade" }));

    await waitFor(() => expect(postBodies.length).toBeGreaterThanOrEqual(1));
    const lastBody = JSON.parse(postBodies[postBodies.length - 1]);
    expect(lastBody.entries).toHaveLength(1);
  });

  it("syncs Tastytrade buying power into the capital field and persists the session", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "connect tasty" }));

    expect(screen.getByTestId("tasty-nickname")).toHaveTextContent("Main");
    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem("tasty_session") ?? "null");
      expect(stored?.nickname).toBe("Main");
    });

    await user.click(screen.getByRole("button", { name: "Calculator" }));
    await waitFor(() => {
      expect(screen.getByLabelText("Cash available")).toHaveValue("12345");
    });

    await user.click(screen.getByRole("button", { name: "disconnect tasty" }));
    await waitFor(() => {
      expect(localStorage.getItem("tasty_session")).toBeNull();
    });
  });

  it("shows the tour on first visit and dismissing it persists to localStorage", async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(screen.getByTestId("tour-mock")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "tour skip" }));
    expect(screen.queryByTestId("tour-mock")).not.toBeInTheDocument();
    expect(localStorage.getItem(TOUR_KEY)).toBe("1");
  });

  it("does not show the tour when it was already dismissed", () => {
    localStorage.setItem(TOUR_KEY, "1");
    render(<App />);
    expect(screen.queryByTestId("tour-mock")).not.toBeInTheDocument();
  });

  it("loading a Today's-picks trade switches to the Calculator tab and prefills the ticket", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "load MSFT pick" }));

    expect(screen.getByTestId("chart-mock")).toBeInTheDocument(); // now on the calculator tab
    expect(screen.getByLabelText("Short put (sell)")).toHaveValue("300"); // strike, mode switched to spread
    expect(screen.getByLabelText("Long put (buy)")).toHaveValue("280");
  });

  it("clears the sync key without leaving a stored value behind", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "set sync key" }));
    await waitFor(() => expect(localStorage.getItem(JOURNAL_SYNC_KEY_STORAGE)).toBe("team-secret"));

    await user.click(screen.getByRole("button", { name: "clear sync key" }));
    await waitFor(() => expect(localStorage.getItem(JOURNAL_SYNC_KEY_STORAGE)).toBeNull());
  });
});
