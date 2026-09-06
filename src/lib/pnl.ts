// Core options P&L math — no UI, no React. This is the financial engine
// behind the calculator, chart, ticket, and journal; kept pure and separate
// so it can be unit-tested without rendering anything.

import { normCdf } from "./blackScholes";
import { money, money2, trimNum } from "./format";
import type { StrategyParams, PnlModel, ScenarioCard, AssignmentSummary, Mode } from "../types";

export function roundStrike(p: number): number {
  if (p >= 200) return Math.round(p / 5) * 5;
  if (p >= 25) return Math.round(p);
  return Math.round(p * 2) / 2;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// Spread width based on price tier (standard option strike increments)
export function spreadWidthFor(price: number): number {
  if (price < 20) return 1;
  if (price < 50) return 2.5;
  return 5;
}

// --- core strategy P&L at expiration, per share, × shares ---
export function stratPnl(S: number, p: StrategyParams): number {
  const putLeg = p.putPrem - Math.max(0, p.putStrike - S);
  if (p.mode === "put") return putLeg * p.shares;
  if (p.mode === "spread") {
    // sell short put, buy long put below it — loss is capped at spread width
    const longLeg = -(p.longPrem ?? 0) + Math.max(0, (p.longStrike ?? 0) - S);
    return (putLeg + longLeg) * p.shares;
  }
  const callLeg = (p.callPrem ?? 0) - Math.max(0, S - (p.callStrike ?? 0));
  if (p.mode === "strangle") return (putLeg + callLeg) * p.shares;
  return (S - (p.spot ?? 0) + putLeg + callLeg) * p.shares; // covered
}

interface AssignmentSummaryInput {
  putStrike: number;
  putPrem?: number;
  spot?: number;
  contracts: number;
}

// What owning the shares from a put assignment would actually cost and be
// worth. Returns null when there isn't a real position to describe (no
// strike or no contracts) — the caller should render nothing in that case.
export function assignmentSummary({ putStrike, putPrem, spot, contracts }: AssignmentSummaryInput): AssignmentSummary | null {
  if (!(putStrike > 0) || !(contracts > 0)) return null;
  const shares = contracts * 100;
  const totalCost = putStrike * shares;
  const costBasisPerShare = putStrike - (putPrem || 0);
  const costBasisValue = costBasisPerShare * shares;
  const hasSpot = (spot ?? 0) > 0;
  const currentValue = hasSpot ? (spot as number) * shares : null;
  const gainLoss = hasSpot ? (currentValue as number) - costBasisValue : null;
  return { shares, totalCost, costBasisPerShare, currentValue, gainLoss, hasSpot };
}

interface LegLabelEntry {
  mode: Mode;
  putStrike: number;
  callStrike?: number;
}

export function legLabel(e: LegLabelEntry): string {
  if (e.mode === "put") return `${money2(e.putStrike)}P`;
  return `${money2(e.putStrike)}P / ${money2(e.callStrike ?? 0)}C`;
}

// ---------- model builder: one place, all modes ----------
export function buildModel(p: StrategyParams, dropPct: number): PnlModel {
  const { mode, putStrike, longStrike, callStrike, spot, shares, iv, dte } = p;

  const credit =
    mode === "spread"
      ? (p.putPrem - (p.longPrem ?? 0)) * shares
      : mode === "put"
      ? p.putPrem * shares
      : (p.putPrem + (p.callPrem ?? 0)) * shares;

  const collateral =
    mode === "spread"
      ? Math.max(0, putStrike - (longStrike ?? 0)) * shares
      : putStrike * 100 * (shares / 100) + (mode === "covered" ? (spot ?? 0) * 100 * (shares / 100) : 0);

  let maxGain: number;
  if (mode === "put") maxGain = p.putPrem * shares;
  else if (mode === "spread") maxGain = (p.putPrem - (p.longPrem ?? 0)) * shares;
  else if (mode === "strangle") maxGain = (p.putPrem + (p.callPrem ?? 0)) * shares;
  else maxGain = ((callStrike ?? 0) - (spot ?? 0) + p.putPrem + (p.callPrem ?? 0)) * shares;

  const move = dropPct / 100;
  const moveLbl = trimNum(dropPct);

  // σ-anchored scenario prices when IV is available, else fall back to dropPct
  const hasIv = !!iv && iv > 0 && !!dte && dte > 0;
  const T = (dte || 30) / 365;
  const sigma1 = hasIv ? (spot ?? 0) * (iv as number) * Math.sqrt(T) : 0;

  const down1Price = hasIv ? Math.max(0.01, (spot ?? 0) - sigma1) : putStrike * (1 - move);
  const down2Price = hasIv ? Math.max(0.01, (spot ?? 0) - 2 * sigma1) : putStrike * (1 - move * 1.5);
  const upPrice = (mode === "put" || mode === "spread" ? putStrike : (callStrike ?? 0)) * (1 + move);
  const flatPrice =
    mode === "covered" ? (spot ?? 0)
    : mode === "strangle" ? (putStrike + (callStrike ?? 0)) / 2
    : putStrike;

  const down1Pnl = stratPnl(down1Price, p);
  const down2Pnl = stratPnl(down2Price, p);
  const flatPnl = stratPnl(flatPrice, p);
  const upPnl = stratPnl(upPrice, p);
  const midPnl = mode === "spread" ? stratPnl((putStrike + (longStrike ?? 0)) / 2, p) : null;

  // Labels for σ scenarios
  const down1Lbl = hasIv
    ? `1σ drop → ${money2(down1Price)}`
    : `−${moveLbl}% → ${money2(down1Price)}`;
  const down2Lbl = hasIv
    ? `2σ drop → ${money2(down2Price)}`
    : `−${trimNum(dropPct * 1.5)}% → ${money2(down2Price)}`;

  const scenarios: ScenarioCard[] =
    mode === "spread"
      ? [
          {
            key: "down",
            title: "Falls below long strike",
            sub: `below ${money2(longStrike ?? 0)} · max loss`,
            pnl: stratPnl((longStrike ?? 0) * 0.97, p),
            isWorst: true,
            note: `Both puts are deep in the money. Your long put offsets the short put exactly — loss is capped here. You can't lose more than ${money2(Math.max(0, putStrike - (longStrike ?? 0)) - (p.putPrem - (p.longPrem ?? 0)))} per share no matter how far it falls.`,
          },
          {
            key: "flat",
            title: "Stays above short strike",
            sub: `above ${money2(putStrike)} · max profit`,
            pnl: flatPnl,
            note: "Both puts expire worthless. You keep the full net credit — this is the best case.",
          },
          {
            key: "between",
            title: "Lands between the strikes",
            sub: `between ${money2(longStrike ?? 0)} and ${money2(putStrike)}`,
            pnl: midPnl,
            note: "The short put is in the money but the long put isn't fully offsetting yet. Partial loss — worse than the flat case, better than max loss.",
          },
        ]
      : mode === "strangle"
      ? [
          {
            key: "up",
            title: "If it runs up",
            sub: `+${moveLbl}% · call loses, no ceiling`,
            pnl: upPnl,
            isWorst: true,
            note: "The naked call bites. This loss keeps growing the higher it goes — there is no ceiling. This is the scenario the ads skip.",
          },
          {
            key: "down",
            title: hasIv ? "1σ drop" : "If it falls",
            sub: down1Lbl,
            pnl: down1Pnl,
            isWorst: down1Pnl < 0,
            note: "Put goes in the money. Call expires worthless. Loss depends on how far below the put strike it closes.",
          },
          {
            key: "flat",
            title: "Stays between strikes",
            sub: `between ${money2(putStrike)} and ${money2(callStrike ?? 0)}`,
            pnl: flatPnl,
            note: "Both options expire worthless — you keep both premiums. This is the sweet spot.",
          },
        ]
      : [
          {
            key: "down2",
            title: hasIv ? "2σ drop (tail risk)" : "Bad drop",
            sub: down2Lbl,
            pnl: down2Pnl,
            isWorst: true,
            note: mode === "covered"
              ? "Shares lose value AND you're assigned on the put — double the downside. This is the case to size for, not the premium."
              : `Assigned well below breakeven. ${hasIv ? "A 2σ move is uncommon but not rare — it happens." : "The side the ads skip."}`,
          },
          {
            key: "down1",
            title: hasIv ? "1σ drop (expected move)" : "Mild drop",
            sub: down1Lbl,
            pnl: down1Pnl,
            isWorst: down1Pnl < 0,
            note: hasIv
              ? `This is exactly the move the options market "expects" — about a 16% chance of closing here or lower. ${down1Pnl >= 0 ? "Your breakeven is below this level — you still profit." : "Your breakeven is above this — already a loss."}`
              : "A moderate drop tests the breakeven.",
          },
          {
            key: "flat",
            title: "Stays above strike",
            sub: "put expires worthless",
            pnl: flatPnl,
            note: "Best case — you keep the full premium and the collateral is released.",
          },
        ];

  // "What would have to happen to lose" — computed from first breakeven
  let loseCondition: string | null = null;
  let probProfit: number | null = null;

  // chart range
  let xMin: number, xMax: number;
  if (mode === "spread") {
    xMin = (longStrike ?? 0) * 0.82;
    xMax = putStrike * 1.15;
  } else if (mode === "put") {
    xMin = Math.min(down2Price, putStrike * 0.7);
    xMax = putStrike * 1.15;
  } else {
    xMin = Math.min(down2Price, putStrike * 0.6);
    xMax = Math.max(upPrice, (callStrike ?? 0) * 1.35);
  }

  const N = 160;
  const samples: Array<[number, number]> = [];
  for (let i = 0; i <= N; i++) {
    const x = xMin + ((xMax - xMin) * i) / N;
    samples.push([x, stratPnl(x, p)]);
  }

  // breakevens via zero-crossings
  const breakevens: number[] = [];
  for (let i = 1; i < samples.length; i++) {
    const [x0, y0] = samples[i - 1];
    const [x1, y1] = samples[i];
    if ((y0 <= 0 && y1 > 0) || (y0 >= 0 && y1 < 0)) {
      if (y1 !== y0) breakevens.push(round2(x0 + (-y0 / (y1 - y0)) * (x1 - x0)));
    }
  }
  const breakevenLabel = breakevens.length ? breakevens.map((b) => money2(b)).join(" / ") : "—";

  // "What would have to happen to lose" — computed from first breakeven on the put side
  if (breakevens.length > 0 && (spot ?? 0) > 0) {
    const be = breakevens[0]; // lowest breakeven (put side)
    const pctDrop = (((spot as number) - be) / (spot as number)) * 100;
    if (pctDrop > 0) {
      if (hasIv && sigma1 > 0) {
        const sigmas = ((spot as number) - be) / sigma1;
        const prob = normCdf(sigmas);
        probProfit = Math.round(prob * 10) / 10;
        const losePct = Math.round((1 - prob) * 1000) / 10;
        loseCondition = `You lose money only if ${p.ticker || "the stock"} drops more than ${pctDrop.toFixed(1)}% by expiration. At current IV (${((iv as number) * 100).toFixed(0)}%) that's a ${sigmas.toFixed(1)}σ move — the market prices this as a ${losePct}% chance.`;
      } else {
        loseCondition = `You lose money only if the stock drops more than ${pctDrop.toFixed(1)}% by expiration. Pull a live premium to see the IV-based probability.`;
      }
    }
  }

  // chart markers and dots
  const markers: Array<{ x: number; label: string }> =
    mode === "spread"
      ? [
          { x: longStrike ?? 0, label: `long ${money2(longStrike ?? 0)}` },
          { x: putStrike, label: `short ${money2(putStrike)}` },
        ]
      : [{ x: putStrike, label: `put ${money2(putStrike)}` }];
  if (mode === "strangle" || mode === "covered") markers.push({ x: callStrike ?? 0, label: `call ${money2(callStrike ?? 0)}` });

  const dots: Array<{ x: number; y: number | null }> =
    mode === "spread"
      ? [
          { x: (longStrike ?? 0) * 0.97, y: stratPnl((longStrike ?? 0) * 0.97, p) },
          { x: (putStrike + (longStrike ?? 0)) / 2, y: midPnl },
        ]
      : [{ x: down1Price, y: down1Pnl }, ...(hasIv ? [{ x: down2Price, y: down2Pnl }] : [])];
  if (mode === "strangle" || mode === "covered") dots.push({ x: upPrice, y: upPnl });

  // stat strip — max loss first
  let worstLabel: string, worstValue: string;
  if (mode === "strangle") {
    worstLabel = `Loss if +${moveLbl}% (no ceiling)`;
    worstValue = money(upPnl);
  } else if (mode === "spread") {
    const maxLoss = stratPnl((longStrike ?? 0) * 0.97, p);
    worstLabel = "Max possible loss";
    worstValue = money(maxLoss);
  } else {
    worstLabel = hasIv ? "Loss at 2σ drop" : `Loss on −${moveLbl}% drop`;
    worstValue = money(down2Pnl);
  }

  return {
    mode, credit, collateral, maxGain, samples, xMin, xMax,
    markers, dots, scenarios, breakevens, breakevenLabel,
    worstLabel, worstValue, down1Pnl, down2Pnl, upPnl,
    loseCondition, probProfit, hasIv, iv, dte, spot,
  };
}
