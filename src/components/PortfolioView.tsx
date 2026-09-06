import { useState, useEffect, useMemo } from "react";
import { money, moneySigned, trimNum } from "../lib/format";
import { legLabel } from "../lib/pnl";
import { entryCollateral, entryRiskNote, entryBadWeekPnl } from "../lib/journal";
import { entryDaysTo } from "../lib/dates";
import { styles } from "../styles";
import { Stat } from "./shared";
import type { JournalEntry } from "../types";

// ─── Sarah's book — cross-position portfolio view ─────────────────────────
// The one thing the calculator and per-trade journal don't show on their
// own: everything open, added up, checked the same way each day.

interface EarningsInfo {
  available: boolean;
  hasEarnings?: boolean;
  date?: string | null;
}

interface PortfolioViewProps {
  journal: JournalEntry[];
  dropPct: number;
  onOpenJournal: () => void;
}

export function PortfolioView({ journal, dropPct, onOpenJournal }: PortfolioViewProps) {
  const open = useMemo(() => journal.filter((e) => e.status === "open"), [journal]);
  const [earningsMap, setEarningsMap] = useState<Record<string, EarningsInfo>>({});

  useEffect(() => {
    if (open.length === 0) { setEarningsMap({}); return; }
    const pairs = [...new Set(
      open
        .filter((e) => e.ticker && e.ticker !== "—" && /^\d{4}-\d{2}-\d{2}$/.test(e.expiration || ""))
        .map((e) => `${e.ticker}|${e.expiration}`)
    )];
    let cancelled = false;
    Promise.all(
      pairs.map((key) => {
        const [sym, exp] = key.split("|");
        return fetch(`/api/earnings?symbol=${sym}&expiration=${exp}`)
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null)
          .then((d) => [key, d] as [string, EarningsInfo | null]);
      })
    ).then((entries) => {
      if (cancelled) return;
      const map: Record<string, EarningsInfo> = {};
      entries.forEach(([key, d]) => { if (d?.available) map[key] = d; });
      setEarningsMap(map);
    });
    return () => { cancelled = true; };
  }, [open]);

  if (open.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "48px 24px", background: "#f8fafc", borderRadius: 16, border: "1.5px solid #e2e8f0" }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>📋</div>
        <div style={{ fontWeight: 700, fontSize: 16, color: "#0f172a", marginBottom: 6 }}>No open positions</div>
        <div style={{ fontSize: 13, color: "#94a3b8", maxWidth: 340, margin: "0 auto" }}>
          Log a trade from the Calculator tab and it shows up here — the cross-position view to check before the close each day.
        </div>
      </div>
    );
  }

  const rows = open.map((e) => ({
    e,
    collateral: entryCollateral(e),
    badWeekPnl: entryBadWeekPnl(e, dropPct),
    riskNote: entryRiskNote(e),
    dte: entryDaysTo(e.expiration),
    earn: earningsMap[`${e.ticker}|${e.expiration}`],
  }));

  const defined = rows.filter((r) => r.collateral != null);
  const totalCollateral = defined.reduce((s, r) => s + (r.collateral ?? 0), 0);
  const totalBadWeek = defined.reduce((s, r) => s + (r.badWeekPnl ?? 0), 0);
  const uncappedCount = rows.length - defined.length;
  const earningsRiskCount = rows.filter((r) => r.earn?.hasEarnings).length;
  const soonest = rows.reduce<number | null>((m, r) => (r.dte != null && (m == null || r.dte < m) ? r.dte : m), null);

  return (
    <div style={{ paddingTop: 8 }}>
      <div style={{ fontWeight: 700, fontSize: 17, color: "#0f172a", marginBottom: 4 }}>📋 Sarah's book</div>
      <div style={{ fontSize: 13, color: "#64748b", marginBottom: 18 }}>
        Every open position, added up — collateral locked, worst-week exposure, and what's coming due.
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 20 }}>
        <Stat label="Open positions" value={rows.length} />
        <Stat label="Collateral locked" value={money(totalCollateral)} />
        <Stat label={`Bad-week loss (−${trimNum(dropPct)}%)`} value={moneySigned(totalBadWeek)} tone={totalBadWeek < 0 ? "bad" : undefined} big />
        <Stat label="Soonest expiration" value={soonest != null ? (soonest <= 0 ? "past due" : `${soonest}d`) : "—"} tone={soonest != null && soonest <= 3 ? "bad" : undefined} />
      </div>

      {uncappedCount > 0 && (
        <div style={{ ...styles.warnBar, marginBottom: 16 }}>
          {uncappedCount} position{uncappedCount !== 1 ? "s" : ""} {uncappedCount !== 1 ? "carry" : "carries"} undefined or uncapped risk and {uncappedCount !== 1 ? "are" : "is"} left out of the totals above — see the notes in the table below. Don't read the totals as "everything."
        </div>
      )}
      {earningsRiskCount > 0 && (
        <div style={{ ...styles.warnBar, marginBottom: 16, background: "#fff5f5", borderColor: "#fecaca", color: "#991b1b" }}>
          {earningsRiskCount} position{earningsRiskCount !== 1 ? "s" : ""} {earningsRiskCount !== 1 ? "have" : "has"} earnings before expiration — a gap risk a stop-loss can't protect against.
        </div>
      )}

      <div style={{ overflowX: "auto" }}>
        <table style={styles.screenerTable}>
          <thead>
            <tr>
              {["Position", "Expiration", "DTE", "Collateral", `−${trimNum(dropPct)}% scenario`, "Earnings"].map((h) => (
                <th key={h} style={styles.screenerTh}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ e, collateral, badWeekPnl, riskNote, dte, earn }, i) => (
              <tr key={e.id} style={{ background: i % 2 === 0 ? "#fff" : "#f8fafc" }}>
                <td style={styles.screenerTd}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{e.ticker} · {e.mode} · {legLabel(e)} ×{e.contracts}</div>
                  <div style={{ fontSize: 11, color: "#94a3b8" }}>opened {e.openedAt}</div>
                </td>
                <td style={styles.screenerTd}>{e.expiration}</td>
                <td style={{ ...styles.screenerTd, fontWeight: 700, color: dte == null ? "#cbd5e1" : dte <= 0 ? "#e14c4c" : dte <= 3 ? "#d97706" : "#0f172a" }}>
                  {dte == null ? "—" : dte <= 0 ? "past due" : `${dte}d`}
                </td>
                <td style={{ ...styles.screenerTd, whiteSpace: collateral != null ? "nowrap" : "normal", maxWidth: collateral != null ? undefined : 220 }}>
                  {collateral != null ? money(collateral) : <span style={{ color: "#e14c4c", fontSize: 11.5 }}>{riskNote}</span>}
                </td>
                <td style={{ ...styles.screenerTd, fontWeight: 700, color: badWeekPnl == null ? "#cbd5e1" : badWeekPnl < 0 ? "#e14c4c" : "#16a34a" }}>
                  {badWeekPnl != null ? moneySigned(badWeekPnl) : "—"}
                </td>
                <td style={styles.screenerTd}>
                  {earn?.hasEarnings
                    ? <span style={{ color: "#e14c4c", fontWeight: 700, fontSize: 12 }}>⚠ {earn.date || "before exp."}</span>
                    : earn ? <span style={{ color: "#94a3b8", fontSize: 12 }}>clear</span> : <span style={{ color: "#cbd5e1", fontSize: 12 }}>checking…</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p style={{ fontSize: 11.5, color: "#94a3b8", lineHeight: 1.5, margin: "14px 0 0" }}>
        The bad-week scenario uses the same −{trimNum(dropPct)}% set in the Calculator tab. To close or update a position, use{" "}
        <button type="button" onClick={onOpenJournal} style={{ background: "none", border: "none", color: "#1f2937", textDecoration: "underline", cursor: "pointer", padding: 0, font: "inherit" }}>
          the journal in the Calculator tab
        </button>.
      </p>
    </div>
  );
}
