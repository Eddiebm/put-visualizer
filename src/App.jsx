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
  strike: 50, // put strike
  premium: 1.5, // put premium
  callStrike: 60,
  callPremium: 1.2,
  spot: 55, // share cost basis (covered mode)
  contracts: 2,
  dropPct: 20,
  capital: 25000,
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
// put:      short put only
// strangle: short put + short call, no stock (naked call → unbounded upside loss)
// covered:  long stock @ spot + short call (covered) + short put (cash-secured)
function stratPnl(S, p) {
  const putLeg = p.putPrem - Math.max(0, p.putStrike - S);
  if (p.mode === "put") return putLeg * p.shares;
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
        setInputs((s) => ({ ...s, premium: round2(d.premium) }));
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
  const twoSided = mode !== "put";
  const putStrike = num(inputs.strike);
  const putPrem = num(inputs.premium);
  const callStrike = num(inputs.callStrike);
  const callPrem = num(inputs.callPremium);
  const spot = num(inputs.spot);
  const contracts = Math.max(0, Math.round(num(inputs.contracts)));
  const dropPct = num(inputs.dropPct);
  const capital = num(inputs.capital);
  const shares = contracts * 100;

  // collateral: put always cash-secured; covered also buys the stock
  const perContractCash =
    putStrike * 100 + (mode === "covered" ? spot * 100 : 0);
  const maxContracts = perContractCash > 0 ? Math.floor(capital / perContractCash) : 0;

  const p = { mode, putStrike, putPrem, callStrike, callPrem, spot, shares };

  const model = useMemo(() => buildModel(p, dropPct), [
    mode,
    putStrike,
    putPrem,
    callStrike,
    callPrem,
    spot,
    shares,
    dropPct,
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
            label={twoSided ? "Put strike" : "Strike price"}
            prefix="$"
            value={inputs.strike}
            onChange={(v) => setInputs((s) => ({ ...s, strike: v }))}
          />
          <Field
            label="Put premium"
            prefix="$"
            value={inputs.premium}
            onChange={(v) => setInputs((s) => ({ ...s, premium: v }))}
          />
          {twoSided && (
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

        <Ticket
          mode={mode}
          ticker={ticker}
          expiration={expiration}
          putStrike={putStrike}
          putPrem={putPrem}
          callStrike={callStrike}
          callPrem={callPrem}
          contracts={contracts}
          collateral={model.collateral}
        />

        <section style={styles.stats}>
          <Stat label={mode === "covered" ? "Capital tied up" : "Collateral"} value={money(model.collateral)} tone="neutral" />
          <Stat label="Premium collected" value={money(model.credit)} tone="good" />
          <Stat label={model.breakevens.length > 1 ? "Breakevens" : "Breakeven"} value={model.breakevenLabel} tone="neutral" />
          <Stat label={model.worstLabel} value={model.worstValue} tone="bad" />
        </section>

        <Journal journal={journal} onLog={logTrade} onClose={closeTrade} onDelete={deleteTrade} />

        <footer style={styles.footer}>
          Inputs are saved on this device — close it and your last setup is still here. Not advice;
          the red is the part that matters.
        </footer>
      </div>
    </div>
  );
}

// ---------- model builder: one place, all modes ----------
function buildModel(p, dropPct) {
  const { mode, putStrike, callStrike, spot, shares } = p;
  const credit =
    (mode === "put" ? p.putPrem : p.putPrem + p.callPrem) * shares;

  const collateral =
    putStrike * 100 * (shares / 100) + (mode === "covered" ? spot * 100 * (shares / 100) : 0);

  // max gain (flat ceiling)
  let maxGain;
  if (mode === "put") maxGain = p.putPrem * shares;
  else if (mode === "strangle") maxGain = (p.putPrem + p.callPrem) * shares;
  else maxGain = (callStrike - spot + p.putPrem + p.callPrem) * shares;

  // scenario reference prices
  const move = dropPct / 100;
  const highAnchor = mode === "put" ? putStrike : callStrike;
  const center = mode === "put" ? putStrike : mode === "covered" ? spot : (putStrike + callStrike) / 2;
  const downPrice = putStrike * (1 - move);
  const upPrice = highAnchor * (1 + move);

  const downPnl = stratPnl(downPrice, p);
  const flatPnl = stratPnl(center, p);
  const upPnl = stratPnl(upPrice, p);

  const moveLbl = trimNum(dropPct);
  const scenarios = [
    {
      key: "down",
      title: "If it goes down",
      sub: `−${moveLbl}% → ${money2(downPrice)}`,
      pnl: downPnl,
      note:
        mode === "covered"
          ? "You lose on the shares AND get assigned on the put — double the downside."
          : "Assigned below breakeven. The loss has real room to run — the side the videos skip.",
    },
    {
      key: "flat",
      title: "If it stays flat",
      sub: mode === "put" ? "unchanged" : mode === "covered" ? `at ${money2(spot)}` : "between strikes",
      pnl: flatPnl,
      note:
        mode === "put"
          ? "Put expires worthless — you keep the full premium."
          : "Both options expire worthless — you keep both premiums. The sweet spot.",
    },
    {
      key: "up",
      title: "If it goes up",
      sub: `+${moveLbl}% → ${money2(upPrice)}`,
      pnl: upPnl,
      note:
        mode === "put"
          ? "Put expires worthless — you keep the premium, and only the premium, however high it climbs."
          : mode === "strangle"
          ? "The naked call bites. This loss keeps growing the higher it goes — no ceiling."
          : "Shares called away at the call strike. Gains are capped here — you don't lose, but you give up the upside.",
    },
  ];

  // sample the curve
  let xMin, xMax;
  if (mode === "put") {
    xMin = Math.min(downPrice, putStrike * 0.7);
    xMax = putStrike * 1.15;
  } else {
    xMin = Math.min(downPrice, putStrike * 0.6);
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
  const breakevenLabel = breakevens.length
    ? breakevens.map((b) => money2(b)).join(" / ")
    : "—";

  // markers + dots for the chart
  const markers = [{ x: putStrike, label: `put ${money2(putStrike)}` }];
  if (mode !== "put") markers.push({ x: callStrike, label: `call ${money2(callStrike)}` });

  const dots = [{ x: downPrice, y: downPnl }];
  if (mode !== "put") dots.push({ x: upPrice, y: upPnl });

  // worst modeled loss for the stat strip
  let worstLabel, worstValue;
  if (mode === "strangle") {
    worstLabel = `Loss if +${moveLbl}% (and rising)`;
    worstValue = money(upPnl);
  } else {
    worstLabel = `Loss on a ${moveLbl}% drop`;
    worstValue = money(downPnl);
  }

  return {
    mode,
    credit,
    collateral,
    maxGain,
    samples,
    xMin,
    xMax,
    markers,
    dots,
    scenarios,
    breakevens,
    breakevenLabel,
    worstLabel,
    worstValue,
    downPnl,
    upPnl,
  };
}

function Chart({ model }) {
  const W = 720;
  const H = 380;
  const pad = { top: 44, right: 44, bottom: 56, left: 44 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;
  const { samples, xMin, xMax, maxGain, markers, dots } = model;

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

  const areaPts = [`${xToPx(xMin).toFixed(1)},${zeroY.toFixed(1)}`];
  for (const [x, y] of samples) areaPts.push(`${xToPx(x).toFixed(1)},${yToPx(Math.min(0, y)).toFixed(1)}`);
  areaPts.push(`${xToPx(xMax).toFixed(1)},${zeroY.toFixed(1)}`);

  const ceilingY = yToPx(maxGain);

  return (
    <div style={styles.chartWrap}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Profit and loss curve">
        <line x1={pad.left} y1={zeroY} x2={W - pad.right} y2={zeroY} stroke="#e9edf3" strokeWidth="1" />

        <polygon points={areaPts.join(" ")} fill="rgba(225,76,76,0.06)" />

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

  const used = maxContracts * perContractCash;
  const leftover = capital - used;
  const atMax = contracts === maxContracts && maxContracts > 0;

  if (maxContracts < 1) {
    return (
      <div style={styles.sizing}>
        {money(capital)} isn't enough for even one contract — that needs {money(perContractCash)}.{" "}
        {mode === "covered" ? "Lower the strike, or you're short the share cost." : "Lower the strike or add cash."}
      </div>
    );
  }

  // loss at max size, on the dangerous side for this mode
  const big = { ...p, shares: maxContracts * 100 };
  const lossRef =
    mode === "strangle"
      ? stratPnl(model.dots[1]?.x ?? p.callStrike * (1 + dropPct / 100), big)
      : stratPnl(p.putStrike * (1 - dropPct / 100), big);

  return (
    <div style={styles.sizing}>
      <span>
        Your {money(capital)} {mode === "covered" ? "funds" : "secures"}{" "}
        <b>
          {maxContracts} contract{maxContracts === 1 ? "" : "s"}
        </b>{" "}
        ({money(used)} tied up, {money(leftover)} left). At that size a {trimNum(dropPct)}% adverse move loses{" "}
        <b style={{ color: "#e14c4c" }}>{money(lossRef)}</b>
        {mode === "strangle" ? " — and climbs with no ceiling if it keeps running." : " — sizing up multiplies the loss as much as the premium."}
      </span>
      {!atMax && (
        <button type="button" onClick={() => onApply(maxContracts)} style={styles.sizingBtn}>
          Use max ({maxContracts})
        </button>
      )}
    </div>
  );
}

function Ticket({ mode, ticker, expiration, putStrike, putPrem, callStrike, callPrem, contracts, collateral }) {
  const [copied, setCopied] = useState(false);
  const sym = ticker || "[symbol]";
  const qty = contracts || 1;
  const exp = formatExp(expiration);

  const legs = [`Sell to Open · ${qty} ${sym} ${exp} ${money2(putStrike)} Put · Limit ${money2(putPrem)} · Day`];
  if (mode !== "put") legs.push(`Sell to Open · ${qty} ${sym} ${exp} ${money2(callStrike)} Call · Limit ${money2(callPrem)} · Day`);
  const order = legs.join("\n");

  const tag =
    mode === "put"
      ? "cash-secured put"
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
          <b>Action:</b> Sell to Open every leg — you're opening short options, not buying
        </li>
        <li>
          <b>Order type:</b> Limit at each premium, never market{mode !== "put" ? " — many brokers let you send both legs as one order" : ""}
        </li>
        <li>
          {mode === "put" && <><b>Cash-secured:</b> keep {money(collateral)} in cash for assignment</>}
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
        return (
          <div
            key={c.key}
            style={{
              ...styles.scenarioCard,
              borderColor: isLoss ? "#f2d4d4" : "#d4ead9",
              background: isLoss ? "#fdf6f6" : "#f6fbf8",
            }}
          >
            <div style={styles.scenarioTitle}>{c.title}</div>
            <div style={styles.scenarioSub}>{c.sub}</div>
            <div style={{ ...styles.scenarioPnl, color: isLoss ? "#e14c4c" : "#3aa56b" }}>{moneySigned(c.pnl)}</div>
            <div style={styles.scenarioNote}>{c.note}</div>
          </div>
        );
      })}
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

function Stat({ label, value, tone }) {
  const color = tone === "good" ? "#16a34a" : tone === "bad" ? "#ef4444" : "#0f172a";
  return (
    <div style={styles.stat}>
      <div style={styles.statLabel}>{label}</div>
      <div style={{ ...styles.statValue, color }}>{value}</div>
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
