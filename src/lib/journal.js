// Journal-entry math shared by Sarah's book (portfolio view) and Elena's
// report (weekly aggregation) — no UI, no React.

import { stratPnl } from "./pnl.js";

// Collateral / max-defined-risk for a logged entry. Uses the stored value
// when present (entries logged after this field was added) and reconstructs
// it for older entries. Returns null when risk is genuinely uncapped (a
// naked strangle) or unreconstructable (an old spread entry logged before
// its long leg was persisted) — callers must not treat null as zero.
export function entryCollateral(e) {
  if (e.collateral != null) return e.collateral;
  const shares = (e.contracts || 0) * 100;
  if (e.mode === "put") return e.putStrike * shares;
  if (e.mode === "covered") return e.putStrike * shares + e.spot * shares;
  if (e.mode === "spread" && e.longStrike != null) return Math.max(0, e.putStrike - e.longStrike) * shares;
  return null;
}

export function entryRiskNote(e) {
  if (entryCollateral(e) != null) return null;
  if (e.mode === "strangle") return "Naked strangle — no defined max loss.";
  if (e.mode === "spread") return "Long strike wasn't recorded on this older entry — can't reconstruct.";
  return "Risk not computable for this entry.";
}

// P&L if the underlying drops dropPct% from the short strike by expiration.
// Returns null wherever entryCollateral does, for the same reason — and also
// whenever the entry is missing a field stratPnl needs (e.g. putPrem), so a
// malformed entry renders as "—" rather than a misleading "$NaN".
export function entryBadWeekPnl(e, dropPct) {
  if (entryCollateral(e) == null) return null;
  const shares = (e.contracts || 0) * 100;
  const p = {
    mode: e.mode, putStrike: e.putStrike, putPrem: e.putPrem,
    longStrike: e.longStrike, longPrem: e.longPrem,
    callStrike: e.callStrike, callPrem: e.callPrem, spot: e.spot, shares,
  };
  const badPrice = e.putStrike * (1 - dropPct / 100);
  const pnl = stratPnl(badPrice, p);
  return Number.isFinite(pnl) ? pnl : null;
}

// Realized-performance summary for a set of closed journal entries — the
// shared shape behind both "this week" and each row of "previous weeks" in
// Elena's report. No win-rate, no streaks: wins and losses both, worst loss
// and average return on collateral always paired, never shown alone.
export function summarizeWeek(entries) {
  const wins = entries.filter((e) => e.realizedPnl >= 0);
  const losses = entries.filter((e) => e.realizedPnl < 0);
  const realized = entries.reduce((s, e) => s + e.realizedPnl, 0);
  const worst = losses.reduce((m, e) => Math.min(m, e.realizedPnl), 0);
  const withCollateral = entries.map((e) => ({ e, c: entryCollateral(e) })).filter((x) => x.c);
  const avgReturnPct = withCollateral.length
    ? (withCollateral.reduce((s, x) => s + x.e.realizedPnl / x.c, 0) / withCollateral.length) * 100
    : null;
  return { count: entries.length, wins, losses, realized, worst, avgReturnPct };
}
