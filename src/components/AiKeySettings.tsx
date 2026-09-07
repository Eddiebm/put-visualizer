import { useState } from "react";

// ─── AI access key: gates the chat/analyze/lesson endpoints ──────────────
// Those three proxy to the Anthropic API on this app's own server-side key
// — without a required key here too, anyone who finds the URL can call
// them directly and run up the bill. Same shape as JournalSync's setup:
// enter the same value set as AI_ACCESS_KEY on the server, stored only in
// this browser. Until both are set, the AI features report unavailable.

type AiKeyStatus = "unset" | "set";

interface AiKeySettingsProps {
  aiKey: string;
  onSetKey: (key: string) => void;
}

export function AiKeySettings({ aiKey, onSetKey }: AiKeySettingsProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(aiKey);

  const status: AiKeyStatus = aiKey ? "set" : "unset";
  const badge = {
    unset: { text: "AI features need a key", color: "#d97706", bg: "#fffbeb" },
    set: { text: "✓ AI access key set", color: "#16a34a", bg: "#f0fdf4" },
  }[status];

  return (
    <div style={{ position: "fixed", bottom: 84, left: 24, zIndex: 150 }}>
      {open && (
        <div style={{
          marginBottom: 8, background: "#fff", border: "1px solid #e2e8f0",
          borderRadius: 14, padding: 18, width: 280,
          boxShadow: "0 8px 32px rgba(0,0,0,0.14)",
        }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: "#0f172a", marginBottom: 4 }}>AI access key</div>
          <div style={{ fontSize: 12, color: "#64748b", marginBottom: 12, lineHeight: 1.5 }}>
            The AI coach, stock-comparison analysis, and daily lesson all call your own server, which
            calls Anthropic on your key. Without an access key here too, anyone with this app's URL
            could call those endpoints directly and run up your bill. Enter the same value you set as{" "}
            <code>AI_ACCESS_KEY</code> on the server.
          </div>
          <input
            type="password" placeholder="Access key" value={draft}
            onChange={(e) => setDraft(e.target.value)}
            style={{ width: "100%", border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 10px", fontSize: 13, marginBottom: 8, boxSizing: "border-box" }}
          />
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button" onClick={() => { onSetKey(draft.trim()); }}
              disabled={!draft.trim()}
              style={{ flex: 1, padding: "9px 0", background: draft.trim() ? "#0f172a" : "#e2e8f0", color: draft.trim() ? "#fff" : "#94a3b8", border: "none", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: draft.trim() ? "pointer" : "default" }}
            >
              Save
            </button>
            {aiKey && (
              <button
                type="button" onClick={() => { setDraft(""); onSetKey(""); }}
                style={{ flex: 1, padding: "9px 0", background: "none", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 12, color: "#64748b", cursor: "pointer" }}
              >
                Remove
              </button>
            )}
          </div>
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {badge && (
          <div style={{ background: badge.bg, color: badge.color, border: `1px solid ${badge.color}30`, borderRadius: 10, padding: "8px 12px", fontSize: 11.5, fontWeight: 600, boxShadow: "0 2px 10px rgba(0,0,0,0.08)" }}>
            {badge.text}
          </div>
        )}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          style={{
            background: "#fff", color: "#475569", border: "1px solid #e2e8f0",
            borderRadius: 10, padding: "9px 12px", fontSize: 12,
            fontWeight: 700, cursor: "pointer",
            boxShadow: "0 2px 10px rgba(0,0,0,0.10)",
          }}
        >
          {open ? "✕" : "🔑"}
        </button>
      </div>
    </div>
  );
}
