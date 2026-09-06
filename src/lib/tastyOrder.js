// Pure order-construction helpers for the tastytrade integration — no UI,
// no network. Kept separate so the order shape can be reasoned about (and
// tested) independent of the connect/confirm UI in components/Tastytrade.jsx.

import { round2 } from "./pnl.js";

export function toOccSymbol(ticker, expDate, type, strike) {
  const [y, m, d] = expDate.split("-");
  const root = ticker.replace(/\s/g, "").padEnd(6, " ");
  const cp = type === "put" ? "P" : "C";
  const strikePadded = Math.round(strike * 1000).toString().padStart(8, "0");
  return `${root}${y.slice(2)}${m}${d}${cp}${strikePadded}`;
}

export function buildTastyOrder({ mode, ticker, expiration, putStrike, putPrem, longStrike, longPrem, callStrike, callPrem, contracts }) {
  const qty = contracts || 1;
  const credit = mode === "spread"
    ? Math.max(0.01, round2((putPrem || 0) - (longPrem || 0)))
    : round2(putPrem || 0);

  const legs = [];
  if (mode === "spread" || mode === "put" || mode === "strangle" || mode === "covered") {
    legs.push({ "instrument-type": "Equity Option", "symbol": toOccSymbol(ticker, expiration, "put", putStrike), "quantity": qty, "action": "Sell to Open" });
  }
  if (mode === "spread") {
    legs.push({ "instrument-type": "Equity Option", "symbol": toOccSymbol(ticker, expiration, "put", longStrike), "quantity": qty, "action": "Buy to Open" });
  }
  if (mode === "strangle" || mode === "covered") {
    legs.push({ "instrument-type": "Equity Option", "symbol": toOccSymbol(ticker, expiration, "call", callStrike), "quantity": qty, "action": "Sell to Open" });
  }

  return { "order-type": "Limit", "price": credit.toFixed(2), "price-effect": "Credit", "time-in-force": "Day", legs };
}
