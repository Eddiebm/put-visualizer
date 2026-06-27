import React, { useMemo, useState, useEffect, useRef } from "react";

const STORAGE_KEY = "csp_visualizer_inputs_v1";
const JOURNAL_KEY = "csp_journal_v1";
const TOUR_KEY = "csp_tour_done_v1";

function buildTourSteps(ticker, inputs, model) {
  const company = COMPANIES.find((c) => c.ticker === ticker);
  const sym = ticker || "the stock";
  const name = company ? company.name : sym;
  const mode = inputs.mode;
  const putStrike = num(inputs.strike);
  const putPrem = num(inputs.premium);
  const callStrike = num(inputs.callStrike);
  const callPrem = num(inputs.callPremium);
  const spot = num(inputs.spot);
  const contracts = Math.max(1, Math.round(num(inputs.contracts)));
  const shares = contracts * 100;
  const dropPct = num(inputs.dropPct);
  const moveLbl = trimNum(dropPct);

  const p = { mode, putStrike, putPrem, callStrike, callPrem: callPrem, spot, shares };
  const credit = model ? model.credit : putPrem * shares;
  const collateral = model ? model.collateral : putStrike * shares;

  const downPrice = putStrike * (1 - dropPct / 100);
  const upAnchor = mode === "put" ? putStrike : callStrike;
  const upPrice = upAnchor * (1 + dropPct / 100);
  const flatPrice = mode === "covered" ? spot : mode === "strangle" ? (putStrike + callStrike) / 2 : putStrike;

  const downPnl = stratPnl(downPrice, p);
  const flatPnl = stratPnl(flatPrice, p);
  const upPnl = stratPnl(upPrice, p);

  const fmt = (n) => (n >= 0 ? "+" : "−") + "$" + Math.abs(Math.round(n)).toLocaleString();

  if (mode === "put") {
    return [
      {
        tag: "The trade",
        title: `You sell ${contracts > 1 ? contracts + " puts" : "a put"} on ${name}`,
        setup: `${contracts} contract${contracts !== 1 ? "s" : ""} · ${money2(putStrike)} strike · ${money2(putPrem)} premium`,
        outcome: fmt(credit),
        good: true,
        body: `You collect ${money(credit)} upfront and set aside ${money(collateral)} in cash. If ${sym} falls below ${money2(putStrike)} by expiration, you're obligated to buy ${shares} shares at that price.`,
      },
      {
        tag: `Scenario 1 — ${sym} drops`,
        title: `${name} falls to ${money2(downPrice)}`,
        setup: `−${moveLbl}% · below your ${money2(putStrike)} strike`,
        outcome: fmt(downPnl),
        good: downPnl >= 0,
        body: `You're assigned — forced to buy ${shares} shares of ${sym} at ${money2(putStrike)} when they're worth ${money2(downPrice)}. That's a ${money(Math.abs(downPnl - credit))} stock loss, minus the ${money(credit)} you collected. Net: ${fmt(downPnl)}. This is the side the ads skip.`,
      },
      {
        tag: `Scenario 2 — ${sym} flat`,
        title: `${name} stays near ${money2(putStrike)}`,
        setup: "At or above your strike",
        outcome: fmt(flatPnl),
        good: true,
        body: `The put expires worthless. Nobody will make you buy ${sym} at ${money2(putStrike)} when it's trading at that price or higher — the option has no value. You keep ${money(credit)} and your ${money(collateral)} is released.`,
      },
      {
        tag: `Scenario 3 — ${sym} rises`,
        title: `${name} climbs to ${money2(upPrice)}`,
        setup: `+${moveLbl}% · above your strike`,
        outcome: fmt(upPnl),
        good: true,
        body: `Put expires worthless. You keep ${money(credit)}. But ${sym} gained ${money((upPrice - putStrike) * shares)} — and you didn't own it, so that upside wasn't yours. Your gain is always capped at the premium, no matter how high ${sym} climbs.`,
      },
      {
        tag: "The asymmetry",
        title: "The gap is the whole point",
        setup: `Max gain: ${money(credit)} · Bad-week loss: ${money(Math.abs(downPnl))}`,
        outcome: null,
        good: null,
        body: `Scenarios 2 and 3 both pay ${money(credit)}. Scenario 1 loses ${money(Math.abs(downPnl))} — and gets worse the further ${sym} falls. The chart below draws this: flat green ceiling on top, red drop below. That gap is the trade you're making.`,
      },
      {
        tag: "Now try it",
        title: "Adjust the numbers above",
        setup: "Change strike, premium, or contracts",
        outcome: null,
        good: null,
        body: `Pick any stock or ETF to auto-fill the price. Change the strike or premium and every number — the chart, scenarios, and order ticket — updates live. Hit "How does this work?" any time to rerun this walkthrough with your current inputs.`,
      },
    ];
  }

  if (mode === "strangle") {
    return [
      {
        tag: "The trade",
        title: `You sell a strangle on ${name}`,
        setup: `${contracts} contract${contracts !== 1 ? "s" : ""} · ${money2(putStrike)}P / ${money2(callStrike)}C`,
        outcome: fmt(credit),
        good: true,
        body: `You collect ${money(credit)} upfront — both a put and a call premium. You profit as long as ${sym} stays between ${money2(putStrike)} and ${money2(callStrike)} by expiration. Outside that range, you start losing.`,
      },
      {
        tag: `Scenario 1 — ${sym} drops`,
        title: `${name} falls to ${money2(downPrice)}`,
        setup: `−${moveLbl}% · below your ${money2(putStrike)} put strike`,
        outcome: fmt(downPnl),
        good: downPnl >= 0,
        body: `The put is in the money. You're assigned on ${shares} shares at ${money2(putStrike)} when they're worth ${money2(downPrice)}. The call expires worthless. Net: ${fmt(downPnl)}.`,
      },
      {
        tag: `Scenario 2 — ${sym} flat`,
        title: `${name} stays between strikes`,
        setup: `Between ${money2(putStrike)} and ${money2(callStrike)}`,
        outcome: fmt(flatPnl),
        good: true,
        body: `Both options expire worthless. You keep the full ${money(credit)} — this is the sweet spot. The trade pays best when the stock goes nowhere.`,
      },
      {
        tag: `Scenario 3 — ${sym} rises`,
        title: `${name} climbs to ${money2(upPrice)}`,
        setup: `+${moveLbl}% · above your ${money2(callStrike)} call strike`,
        outcome: fmt(upPnl),
        good: upPnl >= 0,
        body: `The call is in the money — you're short a naked call with no shares to cover it. The loss is ${fmt(upPnl)} here, but it keeps growing with no ceiling as long as ${sym} keeps rising. This is the unlimited-risk side.`,
      },
      {
        tag: "The asymmetry",
        title: "The gap is the whole point",
        setup: `Max gain: ${money(credit)} · Upside: no ceiling`,
        outcome: null,
        good: null,
        body: `The sweet spot is ${money(credit)} and it's a narrow band. Either wing — down past the put or up past the call — starts costing you, and the call side never stops.`,
      },
      {
        tag: "Now try it",
        title: "Adjust the numbers above",
        setup: "Change strikes, premiums, or contracts",
        outcome: null,
        good: null,
        body: `Widen the strikes to make the tent bigger but cheaper. Narrow them for more premium but less room. Hit "How does this work?" any time to rerun this with your current inputs.`,
      },
    ];
  }

  // covered strangle
  return [
    {
      tag: "The trade",
      title: `You run a covered strangle on ${name}`,
      setup: `Own ${shares} shares · sell ${money2(putStrike)}P + ${money2(callStrike)}C`,
      outcome: fmt(credit),
      good: true,
      body: `You own ${shares} shares of ${sym} at ${money2(spot)} and sell both a put and a call. You collect ${money(credit)} in premium. Your upside is capped at the call strike; your downside is doubled — you lose on the shares AND get assigned on the put.`,
    },
    {
      tag: `Scenario 1 — ${sym} drops`,
      title: `${name} falls to ${money2(downPrice)}`,
      setup: `−${moveLbl}% · below your ${money2(putStrike)} put strike`,
      outcome: fmt(downPnl),
      good: downPnl >= 0,
      body: `Your shares lose value AND you're assigned on the put — buying another ${shares} shares at ${money2(putStrike)} when they're worth ${money2(downPrice)}. Double the downside. Net: ${fmt(downPnl)}.`,
    },
    {
      tag: `Scenario 2 — ${sym} flat`,
      title: `${name} stays near ${money2(spot)}`,
      setup: "Between your put and call strikes",
      outcome: fmt(flatPnl),
      good: flatPnl >= 0,
      body: `Both options expire worthless. You keep ${money(credit)} in premium, your shares are unchanged, and you still own them. Best outcome.`,
    },
    {
      tag: `Scenario 3 — ${sym} rises`,
      title: `${name} climbs to ${money2(upPrice)}`,
      setup: `+${moveLbl}% · above your ${money2(callStrike)} call strike`,
      outcome: fmt(upPnl),
      good: upPnl >= 0,
      body: `Your shares get called away at ${money2(callStrike)}. You don't lose money, but you miss the gain above that price. Your profit is capped at ${money2(callStrike)} per share plus the premium collected.`,
    },
    {
      tag: "The asymmetry",
      title: "Capped upside, doubled downside",
      setup: `Max gain: ${money(upPnl)} · Bad-week loss: ${money(Math.abs(downPnl))}`,
      outcome: null,
      good: null,
      body: `The covered strangle sells off your upside for premium income but doesn't reduce the downside — it adds to it. Make sure you're comfortable holding ${sym} at lower prices before running this.`,
    },
    {
      tag: "Now try it",
      title: "Adjust the numbers above",
      setup: "Change strikes, premiums, or share cost",
      outcome: null,
      good: null,
      body: `Hit "How does this work?" any time to rerun this walkthrough with your current ${sym} inputs.`,
    },
  ];
}

