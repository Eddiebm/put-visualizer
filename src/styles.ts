import type { CSSProperties } from "react";

export const keyframes = `
  * { box-sizing: border-box; }
  body { margin: 0; }
  input[type=number]::-webkit-outer-spin-button,
  input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
  input[type=number] { -moz-appearance: textfield; }

  /* JournalSync (bottom-left) and AiKeySettings (bottom-left, stacked above
     it) each render a status-text pill next to their icon toggle button.
     Measured with Playwright: at common phone widths (320-375px) those
     pills are wide enough to visually collide with the bottom-right
     floating buttons (AiAssistant, Tastytrade connect). Below 480px, drop
     the text and keep just the icon buttons — tapping one still opens the
     full explanation in its popover, nothing is lost, just not shown
     passively at a size where it would overlap something else. */
  @media (max-width: 480px) {
    .pv-fab-badge { display: none; }
  }
`;

export const styles: Record<string, CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "#f1f5f9",
    fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    color: "#0f172a",
    // clamp() rather than a media query — inline styles can't be overridden
    // by a stylesheet media query without !important, so responsive sizing
    // has to live in the value itself. Shrinks toward phone-width viewports,
    // caps out at the desktop value.
    padding: "clamp(14px, 5vw, 32px) clamp(10px, 4vw, 16px)",
  },
  shell: { maxWidth: 780, margin: "0 auto", background: "#fff", borderRadius: 18, boxShadow: "0 10px 40px rgba(15,23,42,0.08)", padding: "clamp(16px, 5vw, 28px)" },
  header: { marginBottom: 20 },
  h1: { margin: "0 0 6px", fontSize: 25, letterSpacing: "-0.02em" },
  sub: { margin: 0, color: "#475569", fontSize: 14, lineHeight: 1.5, maxWidth: 600 },
  // Four mode labels ("Cash-secured put", "Covered strangle", …) don't fit
  // four-across on a phone-width screen without either clipping or wrapping
  // mid-word. Scrolling horizontally (like the data tables elsewhere in
  // this app) beats both — nothing is ever cut off or unreadable.
  toggle: { display: "flex", gap: 4, background: "#f1f5f9", borderRadius: 10, padding: 4, marginBottom: 18, overflowX: "auto", WebkitOverflowScrolling: "touch" },
  toggleBtn: { flex: "1 0 auto", minWidth: "max-content", border: "none", borderRadius: 8, padding: "9px 14px", fontSize: 13, cursor: "pointer", whiteSpace: "nowrap" },
  pickerWrap: { display: "flex", flexDirection: "column", gap: 14, marginBottom: 18, paddingBottom: 18, borderBottom: "1px solid #eef2f7" },
  pickerRow: { display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: 14 },
  premiumBtn: { border: "1px solid #d6deea", borderRadius: 10, background: "#f8fafc", color: "#1f2937", fontSize: 13, fontWeight: 600, padding: "10px 14px", cursor: "pointer", height: 40, whiteSpace: "nowrap" },
  pickerStatus: { fontSize: 12.5, color: "#64748b", paddingBottom: 11, lineHeight: 1.4 },
  controls: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 22 },
  field: { display: "flex", flexDirection: "column", gap: 6 },
  fieldLabel: { fontSize: 12.5, fontWeight: 600, color: "#475569" },
  inputWrap: { display: "flex", alignItems: "center", border: "1px solid #e2e8f0", borderRadius: 10, background: "#f8fafc", padding: "0 10px" },
  affix: { color: "#94a3b8", fontSize: 14 },
  input: { border: "none", outline: "none", background: "transparent", padding: "10px 6px", fontSize: 16, width: "100%", color: "#0f172a" },
  chartWrap: { background: "#fff", padding: "8px 4px 0", minHeight: 200, marginBottom: 16 },
  axisLabel: { fontSize: 11, fill: "#94a3b8", letterSpacing: "0.01em" },
  ceilingLabel: { fontSize: 11, fontWeight: 600, fill: "#3aa56b", letterSpacing: "0.02em" },
  badLabel: { fontSize: 12, fontWeight: 600, fill: "#e14c4c" },
  goodLabel: { fontSize: 12, fontWeight: 600, fill: "#3aa56b" },
  warnBar: { fontSize: 12.5, color: "#9a3412", background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 10, padding: "10px 14px", marginBottom: 22, lineHeight: 1.5 },
  sizing: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, fontSize: 12.5, lineHeight: 1.55, color: "#475569", background: "#f8fafc", border: "1px solid #eef2f7", borderRadius: 10, padding: "11px 14px", marginBottom: 22 },
  sizingBtn: { border: "1px solid #d6deea", borderRadius: 8, background: "#fff", color: "#1f2937", fontSize: 12, fontWeight: 600, padding: "6px 12px", cursor: "pointer", whiteSpace: "nowrap", marginLeft: "auto" },
  ticket: { border: "1px solid #e5e7eb", borderRadius: 12, padding: "16px 18px", marginBottom: 26, background: "#fcfcfd" },
  ticketHead: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  ticketTitle: { fontSize: 13, fontWeight: 700, color: "#1f2937" },
  copyBtn: { border: "1px solid #d6deea", borderRadius: 8, background: "#fff", color: "#1f2937", fontSize: 12, fontWeight: 600, padding: "5px 12px", cursor: "pointer" },
  ticketOrder: { fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace', fontSize: 13, color: "#0f172a", background: "#fff", border: "1px solid #eef2f7", borderRadius: 8, padding: "11px 13px", lineHeight: 1.6 },
  ticketList: { margin: "12px 0 0", paddingLeft: 18, fontSize: 12.5, color: "#475569", lineHeight: 1.6 },
  scenarios: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 26 },
  scenarioCard: { border: "1px solid #e5e7eb", borderRadius: 12, padding: "14px 16px" },
  scenarioTitle: { fontSize: 13, fontWeight: 700, color: "#1f2937" },
  scenarioSub: { fontSize: 12, color: "#94a3b8", marginTop: 2 },
  scenarioPnl: { fontSize: 23, fontWeight: 700, letterSpacing: "-0.02em", margin: "8px 0 6px" },
  scenarioNote: { fontSize: 12, color: "#64748b", lineHeight: 1.45 },
  stats: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 },
  stat: { border: "1px solid #eef2f7", borderRadius: 12, padding: "12px 14px", background: "#f8fafc" },
  statLabel: { fontSize: 12, color: "#64748b", marginBottom: 4 },
  statValue: { fontSize: 18, fontWeight: 700, letterSpacing: "-0.01em" },
  footer: { marginTop: 20, fontSize: 12.5, color: "#94a3b8", textAlign: "center", lineHeight: 1.5 },
  journal: { marginTop: 28, paddingTop: 22, borderTop: "1px solid #eef2f7" },
  journalHead: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 14, flexWrap: "wrap" },
  journalEmpty: { fontSize: 13, color: "#64748b", lineHeight: 1.55, margin: 0 },
  journalSummary: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 16 },
  journalList: { display: "flex", flexDirection: "column", gap: 8 },
  journalRow: { display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 10, border: "1px solid #eef2f7", borderRadius: 10, padding: "10px 12px", background: "#fcfcfd" },
  journalSym: { fontSize: 13, fontWeight: 600, color: "#1f2937", textTransform: "capitalize" },
  journalMeta: { fontSize: 11.5, color: "#94a3b8", marginTop: 2 },
  journalActions: { display: "flex", alignItems: "center", gap: 8 },
  journalPnl: { fontSize: 16, fontWeight: 700, letterSpacing: "-0.01em" },
  journalNote: { fontSize: 12, color: "#cf9a3a", marginTop: 12, lineHeight: 1.5 },
  deleteBtn: { border: "none", background: "transparent", color: "#cbd5e1", fontSize: 14, cursor: "pointer", padding: "4px 6px", lineHeight: 1 },
  howBtn: { border: "1px solid #e2e8f0", borderRadius: 8, background: "#f8fafc", color: "#475569", fontSize: 12, fontWeight: 600, padding: "6px 12px", cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 },
  screener: { marginTop: 28, paddingTop: 22, borderTop: "1px solid #eef2f7" },
  picksGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 },
  chipGrid: { display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 },
  chip: { border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 12, fontWeight: 700, padding: "5px 10px", cursor: "pointer", letterSpacing: "0.02em" },
  screenerTable: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  screenerTh: { textAlign: "left", padding: "8px 10px", fontSize: 11.5, fontWeight: 700, borderBottom: "2px solid #eef2f7", whiteSpace: "nowrap", userSelect: "none" },
  screenerTd: { padding: "10px 10px", borderBottom: "1px solid #f1f5f9", verticalAlign: "middle", whiteSpace: "nowrap" },
  loadBtn: { border: "1px solid #d6deea", borderRadius: 7, background: "#f8fafc", color: "#1f2937", fontSize: 11, fontWeight: 700, padding: "4px 10px", cursor: "pointer" },
  tourOverlay: { position: "fixed", inset: 0, background: "rgba(15,23,42,0.6)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 },
  tourCard: { background: "#fff", borderRadius: 20, padding: "28px 28px 22px", maxWidth: 420, width: "100%", boxShadow: "0 24px 64px rgba(15,23,42,0.2)", textAlign: "center" },
  tourTag: { fontSize: 11, fontWeight: 700, color: "#94a3b8", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 10 },
  tourTitle: { fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", color: "#0f172a", marginBottom: 6 },
  tourSetup: { fontSize: 13, color: "#64748b", marginBottom: 16 },
  tourOutcome: { fontSize: 36, fontWeight: 800, letterSpacing: "-0.03em", borderRadius: 12, padding: "14px 0", marginBottom: 16 },
  tourBody: { fontSize: 14, color: "#475569", lineHeight: 1.65, marginBottom: 24, textAlign: "left" },
  tourActions: { display: "flex", gap: 10, justifyContent: "center", marginBottom: 18 },
  tourSkip: { border: "1px solid #e2e8f0", borderRadius: 10, background: "#fff", color: "#94a3b8", fontSize: 13, fontWeight: 600, padding: "10px 20px", cursor: "pointer" },
  tourNext: { border: "none", borderRadius: 10, background: "#1f2937", color: "#fff", fontSize: 13, fontWeight: 700, padding: "10px 28px", cursor: "pointer" },
  tourDots: { display: "flex", gap: 6, justifyContent: "center" },
  tourDot: { width: 6, height: 6, borderRadius: "50%", display: "inline-block" },
};
