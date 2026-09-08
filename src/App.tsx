import { useMemo, useState, useEffect, useRef } from "react";
import { bsGreeks, realizedVol as calcRealizedVol } from "./lib/blackScholes";
import { popFromDelta, expectedMove, cushionSigma, popPlain, cushionPlain } from "./lib/probability";
import { richnessSignal } from "./lib/richness";
import { num, money } from "./lib/format";
import { today, defaultExpiration } from "./lib/dates";
import { roundStrike, round2, stratPnl, buildModel } from "./lib/pnl";
import {
  COMPANIES, STORAGE_KEY, JOURNAL_KEY, TOUR_KEY, JOURNAL_SYNC_KEY_STORAGE, AI_ACCESS_KEY_STORAGE,
  loadInputs, loadJournal,
} from "./appConstants";
import type { Defaults } from "./appConstants";
import { keyframes, styles } from "./styles";
import type { JournalEntry, Mode, PnlModel, StrategyParams, TastySession, TastyOrderRequest, MarketCondition } from "./types";

import { Chart } from "./components/Chart";
import { ModeToggle, Field, CompanyPicker, SizingHint } from "./components/CalculatorControls";
import { Ticket } from "./components/Ticket";
import { Journal } from "./components/Journal";
import { InsightCard, Scenarios } from "./components/ChartExtras";
import { Stat } from "./components/shared";
import { Tour, buildTourSteps } from "./components/Tour";
import { TastyConnect, TastyOrderConfirm } from "./components/Tastytrade";
import { JournalSync } from "./components/JournalSync";
import { AiKeySettings } from "./components/AiKeySettings";
import { AiAssistant } from "./components/AiAssistant";
import { TodayView } from "./components/TodayView";
import type { OpportunityPick } from "./components/TodayView";
import { Screener } from "./components/Screener";
import { AlexScan } from "./components/AlexScan";
import { PortfolioView } from "./components/PortfolioView";
import { WeeklyReport } from "./components/WeeklyReport";
import { DayReview } from "./components/DayReview";
import { LearnView } from "./components/LearnView";
import { Holdings } from "./components/Holdings";
import { AssignmentView } from "./components/AssignmentView";
import { PriceChart } from "./components/PriceChart";

// Local UI fetch-status shapes — not shared domain types, just what this
// component tracks about an in-flight/completed quote request.
interface QuoteState {
  status: "idle" | "loading" | "live" | "snapshot" | string;
  price?: number;
  date?: string;
  source?: string;
}

interface PremQuoteState {
  status: "idle" | "loading" | "live" | "nokey" | "error" | string;
  premium?: number;
  iv?: number | null;
  delta?: number | null;
  strike?: number;
  expiration?: string;
  requestedStrike?: number;
}

interface AiContextState {
  picks: unknown[];
  marketCondition: MarketCondition | null;
}

interface ScanStatsState {
  totalScanned: number;
  qualified: number;
  condition: MarketCondition | null;
}

type SyncStatus = "idle" | "checking" | "synced" | "offline" | "unauthorized" | "not_configured";

interface PopInfo {
  pop: number | null;
  popText: string | null;
  cushion: number;
  cushionText: string | null;
  expMove: number;
  deltaSource: "market" | "calculated" | null;
}

const TABS = [
  { key: "today", label: "Today's picks" },
  { key: "alex", label: "🔭 Alex's scan" },
  { key: "calculator", label: "Calculator" },
  { key: "compare", label: "Compare stocks" },
  { key: "portfolio", label: "📋 Sarah's book" },
  { key: "holdings", label: "💼 Holdings" },
  { key: "chart", label: "🕯️ Chart" },
  { key: "weekly", label: "📈 Elena's report" },
  { key: "review", label: "Review" },
  { key: "learn", label: "📚 Learn" },
];

