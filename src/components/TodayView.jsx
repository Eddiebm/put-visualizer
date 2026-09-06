import { useState, useEffect, useMemo } from "react";
import { bsPrice, bsGreeks, realizedVol as calcRealizedVol } from "../lib/blackScholes.js";
import { expectedMove, cushionSigma } from "../lib/probability.js";
import { richnessSignal } from "../lib/richness.js";
import { opportunityScore, scoreGrade, autopilotChecks, marketCondition as computeMarketCondition } from "../lib/score.js";
import { money, money2 } from "../lib/format.js";
import { targetExpiration, computeDte } from "../lib/dates.js";
import { roundStrike, spreadWidthFor } from "../lib/pnl.js";
import { COMPANIES } from "../appConstants.js";
import { styles } from "../styles.js";
import { ExplainCheckItem } from "./shared.jsx";
import { MorningGates } from "./MorningGates.jsx";

// ─── Today's AI Coach View ───────────────────────────────────────────────────

export function TodayView({ capital, onLoadTrade, onPicksReady }) {
  const [picks, setPicks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [condition, setCondition] = useState(null);
  const [lastRun, setLastRun] = useState(null);
  const exp = useMemo(() => targetExpiration(30), []);
  const dte = useMemo(() => computeDte(exp), [exp]);

  useEffect(() => { runScan(); }, []);

  async function runScan() {
    setLoading(true);

    // One Finnhub call for all stocks — avoids per-stock rate limit hits
    const earningsBulk = await fetch(`/api/earnings?expiration=${exp}`)
      .then(r => r.ok ? r.json() : null).catch(() => null);
    const earningsMap = earningsBulk?.earningsMap ?? null;

    const results = await Promise.all(
      COMPANIES.map(async (company) => {
        const sym = company.ticker;
        const base = { sym, name: company.name, available: false };

        const [quoteData, histData] = await Promise.all([
          fetch(`/api/quote?symbol=${sym}`).then(r => r.ok ? r.json() : null).catch(() => null),
          fetch(`/api/history?symbol=${sym}`).then(r => r.ok ? r.json() : null).catch(() => null),
        ]);

        const price = (quoteData?.price > 0) ? quoteData.price : company.price;
        const strike = roundStrike(price);
        const rvol = (histData?.available && histData.closes?.length >= 3)
          ? calcRealizedVol(histData.closes, 30) : null;

        const optData = await fetch(`/api/option?symbol=${sym}&expiration=${exp}&strike=${strike}`)
          .then(r => r.ok ? r.json() : null).catch(() => null);

        if (!optData?.available || !(optData.premium > 0)) return base;

        const earningsEntry = earningsMap ? (earningsMap[sym] ?? { hasEarnings: false }) : null;
        const hasEarnings = earningsEntry ? earningsEntry.hasEarnings : null;
        const earningsDate = earningsEntry?.date ?? null;
        const { premium, iv, delta: mktDelta } = optData;
        const richness = (iv > 0 && rvol > 0) ? richnessSignal(iv, rvol) : null;

        const sw = spreadWidthFor(price);
        const longStrikeVal = Math.max(0.5, strike - sw);
        const longPremEst = (iv > 0)
          ? bsPrice(price, longStrikeVal, dte, 0.05, iv, "put")
          : premium * 0.4;
        const netCredit = Math.max(0.01, premium - longPremEst);
        const collateral = sw * 100;
        const maxLoss = collateral - netCredit * 100;
        const canAfford = capital >= collateral;
        const contracts = canAfford ? Math.floor(capital / collateral) : 0;

        const putDelta = mktDelta ?? (iv > 0 ? bsGreeks(price, strike, dte, 0.05, iv, "put").delta : null);
        const pop = putDelta != null ? 1 - Math.abs(putDelta) : null;

        const expMove = expectedMove(price, iv || 0, dte);
        const cSigma = cushionSigma(price, strike, expMove);
        const annYield = (netCredit / sw) * (365 / Math.max(dte, 1)) * 100;
        const capitalPct = collateral / capital;
        const maxLossPct = maxLoss / capital;

        const score = opportunityScore({ richness, pop, cushion: cSigma, canAfford, capitalPct, annYield, maxLossPct, hasEarnings });
        const grade = scoreGrade(score);

        return {
          sym, name: company.name, price, strike, premium, iv, rvol, dte,
          richness, pop, cushion: cSigma, annYield, score, grade,
          sw, longStrikeVal, netCredit, collateral, maxLoss, canAfford, contracts,
          capitalPct, maxLossPct, hasEarnings, earningsDate,
          earn: Math.round(netCredit * 100 * contracts),
          lose: Math.round(maxLoss * contracts),
          collateralUsed: collateral * contracts,
          richnessTag: richness?.tag,
          richnessHeadline: richness?.headline,
          cushionDesc: cSigma >= 1.5 ? "very large" : cSigma >= 1.0 ? "larger-than-normal" : "notable",
          available: true,
        };
      })
    );

    const affordable = results.filter(p => p.available && p.canAfford).sort((a, b) => b.score - a.score);
    const qualified = affordable.filter(p => p.score >= 50);
    const cond = computeMarketCondition(affordable.map(p => p.richness?.tag).filter(Boolean));
    const top = qualified.slice(0, 3);

    setPicks(top);
    setCondition(cond);
    setLastRun(new Date());
    onPicksReady?.({ picks: top, condition: cond, totalScanned: COMPANIES.length, qualified: qualified.length });
    setLoading(false);
  }

  if (loading) {
    return (
      <div style={{ padding: "64px 0", textAlign: "center" }}>
        <div style={{ fontSize: 32, marginBottom: 16 }}>🔍</div>
        <div style={{ fontWeight: 700, fontSize: 16, color: "#0f172a", marginBottom: 6 }}>
          Scanning {COMPANIES.length} stocks…
        </div>
        <div style={{ fontSize: 13, color: "#94a3b8" }}>
          Checking live prices, option premiums, and price history to find today's best setups.
        </div>
      </div>
    );
  }

  const noTrades = picks.length === 0 || (picks[0]?.score ?? 0) < 35;

  return (
    <div style={{ paddingTop: 8 }}>
      <MorningGates />
      {/* Market condition banner */}
      {condition && (
        <div style={{
          background: condition.color + "12",
          border: `1.5px solid ${condition.color}30`,
          borderRadius: 12,
          padding: "16px 20px",
          marginBottom: 24,
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: condition.color, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 4 }}>
                {condition.emoji} {condition.label}
              </div>
              <div style={{ fontSize: 13, color: "#0f172a", lineHeight: 1.5 }}>
                {condition.summary}
              </div>
            </div>
            <button
              type="button"
              onClick={runScan}
              style={{ fontSize: 11, color: "#64748b", background: "none", border: "1px solid #e2e8f0", borderRadius: 8, padding: "6px 12px", cursor: "pointer" }}
            >
              Refresh ↺
            </button>
          </div>
          <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 8 }}>
            {exp} expiry · ~{dte} days · scanned {lastRun ? lastRun.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "just now"}
          </div>
        </div>
      )}

      {noTrades ? (
        <div style={{ textAlign: "center", padding: "48px 24px", background: "#f8fafc", borderRadius: 16, border: "1.5px solid #e2e8f0" }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>🧘</div>
          <div style={{ fontWeight: 700, fontSize: 20, color: "#0f172a", marginBottom: 8 }}>
            No trade today.
          </div>
          <div style={{ fontSize: 15, color: "#475569", marginBottom: 6 }}>
            Cash is a position too.
          </div>
          <div style={{ fontSize: 13, color: "#94a3b8", maxWidth: 320, margin: "0 auto" }}>
            The conditions don't justify taking risk right now. Sitting out is a discipline skill — most people only learn it after losing money.
          </div>
        </div>
      ) : (
        <>
          <div style={{ fontWeight: 700, fontSize: 15, color: "#0f172a", marginBottom: 16 }}>
            Today's best {picks.length === 1 ? "opportunity" : `${picks.length} opportunities`}
          </div>
          <div style={styles.picksGrid}>
            {picks.map(p => (
              <OpportunityCard key={p.sym} pick={p} capital={capital} onLoad={onLoadTrade} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function OpportunityCard({ pick, capital, onLoad }) {
  const [showAll, setShowAll] = useState(false);
  const { sym, name, price, strike, sw, longStrikeVal, dte, score, grade,
          earn, lose, collateralUsed, pop, cushion, richness,
          canAfford, capitalPct, maxLossPct, hasEarnings, earningsDate } = pick;
  const popN = pop != null ? Math.round(pop * 100) : null;

  const checks = autopilotChecks({ richness, pop, canAfford, maxLossPct, cushion, capitalPct, hasEarnings, earningsDate });
  const passing = checks.filter(c => !c.manual && c.pass && !c.warn);
  const cautious = checks.filter(c => !c.manual && (c.warn || (!c.pass && c.warnLabel)));
  const failed = checks.filter(c => !c.manual && !c.pass && !c.warn && !c.warnLabel);

  const positives = passing.slice(0, 4);
  const negatives = [...cautious, ...failed].slice(0, 3);

  return (
    <div style={{
      border: `1.5px solid ${grade.color}30`,
      borderRadius: 14,
      background: "#fff",
      padding: "20px",
      display: "flex",
      flexDirection: "column",
      gap: 14,
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 22, color: "#0f172a", lineHeight: 1 }}>{sym}</div>
          <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 3 }}>{name}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 24, fontWeight: 800, color: grade.color, lineHeight: 1 }}>{score}</div>
          <div style={{ fontSize: 10, fontWeight: 700, color: grade.color, letterSpacing: "0.05em", textTransform: "uppercase" }}>{grade.label}</div>
        </div>
      </div>

      {/* Why I like this trade */}
      {positives.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#16a34a", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 8 }}>
            Why I like this trade
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {positives.map(c => <ExplainCheckItem key={c.key} check={c} accent="#16a34a" icon="✓" text={c.label} />)}
          </div>
        </div>
      )}

      {/* Cautions */}
      {negatives.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#d97706", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 8 }}>
            Worth knowing
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {negatives.map(c => <ExplainCheckItem key={c.key} check={c} accent="#d97706" icon="•" text={c.warnLabel || c.fail} />)}
          </div>
        </div>
      )}

      {/* Numbers */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: "8px 20px",
        background: "#f8fafc",
        borderRadius: 10,
        padding: "14px 16px",
        fontSize: 13,
      }}>
        <div style={{ color: "#64748b" }}>You collect</div>
        <div style={{ fontWeight: 700, color: "#16a34a" }}>+{money(earn)}</div>
        <div style={{ color: "#64748b" }}>Worst case</div>
        <div style={{ fontWeight: 700, color: "#e14c4c" }}>−{money(lose)}</div>
        {popN != null && <>
          <div style={{ color: "#64748b" }}>Odds of winning</div>
          <div style={{ color: "#0f172a" }}>{popN} in 100</div>
        </>}
        <div style={{ color: "#64748b" }}>Uses from account</div>
        <div style={{ color: "#0f172a" }}>{money(collateralUsed)}</div>
        <div style={{ color: "#64748b" }}>Close if loss hits</div>
        <div style={{ fontWeight: 700, color: "#e14c4c" }}>{money(earn * 2)}</div>
      </div>

      {/* Earnings warning — only shown when earnings confirmed before expiration */}
      {hasEarnings === true && (
        <div style={{ fontSize: 12, color: "#991b1b", background: "#fff5f5", border: "1px solid #fecaca", borderRadius: 8, padding: "8px 12px", fontWeight: 600 }}>
          ❌ Earnings before expiration{earningsDate ? ` (${earningsDate})` : ""} — do not sell premium through this announcement.
        </div>
      )}
      {hasEarnings === null && (
        <div style={{ fontSize: 12, color: "#92400e", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, padding: "8px 12px" }}>
          ⚠ Earnings check unavailable — verify manually before entering.
        </div>
      )}

      {/* Autopilot checklist expand */}
      <button
        type="button"
        onClick={() => setShowAll(o => !o)}
        style={{ fontSize: 12, color: "#64748b", background: "none", border: "none", cursor: "pointer", textAlign: "left", padding: 0 }}
      >
        {showAll ? "▲ Hide checklist" : "▼ Show full autopilot checklist (8 checks)"}
      </button>
      {showAll && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {checks.map(c => {
            const isManual = c.manual;
            const icon = isManual ? "⚠" : c.pass && !c.warn ? "✅" : c.warn ? "🟡" : "❌";
            const text = isManual ? c.label : c.pass && !c.warn ? c.label : c.warn ? (c.warnLabel || c.label) : c.fail;
            return (
              <div key={c.key} style={{ display: "flex", gap: 8, fontSize: 12, color: isManual ? "#92400e" : c.pass && !c.warn ? "#166534" : c.warn ? "#92400e" : "#991b1b" }}>
                <span style={{ flexShrink: 0 }}>{icon}</span>
                <span>{text}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Details */}
      <div style={{ fontSize: 11, color: "#94a3b8", borderTop: "1px solid #f1f5f9", paddingTop: 10 }}>
        Sell {money2(strike)} put · Buy {money2(longStrikeVal)} put · {sw}-point spread · {dte} days · stock at {money2(price)}
      </div>

      <button
        type="button"
        onClick={() => onLoad(pick)}
        style={{ ...styles.tourNext, fontSize: 13, padding: "11px 0", width: "100%" }}
      >
        Show Me The Trade →
      </button>
    </div>
  );
}

