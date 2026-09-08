import { useState, useEffect, useMemo } from "react";
import { bsPrice, bsGreeks, realizedVol as calcRealizedVol } from "../lib/blackScholes";
import { expectedMove, cushionSigma } from "../lib/probability";
import { richnessSignal } from "../lib/richness";
import { opportunityScore, scoreGrade, autopilotChecks, marketCondition as computeMarketCondition } from "../lib/score";
import { suitabilityVerdict, type SuitabilityVerdict } from "../lib/suitability";
import { money, money2 } from "../lib/format";
import { targetExpiration, computeDte } from "../lib/dates";
import { roundStrike, spreadWidthFor } from "../lib/pnl";
import { COMPANIES } from "../appConstants";
import { styles } from "../styles";
import { ExplainCheckItem, BacktestDisclosure } from "./shared";
import { MorningGates } from "./MorningGates";
import type { Richness, Grade, MarketCondition } from "../types";

// ─── Today's AI Coach View ───────────────────────────────────────────────────

interface EarningsEntry {
  hasEarnings: boolean;
  date?: string | null;
}

interface EarningsBulkResponse {
  earningsMap?: Record<string, EarningsEntry>;
}

interface QuoteResponse {
  price?: number;
}

interface HistoryResponse {
  available?: boolean;
  closes?: number[];
}

interface OptionResponse {
  available?: boolean;
  premium?: number;
  iv?: number;
  delta?: number | null;
}

// A stock that was scanned but has no usable option data — excluded from picks.
interface ScanUnavailable {
  sym: string;
  name: string;
  available: false;
}

// A fully-evaluated candidate — the shape rendered by OpportunityCard.
export interface OpportunityPick {
  sym: string;
  name: string;
  price: number;
  strike: number;
  premium: number;
  iv?: number;
  rvol: number | null;
  dte: number;
  richness: Richness | null;
  pop: number | null;
  cushion: number;
  annYield: number;
  score: number;
  grade: Grade;
  sw: number;
  longStrikeVal: number;
  netCredit: number;
  collateral: number;
  maxLoss: number;
  canAfford: boolean;
  contracts: number;
  capitalPct: number;
  maxLossPct: number;
  hasEarnings: boolean | null;
  earningsDate?: string | null;
  earn: number;
  lose: number;
  collateralUsed: number;
  richnessTag?: Richness["tag"];
  richnessHeadline?: string;
  cushionDesc: string;
  available: true;
}

type ScanResult = ScanUnavailable | OpportunityPick;

interface PicksReadyCtx {
  picks: OpportunityPick[];
  condition: MarketCondition | null;
  totalScanned: number;
  qualified: number;
}

interface TodayViewProps {
  capital: number;
  onLoadTrade: (pick: OpportunityPick) => void;
  onPicksReady?: (ctx: PicksReadyCtx) => void;
  onViewChart: (sym: string) => void;
}

