import { useState } from "react";
import { money, money2, formatExp } from "../lib/format.js";
import { styles } from "../styles.js";

export function Ticket({ mode, ticker, expiration, putStrike, putPrem, longStrike, longPrem, callStrike, callPrem, contracts, collateral, tastyConnected, onPlaceOrder }) {
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
      const credit = mode === "spread" ? ((putPrem || 0) - (longPrem || 0)) : (putPrem || 0);
      const maxGain = Math.round(credit * 100 * qty);
      const maxLossAmt = mode === "spread"
        ? Math.round(((putStrike || 0) - (longStrike || 0) - credit) * 100 * qty)
        : null;
      const lines = [
        "─── TRADE ORDER ───────────────────────────",
        ...legs,
        "",
        `Net credit:  ${money2(credit)}/share = ${money(maxGain)} collected`,
        maxLossAmt != null ? `Max loss:    ${money(maxLossAmt)} (worst case, spread expires at max loss)` : null,
        `Collateral:  ${money(collateral)} held by broker`,
        `Expiration:  ${exp}`,
        "",
        `(${tag})`,
        "────────────────────────────────────────────",
      ].filter(Boolean).join("\n");
      navigator.clipboard?.writeText(lines);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked — text is on screen */
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

      {(() => {
        const credit = mode === "spread" ? ((putPrem || 0) - (longPrem || 0)) : (putPrem || 0);
        const maxGain = Math.round(credit * 100 * (contracts || 1));
        const stopLoss = maxGain * 2;
        return (
          <div style={{
            marginTop: 14, background: "#fafafa", border: "1px solid #e2e8f0",
            borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#475569",
          }}>
            <b style={{ color: "#0f172a" }}>Stop-loss rule:</b> close this trade if your loss reaches{" "}
            <b style={{ color: "#e14c4c" }}>{money(stopLoss)}</b>
            {" "}(2× the {money(maxGain)} you collect today). Don't let a bad week turn into a catastrophe.
          </div>
        );
      })()}

      {tastyConnected ? (
        <button
          type="button"
          onClick={onPlaceOrder}
          style={{
            marginTop: 10, width: "100%", padding: "13px 0",
            background: "#16a34a", color: "#fff", border: "none",
            borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: "pointer",
            letterSpacing: "0.01em",
          }}
        >
          Place Order in Tastytrade →
        </button>
      ) : (
        <div style={{ marginTop: 14, fontSize: 12, color: "#64748b", textAlign: "center" }}>
          Connect Tastytrade (bottom-right) to place this order in one click
        </div>
      )}
    </section>
  );
}

