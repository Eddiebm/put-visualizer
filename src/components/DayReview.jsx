import { money, moneySigned } from "../lib/format.js";
import { today } from "../lib/dates.js";

// ─── Day Review ───────────────────────────────────────────────────────────────

export function DayReview({ journal, scanStats, capital }) {
  const todayStr = today(); // openedAt/closedAt are stored as ISO (see today()) — must match here
  const todayTrades = journal.filter(e => e.openedAt === todayStr);
  const todayClosed = todayTrades.filter(e => e.status === "closed");
  const todayOpen = todayTrades.filter(e => e.status === "open");
  const todayWins = todayClosed.filter(e => e.realizedPnl >= 0);
  const todayPnl = todayClosed.reduce((s, e) => s + e.realizedPnl, 0);

  const { totalScanned = 0, qualified = 0, condition } = scanStats;

  // Discipline score
  let disciplineScore = 100;
  let disciplineNote = "";
  const maxSuggestedTrades = Math.min(qualified, 3);

  if (condition?.label?.includes("No edge") && todayTrades.length > 0) {
    disciplineScore = 30;
    disciplineNote = "You traded when conditions were red. The system said to wait.";
  } else if (todayTrades.length === 0 && condition?.label?.includes("Good")) {
    disciplineScore = 85;
    disciplineNote = "You passed on a green day. Caution is valid — but good setups don't always come back.";
  } else if (todayTrades.length === 0) {
    disciplineScore = 100;
    disciplineNote = "You sat out. Cash is a position. When conditions aren't right, not trading IS the right trade.";
  } else if (todayTrades.length <= maxSuggestedTrades) {
    disciplineScore = 100;
    disciplineNote = "You stayed within the system's recommendations. That's the discipline.";
  } else {
    disciplineScore = Math.max(40, 100 - (todayTrades.length - maxSuggestedTrades) * 20);
    disciplineNote = `You took ${todayTrades.length} trades — the system suggested at most ${maxSuggestedTrades}. More trades means more risk, not more edge.`;
  }

  const dsColor = disciplineScore >= 90 ? "#16a34a" : disciplineScore >= 70 ? "#d97706" : "#e14c4c";

  return (
    <div style={{ paddingTop: 8 }}>
      <div style={{ fontWeight: 700, fontSize: 17, color: "#0f172a", marginBottom: 18 }}>
        Today's review
      </div>

      {/* Market activity summary */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
        gap: 12, marginBottom: 24,
      }}>
        {[
          { label: "Stocks scanned", value: totalScanned || "—" },
          { label: "Met the bar", value: qualified || "—", note: "score ≥ 50" },
          { label: "Shown to you", value: Math.min(qualified, 3) || "—", note: "top 3 max" },
          { label: "Trades logged today", value: todayTrades.length },
        ].map(s => (
          <div key={s.label} style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: "14px 16px" }}>
            <div style={{ fontSize: 11, color: "#64748b", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: "#0f172a", lineHeight: 1 }}>{s.value}</div>
            {s.note && <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 3 }}>{s.note}</div>}
          </div>
        ))}
      </div>

      {/* Discipline score */}
      <div style={{
        background: dsColor + "10", border: `1.5px solid ${dsColor}30`,
        borderRadius: 12, padding: "18px 20px", marginBottom: 24,
        display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap",
      }}>
        <div style={{ textAlign: "center", minWidth: 70 }}>
          <div style={{ fontSize: 40, fontWeight: 800, color: dsColor, lineHeight: 1 }}>{disciplineScore}</div>
          <div style={{ fontSize: 11, fontWeight: 700, color: dsColor, textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 2 }}>Discipline</div>
        </div>
        <div style={{ flex: 1, minWidth: 180 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#0f172a", marginBottom: 4 }}>
            {disciplineScore === 100 ? "Excellent." : disciplineScore >= 85 ? "Good." : disciplineScore >= 70 ? "Be careful." : "High risk."}
          </div>
          <div style={{ fontSize: 13, color: "#475569", lineHeight: 1.5 }}>{disciplineNote}</div>
        </div>
      </div>

      {/* Today's P&L */}
      {todayClosed.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 10 }}>
            Today's closed trades
          </div>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            <div style={{ background: "#f8fafc", borderRadius: 10, padding: "12px 18px", border: "1px solid #e2e8f0" }}>
              <div style={{ fontSize: 11, color: "#64748b" }}>P&L today</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: todayPnl >= 0 ? "#16a34a" : "#e14c4c" }}>
                {todayPnl >= 0 ? "+" : ""}{money(todayPnl)}
              </div>
            </div>
            <div style={{ background: "#f8fafc", borderRadius: 10, padding: "12px 18px", border: "1px solid #e2e8f0" }}>
              <div style={{ fontSize: 11, color: "#64748b" }}>Win rate today</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: "#0f172a" }}>
                {todayClosed.length > 0 ? `${Math.round(todayWins.length / todayClosed.length * 100)}%` : "—"}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Open positions */}
      {todayOpen.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 10 }}>
            Open positions (logged today)
          </div>
          <div style={{ fontSize: 13, color: "#475569" }}>
            {todayOpen.map(e => e.ticker).join(", ")} — check the Calculator tab to monitor.
          </div>
        </div>
      )}

      {todayTrades.length === 0 && journal.length === 0 && (
        <div style={{ textAlign: "center", padding: "32px", color: "#94a3b8", fontSize: 14 }}>
          No trades logged yet. Use "Log current trade" in the Calculator tab to start tracking.
        </div>
      )}

      {/* All-time stats */}
      {journal.filter(e => e.status === "closed").length > 0 && (
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 10 }}>
            All-time record
          </div>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            {(() => {
              const closed = journal.filter(e => e.status === "closed");
              const wins = closed.filter(e => e.realizedPnl >= 0);
              const total = closed.reduce((s, e) => s + e.realizedPnl, 0);
              return [
                { label: "Total trades", value: closed.length },
                { label: "Win rate", value: `${Math.round(wins.length / closed.length * 100)}%` },
                { label: "Total P&L", value: moneySigned(total), color: total >= 0 ? "#16a34a" : "#e14c4c" },
              ].map(s => (
                <div key={s.label} style={{ background: "#f8fafc", borderRadius: 10, padding: "12px 18px", border: "1px solid #e2e8f0" }}>
                  <div style={{ fontSize: 11, color: "#64748b" }}>{s.label}</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: s.color || "#0f172a" }}>{s.value}</div>
                </div>
              ));
            })()}
          </div>
        </div>
      )}
    </div>
  );
}