// Bundled snapshot prices — used instantly on selection and as the offline
// fallback when the live /api/quote endpoint is unreachable. Editable; the UI
// labels these clearly as approximate so they're never mistaken for live data.
const SNAPSHOT_DATE = "Jun 27, 2026";
const COMPANIES = [
  { ticker: "AAPL", name: "Apple", price: 284 },
  { ticker: "MSFT", name: "Microsoft", price: 373 },
  { ticker: "NVDA", name: "NVIDIA", price: 193 },
  { ticker: "AMZN", name: "Amazon", price: 233 },
  { ticker: "GOOGL", name: "Alphabet", price: 337 },
  { ticker: "META", name: "Meta", price: 550 },
  { ticker: "TSLA", name: "Tesla", price: 380 },
  { ticker: "AMD", name: "AMD", price: 522 },
  { ticker: "INTC", name: "Intel", price: 128 },
  { ticker: "JPM", name: "JPMorgan", price: 329 },
  { ticker: "BAC", name: "Bank of America", price: 58 },
  { ticker: "DIS", name: "Disney", price: 99 },
  { ticker: "KO", name: "Coca-Cola", price: 83 },
  { ticker: "PFE", name: "Pfizer", price: 24 },
  { ticker: "F", name: "Ford", price: 14 },
  { ticker: "PLTR", name: "Palantir", price: 113 },
  { ticker: "SOFI", name: "SoFi", price: 18 },
  { ticker: "T", name: "AT&T", price: 23 },
];

const MODES = [
  { key: "put", label: "Cash-secured put" },
  { key: "spread", label: "Put credit spread" },
  { key: "strangle", label: "Short strangle" },
  { key: "covered", label: "Covered strangle" },
];

function roundStrike(p) {
  if (p >= 200) return Math.round(p / 5) * 5;
  if (p >= 25) return Math.round(p);
  return Math.round(p * 2) / 2;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

// Nearest Friday at least 7 days out — a sensible default option expiration.
function defaultExpiration() {
  const d = new Date();
  const add = ((5 - d.getDay() + 7) % 7) || 7;
  d.setDate(d.getDate() + Math.max(add, 7));
  return d.toISOString().slice(0, 10);
}

const DEFAULTS = {
  mode: "put",
  strike: 50,
  premium: 1.5,
  longStrike: 45,
  longPremium: 0.5,
  callStrike: 60,
  callPremium: 1.2,
  spot: 55,
  contracts: 2,
  dropPct: 20,
  capital: 500,
  iv: null,
};

function loadInputs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw);
    return { ...DEFAULTS, ...parsed };
  } catch {
    return DEFAULTS;
  }
}

function loadJournal() {
  try {
    const raw = localStorage.getItem(JOURNAL_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

const money = (n) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

const money2 = (n) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

const moneySigned = (n) => (n > 0 ? "+" : n < 0 ? "−" : "") + money(Math.abs(n));

function formatExp(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso || "[expiration]";
  const [y, m, d] = iso.split("-").map(Number);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[m - 1]} ${d}, ${y}`;
}

// --- core strategy P&L at expiration, per share, × shares ---
function stratPnl(S, p) {
  const putLeg = p.putPrem - Math.max(0, p.putStrike - S);
  if (p.mode === "put") return putLeg * p.shares;
  if (p.mode === "spread") {
    // sell short put, buy long put below it — loss is capped at spread width
    const longLeg = -p.longPrem + Math.max(0, p.longStrike - S);
    return (putLeg + longLeg) * p.shares;
  }
  const callLeg = p.callPrem - Math.max(0, S - p.callStrike);
  if (p.mode === "strangle") return (putLeg + callLeg) * p.shares;
  return (S - p.spot + putLeg + callLeg) * p.shares; // covered
}

export default function App() {
  const [inputs, setInputs] = useState(loadInputs);
  const [ticker, setTicker] = useState("");
  const [quote, setQuote] = useState({ status: "idle" });
  const [expiration, setExpiration] = useState(defaultExpiration);
  const [premQuote, setPremQuote] = useState({ status: "idle" });
  const [journal, setJournal] = useState(loadJournal);
  const [tourStep, setTourStep] = useState(() => {
    try { return localStorage.getItem(TOUR_KEY) ? null : 0; } catch { return 0; }
  });
  const appliedRef = useRef(null);

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
        setPremQuote({ status: "live", ...d });
      })
      .catch(() => setPremQuote({ status: "error" }));
  }

  function selectCompany(sym) {
    setTicker(sym);
    if (!sym) return setQuote({ status: "idle" });
    const c = COMPANIES.find((x) => x.ticker === sym);
    if (!c) return;

    const snapStrike = roundStrike(c.price);
    setInputs((s) => ({ ...s, strike: snapStrike, spot: snapStrike }));
    appliedRef.current = snapStrike;
    setQuote({ status: "loading", price: c.price, source: "snapshot" });

    fetch(`/api/quote?symbol=${encodeURIComponent(sym)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        if (!d || !Number.isFinite(d.price)) return Promise.reject();
        const liveStrike = roundStrike(d.price);
        setInputs((s) =>
          num(s.strike) === appliedRef.current ? { ...s, strike: liveStrike, spot: liveStrike } : s
        );
        appliedRef.current = liveStrike;
        setQuote({ status: "live", price: d.price, date: d.date, source: "live" });
      })
      .catch(() => setQuote({ status: "snapshot", price: c.price, source: "snapshot" }));
  }

  const mode = inputs.mode;
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

  const dte = useMemo(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(expiration)) return 30;
    const d = new Date(expiration + "T12:00:00Z");
    return Math.max(1, Math.round((d - Date.now()) / 86400000));
  }, [expiration]);

  const spreadWidth = Math.max(0, putStrike - longStrike);
  const perContractCash =
    mode === "spread"
      ? spreadWidth * 100
      : putStrike * 100 + (mode === "covered" ? spot * 100 : 0);
  const maxContracts = perContractCash > 0 ? Math.floor(capital / perContractCash) : 0;

  const p = { mode, putStrike, putPrem, longStrike, longPrem, callStrike, callPrem, spot, shares, iv, dte, ticker };

  const model = useMemo(() => buildModel(p, dropPct), [
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
    const entry = {
      id: `${Date.now()}-${Math.round(Math.random() * 1e6)}`,
      openedAt: today(),
      mode,
      ticker: ticker || "—",
      expiration,
      putStrike,
      putPrem,
      callStrike,
      callPrem,
      spot,
      contracts,
      credit: model.credit,
      status: "open",
    };
    setJournal((j) => [entry, ...j]);
  }

  function closeTrade(id, closePrice) {
    const px = num(closePrice);
    setJournal((j) =>
      j.map((e) => {
        if (e.id !== id) return e;
        const realizedPnl = stratPnl(px, {
          mode: e.mode,
          putStrike: e.putStrike,
          putPrem: e.putPrem,
          callStrike: e.callStrike,
          callPrem: e.callPrem,
          spot: e.spot,
          shares: e.contracts * 100,
        });
        return { ...e, status: "closed", closePrice: px, closedAt: today(), realizedPnl };
      })
    );
  }

  function deleteTrade(id) {
    setJournal((j) => j.filter((e) => e.id !== id));
  }

  return (
    <div style={styles.page}>
      <style>{keyframes}</style>
      {tourStep !== null && (
        <Tour
          step={tourStep}
          steps={buildTourSteps(ticker, inputs, model)}
          onNext={() => setTourStep((s) => s + 1)}
          onDone={dismissTour}
          onSkip={dismissTour}
        />
      )}
      <div style={styles.shell}>
        <header style={styles.header}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 6 }}>
            <h1 style={{ ...styles.h1, margin: 0 }}>Options Income — Honest P&L</h1>
            <button type="button" onClick={() => setTourStep(0)} style={styles.howBtn} title="How does this work?">
              How does this work?
            </button>
          </div>
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
        </header>

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
            onChange={(v) => setInputs((s) => ({ ...s, strike: v }))}
          />
          <Field
            label={mode === "spread" ? "Short premium (collect)" : "Put premium"}
            prefix="$"
            value={inputs.premium}
            onChange={(v) => setInputs((s) => ({ ...s, premium: v }))}
          />
          {mode === "spread" && (
            <>
              <Field
                label="Long put (buy)"
                prefix="$"
                value={inputs.longStrike}
                onChange={(v) => setInputs((s) => ({ ...s, longStrike: v }))}
              />
              <Field
                label="Long premium (pay)"
                prefix="$"
                value={inputs.longPremium}
                onChange={(v) => setInputs((s) => ({ ...s, longPremium: v }))}
              />
            </>
          )}
          {twoSided && mode !== "spread" && (
            <>
              <Field
                label="Call strike"
                prefix="$"
                value={inputs.callStrike}
                onChange={(v) => setInputs((s) => ({ ...s, callStrike: v }))}
              />
              <Field
                label="Call premium"
                prefix="$"
                value={inputs.callPremium}
                onChange={(v) => setInputs((s) => ({ ...s, callPremium: v }))}
              />
            </>
          )}
          {mode === "covered" && (
            <Field
              label="Your share cost"
              prefix="$"
              value={inputs.spot}
              onChange={(v) => setInputs((s) => ({ ...s, spot: v }))}
            />
          )}
          <Field
            label="Contracts"
            value={inputs.contracts}
            onChange={(v) => setInputs((s) => ({ ...s, contracts: v }))}
          />
          <Field
            label={twoSided ? "Move size" : "Bad-week drop"}
            suffix="%"
            value={inputs.dropPct}
            onChange={(v) => setInputs((s) => ({ ...s, dropPct: v }))}
          />
          <Field
            label="Cash available"
            prefix="$"
            value={inputs.capital}
            onChange={(v) => setInputs((s) => ({ ...s, capital: v }))}
          />
        </section>

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

        <Journal journal={journal} onLog={logTrade} onClose={closeTrade} onDelete={deleteTrade} />

        <Screener
          expiration={expiration}
          dropPct={dropPct}
          capital={capital}
          mode={mode}
          onLoad={(sym, strike, prem) => {
            setTicker(sym);
            setInputs((s) => ({ ...s, strike, premium: prem, spot: strike }));
            selectCompany(sym);
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        />

        <footer style={styles.footer}>
          Inputs are saved on this device — close it and your last setup is still here. Not advice;
          the red is the part that matters.
        </footer>
      </div>
    </div>
  );
}

