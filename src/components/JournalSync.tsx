import { useState } from "react";

// ─── Journal sync: optional server-side backup ────────────────────────────
// Without this, the trade journal — the only record of real trades — lives
// only in this browser's localStorage. Purely optional: everything works
// unchanged if it's never set up.

type SyncStatus = "idle" | "checking" | "synced" | "offline" | "unauthorized" | "not_configured";

interface JournalSyncProps {
  syncKey: string;
  status: SyncStatus;
  onSetKey: (key: string) => void;
}

export function JournalSync({ syncKey, status, onSetKey }: JournalSyncProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(syncKey);

  const badge = {
    idle: null,
    checking: { text: "Syncing…", color: "#64748b", bg: "#f8fafc" },
    synced: { text: "✓ Journal backed up", color: "#16a34a", bg: "#f0fdf4" },
    offline: { text: "⚠ Backup unreachable — using local copy", color: "#d97706", bg: "#fffbeb" },
    unauthorized: { text: "✕ Wrong sync key", color: "#e14c4c", bg: "#fff5f5" },
    not_configured: { text: "Backup not set up on server", color: "#94a3b8", bg: "#f8fafc" },
  }[status];

  return (
    // maxWidth caps the whole floating group — without it, the "Backup
    // unreachable" badge text below is long enough to run off the right
    // edge of a phone-width screen (nothing here scrolls to reveal it).
    <div style={{ position: "fixed", bottom: 24, left: 24, zIndex: 150, maxWidth: "calc(100vw - 48px)" }}>
      {open && (
        <div style={{
          marginBottom: 8, background: "#fff", border: "1px solid #e2e8f0",
          borderRadius: 14, padding: 18, width: "min(280px, calc(100vw - 48px))",
          boxShadow: "0 8px 32px rgba(0,0,0,0.14)",
        }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: "#0f172a", marginBottom: 4 }}>Journal backup</div>
          <div style={{ fontSize: 12, color: "#64748b", marginBottom: 12, lineHeight: 1.5 }}>
            Without this, your trade journal lives only in this browser. Enter the same key you set as{" "}
            <code>JOURNAL_ACCESS_KEY</code> on the server to back it up.
          </div>
          <input
            type="password" placeholder="Sync key" value={draft}
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
            {syncKey && (
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
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        {badge && (
          <div className="pv-fab-badge" style={{ background: badge.bg, color: badge.color, border: `1px solid ${badge.color}30`, borderRadius: 10, padding: "8px 12px", fontSize: 11.5, fontWeight: 600, boxShadow: "0 2px 10px rgba(0,0,0,0.08)" }}>
            {badge.text}
          </div>
        )}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          title="Journal backup"
          style={{
            background: "#fff", color: "#475569", border: "1px solid #e2e8f0",
            borderRadius: 10, padding: "9px 12px", fontSize: 12,
            fontWeight: 700, cursor: "pointer",
            boxShadow: "0 2px 10px rgba(0,0,0,0.10)",
          }}
        >
          {open ? "✕" : "🗄"}
        </button>
      </div>
    </div>
  );
}