export default function App() {
  const [inputs, setInputs] = useState<Defaults>(loadInputs);
  const [ticker, setTicker] = useState("");
  const [quote, setQuote] = useState<QuoteState>({ status: "idle" });
  const [expiration, setExpiration] = useState(defaultExpiration);
  const [premQuote, setPremQuote] = useState<PremQuoteState>({ status: "idle" });
  const [journal, setJournal] = useState<JournalEntry[]>(loadJournal);
  const [tourStep, setTourStep] = useState<number | null>(() => {
    try { return localStorage.getItem(TOUR_KEY) ? null : 0; } catch { return 0; }
  });
  const [rvol, setRvol] = useState<number | null>(null);      // realized vol from 30d price history
  const [delta, setDelta] = useState<number | null>(null);    // from Alpaca option snapshot
  const [tab, setTab] = useState("today");
  const [aiContext, setAiContext] = useState<AiContextState>({ picks: [], marketCondition: null });
  const [scanStats, setScanStats] = useState<ScanStatsState>({ totalScanned: 0, qualified: 0, condition: null });
  const [tasty, setTasty] = useState<TastySession | null>(() => {
    try { return JSON.parse(localStorage.getItem("tasty_session") ?? "null"); } catch { return null; }
  });
  const [tastyOrder, setTastyOrder] = useState<TastyOrderRequest | null>(null); // order pending confirmation
  const [syncKey, setSyncKey] = useState(() => {
    try { return localStorage.getItem(JOURNAL_SYNC_KEY_STORAGE) || ""; } catch { return ""; }
  });
  const [aiKey, setAiKey] = useState(() => {
    try { return localStorage.getItem(AI_ACCESS_KEY_STORAGE) || ""; } catch { return ""; }
  });
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
  const [pulled, setPulled] = useState(false); // has the initial pull for the current syncKey resolved?
  const appliedRef = useRef<number | null>(null);
  const syncedOnceRef = useRef(false);

  function dismissTour() {
    try { localStorage.setItem(TOUR_KEY, "1"); } catch { /* ignore */ }
    setTourStep(null);
  }

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(inputs));
    } catch {
      /* ignore quota / private-mode errors */
    }
  }, [inputs]);

  useEffect(() => {
    try {
      localStorage.setItem(JOURNAL_KEY, JSON.stringify(journal));
    } catch {
      /* ignore quota / private-mode errors */
    }
  }, [journal]);

  // Pull the server copy of the journal and adopt it as source of truth
  // (it's the durable copy — the local one is just this browser's cache).
  // Runs whenever the sync key changes — including the first time one is
  // entered, not just at mount — so the push effect below always has a
  // real pull to wait on before it's allowed to write anything back.
  //
  // Adopts the server's array even when it's empty: an empty result is
  // either "nothing has ever synced" or "the journal was deliberately
  // emptied from another device," and this endpoint's whole contract is
  // that the server is the source of truth — an empty array is still an
  // answer, not a "no answer yet" to fall back past. Treating only
  // non-empty arrays as authoritative was exactly backwards: it silently
  // ignored deletions made from other devices.
  useEffect(() => {
    if (!syncKey) return;
    setPulled(false);
    setSyncStatus("checking");
    fetch("/api/journal", { headers: { "x-journal-key": syncKey } })
      .then((r) => r.json().then((d) => ({ status: r.status, d })))
      .then(({ status, d }) => {
        if (status === 401) { setSyncStatus("unauthorized"); return; }
        if (!d.available) { setSyncStatus("not_configured"); return; }
        if (Array.isArray(d.entries)) {
          syncedOnceRef.current = true; // this fetch will drive a setJournal — don't echo it right back
          setJournal(d.entries);
        }
        setSyncStatus("synced");
      })
      .catch(() => setSyncStatus("offline"))
      .finally(() => setPulled(true));
  }, [syncKey]);

  // Push the full journal to the server whenever it changes, if a sync key
  // is configured — but only once the pull above has resolved for that key.
  // Without that gate, a second browser (or the same one, right after a key
  // is entered) fires this on mount with whatever was in localStorage
  // before the pull's response ever comes back, and a full-replace POST
  // can stomp the server's real journal with stale or empty local data.
  // Full-replace, not incremental — see api/journal.ts.
  useEffect(() => {
    if (!syncKey || !pulled) return;
    if (syncedOnceRef.current) { syncedOnceRef.current = false; return; } // skip the echo from the pull above
    setSyncStatus("checking");
    fetch("/api/journal", {
      method: "POST",
      headers: { "x-journal-key": syncKey, "content-type": "application/json" },
      body: JSON.stringify({ action: "sync", entries: journal }),
    })
      .then((r) => r.json().then((d) => ({ status: r.status, d })))
      .then(({ status, d }) => {
        if (status === 401) { setSyncStatus("unauthorized"); return; }
        if (!d.available) { setSyncStatus("not_configured"); return; }
        setSyncStatus(d.error ? "offline" : "synced");
      })
      .catch(() => setSyncStatus("offline"));
  }, [journal, syncKey, pulled]);

  // Sync Tastytrade live balance → capital field
  useEffect(() => {
    if (tasty?.buyingPower && tasty.buyingPower > 0) {
      setInputs(s => ({ ...s, capital: Math.floor(tasty.buyingPower as number) }));
    }
  }, [tasty?.buyingPower]);

  // Persist Tastytrade session (token only — never the password)
  useEffect(() => {
    try {
      if (tasty) localStorage.setItem("tasty_session", JSON.stringify(tasty));
      else localStorage.removeItem("tasty_session");
    } catch { /* ignore */ }
  }, [tasty]);

  function fetchPremium() {
    if (!ticker) return;
    setPremQuote({ status: "loading" });
    fetch(
      `/api/option?symbol=${encodeURIComponent(ticker)}` +
        `&expiration=${encodeURIComponent(expiration)}` +
        `&strike=${num(inputs.strike)}`
    )
      .then((r) => r.json())
      .then((d) => {
        if (d && d.available === false) return setPremQuote({ status: "nokey" });
        if (!d || !Number.isFinite(d.premium)) return Promise.reject();
        setInputs((s) => ({ ...s, premium: round2(d.premium), iv: d.iv ?? null }));
        setDelta(Number.isFinite(d.delta) ? d.delta : null);
        setPremQuote({ status: "live", ...d });
      })
      .catch(() => setPremQuote({ status: "error" }));
  }

  // `keepStrike`: skip resetting strike/spot to the company's generic
  // snapshot price. Set this when the caller already computed a specific
  // strike of its own (a "Today's picks" or "Compare stocks" pick carries
  // the exact strike its scan validated has a real premium) — without it,
  // this function's own snapshot-rounded strike would silently overwrite
  // that pick's strike right after the caller set it, both on the initial
  // snapshot and again once the live quote resolves.
  function selectCompany(sym: string, opts?: { keepStrike?: boolean }) {
    setTicker(sym);
    setRvol(null);
    setDelta(null);
    if (!sym) return setQuote({ status: "idle" });
    const c = COMPANIES.find((x) => x.ticker === sym);
    if (!c) return;

    if (!opts?.keepStrike) {
      const snapStrike = roundStrike(c.price);
      setInputs((s) => ({ ...s, strike: snapStrike, spot: snapStrike }));
      appliedRef.current = snapStrike;
    }
    setQuote({ status: "loading", price: c.price, source: "snapshot" });

    fetch(`/api/quote?symbol=${encodeURIComponent(sym)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        if (!d || !Number.isFinite(d.price)) return Promise.reject();
        if (!opts?.keepStrike) {
          const liveStrike = roundStrike(d.price);
          setInputs((s) =>
            num(s.strike) === appliedRef.current ? { ...s, strike: liveStrike, spot: liveStrike } : s
          );
          appliedRef.current = liveStrike;
        }
        setQuote({ status: "live", price: d.price, date: d.date, source: "live" });
      })
      .catch(() => setQuote({ status: "snapshot", price: c.price, source: "snapshot" }));

    // Fetch 30-day price history for realized vol (cached 1 hour)
    fetch(`/api/history?symbol=${encodeURIComponent(sym)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.available && d.closes?.length >= 3) {
          setRvol(calcRealizedVol(d.closes, 30));
        }
      })
      .catch(() => { /* ignore */ });
  }

  const mode: Mode = inputs.mode;
  const twoSided = mode === "strangle" || mode === "covered";
  const putStrike = num(inputs.strike);
  const putPrem = num(inputs.premium);
  const longStrike = num(inputs.longStrike);
  const longPrem = num(inputs.longPremium);
  const callStrike = num(inputs.callStrike);
  const callPrem = num(inputs.callPremium);
  const spot = num(inputs.spot);
  const contracts = Math.max(0, Math.round(num(inputs.contracts)));
  const dropPct = num(inputs.dropPct);
  const capital = num(inputs.capital);
  const iv = inputs.iv != null ? Number(inputs.iv) : null;
  const shares = contracts * 100;

  // Volatility-based presets for the bad-week drop input — market IV preferred
  // (it's forward-looking), realized vol as a fallback, so the drop % isn't
  // just a guess when either is available.
  const volForPresets = iv != null && iv > 0 ? iv : rvol != null && rvol > 0 ? rvol : null;

  const dte = useMemo(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(expiration)) return 30;
    const d = new Date(expiration + "T12:00:00Z");
    return Math.max(1, Math.round((d.getTime() - Date.now()) / 86400000));
  }, [expiration]);

  const spreadWidth = Math.max(0, putStrike - longStrike);
  const perContractCash =
    mode === "spread"
      ? spreadWidth * 100
      : putStrike * 100 + (mode === "covered" ? spot * 100 : 0);
  const maxContracts = perContractCash > 0 ? Math.floor(capital / perContractCash) : 0;

  // Richness: market IV vs realized vol
  const richness = useMemo(() => {
    if (!(iv != null && iv > 0) || !(rvol != null && rvol > 0)) return null;
    return richnessSignal(iv, rvol);
  }, [iv, rvol]);

  // Probability of profit + cushion (market-implied, via delta or BS fallback)
  const popInfo = useMemo((): PopInfo | null => {
    if (!(putStrike > 0) || !(putPrem > 0)) return null;
    let shortPutDelta = delta; // from Alpaca snapshot
    // BS fallback if Alpaca didn't return delta but we have IV
    if (shortPutDelta == null && iv != null && iv > 0 && dte > 0 && spot > 0) {
      shortPutDelta = bsGreeks(spot, putStrike, dte, 0.05, iv, "put").delta;
    }
    const legs = {
      shortPutDelta: shortPutDelta ?? undefined,
      putDelta: shortPutDelta ?? undefined,
      callDelta: delta != null ? Math.abs(delta) : 0,
    };
    const pop = popFromDelta(mode === "covered" ? "covered" : mode === "strangle" ? "strangle" : "put", legs);
    const popNum = typeof pop === "object" ? (pop as { keepPremium: number } | null)?.keepPremium ?? null : pop;
    const expMove = expectedMove(spot, iv || 0, dte);
    const cSigma = cushionSigma(spot, putStrike, expMove);
    return {
      pop: popNum,
      popText: popPlain(popNum),
      cushion: cSigma,
      cushionText: cushionPlain(cSigma),
      expMove,
      deltaSource: delta != null ? "market" : iv != null && iv > 0 ? "calculated" : null,
    };
  }, [mode, putStrike, putPrem, delta, iv, dte, spot]);

  const p: StrategyParams = { mode, putStrike, putPrem, longStrike, longPrem, callStrike, callPrem, spot, shares, iv, dte, ticker };

  const model: PnlModel = useMemo(() => buildModel(p, dropPct), [
    mode,
    putStrike,
    putPrem,
    longStrike,
    longPrem,
    callStrike,
    callPrem,
    spot,
    shares,
    dropPct,
    iv,
    dte,
  ]);

  function logTrade() {
    if (shares <= 0) return;
    const entry: JournalEntry = {
      id: `${Date.now()}-${Math.round(Math.random() * 1e6)}`,
      openedAt: today(),
      mode,
      ticker: ticker || "—",
      expiration,
      putStrike,
      putPrem,
      longStrike,
      longPrem,
      callStrike,
      callPrem,
      spot,
      contracts,
      credit: model.credit,
      collateral: model.collateral,
      status: "open",
      stopLossMultiplier: inputs.stopLossMultiplier,
    };
    setJournal((j) => [entry, ...j]);
  }

  function closeTrade(id: string, closePrice: string) {
    const px = num(closePrice);
    setJournal((j) =>
      j.map((e): JournalEntry => {
        if (e.id !== id) return e;
        const realizedPnl = stratPnl(px, {
          mode: e.mode,
          putStrike: e.putStrike,
          putPrem: e.putPrem,
          longStrike: e.longStrike,
          longPrem: e.longPrem,
          callStrike: e.callStrike,
          callPrem: e.callPrem,
          spot: e.spot,
          shares: e.contracts * 100,
        });
        return { ...e, status: "closed", closePrice: px, closedAt: today(), realizedPnl };
      })
    );
  }

  function deleteTrade(id: string) {
    setJournal((j) => j.filter((e) => e.id !== id));
  }

  return (
    <div style={styles.page}>
      <style>{keyframes}</style>
      {tourStep !== null && (
        <Tour
          step={tourStep}
          steps={buildTourSteps(ticker, inputs, model)}
          onNext={() => setTourStep((s) => (s as number) + 1)}
          onDone={dismissTour}
          onSkip={dismissTour}
        />
      )}
      <div style={styles.shell}>
        <header style={styles.header}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
            <h1 style={{ ...styles.h1, margin: 0 }}>Options Income</h1>
            <button type="button" onClick={() => setTourStep(0)} style={styles.howBtn} title="How does this work?">
              How does this work?
            </button>
          </div>
          {/* Eight tabs don't fit one row on a phone screen without either
              clipping or wrapping mid-label. Scrolling horizontally (same
              pattern as the data tables and the mode toggle) keeps every
              tab reachable and every label intact instead. */}
          <div style={{ display: "flex", gap: 4, borderBottom: "2px solid #e2e8f0", marginBottom: 0, overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
            {TABS.map(t => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                style={{
                  background: "none", border: "none", cursor: "pointer",
                  padding: "8px 16px", fontSize: 13, fontWeight: tab === t.key ? 700 : 500,
                  color: tab === t.key ? "#0f172a" : "#64748b",
                  borderBottom: tab === t.key ? "2px solid #0f172a" : "2px solid transparent",
                  marginBottom: -2, whiteSpace: "nowrap", flexShrink: 0,
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
        </header>

        {tab === "today" && (
          <TodayView
            capital={capital}
            onPicksReady={(ctx) => {
              setAiContext({ picks: ctx.picks, marketCondition: ctx.condition });
              setScanStats({ totalScanned: ctx.totalScanned, qualified: ctx.qualified, condition: ctx.condition });
            }}
            onLoadTrade={(pick: OpportunityPick) => {
              setTab("calculator");
              setInputs(s => ({
                ...s,
                mode: "spread",
                strike: pick.strike,
                premium: round2(pick.premium),
                longStrike: pick.longStrikeVal,
                longPremium: round2(pick.netCredit < pick.premium ? pick.premium - pick.netCredit : pick.premium * 0.4),
                iv: pick.iv ?? null,
              }));
              selectCompany(pick.sym, { keepStrike: true });
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
          />
        )}

        {tab === "compare" && (
          <Screener
            expiration={expiration}
            dropPct={dropPct}
            capital={capital}
            mode={mode}
            aiKey={aiKey}
            onLoad={(sym, strike, prem) => {
              setTicker(sym);
              setInputs((s) => ({ ...s, strike, premium: prem, spot: strike }));
              selectCompany(sym, { keepStrike: true });
              setTab("calculator");
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
          />
        )}

        {tab === "alex" && (
          <AlexScan
            capital={capital}
            onLoad={(sym) => {
              selectCompany(sym);
              setTab("calculator");
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
          />
        )}

        {tab === "portfolio" && (
          <PortfolioView
            journal={journal}
            dropPct={dropPct}
            onOpenJournal={() => {
              setTab("calculator");
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
          />
        )}

        {tab === "holdings" && <Holdings />}

        {tab === "chart" && <PriceChart initialTicker={ticker} />}

        {tab === "weekly" && <WeeklyReport journal={journal} />}

        {tab === "review" && (
          <DayReview journal={journal} scanStats={scanStats} capital={capital} />
        )}

        {tab === "learn" && <LearnView capital={capital} aiKey={aiKey} />}

        {tab === "calculator" && (<>
        <p style={styles.sub}>
            {mode === "put" &&
              "The flat green ceiling is everything you can win. The red underneath is what a bad week costs. That gap is the whole story."}
            {mode === "spread" &&
              "Sell a put, buy a cheaper put below it. Your loss is capped at the spread width — so $500 can trade any stock. You collect less premium, but you know exactly the worst case before you enter."}
            {mode === "strangle" &&
              "Sell a put and a call, collect both premiums — a flat top between the strikes, with losses on both wings. The upside wing never stops."}
            {mode === "covered" &&
              "Own the shares, sell a call and a put against them. The upside is capped; the downside is doubled — you lose on the stock AND get assigned."}
          </p>

        <CompanyPicker
          ticker={ticker}
          quote={quote}
          onSelect={selectCompany}
          expiration={expiration}
          onExpirationChange={setExpiration}
          onFetchPremium={fetchPremium}
          premQuote={premQuote}
        />

        <ModeToggle mode={mode} onChange={(m) => setInputs((s) => ({ ...s, mode: m }))} />

        <section style={styles.controls}>
          <Field
            label={mode === "spread" ? "Short put (sell)" : twoSided ? "Put strike" : "Strike price"}
            prefix="$"
            value={inputs.strike}
            onChange={(v) => setInputs((s) => ({ ...s, strike: num(v) }))}
          />
          <Field
            label={mode === "spread" ? "Short premium (collect)" : "Put premium"}
            prefix="$"
            value={inputs.premium}
            onChange={(v) => setInputs((s) => ({ ...s, premium: num(v) }))}
          />
          {mode === "spread" && (
            <>
              <Field
                label="Long put (buy)"
                prefix="$"
                value={inputs.longStrike}
                onChange={(v) => setInputs((s) => ({ ...s, longStrike: num(v) }))}
              />
              <Field
                label="Long premium (pay)"
                prefix="$"
                value={inputs.longPremium}
                onChange={(v) => setInputs((s) => ({ ...s, longPremium: num(v) }))}
              />
            </>
          )}
          {twoSided && (
            <>
              <Field
                label="Call strike"
                prefix="$"
                value={inputs.callStrike}
                onChange={(v) => setInputs((s) => ({ ...s, callStrike: num(v) }))}
              />
              <Field
                label="Call premium"
                prefix="$"
                value={inputs.callPremium}
                onChange={(v) => setInputs((s) => ({ ...s, callPremium: num(v) }))}
              />
            </>
          )}
          {mode === "covered" && (
            <Field
              label="Your share cost"
              prefix="$"
              value={inputs.spot}
              onChange={(v) => setInputs((s) => ({ ...s, spot: num(v) }))}
            />
          )}
          <Field
            label="Contracts"
            value={inputs.contracts}
            onChange={(v) => setInputs((s) => ({ ...s, contracts: num(v) }))}
          />
          <Field
            label={twoSided ? "Move size" : "Bad-week drop"}
            suffix="%"
            value={inputs.dropPct}
            onChange={(v) => setInputs((s) => ({ ...s, dropPct: num(v) }))}
          />
          <Field
            label="Cash available"
            prefix="$"
            value={inputs.capital}
            onChange={(v) => setInputs((s) => ({ ...s, capital: num(v) }))}
          />
          <Field
            label="Stop-loss (× credit)"
            suffix="×"
            value={inputs.stopLossMultiplier}
            onChange={(v) => setInputs((s) => ({ ...s, stopLossMultiplier: num(v) }))}
          />
        </section>

        {volForPresets != null && volForPresets > 0 && dte > 0 ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: -10, marginBottom: 18, fontSize: 12 }}>
            <span style={{ color: "#94a3b8" }}>
              {twoSided ? "Move size" : "Bad-week drop"} presets ({iv != null && iv > 0 ? "market IV" : "realized vol"}):
            </span>
            {[1, 2].map((n) => {
              const pct = Math.round(volForPresets * Math.sqrt(dte / 365) * n * 100 * 10) / 10;
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => setInputs((s) => ({ ...s, dropPct: pct }))}
                  style={{
                    border: "1px solid #e2e8f0", borderRadius: 20, background: dropPct === pct ? "#1f2937" : "#f8fafc",
                    color: dropPct === pct ? "#fff" : "#475569", fontSize: 12, fontWeight: 700,
                    padding: "4px 12px", cursor: "pointer",
                  }}
                >
                  {n}σ ({pct}%)
                </button>
              );
            })}
          </div>
        ) : (
          <div style={{ fontSize: 11.5, color: "#94a3b8", marginTop: -10, marginBottom: 18 }}>
            Pick a company or pull a live premium to enable volatility-based {twoSided ? "move size" : "drop"} presets — until then this is a manual guess.
          </div>
        )}

        <SizingHint
          mode={mode}
          capital={capital}
          perContractCash={perContractCash}
          maxContracts={maxContracts}
          contracts={contracts}
          dropPct={dropPct}
          model={model}
          p={p}
          onApply={(n) => setInputs((s) => ({ ...s, contracts: n }))}
        />

        <Chart model={model} />

        {mode === "strangle" && (
          <div style={styles.warnBar}>
            ⚠ The call side is <b>naked</b> — if the stock keeps rising, the loss has no ceiling.
            That right wing falls forever.
          </div>
        )}

        <Scenarios cards={model.scenarios} />

        {model.loseCondition && (
          <div style={{ fontSize: 13, color: "#475569", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "10px 14px", margin: "0 0 4px", lineHeight: 1.55 }}>
            {model.loseCondition}
          </div>
        )}

        {(popInfo || richness) && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, margin: "12px 0 4px" }}>
            {popInfo?.popText && (
              <InsightCard icon="🎯" label="Your odds" text={popInfo.popText} note={popInfo.deltaSource === "calculated" ? "Calculated from current IV — pull a live premium for the market's own figure." : undefined} />
            )}
            {popInfo?.cushionText && (
              <InsightCard icon="🛡️" label="Your buffer" text={popInfo.cushionText} />
            )}
            {richness && (
              <InsightCard icon={richness.emoji} label="Good time to sell?" text={richness.headline} detail={richness.detail} tag={richness.tag} />
            )}
          </div>
        )}

        <Ticket
          mode={mode}
          ticker={ticker}
          expiration={expiration}
          putStrike={putStrike}
          putPrem={putPrem}
          longStrike={longStrike}
          longPrem={longPrem}
          callStrike={callStrike}
          callPrem={callPrem}
          contracts={contracts}
          collateral={model.collateral}
          tastyConnected={!!tasty}
          onPlaceOrder={() => setTastyOrder({ mode, ticker, expiration, putStrike, putPrem, longStrike, longPrem, callStrike, callPrem, contracts, credit: model.credit })}
        />

        <section style={styles.stats}>
          <Stat label={model.worstLabel} value={model.worstValue} tone="bad" big />
          <Stat label="Premium collected" value={money(model.credit)} tone="good" />
          <Stat label={model.breakevens.length > 1 ? "Breakevens" : "Breakeven"} value={model.breakevenLabel} tone="neutral" />
          <Stat label={mode === "covered" ? "Capital tied up" : "Collateral"} value={money(model.collateral)} tone="neutral" />
          {model.probProfit != null && (
            <Stat label="Prob. of profit (IV-implied)" value={`${model.probProfit}%`} tone="neutral" />
          )}
        </section>

        <AssignmentView
          mode={mode}
          ticker={ticker}
          putStrike={putStrike}
          putPrem={putPrem}
          longStrike={longStrike}
          spot={spot}
          contracts={contracts}
        />

        <Journal journal={journal} onLog={logTrade} onClose={closeTrade} onDelete={deleteTrade} />
        </>)}

        <footer style={styles.footer}>
          Prices ~15-min delayed · for learning only, not live order entry · not financial advice · the red number is the part that matters
        </footer>
      </div>
      <AiAssistant context={{ ...aiContext, capital }} aiKey={aiKey} />
      <AiKeySettings
        aiKey={aiKey}
        onSetKey={(k) => {
          setAiKey(k);
          try {
            if (k) localStorage.setItem(AI_ACCESS_KEY_STORAGE, k);
            else localStorage.removeItem(AI_ACCESS_KEY_STORAGE);
          } catch { /* ignore */ }
        }}
      />
      <JournalSync
        syncKey={syncKey}
        status={syncStatus}
        onSetKey={(k) => {
          setSyncKey(k);
          try {
            if (k) localStorage.setItem(JOURNAL_SYNC_KEY_STORAGE, k);
            else localStorage.removeItem(JOURNAL_SYNC_KEY_STORAGE);
          } catch { /* ignore */ }
        }}
      />
      <TastyConnect tasty={tasty} onConnect={setTasty} onDisconnect={() => setTasty(null)} />
      {tastyOrder && tasty && (
        <TastyOrderConfirm
          order={tastyOrder}
          tasty={tasty}
          onClose={() => setTastyOrder(null)}
          onRefreshSession={(updated) => setTasty(t => (t ? { ...t, ...updated } : t))}
        />
      )}
    </div>
  );
}
