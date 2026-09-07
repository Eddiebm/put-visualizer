// Pure order-construction helpers for the tastytrade integration — no UI,
// no network. Kept separate so the order shape can be reasoned about (and
// tested) independent of the connect/confirm UI in components/Tastytrade.jsx.

import { round2 } from "./pnl";
import type { Mode, TastyLeg, TastyOrderPayload } from "../types";

export function toOccSymbol(ticker: string, expDate: string, type: "put" | "call", strike: number): string {
  const [y, m, d] = expDate.split("-");
  const root = ticker.replace(/\s/g, "").padEnd(6, " ");
  const cp = type === "put" ? "P" : "C";
  const strikePadded = Math.round(strike * 1000).toString().padStart(8, "0");
  return `${root}${y.slice(2)}${m}${d}${cp}${strikePadded}`;
}

interface BuildTastyOrderInput {
  mode: Mode;
  ticker: string;
  expiration: string;
  putStrike: number;
  putPrem?: number;
  longStrike?: number;
  longPrem?: number;
  callStrike?: number;
  callPrem?: number;
  contracts?: number;
}

export function buildTastyOrder({ mode, ticker, expiration, putStrike, putPrem, longStrike, longPrem, callStrike, callPrem, contracts }: BuildTastyOrderInput): TastyOrderPayload {
  const qty = contracts || 1;
  // Must match buildModel()'s credit formula in pnl.ts: a strangle/covered
  // order sells BOTH the put and call leg (see the legs below), so the
  // limit price has to reflect both premiums — round2(putPrem) alone
  // silently discarded the call's premium here, submitting a real order at
  // a fraction of its actual credit.
  const credit = mode === "spread"
    ? Math.max(0.01, round2((putPrem || 0) - (longPrem || 0)))
    : mode === "strangle" || mode === "covered"
    ? round2((putPrem || 0) + (callPrem || 0))
    : round2(putPrem || 0);

  const legs: TastyLeg[] = [];
  if (mode === "spread" || mode === "put" || mode === "strangle" || mode === "covered") {
    legs.push({ "instrument-type": "Equity Option", "symbol": toOccSymbol(ticker, expiration, "put", putStrike), "quantity": qty, "action": "Sell to Open" });
  }
  if (mode === "spread") {
    legs.push({ "instrument-type": "Equity Option", "symbol": toOccSymbol(ticker, expiration, "put", longStrike ?? 0), "quantity": qty, "action": "Buy to Open" });
  }
  if (mode === "strangle" || mode === "covered") {
    legs.push({ "instrument-type": "Equity Option", "symbol": toOccSymbol(ticker, expiration, "call", callStrike ?? 0), "quantity": qty, "action": "Sell to Open" });
  }

  return { "order-type": "Limit", "price": credit.toFixed(2), "price-effect": "Credit", "time-in-force": "Day", legs };
}
