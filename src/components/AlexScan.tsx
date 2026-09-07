import React, { useState, useEffect } from "react";
import { money2 } from "../lib/format";
import { targetExpiration } from "../lib/dates";
import { analyzeStock, stockChecks, technicalMarketCondition } from "../lib/technicals";
import { COMPANIES } from "../appConstants";
import { styles } from "../styles";
import { ExplainCheckItem } from "./shared";
import type { TechnicalAnalysis, MarketCondition } from "../types";

// ─── Alex's scan — technical stock/ETF screener ───────────────────────────
// Independent from the options-pricing scan on "Today's picks": this asks
// "is the stock/ETF itself in a good technical setup?" (trend, pullback,
// relative strength vs. SPY, momentum, volume) rather than "is the option
// priced richly?" A high score here is a candidate worth structuring a
// trade around, not a trade by itself.

interface AlexScanProps {
  capital: number;
  onLoad: (sym: string) => void;
}

type SortKey = keyof TechnicalAnalysis;

export function AlexScan({ capital, onLoad }: AlexScanProps) {
  const [results, setResults] = useState<TechnicalAnalysis[]>([]);
  const [loading, setLoading] = useState(true);
  const [condition, setCondition] = useState<MarketCondition | null>(null);
  const [lastRun, setLastRun] = useState<Date | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("score");
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => { runScan(); }, []);

  async function runScan() {
    setLoading(true);
    setExpanded(null);

    const exp30 = targetExpiration(30);
    const [spyData, earningsBulk] = await Promise.all([
      fetch(`/api/history?symbol=SPY&days=220`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch(`/api/earnings?expiration=${exp30}`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]);
    const spyBars = spyData?.available ? spyData.bars : null;
    const earningsMap = earningsBulk?.earningsMap ?? null;

    const analyzed = await Promise.all(
      COMPANIES.map(async (c) => {
        const histData = await fetch(`/api/history?symbol=${c.ticker}&days=220`)
          .then((r) => (r.ok ? r.json() : null)).catch(() => null);
        if (!histData?.available || !histData.bars?.length) return null;

        const earningsEntry = earningsMap ? (earningsMap[c.ticker] ?? { hasEarnings: false }) : null;
        const hasEarnings = earningsEntry ? earningsEntry.hasEarnings : null;
        const earningsDate = earningsEntry?.date ?? null;

        return analyzeStock({
          sym: c.ticker, name: c.name, bars: histData.bars, capital,
          hasEarnings, earningsDate, spyBars,
        });
      })
    );

    const clean = analyzed.filter(Boolean) as TechnicalAnalysis[];
    setResults(clean);
    setCondition(technicalMarketCondition(spyBars));
    setLastRun(new Date());
    setLoading(false);
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else { setSortKey(key); setSortDir("desc"); }
  }

  const sorted = [...results].sort((a, b) => {
    const av = (a[sortKey] as number | null | undefined) ?? -Infinity;
    const bv = (b[sortKey] as number | null | undefined) ?? -Infinity;
    return sortDir === "desc" ? bv - av : av - bv;
  });

  if (loading) {
    return (
      <div style={{ padding: "64px 0", textAlign: "center" }}>
        <div style={{ fontSize: 32, marginBottom: 16 }}>🔭</div>
        <div style={{ fontWeight: 700, fontSize: 16, color: "#0f172a", marginBottom: 6 }}>
          Alex is scanning {COMPANIES.length} stocks and ETFs…
        </div>
        <div style={{ fontSize: 13, color: "#94a3b8" }}>
          Trend, pullback quality, relative strength vs. SPY, momentum, and volume — a technical read, independent of option pricing.
        </div>
      </div>
    );
  }

  const COLS: Array<{ key: SortKey; label: string; num: boolean }> = [
    { key: "sym", label: "Stock", num: false },
    { key: "score", label: "Score", num: true },
    { key: "price", label: "Price", num: true },
    { key: "pullbackPct", label: "Above 20d", num: true },
    { key: "relStrength", label: "Rel. strength", num: true },
    { key: "rsiVal", label: "RSI", num: true },
    { key: "volRatio", label: "Vol ratio", num: true },
  ];

  return (
    <div style={{ paddingTop: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 17, color: "#0f172a" }}>🔭 Alex's scan</div>
          <div style={{ fontSize: 13, color: "#64748b", marginTop: 2 }}>
            A technical read on {COMPANIES.length} stocks/ETFs — separate from the options-pricing scan on "Today's picks."
          </div>
        </div>
        <button type="button" onClick={runScan} style={{ ...styles.sizingBtn, marginLeft: 0 }}>
          Refresh ↺
        </button>
      </div>

      {condition && (
        <div style={{
          background: condition.color + "12", border: `1.5px solid ${condition.color}30`,
          borderRadius: 12, padding: "16px 20px", marginBottom: 20,
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: condition.color, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 4 }}>
            {condition.emoji} {condition.label}
          </div>
          <div style={{ fontSize: 13, color: "#0f172a", lineHeight: 1.5 }}>{condition.summary}</div>
          <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 8 }}>
            scanned {lastRun ? lastRun.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "just now"} · needs an Alpaca market-data key for real price history
          </div>
        </div>
      )}

      {results.length === 0 ? (
        <div style={{ textAlign: "center", padding: "48px 24px", background: "#f8fafc", borderRadius: 16, border: "1.5px solid #e2e8f0" }}>
          <div style={{ fontSize: 15, color: "#475569" }}>
            No price history came back — this needs an Alpaca market-data key (see the README) to fetch daily bars.
          </div>
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={styles.screenerTable}>
            <thead>
              <tr>
                {COLS.map((col) => (
                  <th
                    key={col.key}
                    onClick={() => col.num && toggleSort(col.key)}
                    style={{ ...styles.screenerTh, cursor: col.num ? "pointer" : "default", color: sortKey === col.key ? "#0f172a" : "#64748b" }}
                  >
                    {col.label}{sortKey === col.key ? (sortDir === "desc" ? " ↓" : " ↑") : ""}
                  </th>
                ))}
                <th style={styles.screenerTh} />
              </tr>
            </thead>
            <tbody>
              {sorted.map((r, i) => (
                <React.Fragment key={r.sym}>
                  <tr style={{ background: i % 2 === 0 ? "#fff" : "#f8fafc" }}>
                    <td style={styles.screenerTd}>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{r.sym}</div>
                      <div style={{ fontSize: 11, color: "#94a3b8" }}>{r.name}</div>
                    </td>
                    <td style={styles.screenerTd}>
                      <span style={{ fontSize: 11, fontWeight: 800, color: r.grade.color, background: r.grade.bg, borderRadius: 6, padding: "3px 8px" }}>
                        {r.score} · {r.grade.label}
                      </span>
                    </td>
                    <td style={styles.screenerTd}>{money2(r.price)}</td>
                    <td style={styles.screenerTd}>{r.pullbackPct != null ? `${(r.pullbackPct * 100).toFixed(1)}%` : "—"}</td>
                    <td style={{ ...styles.screenerTd, color: r.relStrength != null ? (r.relStrength >= 0 ? "#16a34a" : "#e14c4c") : "#cbd5e1" }}>
                      {r.relStrength != null ? `${r.relStrength >= 0 ? "+" : ""}${(r.relStrength * 100).toFixed(1)}%` : "—"}
                    </td>
                    <td style={styles.screenerTd}>{r.rsiVal != null ? Math.round(r.rsiVal) : "—"}</td>
                    <td style={styles.screenerTd}>{r.volRatio != null ? `${r.volRatio.toFixed(1)}×` : "—"}</td>
                    <td style={styles.screenerTd}>
                      <button type="button" onClick={() => setExpanded((x) => (x === r.sym ? null : r.sym))} style={styles.loadBtn}>
                        {expanded === r.sym ? "Hide" : "Checks"}
                      </button>{" "}
                      <button type="button" onClick={() => onLoad(r.sym)} style={{ ...styles.loadBtn, marginLeft: 6 }}>
                        Load ↑
                      </button>
                    </td>
                  </tr>
                  {expanded === r.sym && (
                    <tr>
                      <td colSpan={COLS.length + 1} style={{ padding: "4px 10px 16px", borderBottom: "1px solid #f1f5f9" }}>
                        <div style={{ display: "grid", gap: 10, maxWidth: 640 }}>
                          {stockChecks(r).map((c) => (
                            <ExplainCheckItem
                              key={c.key}
                              check={c}
                              accent={c.manual ? "#94a3b8" : c.pass ? "#16a34a" : c.warn ? "#d97706" : "#e14c4c"}
                              icon={c.manual ? "…" : c.pass ? "✓" : c.warn ? "!" : "✕"}
                              text={(c.warn && !c.pass ? c.warnLabel : c.pass ? c.label : (c.fail || c.label)) ?? ""}
                            />
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p style={{ fontSize: 11.5, color: "#94a3b8", lineHeight: 1.5, margin: "14px 0 0" }}>
        This is a technical scan of the stock or ETF itself, not an options price check. A high score here is a candidate worth structuring
        a trade around, not a trade by itself. Earnings inside the next 30 days zero out the score.
      </p>
    </div>
  );
}
