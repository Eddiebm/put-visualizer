import { useState, useEffect } from "react";

// ─── MorningGates ─────────────────────────────────────────────────────────────

interface MarketEntry {
  key: string;
  label: string;
  price?: number | null;
  changePct?: number | null;
  available: boolean;
}

interface CalendarEvent {
  event: string;
  impact: string;
  time?: string;
}

interface MorningData {
  markets?: MarketEntry[];
  calendar?: {
    today?: CalendarEvent[];
    week?: CalendarEvent[];
  };
  spyGap?: { gapPct: number } | null;
}

interface GateResult {
  pass: boolean | "warn" | null;
  text: string;
}

interface Gate extends GateResult {
  label: string;
}

export function MorningGates() {
  const [data, setData]       = useState<MorningData | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen]       = useState(false);

  useEffect(() => {
    fetch("/api/morning")
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return (
    <div style={{ fontSize: 12, color: "#94a3b8", padding: "10px 0 4px", marginBottom: 8 }}>
      Running morning checks…
    </div>
  );
  if (!data) return null;

  const { markets, calendar, spyGap } = data;

  // ── Gate evaluations ──────────────────────────────────────────────────────

  // Gate 1: International markets
  const intlMarkets = (markets ?? []).filter(m => m.key !== "vix" && m.key !== "futures" && m.available);
  const futures     = (markets ?? []).find(m => m.key === "futures");
  const vixEntry    = (markets ?? []).find(m => m.key === "vix");
  const vix         = vixEntry?.price ?? null;

  const avgIntlChg  = intlMarkets.length
    ? intlMarkets.reduce((s, m) => s + (m.changePct ?? 0), 0) / intlMarkets.length
    : null;
  const anyBigDrop  = intlMarkets.some(m => (m.changePct ?? 0) < -2);
  const futuresChg  = futures?.changePct ?? null;

  const intlGate: GateResult = ((): GateResult => {
    if (!intlMarkets.length) return { pass: null, text: "Overseas data unavailable" };
    if (anyBigDrop || (futuresChg != null && futuresChg < -1.5))
      return { pass: false, text: `Sharp overnight losses — wait for US open to settle` };
    if (avgIntlChg != null && avgIntlChg < -0.8)
      return { pass: "warn", text: `Markets under pressure overnight — be selective` };
    return { pass: true, text: "Markets opened calmly overnight" };
  })();

  // Gate 2: Economic calendar
  const highImpact = (calendar?.today ?? []).filter(e => e.impact === "high");
  const calGate: GateResult = highImpact.length > 0
    ? { pass: false, text: `${highImpact[0].event} today — markets will be volatile` }
    : { pass: true,  text: "No major economic events today" };

  // Gate 3: VIX
  const vixGate: GateResult = ((): GateResult => {
    if (vix == null) return { pass: null, text: "VIX unavailable" };
    if (vix < 14) return { pass: false, text: `VIX ${vix.toFixed(1)} — premiums too thin to sell` };
    if (vix < 16) return { pass: "warn", text: `VIX ${vix.toFixed(1)} — premiums are thin, be selective` };
    if (vix > 40) return { pass: "warn", text: `VIX ${vix.toFixed(1)} — extreme fear, size down` };
    return { pass: true, text: `VIX ${vix.toFixed(1)} — premiums are worth selling` };
  })();

  // Gate 4: SPY gap
  const gapGate: GateResult = ((): GateResult => {
    if (!spyGap) return { pass: null, text: "Gap data unavailable" };
    const g = spyGap.gapPct;
    if (Math.abs(g) > 2) return { pass: false, text: `SPY gapped ${g > 0 ? "+" : ""}${g.toFixed(1)}% — wait for it to settle` };
    if (Math.abs(g) > 1) return { pass: "warn", text: `SPY gapped ${g > 0 ? "+" : ""}${g.toFixed(1)}% — let the first 30 min settle` };
    return { pass: true, text: `SPY opened flat (${g > 0 ? "+" : ""}${g.toFixed(1)}%) — calm open` };
  })();

  const gates: Gate[] = [
    { label: "Overnight markets",   ...intlGate },
    { label: "Economic calendar",   ...calGate  },
    { label: "Fear gauge (VIX)",    ...vixGate  },
    { label: "Market gap",          ...gapGate  },
  ];

  const hardBlock = gates.some(g => g.pass === false);
  const hasWarn   = gates.some(g => g.pass === "warn");

  const summary = hardBlock
    ? { label: "Stay in cash today", color: "#e14c4c", bg: "#fff5f5", emoji: "🚫" }
    : hasWarn
    ? { label: "Proceed with caution", color: "#d97706", bg: "#fffbeb", emoji: "⚠️" }
    : { label: "Good morning to trade", color: "#16a34a", bg: "#f0fdf4", emoji: "✅" };

  return (
    <div style={{ marginBottom: 16 }}>
      {/* Summary bar — always visible */}
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          background: summary.bg, border: `1px solid ${summary.color}30`,
          borderRadius: 10, padding: "10px 14px", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 16 }}>{summary.emoji}</span>
          <span style={{ fontWeight: 700, fontSize: 13, color: summary.color }}>{summary.label}</span>
          {vix != null && (
            <span style={{ fontSize: 11, color: "#94a3b8", marginLeft: 4 }}>
              VIX {vix.toFixed(1)}
              {futuresChg != null && ` · Futures ${futuresChg > 0 ? "+" : ""}${futuresChg.toFixed(1)}%`}
            </span>
          )}
        </div>
        <span style={{ fontSize: 11, color: "#94a3b8" }}>{open ? "▲" : "▼"} Morning briefing</span>
      </div>

      {/* Expanded gate detail */}
      {open && (
        <div style={{
          background: "#fafafa", border: "1px solid #e2e8f0", borderTopWidth: 0,
          borderRadius: "0 0 10px 10px", padding: "12px 14px",
          display: "flex", flexDirection: "column", gap: 10,
        }}>
          {/* International indices */}
          {intlMarkets.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 6 }}>
                Overnight Markets
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px" }}>
                {(markets ?? []).filter(m => m.available && m.key !== "vix").map(m => (
                  <div key={m.key} style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
                    <span style={{ color: "#64748b" }}>{m.label}</span>
                    <span style={{
                      fontWeight: 700,
                      color: (m.changePct ?? 0) >= 0 ? "#16a34a" : (m.changePct ?? 0) < -1.5 ? "#e14c4c" : "#f97316",
                    }}>
                      {(m.changePct ?? 0) >= 0 ? "+" : ""}{(m.changePct ?? 0).toFixed(1)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Gate list */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {gates.map((g, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                <span style={{
                  width: 16, height: 16, borderRadius: "50%", display: "flex",
                  alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 800, flexShrink: 0,
                  background: g.pass === true ? "#dcfce7" : g.pass === false ? "#fee2e2" : g.pass === "warn" ? "#fef3c7" : "#f1f5f9",
                  color:      g.pass === true ? "#16a34a" : g.pass === false ? "#e14c4c" : g.pass === "warn" ? "#d97706" : "#94a3b8",
                }}>
                  {g.pass === true ? "✓" : g.pass === false ? "✗" : g.pass === "warn" ? "!" : "?"}
                </span>
                <span style={{ color: "#475569" }}>
                  <span style={{ fontWeight: 600, color: "#0f172a" }}>{g.label}: </span>
                  {g.text}
                </span>
              </div>
            ))}
          </div>

          {/* High impact events detail */}
          {highImpact.length > 0 && (
            <div style={{ fontSize: 12, color: "#991b1b", background: "#fff5f5", borderRadius: 6, padding: "6px 10px" }}>
              {highImpact.map((e, i) => (
                <div key={i}><b>{e.event}</b>{e.time ? ` at ${e.time}` : ""}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

