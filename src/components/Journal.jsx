import { useState, useEffect } from "react";
import { money, money2, moneySigned } from "../lib/format.js";
import { legLabel } from "../lib/pnl.js";
import { styles } from "../styles.js";
import { Stat } from "./shared.jsx";

export function Journal({ journal, onLog, onClose, onDelete }) {
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

export function JournalRow({ e, onClose, onDelete }) {
  const [px, setPx] = useState("");
  const [currentPrice, setCurrentPrice] = useState(null);
  const [currentOptionPrice, setCurrentOptionPrice] = useState(null);
  const open = e.status === "open";
  const loss = e.status === "closed" && e.realizedPnl < 0;

  useEffect(() => {
    if (!open || !e.ticker) return;
    fetch(`/api/quote?symbol=${encodeURIComponent(e.ticker)}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.price > 0) setCurrentPrice(d.price); })
      .catch(() => {});
    // Fetch live option price for P&L monitoring
    if (e.putStrike && e.expiration) {
      fetch(`/api/option?symbol=${encodeURIComponent(e.ticker)}&expiration=${e.expiration}&strike=${e.putStrike}`)
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d?.available && d.premium > 0) setCurrentOptionPrice(d.premium); })
        .catch(() => {});
    }
  }, [open, e.ticker, e.putStrike, e.expiration]);

  const stopLossAt = e.credit * 2; // close if loss exceeds 2× what was collected
  const unrealizedPnl = currentOptionPrice != null && e.putPrem > 0 && e.contracts > 0
    ? e.credit - (currentOptionPrice * 100 * e.contracts)
    : null;
  const stopLossHit = unrealizedPnl != null && unrealizedPnl < -stopLossAt;
  const stopLossWarning = unrealizedPnl != null && unrealizedPnl < -(stopLossAt * 0.7) && !stopLossHit;

  function monitorStatus() {
    if (!currentPrice || !e.putStrike) return null;
    const strike = e.putStrike;
    const pctAbove = (currentPrice - strike) / strike;
    if (pctAbove >= 0.15) return { text: "Nothing to do — well above your strike", color: "#16a34a", bg: "#f0fdf4" };
    if (pctAbove >= 0.07) return { text: "Healthy — worth a weekly check", color: "#22c55e", bg: "#f7fdf9" };
    if (pctAbove >= 0.03) return { text: "Watch closely — getting near your zone", color: "#d97706", bg: "#fffbeb" };
    if (pctAbove >= 0)    return { text: "Near risk zone — consider closing now", color: "#f97316", bg: "#fff7ed" };
    return { text: "Below your strike — exit immediately", color: "#e14c4c", bg: "#fff5f5" };
  }

  const status = open ? monitorStatus() : null;

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
        {stopLossHit && (
          <div style={{
            marginTop: 6, fontSize: 12, fontWeight: 700,
            color: "#fff", background: "#e14c4c",
            borderRadius: 6, padding: "6px 10px", display: "inline-block",
          }}>
            🚨 Stop-loss hit — close this trade now
            <span style={{ fontWeight: 400, marginLeft: 6, opacity: 0.9 }}>
              Loss has reached {money(Math.abs(unrealizedPnl ?? 0))} (limit: {money(stopLossAt)})
            </span>
          </div>
        )}
        {stopLossWarning && !stopLossHit && (
          <div style={{
            marginTop: 6, fontSize: 12, fontWeight: 600,
            color: "#92400e", background: "#fffbeb",
            borderRadius: 6, padding: "5px 9px", display: "inline-block",
          }}>
            ⚠ Approaching stop-loss — loss is {money(Math.abs(unrealizedPnl ?? 0))} (limit: {money(stopLossAt)})
          </div>
        )}
        {!stopLossHit && !stopLossWarning && open && (
          <div style={{ marginTop: 4, fontSize: 11, color: "#94a3b8" }}>
            Stop-loss rule: close if loss exceeds {money(stopLossAt)}
            {unrealizedPnl != null && (
              <span style={{ marginLeft: 8, color: unrealizedPnl >= 0 ? "#16a34a" : "#f97316" }}>
                · current P&L: {unrealizedPnl >= 0 ? "+" : ""}{money(unrealizedPnl)}
              </span>
            )}
          </div>
        )}
        {status && (
          <div style={{
            marginTop: 6, fontSize: 12, fontWeight: 600,
            color: status.color, background: status.bg,
            borderRadius: 6, padding: "4px 8px", display: "inline-block",
          }}>
            {status.text}
            {currentPrice && <span style={{ fontWeight: 400, marginLeft: 6, color: "#64748b" }}>({e.ticker} at {money2(currentPrice)})</span>}
          </div>
        )}
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

