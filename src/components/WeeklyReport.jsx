import { money, moneySigned } from "../lib/format.js";
import { today, weekStartIso, weekLabel } from "../lib/dates.js";
import { summarizeWeek } from "../lib/journal.js";
import { styles } from "../styles.js";
import { Stat } from "./shared.jsx";

// ─── Elena's report — realized performance, grouped by week ──────────────
// No streaks, no confetti, no leading with win rate. Losses are shown with
// exactly the same weight as gains, same as the journal they're drawn from.

export function WeeklyReport({ journal }) {
  const closed = journal.filter((e) => e.status === "closed" && /^\d{4}-\d{2}-\d{2}$/.test(e.closedAt || ""));

  if (closed.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "48px 24px", background: "#f8fafc", borderRadius: 16, border: "1.5px solid #e2e8f0" }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>📈</div>
        <div style={{ fontWeight: 700, fontSize: 16, color: "#0f172a", marginBottom: 6 }}>Nothing closed yet</div>
        <div style={{ fontSize: 13, color: "#94a3b8", maxWidth: 340, margin: "0 auto" }}>
          Close a trade in the journal and this report starts building — wins and losses both, week by week.
        </div>
      </div>
    );
  }

  const weeks = {};
  for (const e of closed) {
    const wk = weekStartIso(e.closedAt);
    (weeks[wk] ??= []).push(e);
  }
  const weekKeys = Object.keys(weeks).sort((a, b) => b.localeCompare(a));
  const thisWeekKey = weekStartIso(today());
  const current = weeks[thisWeekKey] ? summarizeWeek(weeks[thisWeekKey]) : null;
  const priorKeys = weekKeys.filter((k) => k !== thisWeekKey);

  return (
    <div style={{ paddingTop: 8 }}>
      <div style={{ fontWeight: 700, fontSize: 17, color: "#0f172a", marginBottom: 4 }}>📈 Elena's report</div>
      <div style={{ fontSize: 13, color: "#64748b", marginBottom: 18 }}>
        Realized trades, grouped by the week they closed — losses included and never netted away.
      </div>

      <div style={{ marginBottom: 26 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 10 }}>
          This week — {weekLabel(thisWeekKey)}
        </div>
        {current ? (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
              <Stat label="Realized P&L" value={moneySigned(current.realized)} tone={current.realized < 0 ? "bad" : "good"} big />
              <Stat label={`Wins (${current.wins.length})`} value={moneySigned(current.wins.reduce((s, e) => s + e.realizedPnl, 0))} tone="good" />
              <Stat label={`Losses (${current.losses.length})`} value={moneySigned(current.losses.reduce((s, e) => s + e.realizedPnl, 0))} tone="bad" />
              <Stat label="Worst single loss" value={current.losses.length ? money(current.worst) : "—"} tone="bad" />
              <Stat label="Avg. return on collateral" value={current.avgReturnPct != null ? `${current.avgReturnPct.toFixed(1)}%` : "n/a"} />
            </div>
            {current.losses.length === 0 && (
              <p style={styles.journalNote}>No losses this week — keep logging the bad weeks too when they come.</p>
            )}
          </>
        ) : (
          <p style={{ fontSize: 13, color: "#94a3b8" }}>Nothing closed yet this week.</p>
        )}
      </div>

      {priorKeys.length > 0 && (
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 10 }}>
            Previous weeks
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={styles.screenerTable}>
              <thead>
                <tr>
                  {["Week", "Trades", "Realized P&L", "Wins", "Losses", "Worst loss", "Avg. return on collateral"].map((h) => (
                    <th key={h} style={styles.screenerTh}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {priorKeys.slice(0, 12).map((k, i) => {
                  const s = summarizeWeek(weeks[k]);
                  return (
                    <tr key={k} style={{ background: i % 2 === 0 ? "#fff" : "#f8fafc" }}>
                      <td style={styles.screenerTd}>{weekLabel(k)}</td>
                      <td style={styles.screenerTd}>{s.count}</td>
                      <td style={{ ...styles.screenerTd, fontWeight: 700, color: s.realized < 0 ? "#e14c4c" : "#16a34a" }}>{moneySigned(s.realized)}</td>
                      <td style={{ ...styles.screenerTd, color: "#16a34a" }}>{s.wins.length}</td>
                      <td style={{ ...styles.screenerTd, color: "#e14c4c" }}>{s.losses.length}</td>
                      <td style={{ ...styles.screenerTd, color: s.losses.length ? "#e14c4c" : "#cbd5e1" }}>{s.losses.length ? money(s.worst) : "—"}</td>
                      <td style={styles.screenerTd}>{s.avgReturnPct != null ? `${s.avgReturnPct.toFixed(1)}%` : "n/a"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

