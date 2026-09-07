import { useState } from "react";
import { money2, trimNum } from "../lib/format";
import { roundStrike } from "../lib/pnl";
import { COMPANIES } from "../appConstants";
import { styles } from "../styles";
import type { Mode } from "../types";

interface RowData {
  sym: string;
  name: string;
  price: number;
  priceSource: string;
  strike: number;
  premium: number | null;
  collateral: number;
  annYield: number | null;
  cushion: number | null;
  badWeekPnl: number | null;
  maxContracts: number;
  dte: number;
}

interface QuoteResponse {
  price?: number;
  source?: string;
}

interface OptionResponse {
  available?: boolean;
  premium?: number;
}

interface AiVerdict {
  sym: string;
  verdict: "FAVORABLE" | "AVOID" | "CAUTION" | string;
  reason?: string;
  flag?: string;
}

interface AiAnalysisResponse {
  available?: boolean;
  verdicts?: AiVerdict[];
  caveat?: string;
}

type AiStatus = "idle" | "loading" | "done" | "unavailable" | "error";

interface Col {
  key: keyof RowData;
  label: string;
  num: boolean;
}

interface ScreenerProps {
  expiration: string;
  dropPct: number;
  capital: number;
  mode: Mode;
  onLoad: (sym: string, strike: number, premium: number) => void;
}

