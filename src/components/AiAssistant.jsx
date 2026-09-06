import { useState, useEffect, useRef } from "react";

// ─── AI Coach Assistant ────────────────────────────────────────────────────────

export function AiAssistant({ context }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([{
    role: "assistant",
    content: "Hi! Ask me anything about today's trades — why I picked them, what could go wrong, whether you can afford two contracts. Plain English only.",
  }]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    const userMsg = { role: "user", content: text };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput("");
    setBusy(true);
    try {
      const r = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: next, context }),
      });
      const d = await r.json();
      if (!d.available && d.available !== undefined) {
        setMessages(m => [...m, { role: "assistant", content: "The AI coach isn't set up yet. Ask me after you add an ANTHROPIC_API_KEY to your environment." }]);
      } else {
        setMessages(m => [...m, { role: "assistant", content: d.reply ?? "Sorry, something went wrong." }]);
      }
    } catch {
      setMessages(m => [...m, { role: "assistant", content: "Couldn't reach the AI coach right now. Try again." }]);
    }
    setBusy(false);
  }

  return (
    <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 200, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 12 }}>
      {open && (
        <div style={{
          width: 340,
          maxHeight: 480,
          background: "#fff",
          borderRadius: 16,
          boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          border: "1px solid #e2e8f0",
        }}>
          {/* Header */}
          <div style={{ padding: "14px 16px", background: "#0f172a", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: "#fff" }}>AI Coach</div>
              <div style={{ fontSize: 11, color: "#94a3b8" }}>Plain English · No jargon</div>
            </div>
            <button type="button" onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "#94a3b8", fontSize: 18, cursor: "pointer", lineHeight: 1 }}>×</button>
          </div>
          {/* Messages */}
          <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
            {messages.map((m, i) => (
              <div key={i} style={{
                alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                background: m.role === "user" ? "#0f172a" : "#f1f5f9",
                color: m.role === "user" ? "#fff" : "#0f172a",
                borderRadius: m.role === "user" ? "14px 14px 2px 14px" : "14px 14px 14px 2px",
                padding: "9px 13px",
                fontSize: 13,
                lineHeight: 1.5,
                maxWidth: "88%",
              }}>
                {m.content}
              </div>
            ))}
            {busy && (
              <div style={{ alignSelf: "flex-start", background: "#f1f5f9", borderRadius: "14px 14px 14px 2px", padding: "9px 14px", fontSize: 13, color: "#94a3b8" }}>
                Thinking…
              </div>
            )}
            <div ref={bottomRef} />
          </div>
          {/* Input */}
          <div style={{ padding: "10px 12px", borderTop: "1px solid #e2e8f0", display: "flex", gap: 8 }}>
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && !e.shiftKey && send()}
              placeholder="Why AMD? What if it drops 10%?"
              style={{
                flex: 1, border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 10px",
                fontSize: 13, outline: "none", color: "#0f172a",
              }}
              disabled={busy}
            />
            <button
              type="button"
              onClick={send}
              disabled={busy || !input.trim()}
              style={{
                background: "#0f172a", color: "#fff", border: "none", borderRadius: 8,
                padding: "8px 14px", fontSize: 13, cursor: busy ? "default" : "pointer",
                opacity: (busy || !input.trim()) ? 0.5 : 1,
              }}
            >
              →
            </button>
          </div>
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        title="Ask your AI coach"
        style={{
          width: 52, height: 52, borderRadius: "50%",
          background: "#0f172a", color: "#fff", border: "none",
          fontSize: 22, cursor: "pointer",
          boxShadow: "0 4px 16px rgba(0,0,0,0.22)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        {open ? "×" : "💬"}
      </button>
    </div>
  );
}

