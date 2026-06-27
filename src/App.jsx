import React, { useMemo, useState, useEffect, useRef } from "react";

const STORAGE_KEY = "csp_visualizer_inputs_v1";

// Bundled snapshot prices — used instantly on selection and as the offline
// fallback when the live /api/quote endpoint is unreachable. Editable; the UI
// labels these clearly as approximate so they're never mistaken for live data.
const SNAPSHOT_DATE = "Jun 2026";
const COMPANIES = [
  { ticker: "AAPL", name: "Apple", price: 214 },
  { ticker: "MSFT", name: "Microsoft", price: 462 },
  { ticker: "NVDA", name: "NVIDIA", price: 131 },
  { ticker: "AMZN", name: "Amazon", price: 201 },
  { ticker: "GOOGL", name: "Alphabet", price: 178 },
  { ticker: "META", name: "Meta", price: 503 },
  { ticker: "TSLA", name: "Tesla", price: 248 },
  { ticker: "AMD", name: "AMD", price: 162 },
  { ticker: "INTC", name: "Intel", price: 31 },
  { ticker: "JPM", name: "JPMorgan", price: 205 },
  { ticker: "BAC", name: "Bank of America", price: 40 },
  { ticker: "DIS", name: "Disney", price: 101 },
  { ticker: "KO", name: "Coca-Cola", price: 63 },
  { ticker: "PFE", name: "Pfizer", price: 28 },
  { ticker: "F", name: "Ford", price: 12 },
  { ticker: "PLTR", name: "Palantir", price: 25 },
  { ticker: "SOFI", name: "SoFi", price: 7 },
  { ticker: "T", name: "AT&T", price: 19 },
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
  const appliedRef = useRef(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(inputs));
    } catch {
      /* ignore quota / private-mode errors */
    }
  }, [inputs]);

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

  return (
    <div style={styles.page}>
      <style>{keyframes}</style>
      <div style={styles.shell}>
        <header style={styles.header}>
          <h1 style={styles.h1}>Options Income — Honest P&L</h1>
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
};