export function Screener({ expiration, dropPct, capital, mode, onLoad }: ScreenerProps) {
  const [selected, setSelected] = useState<string[]>([]);
  const [exp, setExp] = useState(expiration);
  const [rows, setRows] = useState<RowData[]>([]);
  const [loading, setLoading] = useState(false);
  const [sortKey, setSortKey] = useState<keyof RowData | "yield">("yield");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [hasPremiums, setHasPremiums] = useState(false);
  const [aiStatus, setAiStatus] = useState<AiStatus>("idle"); // idle | loading | done | unavailable
  const [aiVerdicts, setAiVerdicts] = useState<Record<string, AiVerdict>>({});
  const [aiCaveat, setAiCaveat] = useState("");

  function toggleTicker(t: string) {
    setSelected((s) =>
      s.includes(t) ? s.filter((x) => x !== t) : s.length < 6 ? [...s, t] : s
    );
  }

  async function runComparison() {
    if (!selected.length) return;
    setLoading(true);
    setRows([]);

    const expDate = new Date(exp + "T12:00:00Z");
    const dte = Math.max(1, Math.round((expDate.getTime() - Date.now()) / 86400000));

    const results: RowData[] = await Promise.all(
      selected.map(async (sym): Promise<RowData> => {
        const company = COMPANIES.find((c) => c.ticker === sym)!;
        let price = company.price;
        let priceSource = "snapshot";
        try {
          const r = await fetch(`/api/quote?symbol=${sym}`);
          if (r.ok) {
            const d: QuoteResponse = await r.json();
            if (Number.isFinite(d.price) && (d.price as number) > 0) { price = d.price as number; priceSource = d.source as string; }
          }
        } catch { /* use snapshot */ }

        const strike = roundStrike(price);
        let premium: number | null = null;
        try {
          const r = await fetch(`/api/option?symbol=${sym}&expiration=${exp}&strike=${strike}`);
          if (r.ok) {
            const d: OptionResponse = await r.json();
            if (d.available && Number.isFinite(d.premium) && (d.premium as number) > 0) premium = d.premium as number;
          }
        } catch { /* no premium */ }

        const collateral = strike * 100;
        const annYield = premium != null ? (premium / strike) * (365 / dte) * 100 : null;
        const cushion = premium != null ? ((price - (strike - premium)) / price) * 100 : null;
        const badWeekPrice = strike * (1 - dropPct / 100);
        const badWeekPnl = premium != null
          ? (premium - Math.max(0, strike - badWeekPrice)) * 100
          : null;
        const maxContracts = capital > 0 ? Math.floor(capital / collateral) : 0;

        return { sym, name: company.name, price, priceSource, strike, premium, collateral, annYield, cushion, badWeekPnl, maxContracts, dte };
      })
    );

    setHasPremiums(results.some((r) => r.premium != null));
    setRows(results);
    setLoading(false);
    setAiStatus("idle");
    setAiVerdicts({});
  }

  async function runAiAnalysis(currentRows: RowData[]) {
    const stocksToAnalyze = currentRows.length ? currentRows : rows;
    if (!stocksToAnalyze.length) return;
    setAiStatus("loading");
    try {
      const r = await fetch("/api/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ stocks: stocksToAnalyze, capital, mode }),
      });
      const d: AiAnalysisResponse = await r.json();
      if (!d.available) { setAiStatus("unavailable"); return; }
      const map: Record<string, AiVerdict> = {};
      (d.verdicts || []).forEach((v) => { map[v.sym] = v; });
      setAiVerdicts(map);
      setAiCaveat(d.caveat || "");
      setAiStatus("done");
    } catch {
      setAiStatus("error");
    }
  }

  function toggleSort(key: keyof RowData) {
    if (sortKey === key) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else { setSortKey(key); setSortDir("desc"); }
  }

  const sorted = [...rows].sort((a, b) => {
    const av = (a[sortKey as keyof RowData] as number | null) ?? (sortDir === "desc" ? -Infinity : Infinity);
    const bv = (b[sortKey as keyof RowData] as number | null) ?? (sortDir === "desc" ? -Infinity : Infinity);
    return sortDir === "desc" ? bv - av : av - bv;
  });

  const COLS: Col[] = [
    { key: "sym", label: "Stock", num: false },
    { key: "price", label: "Price", num: true },
    { key: "strike", label: "Strike", num: true },
    { key: "premium", label: "Premium", num: true },
    { key: "annYield", label: "Yield/yr", num: true },
    { key: "cushion", label: "Cushion", num: true },
    { key: "badWeekPnl", label: `−${trimNum(dropPct)}% scenario`, num: true },
    { key: "maxContracts", label: "Max contracts", num: true },
  ];

  return (
    <section style={styles.screener}>
      <div style={styles.journalHead}>
        <span style={styles.ticketTitle}>Compare stocks</span>
        <span style={{ fontSize: 12, color: "#94a3b8" }}>Pick up to 6</span>
      </div>

      <div style={styles.chipGrid}>
        {COMPANIES.map((c) => {
          const on = selected.includes(c.ticker);
          return (
            <button
              key={c.ticker}
              type="button"
              onClick={() => toggleTicker(c.ticker)}
              style={{
                ...styles.chip,
                background: on ? "#1f2937" : "#f8fafc",
                color: on ? "#fff" : "#475569",
                border: `1px solid ${on ? "#1f2937" : "#e2e8f0"}`,
              }}
            >
              {c.ticker}
            </button>
          );
        })}
      </div>

      <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 18 }}>
        <label style={{ ...styles.field, flex: "0 1 180px" }}>
          <span style={styles.fieldLabel}>Expiration</span>
          <span style={styles.inputWrap}>
            <input type="date" value={exp} onChange={(e) => setExp(e.target.value)} style={styles.input} />
          </span>
        </label>
        <button
          type="button"
          onClick={runComparison}
          disabled={!selected.length || loading}
          style={{ ...styles.tourNext, opacity: !selected.length ? 0.45 : 1, fontSize: 13, padding: "10px 22px" }}
        >
          {loading ? "Fetching…" : `Compare ${selected.length || ""} stock${selected.length !== 1 ? "s" : ""}`}
        </button>
        {selected.length > 0 && !loading && (
          <button type="button" onClick={() => setSelected([])} style={styles.tourSkip}>
            Clear
          </button>
        )}
      </div>

      {rows.length > 0 && (
        <>
          {!hasPremiums && (
            <div style={{ ...styles.warnBar, marginBottom: 14 }}>
              No live premiums — add an Alpaca key to fetch real option prices. Yield and cushion columns need premiums to fill.
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => runAiAnalysis(rows)}
              disabled={aiStatus === "loading"}
              style={{ ...styles.tourNext, fontSize: 12, padding: "8px 18px", opacity: aiStatus === "loading" ? 0.6 : 1 }}
            >
              {aiStatus === "loading" ? "Asking AI…" : aiStatus === "done" ? "Refresh AI picks" : "Ask AI: winner or loser?"}
            </button>
            {aiStatus === "unavailable" && (
              <span style={{ fontSize: 12, color: "#94a3b8" }}>Add ANTHROPIC_API_KEY to Vercel to enable AI analysis.</span>
            )}
            {aiStatus === "error" && (
              <span style={{ fontSize: 12, color: "#e14c4c" }}>AI analysis failed — try again.</span>
            )}
            {aiStatus === "done" && aiCaveat && (
              <span style={{ fontSize: 11.5, color: "#94a3b8", fontStyle: "italic" }}>{aiCaveat}</span>
            )}
          </div>
          <div style={{ overflowX: "auto", marginBottom: 10 }}>
            <table style={styles.screenerTable}>
              <thead>
                <tr>
                  {COLS.map((col) => (
                    <th
                      key={col.key}
                      onClick={() => col.num && toggleSort(col.key)}
                      style={{
                        ...styles.screenerTh,
                        cursor: col.num ? "pointer" : "default",
                        color: sortKey === col.key ? "#0f172a" : "#64748b",
                      }}
                    >
                      {col.label}{sortKey === col.key ? (sortDir === "desc" ? " ↓" : " ↑") : ""}
                    </th>
                  ))}
                  <th style={styles.screenerTh} />
                </tr>
              </thead>
              <tbody>
                {sorted.map((row, i) => {
                  const badLoss = row.badWeekPnl != null && row.badWeekPnl < 0;
                  const ai = aiVerdicts[row.sym];
                  const verdictColor =
                    ai?.verdict === "FAVORABLE" ? "#16a34a"
                    : ai?.verdict === "AVOID" ? "#e14c4c"
                    : ai?.verdict === "CAUTION" ? "#d97706"
                    : "#94a3b8";
                  return (
                    <tr key={row.sym} style={{ background: i % 2 === 0 ? "#fff" : "#f8fafc" }}>
                      <td style={styles.screenerTd}>
                        <div style={{ fontWeight: 700, fontSize: 13 }}>{row.sym}</div>
                        <div style={{ fontSize: 11, color: "#94a3b8" }}>{row.name}</div>
                        {ai && (
                          <div style={{ marginTop: 4 }}>
                            <span style={{ fontSize: 10, fontWeight: 800, color: verdictColor, letterSpacing: "0.05em" }}>
                              {ai.verdict}
                            </span>
                          </div>
                        )}
                      </td>
                      <td style={styles.screenerTd}>
                        {money2(row.price)}
                        <div style={{ fontSize: 10, color: "#94a3b8" }}>{row.priceSource}</div>
                      </td>
                      <td style={styles.screenerTd}>{money2(row.strike)}</td>
                      <td style={styles.screenerTd}>
                        {row.premium != null ? money2(row.premium) : <span style={{ color: "#cbd5e1" }}>—</span>}
                      </td>
                      <td style={{ ...styles.screenerTd, fontWeight: 700, color: row.annYield != null ? "#16a34a" : "#cbd5e1" }}>
                        {row.annYield != null ? `${row.annYield.toFixed(1)}%` : "—"}
                      </td>
                      <td style={{ ...styles.screenerTd, color: row.cushion != null ? "#0f172a" : "#cbd5e1" }}>
                        {row.cushion != null ? `${row.cushion.toFixed(1)}%` : "—"}
                      </td>
                      <td style={{ ...styles.screenerTd, fontWeight: 700, color: badLoss ? "#e14c4c" : row.badWeekPnl != null ? "#16a34a" : "#cbd5e1" }}>
                        {row.badWeekPnl != null ? (row.badWeekPnl >= 0 ? "+" : "−") + "$" + Math.abs(Math.round(row.badWeekPnl)).toLocaleString() : "—"}
                      </td>
                      <td style={styles.screenerTd}>{row.maxContracts}</td>
                      <td style={{ ...styles.screenerTd, maxWidth: 220 }}>
                        {row.premium != null && (
                          <button
                            type="button"
                            onClick={() => onLoad(row.sym, row.strike, row.premium as number)}
                            style={{ ...styles.loadBtn, marginBottom: ai ? 6 : 0 }}
                          >
                            Load ↑
                          </button>
                        )}
                        {ai && (
                          <div style={{ fontSize: 11, color: "#475569", lineHeight: 1.45, whiteSpace: "normal" }}>
                            {ai.reason}
                            {ai.flag && <div style={{ color: "#d97706", marginTop: 3 }}>⚠ {ai.flag}</div>}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p style={{ fontSize: 11.5, color: "#94a3b8", lineHeight: 1.5, margin: 0 }}>
            <b>Yield/yr</b> = annualized return on collateral (premium ÷ strike × 365 ÷ DTE). Always read it next to the scenario loss column — yield without loss context is half the picture. <b>Cushion</b> = how far the stock can fall before you lose money. Click <b>Load ↑</b> to pull a stock into the calculator above. Click column headers to sort.
          </p>
        </>
      )}
    </section>
  );
}