// ---------- model builder: one place, all modes ----------
// Standard normal CDF (Abramowitz & Stegun approximation)
function normCdf(z) {
  const a = [0.3193815, -0.3565638, 1.7814779, -1.8212560, 1.3302744];
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  let poly = 0;
  for (let i = a.length - 1; i >= 0; i--) poly = poly * t + a[i];
  const d = 0.3989423 * Math.exp(-0.5 * z * z) * t * poly;
  return z >= 0 ? 1 - d : d;
}

// Lognormal PDF for stock price S given current price S0, IV, and time T (in years)
function lnDensity(S, S0, iv, T) {
  if (S <= 0 || S0 <= 0 || !(iv > 0) || !(T > 0)) return 0;
  const sigmaLn = iv * Math.sqrt(T);
  const muLn = Math.log(S0) - 0.5 * sigmaLn * sigmaLn;
  const z = (Math.log(S) - muLn) / sigmaLn;
  return Math.exp(-0.5 * z * z) / (S * sigmaLn * Math.sqrt(2 * Math.PI));
}

function buildModel(p, dropPct) {
  const { mode, putStrike, longStrike, callStrike, spot, shares, iv, dte } = p;

  const credit =
    mode === "spread"
      ? (p.putPrem - p.longPrem) * shares
      : mode === "put"
      ? p.putPrem * shares
      : (p.putPrem + p.callPrem) * shares;

  const collateral =
    mode === "spread"
      ? Math.max(0, putStrike - longStrike) * shares
      : putStrike * 100 * (shares / 100) + (mode === "covered" ? spot * 100 * (shares / 100) : 0);

  let maxGain;
  if (mode === "put") maxGain = p.putPrem * shares;
  else if (mode === "spread") maxGain = (p.putPrem - p.longPrem) * shares;
  else if (mode === "strangle") maxGain = (p.putPrem + p.callPrem) * shares;
  else maxGain = (callStrike - spot + p.putPrem + p.callPrem) * shares;

  const move = dropPct / 100;
  const moveLbl = trimNum(dropPct);

  // σ-anchored scenario prices when IV is available, else fall back to dropPct
  const hasIv = iv > 0 && dte > 0;
  const T = (dte || 30) / 365;
  const sigma1 = hasIv ? spot * iv * Math.sqrt(T) : 0;

  const down1Price = hasIv ? Math.max(0.01, spot - sigma1) : putStrike * (1 - move);
  const down2Price = hasIv ? Math.max(0.01, spot - 2 * sigma1) : putStrike * (1 - move * 1.5);
  const upPrice = (mode === "put" || mode === "spread" ? putStrike : callStrike) * (1 + move);
  const flatPrice =
    mode === "covered" ? spot
    : mode === "strangle" ? (putStrike + callStrike) / 2
    : putStrike;

  const down1Pnl = stratPnl(down1Price, p);
  const down2Pnl = stratPnl(down2Price, p);
  const flatPnl = stratPnl(flatPrice, p);
  const upPnl = stratPnl(upPrice, p);
  const midPnl = mode === "spread" ? stratPnl((putStrike + longStrike) / 2, p) : null;

  // Labels for σ scenarios
  const down1Lbl = hasIv
    ? `1σ drop → ${money2(down1Price)}`
    : `−${moveLbl}% → ${money2(down1Price)}`;
  const down2Lbl = hasIv
    ? `2σ drop → ${money2(down2Price)}`
    : `−${trimNum(dropPct * 1.5)}% → ${money2(down2Price)}`;

  const scenarios =
    mode === "spread"
      ? [
          {
            key: "down",
            title: "Falls below long strike",
            sub: `below ${money2(longStrike)} · max loss`,
            pnl: stratPnl(longStrike * 0.97, p),
            isWorst: true,
            note: `Both puts are deep in the money. Your long put offsets the short put exactly — loss is capped here. You can't lose more than ${money2(Math.max(0, putStrike - longStrike) - (p.putPrem - p.longPrem))} per share no matter how far it falls.`,
          },
          {
            key: "flat",
            title: "Stays above short strike",
            sub: `above ${money2(putStrike)} · max profit`,
            pnl: flatPnl,
            note: "Both puts expire worthless. You keep the full net credit — this is the best case.",
          },
          {
            key: "between",
            title: "Lands between the strikes",
            sub: `between ${money2(longStrike)} and ${money2(putStrike)}`,
            pnl: midPnl,
            note: "The short put is in the money but the long put isn't fully offsetting yet. Partial loss — worse than the flat case, better than max loss.",
          },
        ]
      : mode === "strangle"
      ? [
          {
            key: "up",
            title: "If it runs up",
            sub: `+${moveLbl}% · call loses, no ceiling`,
            pnl: upPnl,
            isWorst: true,
            note: "The naked call bites. This loss keeps growing the higher it goes — there is no ceiling. This is the scenario the ads skip.",
          },
          {
            key: "down",
            title: hasIv ? "1σ drop" : "If it falls",
            sub: down1Lbl,
            pnl: down1Pnl,
            isWorst: down1Pnl < 0,
            note: "Put goes in the money. Call expires worthless. Loss depends on how far below the put strike it closes.",
          },
          {
            key: "flat",
            title: "Stays between strikes",
            sub: `between ${money2(putStrike)} and ${money2(callStrike)}`,
            pnl: flatPnl,
            note: "Both options expire worthless — you keep both premiums. This is the sweet spot.",
          },
        ]
      : [
          {
            key: "down2",
            title: hasIv ? "2σ drop (tail risk)" : "Bad drop",
            sub: down2Lbl,
            pnl: down2Pnl,
            isWorst: true,
            note: mode === "covered"
              ? "Shares lose value AND you're assigned on the put — double the downside. This is the case to size for, not the premium."
              : `Assigned well below breakeven. ${hasIv ? "A 2σ move is uncommon but not rare — it happens." : "The side the ads skip."}`,
          },
          {
            key: "down1",
            title: hasIv ? "1σ drop (expected move)" : "Mild drop",
            sub: down1Lbl,
            pnl: down1Pnl,
            isWorst: down1Pnl < 0,
            note: hasIv
              ? `This is exactly the move the options market "expects" — about a 16% chance of closing here or lower. ${down1Pnl >= 0 ? "Your breakeven is below this level — you still profit." : "Your breakeven is above this — already a loss."}`
              : "A moderate drop tests the breakeven.",
          },
          {
            key: "flat",
            title: "Stays above strike",
            sub: "put expires worthless",
            pnl: flatPnl,
            note: "Best case — you keep the full premium and the collateral is released.",
          },
        ];

  // "What would have to happen to lose" — computed from first breakeven
  let loseCondition = null;
  let probProfit = null;

  // chart range
  let xMin, xMax;
  if (mode === "spread") {
    xMin = longStrike * 0.82;
    xMax = putStrike * 1.15;
  } else if (mode === "put") {
    xMin = Math.min(down2Price, putStrike * 0.7);
    xMax = putStrike * 1.15;
  } else {
    xMin = Math.min(down2Price, putStrike * 0.6);
    xMax = Math.max(upPrice, callStrike * 1.35);
  }

  const N = 160;
  const samples = [];
  for (let i = 0; i <= N; i++) {
    const x = xMin + ((xMax - xMin) * i) / N;
    samples.push([x, stratPnl(x, p)]);
  }

  // breakevens via zero-crossings
  const breakevens = [];
  for (let i = 1; i < samples.length; i++) {
    const [x0, y0] = samples[i - 1];
    const [x1, y1] = samples[i];
    if ((y0 <= 0 && y1 > 0) || (y0 >= 0 && y1 < 0)) {
      if (y1 !== y0) breakevens.push(round2(x0 + (-y0 / (y1 - y0)) * (x1 - x0)));
    }
  }
  const breakevenLabel = breakevens.length ? breakevens.map((b) => money2(b)).join(" / ") : "—";

  // "What would have to happen to lose" — computed from first breakeven on the put side
  if (breakevens.length > 0 && spot > 0) {
    const be = breakevens[0]; // lowest breakeven (put side)
    const pctDrop = ((spot - be) / spot) * 100;
    if (pctDrop > 0) {
      if (hasIv && sigma1 > 0) {
        const sigmas = (spot - be) / sigma1;
        const prob = normCdf(sigmas);
        probProfit = Math.round(prob * 10) / 10;
        const losePct = Math.round((1 - prob) * 1000) / 10;
        loseCondition = `You lose money only if ${p.ticker || "the stock"} drops more than ${pctDrop.toFixed(1)}% by expiration. At current IV (${(iv * 100).toFixed(0)}%) that's a ${sigmas.toFixed(1)}σ move — the market prices this as a ${losePct}% chance.`;
      } else {
        loseCondition = `You lose money only if the stock drops more than ${pctDrop.toFixed(1)}% by expiration. Pull a live premium to see the IV-based probability.`;
      }
    }
  }

  // chart markers and dots
  const markers =
    mode === "spread"
      ? [
          { x: longStrike, label: `long ${money2(longStrike)}` },
          { x: putStrike, label: `short ${money2(putStrike)}` },
        ]
      : [{ x: putStrike, label: `put ${money2(putStrike)}` }];
  if (mode === "strangle" || mode === "covered") markers.push({ x: callStrike, label: `call ${money2(callStrike)}` });

  const dots =
    mode === "spread"
      ? [
          { x: longStrike * 0.97, y: stratPnl(longStrike * 0.97, p) },
          { x: (putStrike + longStrike) / 2, y: midPnl },
        ]
      : [{ x: down1Price, y: down1Pnl }, ...(hasIv ? [{ x: down2Price, y: down2Pnl }] : [])];
  if (mode === "strangle" || mode === "covered") dots.push({ x: upPrice, y: upPnl });

  // stat strip — max loss first
  let worstLabel, worstValue;
  if (mode === "strangle") {
    worstLabel = `Loss if +${moveLbl}% (no ceiling)`;
    worstValue = money(upPnl);
  } else if (mode === "spread") {
    const maxLoss = stratPnl(longStrike * 0.97, p);
    worstLabel = "Max possible loss";
    worstValue = money(maxLoss);
  } else {
    worstLabel = hasIv ? "Loss at 2σ drop" : `Loss on −${moveLbl}% drop`;
    worstValue = money(down2Pnl);
  }

  return {
    mode, credit, collateral, maxGain, samples, xMin, xMax,
    markers, dots, scenarios, breakevens, breakevenLabel,
    worstLabel, worstValue, down1Pnl, down2Pnl, upPnl,
    loseCondition, probProfit, hasIv, iv, dte, spot,
  };
}

