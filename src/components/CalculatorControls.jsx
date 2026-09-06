import { money, money2, moneySigned, trimNum } from "../lib/format.js";
import { stratPnl } from "../lib/pnl.js";
import { COMPANIES, MODES, SNAPSHOT_DATE } from "../appConstants.js";
import { styles } from "../styles.js";

export function ModeToggle({ mode, onChange }) {
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

export function Field({ label, value, onChange, prefix, suffix }) {
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

export function CompanyPicker({ ticker, quote, onSelect, expiration, onExpirationChange, onFetchPremium, premQuote }) {
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

export function PremiumStatus({ premQuote }) {
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

export function QuoteStatus({ quote }) {
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

export function Dot({ color }) {
  return (
    <span
      style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: color, marginRight: 6, verticalAlign: "middle" }}
    />
  );
}

export function SizingHint({ mode, capital, perContractCash, maxContracts, contracts, dropPct, model, p, onApply }) {
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