export function TodayView({ capital, onLoadTrade, onPicksReady, onViewChart }: TodayViewProps) {
  const [picks, setPicks] = useState<OpportunityPick[]>([]);
  const [loading, setLoading] = useState(true);
  const [condition, setCondition] = useState<MarketCondition | null>(null);
  const [lastRun, setLastRun] = useState<Date | null>(null);
  const exp = useMemo(() => targetExpiration(30), []);
  const dte = useMemo(() => computeDte(exp), [exp]);

  useEffect(() => { runScan(); }, []);

  async function runScan() {
    setLoading(true);

    // One Finnhub call for all stocks — avoids per-stock rate limit hits
    const earningsBulk: EarningsBulkResponse | null = await fetch(`/api/earnings?expiration=${exp}`)
      .then(r => r.ok ? r.json() : null).catch(() => null);
    const earningsMap = earningsBulk?.earningsMap ?? null;

    const results: ScanResult[] = await Promise.all(
      COMPANIES.map(async (company): Promise<ScanResult> => {
        const sym = company.ticker;
        const base: ScanUnavailable = { sym, name: company.name, available: false };

        const [quoteData, histData]: [QuoteResponse | null, HistoryResponse | null] = await Promise.all([
          fetch(`/api/quote?symbol=${sym}`).then(r => r.ok ? r.json() : null).catch(() => null),
          fetch(`/api/history?symbol=${sym}`).then(r => r.ok ? r.json() : null).catch(() => null),
        ]);

        const price = (quoteData?.price && quoteData.price > 0) ? quoteData.price : company.price;
        const strike = roundStrike(price);
        const rvol = (histData?.available && (histData.closes?.length ?? 0) >= 3)
          ? calcRealizedVol(histData.closes, 30) : null;

        const optData: OptionResponse | null = await fetch(`/api/option?symbol=${sym}&expiration=${exp}&strike=${strike}`)
          .then(r => r.ok ? r.json() : null).catch(() => null);

        if (!optData?.available || !(optData.premium && optData.premium > 0)) return base;

        const earningsEntry = earningsMap ? (earningsMap[sym] ?? { hasEarnings: false }) : null;
        const hasEarnings = earningsEntry ? earningsEntry.hasEarnings : null;
        const earningsDate = earningsEntry?.date ?? null;
        const { premium, iv, delta: mktDelta } = optData;
        const richness = (iv && iv > 0 && rvol && rvol > 0) ? richnessSignal(iv, rvol) : null;

        const sw = spreadWidthFor(price);
        const longStrikeVal = Math.max(0.5, strike - sw);
        const longPremEst = (iv && iv > 0)
          ? bsPrice(price, longStrikeVal, dte, 0.05, iv, "put")
          : (premium as number) * 0.4;
        const netCredit = Math.max(0.01, (premium as number) - longPremEst);
        const collateral = sw * 100;
        const maxLoss = collateral - netCredit * 100;
        const canAfford = capital >= collateral;
        const contracts = canAfford ? Math.floor(capital / collateral) : 0;

        const putDelta = mktDelta ?? (iv && iv > 0 ? bsGreeks(price, strike, dte, 0.05, iv, "put").delta : null);
        const pop = putDelta != null ? 1 - Math.abs(putDelta) : null;

        const expMove = expectedMove(price, iv || 0, dte);
        const cSigma = cushionSigma(price, strike, expMove);
        const annYield = (netCredit / sw) * (365 / Math.max(dte, 1)) * 100;
        const capitalPct = collateral / capital;
        const maxLossPct = maxLoss / capital;

        const score = opportunityScore({ richness, pop: pop ?? 0, cushion: cSigma, canAfford, capitalPct, annYield, maxLossPct, hasEarnings });
        const grade = scoreGrade(score);

        const pick: OpportunityPick = {
          sym, name: company.name, price, strike, premium: premium as number, iv, rvol, dte,
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
        return pick;
      })
    );

    const affordable = results.filter((p): p is OpportunityPick => p.available && p.canAfford).sort((a, b) => b.score - a.score);
    const qualified = affordable.filter(p => p.score >= 50);
    const cond = computeMarketCondition(affordable.map(p => p.richness?.tag).filter((t): t is Richness["tag"] => Boolean(t)));
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
              <OpportunityCard key={p.sym} pick={p} capital={capital} onLoad={onLoadTrade} onViewChart={onViewChart} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

const VERDICT_STYLE: Record<SuitabilityVerdict, { label: string; color: string; bg: string }> = {
  pick: { label: "✅ Pick", color: "#16a34a", bg: "#f0fdf4" },
  "dont-pick": { label: "🚫 Don't pick", color: "#e14c4c", bg: "#fff5f5" },
  "manual-check-needed": { label: "❓ Confirm to see", color: "#d97706", bg: "#fffbeb" },
};

interface OpportunityCardProps {
  pick: OpportunityPick;
  capital: number;
  onLoad: (pick: OpportunityPick) => void;
  onViewChart: (sym: string) => void;
}

export function OpportunityCard({ pick, capital, onLoad, onViewChart }: OpportunityCardProps) {
  const [showAll, setShowAll] = useState(false);
  const [worstCaseAccepted, setWorstCaseAccepted] = useState<boolean | null>(null);
  const { sym, name, price, strike, sw, longStrikeVal, dte, score, grade,
          earn, lose, collateralUsed, pop, cushion, richness, richnessTag,
          canAfford, capitalPct, maxLossPct, hasEarnings, earningsDate } = pick;
  const popN = pop != null ? Math.round(pop * 100) : null;

  const checks = autopilotChecks({ richness, pop: pop ?? 0, canAfford, maxLossPct, cushion, capitalPct, hasEarnings, earningsDate });
  const passing = checks.filter(c => !c.manual && c.pass && !c.warn);
  const cautious = checks.filter(c => !c.manual && (c.warn || (!c.pass && c.warnLabel)));
  const failed = checks.filter(c => !c.manual && !c.pass && !c.warn && !c.warnLabel);

  const positives = passing.slice(0, 4);
  const negatives = [...cautious, ...failed].slice(0, 3);

  // The only pick/don't-pick verdict this app stands behind — built from
  // facts (afford it, no earnings, priced fair-or-rich), not the score
  // above. See src/lib/suitability.ts for exactly why the score can't be
  // the verdict.
  const suitability = suitabilityVerdict({ canAfford, hasEarnings, richnessTag, worstCaseAccepted });
  const verdictStyle = VERDICT_STYLE[suitability.verdict];

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
          <button
            type="button"
            onClick={() => onViewChart(sym)}
            style={{
              border: "none", background: "none", color: "#64748b", fontSize: 11, fontWeight: 700,
              cursor: "pointer", padding: 0, marginTop: 4,
            }}
          >
            🕯️ View chart
          </button>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{
            fontSize: 13, fontWeight: 800, color: verdictStyle.color, letterSpacing: "0.04em",
            textTransform: "uppercase", background: verdictStyle.bg, borderRadius: 6, padding: "3px 9px",
          }}>
            {verdictStyle.label}
          </div>
          <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 5 }}>
            tape: {score} · {grade.label}
          </div>
        </div>
      </div>

      <BacktestDisclosure finding="the score/grade above (Excellent…Avoid) has been walk-forward tested against 10 years of real data and does not reliably predict which trades do better — treat it as a summary of the trade's shape, not a forecast. The PICK/DON'T PICK badge above is a separate, fact-only check (see below), and is the only verdict this app stands behind." />

      {/* The suitability checklist — the actual pick/don't-pick reasoning */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {suitability.checks.map((c) => {
          const icon = c.pass === true ? "✅" : c.pass === false ? "❌" : "❓";
          const color = c.pass === true ? "#166534" : c.pass === false ? "#991b1b" : "#92400e";
          if (c.key === "ownership") {
            return (
              <label key={c.key} style={{ display: "flex", gap: 8, fontSize: 12.5, color, cursor: "pointer", alignItems: "flex-start" }}>
                <input
                  type="checkbox"
                  checked={worstCaseAccepted === true}
                  onChange={(e) => setWorstCaseAccepted(e.target.checked ? true : null)}
                  style={{ marginTop: 2, flexShrink: 0 }}
                />
                <span>
                  <strong>{c.label}</strong> — {c.detail}
                  {worstCaseAccepted !== true && (
                    <>
                      {" "}
                      <button
                        type="button"
                        onClick={() => setWorstCaseAccepted(false)}
                        style={{ border: "none", background: "none", color: "#991b1b", fontSize: 11.5, fontWeight: 700, cursor: "pointer", padding: 0, textDecoration: "underline" }}
                      >
                        No, I wouldn't
                      </button>
                    </>
                  )}
                </span>
              </label>
            );
          }
          return (
            <div key={c.key} style={{ display: "flex", gap: 8, fontSize: 12.5, color }}>
              <span style={{ flexShrink: 0 }}>{icon}</span>
              <span><strong>{c.label}</strong> — {c.detail}</span>
            </div>
          );
        })}
      </div>

      {(positives.length > 0 || negatives.length > 0) && (
        <div style={{ fontSize: 10, color: "#cbd5e1", fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", borderTop: "1px dashed #f1f5f9", paddingTop: 10 }}>
          Additional context (tape, not part of the pick above)
        </div>
      )}

      {/* Context: score-derived detail, not the verdict */}
      {positives.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#16a34a", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 8 }}>
            In this trade's favor
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
            {negatives.map(c => <ExplainCheckItem key={c.key} check={c} accent="#d97706" icon="•" text={c.warnLabel || c.fail || ""} />)}
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
        {suitability.verdict === "dont-pick" ? "See the trade anyway →" : "Show Me The Trade →"}
      </button>
    </div>
  );
}
