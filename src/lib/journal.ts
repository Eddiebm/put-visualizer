// Journal-entry math shared by Sarah's book (portfolio view) and Elena's
// report (weekly aggregation) — no UI, no React.

import { stratPnl } from "./pnl";
import type { JournalEntry, Mode, StrategyParams, WeekSummary } from "../types";

// Collateral / max-defined-risk for a logged entry. Uses the stored value
// when present (entries logged after this field was added) and reconstructs
// it for older entries. Returns null when risk is genuinely uncapped (a
// naked strangle) or unreconstructable (an old spread entry logged before
// its long leg was persisted) — callers must not treat null as zero.
// Takes Partial<JournalEntry> deliberately: this function's whole job is
// tolerating incomplete/legacy entries, not just full ones.
export function entryCollateral(e: Partial<JournalEntry>): number | null {
  if (e.collateral != null) return e.collateral;
  const shares = (e.contracts || 0) * 100;
  if (e.mode === "put") return (e.putStrike as number) * shares;
  if (e.mode === "covered") return (e.putStrike as number) * shares + (e.spot ?? 0) * shares;
  if (e.mode === "spread" && e.longStrike != null) return Math.max(0, (e.putStrike as number) - e.longStrike) * shares;
  return null;
}

export function entryRiskNote(e: Partial<JournalEntry>): string | null {
  if (entryCollateral(e) != null) return null;
  if (e.mode === "strangle") return "Naked strangle — no defined max loss.";
  if (e.mode === "spread") return "Long strike wasn't recorded on this older entry — can't reconstruct.";
  return "Risk not computable for this entry.";
}

// P&L if the underlying drops dropPct% from the short strike by expiration.
// Returns null wherever entryCollateral does, for the same reason — and also
// whenever the entry is missing a field stratPnl needs (e.g. putPrem), so a
// malformed entry renders as "—" rather than a misleading "$NaN".
export function entryBadWeekPnl(e: Partial<JournalEntry>, dropPct: number): number | null {
  if (entryCollateral(e) == null) return null;
  const shares = (e.contracts || 0) * 100;
  const p: StrategyParams = {
    mode: e.mode as Mode, putStrike: e.putStrike as number, putPrem: e.putPrem as number,
    longStrike: e.longStrike, longPrem: e.longPrem,
    callStrike: e.callStrike, callPrem: e.callPrem, spot: e.spot, shares,
  };
  const badPrice = (e.putStrike as number) * (1 - dropPct / 100);
  const pnl = stratPnl(badPrice, p);
  return Number.isFinite(pnl) ? pnl : null;
}

// Realized-performance summary for a set of closed journal entries — the
// shared shape behind both "this week" and each row of "previous weeks" in
// Elena's report. No win-rate, no streaks: wins and losses both, worst loss
// and average return on collateral always paired, never shown alone.
export function summarizeWeek(entries: Partial<JournalEntry>[]): WeekSummary {
  const wins = entries.filter((e) => (e.realizedPnl ?? 0) >= 0);
  const losses = entries.filter((e) => (e.realizedPnl ?? 0) < 0);
  const realized = entries.reduce((s, e) => s + (e.realizedPnl ?? 0), 0);
  const worst = losses.reduce((m, e) => Math.min(m, e.realizedPnl ?? 0), 0);
  const withCollateral = entries
    .map((e) => ({ e, c: entryCollateral(e) }))
    .filter((x): x is { e: Partial<JournalEntry>; c: number } => x.c != null);
  const avgReturnPct = withCollateral.length
    ? (withCollateral.reduce((s, x) => s + (x.e.realizedPnl ?? 0) / x.c, 0) / withCollateral.length) * 100
    : null;
  return { count: entries.length, wins: wins as JournalEntry[], losses: losses as JournalEntry[], realized, worst, avgReturnPct };
}
