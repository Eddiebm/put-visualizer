import { useState } from "react";
import { styles } from "../styles.js";

// ─── Explain Check Item ───────────────────────────────────────────────────────

export function ExplainCheckItem({ check, accent, icon, text }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <div style={{ display: "flex", gap: 7, alignItems: "flex-start" }}>
        <span style={{ color: accent, marginTop: 1, flexShrink: 0, fontSize: 13 }}>{icon}</span>
        <span style={{ fontSize: 13, color: "#0f172a", flex: 1 }}>{text}</span>
        {check.detail && (
          <button
            type="button"
            onClick={() => setOpen(o => !o)}
            style={{
              flexShrink: 0, background: "none", border: "1px solid #e2e8f0",
              borderRadius: 20, fontSize: 10, fontWeight: 700, color: "#64748b",
              padding: "1px 7px", cursor: "pointer", letterSpacing: "0.03em",
            }}
          >
            {open ? "Less" : "Explain"}
          </button>
        )}
      </div>
      {open && check.detail && (
        <div style={{
          marginTop: 6, marginLeft: 20, fontSize: 12, color: "#475569",
          background: "#f8fafc", borderRadius: 8, padding: "8px 12px", lineHeight: 1.6,
        }}>
          {check.detail}
        </div>
      )}
    </div>
  );
}


export function Stat({ label, value, tone, big }) {
  const color = tone === "good" ? "#16a34a" : tone === "bad" ? "#ef4444" : "#0f172a";
  return (
    <div style={{ ...styles.stat, ...(big ? { borderLeft: "3px solid #ef4444", paddingLeft: 10 } : {}) }}>
      <div style={styles.statLabel}>{label}</div>
      <div style={{ ...styles.statValue, color, fontSize: big ? 24 : undefined }}>{value}</div>
    </div>
  );
}