function Chart({ model }) {
  const W = 720;
  const H = 380;
  const pad = { top: 44, right: 44, bottom: 56, left: 44 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;
  const { samples, xMin, xMax, maxGain, markers, dots, hasIv, iv, dte, spot } = model;

  if (!samples || samples.length < 2 || xMax <= xMin) {
    return (
      <div style={{ ...styles.chartWrap, display: "grid", placeItems: "center", color: "#64748b" }}>
        Enter strikes and at least one contract to draw the curve.
      </div>
    );
  }

  let yLo = 0;
  let yHi = Math.max(maxGain, 0);
  for (const [, y] of samples) {
    if (y < yLo) yLo = y;
    if (y > yHi) yHi = y;
  }
  const padY = (yHi - yLo) * 0.08 + 1;
  const yTop = yHi + padY;
  const yBot = yLo - padY;

  const xToPx = (x) => pad.left + ((x - xMin) / (xMax - xMin)) * plotW;
  const yToPx = (y) => pad.top + ((yTop - y) / (yTop - yBot)) * plotH;

  const line = samples.map(([x, y]) => `${xToPx(x).toFixed(1)},${yToPx(y).toFixed(1)}`).join(" ");
  const zeroY = yToPx(0);

  // Lognormal probability density overlay
  let densityPts = null;
  if (hasIv && iv > 0 && dte > 0 && spot > 0) {
    const T = dte / 365;
    const densities = samples.map(([x]) => lnDensity(x, spot, iv, T));
    const maxDen = Math.max(...densities, 1e-10);
    const denScale = plotH * 0.42 / maxDen;
    const bottom = H - pad.bottom;
    const pts = [`${xToPx(xMin).toFixed(1)},${bottom.toFixed(1)}`];
    samples.forEach(([x], i) => {
      const py = bottom - densities[i] * denScale;
      pts.push(`${xToPx(x).toFixed(1)},${py.toFixed(1)}`);
    });
    pts.push(`${xToPx(xMax).toFixed(1)},${bottom.toFixed(1)}`);
    densityPts = pts.join(" ");
  }

  const areaPts = [`${xToPx(xMin).toFixed(1)},${zeroY.toFixed(1)}`];
  for (const [x, y] of samples) areaPts.push(`${xToPx(x).toFixed(1)},${yToPx(Math.min(0, y)).toFixed(1)}`);
  areaPts.push(`${xToPx(xMax).toFixed(1)},${zeroY.toFixed(1)}`);

  const ceilingY = yToPx(maxGain);

  return (
    <div style={styles.chartWrap}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Profit and loss curve">
        <line x1={pad.left} y1={zeroY} x2={W - pad.right} y2={zeroY} stroke="#e9edf3" strokeWidth="1" />

        <polygon points={areaPts.join(" ")} fill="rgba(225,76,76,0.06)" />

        {densityPts && (
          <polygon
            points={densityPts}
            fill="rgba(99,102,241,0.10)"
            stroke="rgba(99,102,241,0.25)"
            strokeWidth="1"
          />
        )}

        {Number.isFinite(ceilingY) && (
          <>
            <line x1={pad.left} y1={ceilingY} x2={W - pad.right} y2={ceilingY} stroke="#3aa56b" strokeWidth="1" />
            <text x={pad.left} y={ceilingY - 10} textAnchor="start" style={styles.ceilingLabel}>
              max gain · {money(maxGain)}
            </text>
          </>
        )}

        {markers.map((m, i) => {
          const mx = xToPx(m.x);
          return (
            <g key={i}>
              <line x1={mx} y1={pad.top} x2={mx} y2={H - pad.bottom} stroke="#e2e8f0" strokeDasharray="2 5" />
              <text x={mx} y={H - pad.bottom + 22} textAnchor="middle" style={styles.axisLabel}>
                {m.label}
              </text>
            </g>
          );
        })}

        <polyline points={line} fill="none" stroke="#1f2937" strokeWidth="1.5" strokeLinejoin="round" />

        {dots.map((d, i) => {
          const dx = xToPx(d.x);
          const dy = yToPx(d.y);
          const loss = d.y < 0;
          return (
            <g key={i}>
              <circle cx={dx} cy={dy} r="10" fill={loss ? "rgba(225,76,76,0.16)" : "rgba(58,165,107,0.16)"}>
                <animate attributeName="r" values="7;13;7" dur="2.4s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.4;0.08;0.4" dur="2.4s" repeatCount="indefinite" />
              </circle>
              <circle cx={dx} cy={dy} r="4" fill={loss ? "#e14c4c" : "#3aa56b"} stroke="#fff" strokeWidth="1.5" />
              <text
                x={dx}
                y={loss ? dy + 24 : dy - 14}
                textAnchor="middle"
                style={loss ? styles.badLabel : styles.goodLabel}
              >
                {moneySigned(d.y)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function ModeToggle({ mode, onChange }) {
  return (
    <div style={styles.toggle}>
      {MODES.map((m) => {
        const active = m.key === mode;
        return (
          <button
            key={m.key}
            type="button"
            onClick={() => onChange(m.key)}
            style={{
              ...styles.toggleBtn,
              background: active ? "#1f2937" : "transparent",
              color: active ? "#fff" : "#475569",
              fontWeight: active ? 700 : 600,
            }}
          >
            {m.label}
          </button>
        );
      })}
    </div>
  );
}

function Field({ label, value, onChange, prefix, suffix }) {
  return (
    <label style={styles.field}>
      <span style={styles.fieldLabel}>{label}</span>
      <span style={styles.inputWrap}>
        {prefix && <span style={styles.affix}>{prefix}</span>}
        <input
          type="number"
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={styles.input}
        />
        {suffix && <span style={styles.affix}>{suffix}</span>}
      </span>
    </label>
  );
}

function CompanyPicker({ ticker, quote, onSelect, expiration, onExpirationChange, onFetchPremium, premQuote }) {
  return (
    <section style={styles.pickerWrap}>
      <div style={{ fontSize: 11, color: "#94a3b8", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 6, padding: "4px 10px", marginBottom: 10, display: "inline-flex", alignItems: "center", gap: 6 }}>
        <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#d97706", flexShrink: 0, display: "inline-block" }} />
        Prices are ~15-min delayed · for learning, not live order entry
      </div>
      <div style={styles.pickerRow}>
        <label style={{ ...styles.field, flex: "1 1 240px", minWidth: 200 }}>
          <span style={styles.fieldLabel}>Company (optional)</span>
          <span style={styles.inputWrap}>
            <select value={ticker} onChange={(e) => onSelect(e.target.value)} style={{ ...styles.input, cursor: "pointer" }}>
              <option value="">— set strike manually —</option>
              {COMPANIES.map((c) => (
                <option key={c.ticker} value={c.ticker}>
                  {c.name} ({c.ticker})
                </option>
              ))}
            </select>
          </span>
        </label>
        <QuoteStatus quote={quote} />
      </div>

      {ticker && (
        <div style={styles.pickerRow}>
          <label style={{ ...styles.field, flex: "0 1 180px", minWidth: 150 }}>
            <span style={styles.fieldLabel}>Expiration</span>
            <span style={styles.inputWrap}>
              <input type="date" value={expiration} onChange={(e) => onExpirationChange(e.target.value)} style={styles.input} />
            </span>
          </label>
          <button type="button" onClick={onFetchPremium} style={styles.premiumBtn}>
            Pull real premium →
          </button>
          <PremiumStatus premQuote={premQuote} />
        </div>
      )}
    </section>
  );
}

function PremiumStatus({ premQuote }) {
  const s = premQuote.status;
  if (s === "idle")
    return <span style={styles.pickerStatus}>Fills the put premium from the real chain at your strike.</span>;
  if (s === "loading") return <span style={styles.pickerStatus}>Fetching option chain…</span>;
  if (s === "live")
    return (
      <span style={styles.pickerStatus}>
        <Dot color="#3aa56b" /> {money2(premQuote.premium)} mid · {premQuote.strike}P {premQuote.expiration}
        {premQuote.requestedStrike !== premQuote.strike ? ` (nearest to ${money2(premQuote.requestedStrike)})` : ""}
      </span>
    );
  if (s === "nokey")
    return (
      <span style={styles.pickerStatus}>
        <Dot color="#cf9a3a" /> Add an Alpaca key to pull real premiums — premium stays manual.
      </span>
    );
  return (
    <span style={styles.pickerStatus}>
      <Dot color="#cf9a3a" /> Couldn't price that expiration — try another date, or set premium manually.
    </span>
  );
}

function QuoteStatus({ quote }) {
  if (quote.status === "idle")
    return <span style={styles.pickerStatus}>Pick a company to pre-fill the strike from its share price.</span>;
  if (quote.status === "loading")
    return (
      <span style={styles.pickerStatus}>
        <Dot color="#b8c2d0" /> snapshot {money2(quote.price)} — checking live price…
      </span>
    );
  if (quote.status === "live")
    return (
      <span style={styles.pickerStatus}>
        <Dot color="#3aa56b" /> live {money2(quote.price)}
        {quote.date ? ` · ${quote.date}` : ""}
      </span>
    );
  return (
    <span style={styles.pickerStatus}>
      <Dot color="#cf9a3a" /> offline — snapshot {money2(quote.price)} (approx, {SNAPSHOT_DATE})
    </span>
  );
}

function Dot({ color }) {
  return (
    <span
      style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: color, marginRight: 6, verticalAlign: "middle" }}
    />
  );
}

function SizingHint({ mode, capital, perContractCash, maxContracts, contracts, dropPct, model, p, onApply }) {
  if (!(perContractCash > 0) || !(capital > 0)) return null;

  if (maxContracts < 1) {
    return (
      <div style={styles.sizing}>
        {money(capital)} isn't enough for even one contract — that needs {money(perContractCash)}.{" "}
        {mode === "spread"
          ? "Narrow the spread or widen the long strike."
          : mode === "covered"
          ? "Lower the strike, or you're short the share cost."
          : "Lower the strike or add cash."}
      </div>
    );
  }

  // Compute 2σ loss price
  const hasIv = model.hasIv;
  const T = (model.dte || 30) / 365;
  const sigma2Price = hasIv
    ? Math.max(0.01, (model.spot || p.putStrike) - 2 * (model.spot || p.putStrike) * (model.iv || 0) * Math.sqrt(T))
    : p.putStrike * (1 - dropPct * 2 / 100);

  // Build rows: 1 contract, conservative (half max, min 1), max
  const sizes = [...new Set([1, Math.max(1, Math.floor(maxContracts / 2)), maxContracts])].filter(n => n >= 1 && n <= maxContracts);

  const lossAtSize = (n) => {
    const pp = { ...p, shares: n * 100 };
    if (mode === "strangle") return stratPnl(p.callStrike * (1 + dropPct / 100), pp);
    if (mode === "spread") return stratPnl(p.longStrike * 0.97, pp);
    return stratPnl(sigma2Price, pp);
  };

  const lossLabel = hasIv
    ? (mode === "strangle" ? `+${trimNum(dropPct)}% adverse` : "2σ drop")
    : (mode === "strangle" ? `+${trimNum(dropPct)}%` : `−${trimNum(dropPct * 2)}% drop`);

  const atMax = contracts === maxContracts;

  return (
    <div style={styles.sizing}>
      <div style={{ marginBottom: 8, fontSize: 13, color: "#475569" }}>
        Your {money(capital)} {mode === "spread" ? "covers" : mode === "covered" ? "funds" : "secures"} up to <b>{maxContracts} contract{maxContracts !== 1 ? "s" : ""}</b>. What {lossLabel} does at different sizes:
      </div>
      <table style={{ fontSize: 12, borderCollapse: "collapse", width: "100%", marginBottom: 8 }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left", color: "#64748b", fontWeight: 600, paddingBottom: 4 }}>Contracts</th>
            <th style={{ textAlign: "right", color: "#64748b", fontWeight: 600, paddingBottom: 4 }}>Loss ({lossLabel})</th>
            <th style={{ textAlign: "right", color: "#64748b", fontWeight: 600, paddingBottom: 4 }}>% of account</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {sizes.map((n) => {
            const loss = lossAtSize(n);
            const pct = capital > 0 ? Math.abs(loss / capital * 100) : 0;
            const dangerous = pct > 50;
            return (
              <tr key={n} style={{ borderTop: "1px solid #f1f5f9" }}>
                <td style={{ padding: "4px 0", fontWeight: n === maxContracts ? 700 : 400 }}>{n}</td>
                <td style={{ textAlign: "right", color: loss < 0 ? "#e14c4c" : "#16a34a", fontWeight: 700 }}>
                  {moneySigned(loss)}
                </td>
                <td style={{ textAlign: "right", color: dangerous ? "#e14c4c" : "#64748b" }}>
                  {pct.toFixed(0)}%{dangerous ? " ⚠" : ""}
                </td>
                <td style={{ textAlign: "right" }}>
                  {!atMax && n === maxContracts ? (
                    <button type="button" onClick={() => onApply(n)} style={{ ...styles.sizingBtn, margin: 0 }}>Use</button>
                  ) : contracts !== n ? (
                    <button type="button" onClick={() => onApply(n)} style={{ ...styles.sizingBtn, margin: 0, background: "transparent", color: "#64748b", border: "1px solid #e2e8f0" }}>Use</button>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div style={{ fontSize: 11.5, color: "#94a3b8" }}>
        Size for the loss you can survive, not the premium you want to collect.
      </div>
    </div>
  );
}

function Ticket({ mode, ticker, expiration, putStrike, putPrem, longStrike, longPrem, callStrike, callPrem, contracts, collateral }) {
  const [copied, setCopied] = useState(false);
  const sym = ticker || "[symbol]";
  const qty = contracts || 1;
  const exp = formatExp(expiration);

  const legs =
    mode === "spread"
      ? [
          `Sell to Open · ${qty} ${sym} ${exp} ${money2(putStrike)} Put · Limit ${money2(putPrem)} · Day`,
          `Buy to Open  · ${qty} ${sym} ${exp} ${money2(longStrike)} Put · Limit ${money2(longPrem)} · Day`,
        ]
      : [`Sell to Open · ${qty} ${sym} ${exp} ${money2(putStrike)} Put · Limit ${money2(putPrem)} · Day`];
  if (mode === "strangle" || mode === "covered")
    legs.push(`Sell to Open · ${qty} ${sym} ${exp} ${money2(callStrike)} Call · Limit ${money2(callPrem)} · Day`);
  const order = legs.join("\n");

  const tag =
    mode === "put"
      ? "cash-secured put"
      : mode === "spread"
      ? `bull put spread — max loss capped at ${money2(putStrike - longStrike - (putPrem - longPrem))} per share`
      : mode === "strangle"
      ? "short strangle — the call is NAKED (uncovered)"
      : "covered strangle — you hold the shares; the put is cash-secured";

  function copy() {
    try {
      navigator.clipboard?.writeText(order + "\n(" + tag + ")");
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — text is on screen to copy by hand */
    }
  }

  return (
    <section style={styles.ticket}>
      <div style={styles.ticketHead}>
        <span style={styles.ticketTitle}>What to say when you place it</span>
        <button type="button" onClick={copy} style={styles.copyBtn}>
          {copied ? "Copied ✓" : "Copy"}
        </button>
      </div>

      <div style={styles.ticketOrder}>
        {legs.map((l, i) => (
          <div key={i}>{l}</div>
        ))}
        <div style={{ color: "#94a3b8", marginTop: 4 }}>({tag})</div>
      </div>

      <ul style={styles.ticketList}>
        <li>
          <b>Action:</b>{" "}
          {mode === "spread"
            ? "Sell to Open the short put, Buy to Open the long put — send both legs together as a spread order"
            : "Sell to Open every leg — you're opening short options, not buying"}
        </li>
        <li>
          <b>Order type:</b> Limit, never market{mode !== "put" ? " — most brokers let you send multi-leg spreads as one order at a net credit" : ""}
        </li>
        <li>
          {mode === "put" && <><b>Cash-secured:</b> keep {money(collateral)} in cash for assignment</>}
          {mode === "spread" && <><b>Collateral:</b> your broker holds {money(collateral)} — the spread width × contracts. That's the most you can lose. No extra cash needed beyond that.</>}
          {mode === "strangle" && <><b>Naked call:</b> your broker holds margin for it — and the loss is theoretically unlimited</>}
          {mode === "covered" && <><b>Covered:</b> hold {(contracts || 1) * 100} shares for the call; the put stays cash-secured ({money(collateral)} total tied up)</>}
        </li>
      </ul>
    </section>
  );
}

function legLabel(e) {
  if (e.mode === "put") return `${money2(e.putStrike)}P`;
  return `${money2(e.putStrike)}P / ${money2(e.callStrike)}C`;
}

function Journal({ journal, onLog, onClose, onDelete }) {
  const closed = journal.filter((e) => e.status === "closed");
  const wins = closed.filter((e) => e.realizedPnl >= 0);
  const losses = closed.filter((e) => e.realizedPnl < 0);
  const realized = closed.reduce((s, e) => s + e.realizedPnl, 0);
  const winSum = wins.reduce((s, e) => s + e.realizedPnl, 0);
  const lossSum = losses.reduce((s, e) => s + e.realizedPnl, 0); // negative
  const worst = losses.reduce((m, e) => Math.min(m, e.realizedPnl), 0);

  return (
    <section style={styles.journal}>
      <div style={styles.journalHead}>
        <span style={styles.ticketTitle}>Paper-trade journal</span>
        <button type="button" onClick={onLog} style={styles.premiumBtn}>
          + Log current trade
        </button>
      </div>

      {journal.length === 0 ? (
        <p style={styles.journalEmpty}>
          No trades logged yet. Set up a trade above and hit “Log current trade” — then come back and
          record how it actually closed, wins <i>and</i> losses.
        </p>
      ) : (
        <>
          {closed.length > 0 && (
            <div style={styles.journalSummary}>
              <Stat label="Realized P&L" value={moneySigned(realized)} tone={realized < 0 ? "bad" : "good"} />
              <Stat label={`Wins (${wins.length})`} value={moneySigned(winSum)} tone="good" />
              <Stat label={`Losses (${losses.length})`} value={moneySigned(lossSum)} tone="bad" />
              <Stat label="Worst single loss" value={losses.length ? money(worst) : "—"} tone="bad" />
            </div>
          )}

          <div style={styles.journalList}>
            {journal.map((e) => (
              <JournalRow key={e.id} e={e} onClose={onClose} onDelete={onDelete} />
            ))}
          </div>

          {closed.length > 0 && losses.length === 0 && (
            <p style={styles.journalNote}>
              No losing trades recorded yet — keep logging the bad weeks too. An honest record needs
              them.
            </p>
          )}
        </>
      )}
    </section>
  );
}

function JournalRow({ e, onClose, onDelete }) {
  const [px, setPx] = useState("");
  const open = e.status === "open";
  const loss = e.status === "closed" && e.realizedPnl < 0;

  return (
    <div style={styles.journalRow}>
      <div style={{ minWidth: 0, flex: "1 1 200px" }}>
        <div style={styles.journalSym}>
          {e.ticker} · {e.mode} · {legLabel(e)} ×{e.contracts}
        </div>
        <div style={styles.journalMeta}>
          opened {e.openedAt} · exp {e.expiration} · collected {money(e.credit)}
          {e.status === "closed" && ` · closed ${e.closedAt} @ ${money2(e.closePrice)}`}
        </div>
      </div>

      {open ? (
        <div style={styles.journalActions}>
          <span style={{ ...styles.inputWrap, width: 130 }}>
            <span style={styles.affix}>close $</span>
            <input
              type="number"
              inputMode="decimal"
              value={px}
              placeholder="price"
              onChange={(ev) => setPx(ev.target.value)}
              style={styles.input}
            />
          </span>
          <button
            type="button"
            onClick={() => px !== "" && onClose(e.id, px)}
            style={styles.sizingBtn}
          >
            Close
          </button>
          <button type="button" onClick={() => onDelete(e.id)} style={styles.deleteBtn} aria-label="delete">
            ✕
          </button>
        </div>
      ) : (
        <div style={styles.journalActions}>
          <span style={{ ...styles.journalPnl, color: loss ? "#e14c4c" : "#3aa56b" }}>
            {moneySigned(e.realizedPnl)}
          </span>
          <button type="button" onClick={() => onDelete(e.id)} style={styles.deleteBtn} aria-label="delete">
            ✕
          </button>
        </div>
      )}
    </div>
  );
}

function Scenarios({ cards }) {
  return (
    <section style={styles.scenarios}>
      {cards.map((c) => {
        const isLoss = c.pnl < 0;
        const isWorst = c.isWorst;
        return (
          <div
            key={c.key}
            style={{
              ...styles.scenarioCard,
              borderColor: isWorst ? "#e14c4c" : isLoss ? "#f2d4d4" : "#d4ead9",
              borderWidth: isWorst ? 2 : 1,
              background: isWorst ? "#fff5f5" : isLoss ? "#fdf6f6" : "#f6fbf8",
            }}
          >
            {isWorst && (
              <div style={{ fontSize: 10, fontWeight: 800, color: "#e14c4c", letterSpacing: "0.08em", marginBottom: 4 }}>
                WORST CASE — SIZE FOR THIS
              </div>
            )}
            <div style={styles.scenarioTitle}>{c.title}</div>
            <div style={styles.scenarioSub}>{c.sub}</div>
            <div style={{ ...styles.scenarioPnl, color: isLoss ? "#e14c4c" : "#3aa56b", fontSize: isWorst ? 26 : undefined }}>{moneySigned(c.pnl)}</div>
            <div style={styles.scenarioNote}>{c.note}</div>
          </div>
        );
      })}
    </section>
  );
}

function Screener({ expiration, dropPct, capital, mode, onLoad }) {
  const [selected, setSelected] = useState([]);
  const [exp, setExp] = useState(expiration);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sortKey, setSortKey] = useState("yield");
  const [sortDir, setSortDir] = useState("desc");
  const [hasPremiums, setHasPremiums] = useState(false);
  const [aiStatus, setAiStatus] = useState("idle"); // idle | loading | done | unavailable
  const [aiVerdicts, setAiVerdicts] = useState({});
  const [aiCaveat, setAiCaveat] = useState("");

  function toggleTicker(t) {
    setSelected((s) =>
      s.includes(t) ? s.filter((x) => x !== t) : s.length < 6 ? [...s, t] : s
    );
  }

  async function runComparison() {
    if (!selected.length) return;
    setLoading(true);
    setRows([]);

    const expDate = new Date(exp + "T12:00:00Z");
    const dte = Math.max(1, Math.round((expDate - Date.now()) / 86400000));

    const results = await Promise.all(
      selected.map(async (sym) => {
        const company = COMPANIES.find((c) => c.ticker === sym);
        let price = company.price;
        let priceSource = "snapshot";
        try {
          const r = await fetch(`/api/quote?symbol=${sym}`);
          if (r.ok) {
            const d = await r.json();
            if (Number.isFinite(d.price) && d.price > 0) { price = d.price; priceSource = d.source; }
          }
        } catch { /* use snapshot */ }

        const strike = roundStrike(price);
        let premium = null;
        try {
          const r = await fetch(`/api/option?symbol=${sym}&expiration=${exp}&strike=${strike}`);
          if (r.ok) {
            const d = await r.json();
            if (d.available && Number.isFinite(d.premium) && d.premium > 0) premium = d.premium;
          }
        } catch { /* no premium */ }

        const collateral = strike * 100;
        const annYield = premium != null ? (premium / strike) * (365 / dte) * 100 : null;
        const cushion = premium != null ? ((price - (strike - premium)) / price) * 100 : null;
        const badWeekPrice = strike * (1 - dropPct / 100);
        const badWeekPnl = premium != null
          ? (premium - Math.max(0, strike - badWeekPrice)) * 100
          : null;
        const maxContracts = capital > 0 ? Math.floor(capital / collateral) : 0;

        return { sym, name: company.name, price, priceSource, strike, premium, collateral, annYield, cushion, badWeekPnl, maxContracts, dte };
      })
    );

    setHasPremiums(results.some((r) => r.premium != null));
    setRows(results);
    setLoading(false);
    setAiStatus("idle");
    setAiVerdicts({});
  }

  async function runAiAnalysis(currentRows) {
    const stocksToAnalyze = currentRows.length ? currentRows : rows;
    if (!stocksToAnalyze.length) return;
    setAiStatus("loading");
    try {
      const r = await fetch("/api/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ stocks: stocksToAnalyze, capital, mode }),
      });
      const d = await r.json();
      if (!d.available) { setAiStatus("unavailable"); return; }
      const map = {};
      (d.verdicts || []).forEach((v) => { map[v.sym] = v; });
      setAiVerdicts(map);
      setAiCaveat(d.caveat || "");
      setAiStatus("done");
    } catch {
      setAiStatus("error");
    }
  }

  function toggleSort(key) {
    if (sortKey === key) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else { setSortKey(key); setSortDir("desc"); }
  }

  const sorted = [...rows].sort((a, b) => {
    const av = a[sortKey] ?? (sortDir === "desc" ? -Infinity : Infinity);
    const bv = b[sortKey] ?? (sortDir === "desc" ? -Infinity : Infinity);
    return sortDir === "desc" ? bv - av : av - bv;
  });

  const COLS = [
    { key: "sym", label: "Stock", num: false },
    { key: "price", label: "Price", num: true },
    { key: "strike", label: "Strike", num: true },
    { key: "premium", label: "Premium", num: true },
    { key: "annYield", label: "Yield/yr", num: true },
    { key: "cushion", label: "Cushion", num: true },
    { key: "badWeekPnl", label: `−${trimNum(dropPct)}% scenario`, num: true },
    { key: "maxContracts", label: "Max contracts", num: true },
  ];

  return (
    <section style={styles.screener}>
      <div style={styles.journalHead}>
        <span style={styles.ticketTitle}>Compare stocks</span>
        <span style={{ fontSize: 12, color: "#94a3b8" }}>Pick up to 6</span>
      </div>

      <div style={styles.chipGrid}>
        {COMPANIES.map((c) => {
          const on = selected.includes(c.ticker);
          return (
            <button
              key={c.ticker}
              type="button"
              onClick={() => toggleTicker(c.ticker)}
              style={{
                ...styles.chip,
                background: on ? "#1f2937" : "#f8fafc",
                color: on ? "#fff" : "#475569",
                border: `1px solid ${on ? "#1f2937" : "#e2e8f0"}`,
              }}
            >
              {c.ticker}
            </button>
          );
        })}
      </div>

      <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 18 }}>
        <label style={{ ...styles.field, flex: "0 1 180px" }}>
          <span style={styles.fieldLabel}>Expiration</span>
          <span style={styles.inputWrap}>
            <input type="date" value={exp} onChange={(e) => setExp(e.target.value)} style={styles.input} />
          </span>
        </label>
        <button
          type="button"
          onClick={runComparison}
          disabled={!selected.length || loading}
          style={{ ...styles.tourNext, opacity: !selected.length ? 0.45 : 1, fontSize: 13, padding: "10px 22px" }}
        >
          {loading ? "Fetching…" : `Compare ${selected.length || ""} stock${selected.length !== 1 ? "s" : ""}`}
        </button>
        {selected.length > 0 && !loading && (
          <button type="button" onClick={() => setSelected([])} style={styles.tourSkip}>
            Clear
          </button>
        )}
      </div>

      {rows.length > 0 && (
        <>
          {!hasPremiums && (
            <div style={{ ...styles.warnBar, marginBottom: 14 }}>
              No live premiums — add an Alpaca key to fetch real option prices. Yield and cushion columns need premiums to fill.
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => runAiAnalysis(rows)}
              disabled={aiStatus === "loading"}
              style={{ ...styles.tourNext, fontSize: 12, padding: "8px 18px", opacity: aiStatus === "loading" ? 0.6 : 1 }}
            >
              {aiStatus === "loading" ? "Asking AI…" : aiStatus === "done" ? "Refresh AI picks" : "Ask AI: winner or loser?"}
            </button>
            {aiStatus === "unavailable" && (
              <span style={{ fontSize: 12, color: "#94a3b8" }}>Add ANTHROPIC_API_KEY to Vercel to enable AI analysis.</span>
            )}
            {aiStatus === "error" && (
              <span style={{ fontSize: 12, color: "#e14c4c" }}>AI analysis failed — try again.</span>
            )}
            {aiStatus === "done" && aiCaveat && (
              <span style={{ fontSize: 11.5, color: "#94a3b8", fontStyle: "italic" }}>{aiCaveat}</span>
            )}
          </div>
          <div style={{ overflowX: "auto", marginBottom: 10 }}>
            <table style={styles.screenerTable}>
              <thead>
                <tr>
                  {COLS.map((col) => (
                    <th
                      key={col.key}
                      onClick={() => col.num && toggleSort(col.key)}
                      style={{
                        ...styles.screenerTh,
                        cursor: col.num ? "pointer" : "default",
                        color: sortKey === col.key ? "#0f172a" : "#64748b",
                      }}
                    >
                      {col.label}{sortKey === col.key ? (sortDir === "desc" ? " ↓" : " ↑") : ""}
                    </th>
                  ))}
                  <th style={styles.screenerTh} />
                </tr>
              </thead>
              <tbody>
                {sorted.map((row, i) => {
                  const badLoss = row.badWeekPnl != null && row.badWeekPnl < 0;
                  const ai = aiVerdicts[row.sym];
                  const verdictColor =
                    ai?.verdict === "FAVORABLE" ? "#16a34a"
                    : ai?.verdict === "AVOID" ? "#e14c4c"
                    : ai?.verdict === "CAUTION" ? "#d97706"
                    : "#94a3b8";
                  return (
                    <tr key={row.sym} style={{ background: i % 2 === 0 ? "#fff" : "#f8fafc" }}>
                      <td style={styles.screenerTd}>
                        <div style={{ fontWeight: 700, fontSize: 13 }}>{row.sym}</div>
                        <div style={{ fontSize: 11, color: "#94a3b8" }}>{row.name}</div>
                        {ai && (
                          <div style={{ marginTop: 4 }}>
                            <span style={{ fontSize: 10, fontWeight: 800, color: verdictColor, letterSpacing: "0.05em" }}>
                              {ai.verdict}
                            </span>
                          </div>
                        )}
                      </td>
                      <td style={styles.screenerTd}>
                        {money2(row.price)}
                        <div style={{ fontSize: 10, color: "#94a3b8" }}>{row.priceSource}</div>
                      </td>
                      <td style={styles.screenerTd}>{money2(row.strike)}</td>
                      <td style={styles.screenerTd}>
                        {row.premium != null ? money2(row.premium) : <span style={{ color: "#cbd5e1" }}>—</span>}
                      </td>
                      <td style={{ ...styles.screenerTd, fontWeight: 700, color: row.annYield != null ? "#16a34a" : "#cbd5e1" }}>
                        {row.annYield != null ? `${row.annYield.toFixed(1)}%` : "—"}
                      </td>
                      <td style={{ ...styles.screenerTd, color: row.cushion != null ? "#0f172a" : "#cbd5e1" }}>
                        {row.cushion != null ? `${row.cushion.toFixed(1)}%` : "—"}
                      </td>
                      <td style={{ ...styles.screenerTd, fontWeight: 700, color: badLoss ? "#e14c4c" : row.badWeekPnl != null ? "#16a34a" : "#cbd5e1" }}>
                        {row.badWeekPnl != null ? (row.badWeekPnl >= 0 ? "+" : "−") + "$" + Math.abs(Math.round(row.badWeekPnl)).toLocaleString() : "—"}
                      </td>
                      <td style={styles.screenerTd}>{row.maxContracts}</td>
                      <td style={{ ...styles.screenerTd, maxWidth: 220 }}>
                        {row.premium != null && (
                          <button
                            type="button"
                            onClick={() => onLoad(row.sym, row.strike, row.premium)}
                            style={{ ...styles.loadBtn, marginBottom: ai ? 6 : 0 }}
                          >
                            Load ↑
                          </button>
                        )}
                        {ai && (
                          <div style={{ fontSize: 11, color: "#475569", lineHeight: 1.45, whiteSpace: "normal" }}>
                            {ai.reason}
                            {ai.flag && <div style={{ color: "#d97706", marginTop: 3 }}>⚠ {ai.flag}</div>}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p style={{ fontSize: 11.5, color: "#94a3b8", lineHeight: 1.5, margin: 0 }}>
            <b>Yield/yr</b> = annualized return on collateral (premium ÷ strike × 365 ÷ DTE). Always read it next to the scenario loss column — yield without loss context is half the picture. <b>Cushion</b> = how far the stock can fall before you lose money. Click <b>Load ↑</b> to pull a stock into the calculator above. Click column headers to sort.
          </p>
        </>
      )}
    </section>
  );
}

function Tour({ step, steps, onNext, onDone, onSkip }) {
  const s = steps[Math.min(step, steps.length - 1)];
  const isLast = step >= steps.length - 1;
  const hasOutcome = s.outcome != null;
  return (
    <div style={styles.tourOverlay}>
      <div style={styles.tourCard}>
        <div style={styles.tourTag}>{s.tag} · {step + 1}/{steps.length}</div>
        <div style={styles.tourTitle}>{s.title}</div>
        {s.setup && <div style={styles.tourSetup}>{s.setup}</div>}

        {hasOutcome && (
          <div style={{
            ...styles.tourOutcome,
            color: s.good ? "#16a34a" : "#e14c4c",
            background: s.good ? "#f0fdf4" : "#fff5f5",
            border: `1px solid ${s.good ? "#bbf7d0" : "#fecaca"}`,
          }}>
            {s.outcome}
          </div>
        )}

        <div style={styles.tourBody}>{s.body}</div>

        <div style={styles.tourActions}>
          <button type="button" onClick={onSkip} style={styles.tourSkip}>
            Skip
          </button>
          <button type="button" onClick={isLast ? onDone : onNext} style={styles.tourNext}>
            {isLast ? "Got it" : "Next →"}
          </button>
        </div>
        <div style={styles.tourDots}>
          {steps.map((_, i) => (
            <span key={i} style={{ ...styles.tourDot, background: i === step ? "#1f2937" : "#e2e8f0" }} />
          ))}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, tone, big }) {
  const color = tone === "good" ? "#16a34a" : tone === "bad" ? "#ef4444" : "#0f172a";
  return (
    <div style={{ ...styles.stat, ...(big ? { borderLeft: "3px solid #ef4444", paddingLeft: 10 } : {}) }}>
      <div style={styles.statLabel}>{label}</div>
      <div style={{ ...styles.statValue, color, fontSize: big ? 24 : undefined }}>{value}</div>
    </div>
  );
}

function num(v) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

function trimNum(n) {
  return Number.isInteger(n) ? n : Math.round(n * 10) / 10;
}

const keyframes = `
  * { box-sizing: border-box; }
  body { margin: 0; }
  input[type=number]::-webkit-outer-spin-button,
  input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
  input[type=number] { -moz-appearance: textfield; }
`;

const styles = {
  page: {
    minHeight: "100vh",
    background: "#f1f5f9",
    fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    color: "#0f172a",
    padding: "32px 16px",
  },
  shell: { maxWidth: 780, margin: "0 auto", background: "#fff", borderRadius: 18, boxShadow: "0 10px 40px rgba(15,23,42,0.08)", padding: 28 },
  header: { marginBottom: 20 },
  h1: { margin: "0 0 6px", fontSize: 25, letterSpacing: "-0.02em" },
  sub: { margin: 0, color: "#475569", fontSize: 14, lineHeight: 1.5, maxWidth: 600 },
  toggle: { display: "flex", gap: 4, background: "#f1f5f9", borderRadius: 10, padding: 4, marginBottom: 18 },
  toggleBtn: { flex: 1, border: "none", borderRadius: 8, padding: "9px 8px", fontSize: 13, cursor: "pointer", whiteSpace: "nowrap" },
  pickerWrap: { display: "flex", flexDirection: "column", gap: 14, marginBottom: 18, paddingBottom: 18, borderBottom: "1px solid #eef2f7" },
  pickerRow: { display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: 14 },
  premiumBtn: { border: "1px solid #d6deea", borderRadius: 10, background: "#f8fafc", color: "#1f2937", fontSize: 13, fontWeight: 600, padding: "10px 14px", cursor: "pointer", height: 40, whiteSpace: "nowrap" },
  pickerStatus: { fontSize: 12.5, color: "#64748b", paddingBottom: 11, lineHeight: 1.4 },
  controls: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 22 },
  field: { display: "flex", flexDirection: "column", gap: 6 },
  fieldLabel: { fontSize: 12.5, fontWeight: 600, color: "#475569" },
  inputWrap: { display: "flex", alignItems: "center", border: "1px solid #e2e8f0", borderRadius: 10, background: "#f8fafc", padding: "0 10px" },
  affix: { color: "#94a3b8", fontSize: 14 },
  input: { border: "none", outline: "none", background: "transparent", padding: "10px 6px", fontSize: 16, width: "100%", color: "#0f172a" },
  chartWrap: { background: "#fff", padding: "8px 4px 0", minHeight: 200, marginBottom: 16 },
  axisLabel: { fontSize: 11, fill: "#94a3b8", letterSpacing: "0.01em" },
  ceilingLabel: { fontSize: 11, fontWeight: 600, fill: "#3aa56b", letterSpacing: "0.02em" },
  badLabel: { fontSize: 12, fontWeight: 600, fill: "#e14c4c" },
  goodLabel: { fontSize: 12, fontWeight: 600, fill: "#3aa56b" },
  warnBar: { fontSize: 12.5, color: "#9a3412", background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 10, padding: "10px 14px", marginBottom: 22, lineHeight: 1.5 },
  sizing: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, fontSize: 12.5, lineHeight: 1.55, color: "#475569", background: "#f8fafc", border: "1px solid #eef2f7", borderRadius: 10, padding: "11px 14px", marginBottom: 22 },
  sizingBtn: { border: "1px solid #d6deea", borderRadius: 8, background: "#fff", color: "#1f2937", fontSize: 12, fontWeight: 600, padding: "6px 12px", cursor: "pointer", whiteSpace: "nowrap", marginLeft: "auto" },
  ticket: { border: "1px solid #e5e7eb", borderRadius: 12, padding: "16px 18px", marginBottom: 26, background: "#fcfcfd" },
  ticketHead: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  ticketTitle: { fontSize: 13, fontWeight: 700, color: "#1f2937" },
  copyBtn: { border: "1px solid #d6deea", borderRadius: 8, background: "#fff", color: "#1f2937", fontSize: 12, fontWeight: 600, padding: "5px 12px", cursor: "pointer" },
  ticketOrder: { fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace', fontSize: 13, color: "#0f172a", background: "#fff", border: "1px solid #eef2f7", borderRadius: 8, padding: "11px 13px", lineHeight: 1.6 },
  ticketList: { margin: "12px 0 0", paddingLeft: 18, fontSize: 12.5, color: "#475569", lineHeight: 1.6 },
  scenarios: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 26 },
  scenarioCard: { border: "1px solid #e5e7eb", borderRadius: 12, padding: "14px 16px" },
  scenarioTitle: { fontSize: 13, fontWeight: 700, color: "#1f2937" },
  scenarioSub: { fontSize: 12, color: "#94a3b8", marginTop: 2 },
  scenarioPnl: { fontSize: 23, fontWeight: 700, letterSpacing: "-0.02em", margin: "8px 0 6px" },
  scenarioNote: { fontSize: 12, color: "#64748b", lineHeight: 1.45 },
  stats: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 },
  stat: { border: "1px solid #eef2f7", borderRadius: 12, padding: "12px 14px", background: "#f8fafc" },
  statLabel: { fontSize: 12, color: "#64748b", marginBottom: 4 },
  statValue: { fontSize: 18, fontWeight: 700, letterSpacing: "-0.01em" },
  footer: { marginTop: 20, fontSize: 12.5, color: "#94a3b8", textAlign: "center", lineHeight: 1.5 },
  journal: { marginTop: 28, paddingTop: 22, borderTop: "1px solid #eef2f7" },
  journalHead: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 14, flexWrap: "wrap" },
  journalEmpty: { fontSize: 13, color: "#64748b", lineHeight: 1.55, margin: 0 },
  journalSummary: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 16 },
  journalList: { display: "flex", flexDirection: "column", gap: 8 },
  journalRow: { display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 10, border: "1px solid #eef2f7", borderRadius: 10, padding: "10px 12px", background: "#fcfcfd" },
  journalSym: { fontSize: 13, fontWeight: 600, color: "#1f2937", textTransform: "capitalize" },
  journalMeta: { fontSize: 11.5, color: "#94a3b8", marginTop: 2 },
  journalActions: { display: "flex", alignItems: "center", gap: 8 },
  journalPnl: { fontSize: 16, fontWeight: 700, letterSpacing: "-0.01em" },
  journalNote: { fontSize: 12, color: "#cf9a3a", marginTop: 12, lineHeight: 1.5 },
  deleteBtn: { border: "none", background: "transparent", color: "#cbd5e1", fontSize: 14, cursor: "pointer", padding: "4px 6px", lineHeight: 1 },
  howBtn: { border: "1px solid #e2e8f0", borderRadius: 8, background: "#f8fafc", color: "#475569", fontSize: 12, fontWeight: 600, padding: "6px 12px", cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 },
  screener: { marginTop: 28, paddingTop: 22, borderTop: "1px solid #eef2f7" },
  chipGrid: { display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 },
  chip: { border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 12, fontWeight: 700, padding: "5px 10px", cursor: "pointer", letterSpacing: "0.02em" },
  screenerTable: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  screenerTh: { textAlign: "left", padding: "8px 10px", fontSize: 11.5, fontWeight: 700, borderBottom: "2px solid #eef2f7", whiteSpace: "nowrap", userSelect: "none" },
  screenerTd: { padding: "10px 10px", borderBottom: "1px solid #f1f5f9", verticalAlign: "middle", whiteSpace: "nowrap" },
  loadBtn: { border: "1px solid #d6deea", borderRadius: 7, background: "#f8fafc", color: "#1f2937", fontSize: 11, fontWeight: 700, padding: "4px 10px", cursor: "pointer" },
  tourOverlay: { position: "fixed", inset: 0, background: "rgba(15,23,42,0.6)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 },
  tourCard: { background: "#fff", borderRadius: 20, padding: "28px 28px 22px", maxWidth: 420, width: "100%", boxShadow: "0 24px 64px rgba(15,23,42,0.2)", textAlign: "center" },
  tourTag: { fontSize: 11, fontWeight: 700, color: "#94a3b8", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 10 },
  tourTitle: { fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", color: "#0f172a", marginBottom: 6 },
  tourSetup: { fontSize: 13, color: "#64748b", marginBottom: 16 },
  tourOutcome: { fontSize: 36, fontWeight: 800, letterSpacing: "-0.03em", borderRadius: 12, padding: "14px 0", marginBottom: 16 },
  tourBody: { fontSize: 14, color: "#475569", lineHeight: 1.65, marginBottom: 24, textAlign: "left" },
  tourActions: { display: "flex", gap: 10, justifyContent: "center", marginBottom: 18 },
  tourSkip: { border: "1px solid #e2e8f0", borderRadius: 10, background: "#fff", color: "#94a3b8", fontSize: 13, fontWeight: 600, padding: "10px 20px", cursor: "pointer" },
  tourNext: { border: "none", borderRadius: 10, background: "#1f2937", color: "#fff", fontSize: 13, fontWeight: 700, padding: "10px 28px", cursor: "pointer" },
  tourDots: { display: "flex", gap: 6, justifyContent: "center" },
  tourDot: { width: 6, height: 6, borderRadius: "50%", display: "inline-block" },
};
