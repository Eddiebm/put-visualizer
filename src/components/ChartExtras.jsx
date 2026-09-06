import { useState } from "react";
import { moneySigned } from "../lib/format.js";
import { styles } from "../styles.js";

export function InsightCard({ icon, label, text, detail, note, tag }) {
  const [open, setOpen] = useState(false);
  const borderColor = tag === "rich" ? "#16a34a" : tag === "cheap" ? "#e14c4c" : tag === "fair" ? "#d97706" : "#e2e8f0";
  return (
    <div style={{ border: `1px solid ${borderColor}`, borderRadius: 8, padding: "10px 14px", background: "#fff", fontSize: 13, lineHeight: 1.5 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
        <span style={{ fontSize: 16, flexShrink: 0 }}>{icon}</span>
        <div style={{ flex: 1 }}>
          <span style={{ fontWeight: 700, color: "#64748b", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</span>
          <div style={{ color: "#0f172a", fontWeight: 600, marginTop: 1 }}>{text}</div>
          {note && <div style={{ color: "#94a3b8", fontSize: 11.5, marginTop: 3 }}>{note}</div>}
          {detail && (
            <button type="button" onClick={() => setOpen(o => !o)} style={{ background: "none", border: "none", color: "#64748b", fontSize: 11.5, cursor: "pointer", padding: "3px 0 0", textDecoration: "underline" }}>
              {open ? "Less" : "Why?"}
            </button>
          )}
          {open && detail && <div style={{ color: "#475569", fontSize: 12.5, marginTop: 4, lineHeight: 1.6 }}>{detail}</div>}
        </div>
      </div>
    </div>
  );
}

export function Scenarios({ cards }) {
  return (
    <section style={styles.scenarios}>
      {cards.map((c) => {
        const isLoss = c.pnl < 0;
        const isWorst = c.isWorst;
        return (
          <div
            key={c.key}
            style={{
              ...styles.scenarioCard,
              borderColor: isWorst ? "#e14c4c" : isLoss ? "#f2d4d4" : "#d4ead9",
              borderWidth: isWorst ? 2 : 1,
              background: isWorst ? "#fff5f5" : isLoss ? "#fdf6f6" : "#f6fbf8",
            }}
          >
            {isWorst && (
              <div style={{ fontSize: 10, fontWeight: 800, color: "#e14c4c", letterSpacing: "0.08em", marginBottom: 4 }}>
                WORST CASE — SIZE FOR THIS
              </div>
            )}
            <div style={styles.scenarioTitle}>{c.title}</div>
            <div style={styles.scenarioSub}>{c.sub}</div>
            <div style={{ ...styles.scenarioPnl, color: isLoss ? "#e14c4c" : "#3aa56b", fontSize: isWorst ? 26 : undefined }}>{moneySigned(c.pnl)}</div>
            <div style={styles.scenarioNote}>{c.note}</div>
          </div>
        );
      })}
    </section>
  );
}

