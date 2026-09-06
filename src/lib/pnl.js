// Core options P&L math — no UI, no React. This is the financial engine
// behind the calculator, chart, ticket, and journal; kept pure and separate
// so it can be unit-tested without rendering anything.

import { normCdf } from "./blackScholes.js";
import { money, money2, trimNum } from "./format.js";

export function roundStrike(p) {
  if (p >= 200) return Math.round(p / 5) * 5;
  if (p >= 25) return Math.round(p);
  return Math.round(p * 2) / 2;
}

export function round2(n) {
  return Math.round(n * 100) / 100;
}

// Spread width based on price tier (standard option strike increments)
export function spreadWidthFor(price) {
  if (price < 20) return 1;
  if (price < 50) return 2.5;
  return 5;
}

// --- core strategy P&L at expiration, per share, × shares ---
export function stratPnl(S, p) {
  const putLeg = p.putPrem - Math.max(0, p.putStrike - S);
  if (p.mode === "put") return putLeg * p.shares;
  if (p.mode === "spread") {
    // sell short put, buy long put below it — loss is capped at spread width
    const longLeg = -p.longPrem + Math.max(0, p.longStrike - S);
    return (putLeg + longLeg) * p.shares;
  }
  const callLeg = p.callPrem - Math.max(0, S - p.callStrike);
  if (p.mode === "strangle") return (putLeg + callLeg) * p.shares;
  return (S - p.spot + putLeg + callLeg) * p.shares; // covered
}

// What owning the shares from a put assignment would actually cost and be
// worth. Returns null when there isn't a real position to describe (no
// strike or no contracts) — the caller should render nothing in that case.
export function assignmentSummary({ putStrike, putPrem, spot, contracts }) {
  if (!(putStrike > 0) || !(contracts > 0)) return null;
  const shares = contracts * 100;
  const totalCost = putStrike * shares;
  const costBasisPerShare = putStrike - (putPrem || 0);
  const costBasisValue = costBasisPerShare * shares;
  const hasSpot = spot > 0;
  const currentValue = hasSpot ? spot * shares : null;
  const gainLoss = hasSpot ? currentValue - costBasisValue : null;
  return { shares, totalCost, costBasisPerShare, currentValue, gainLoss, hasSpot };
}

export function legLabel(e) {
  if (e.mode === "put") return `${money2(e.putStrike)}P`;
  return `${money2(e.putStrike)}P / ${money2(e.callStrike)}C`;
}

// ---------- model builder: one place, all modes ----------
export function buildModel(p, dropPct) {
  const { mode, putStrike, longStrike, callStrike, spot, shares, iv, dte } = p;

  const credit =
    mode === "spread"
      ? (p.putPrem - p.longPrem) * shares
      : mode === "put"
      ? p.putPrem * shares
      : (p.putPrem + p.callPrem) * shares;

  const collateral =
    mode === "spread"
      ? Math.max(0, putStrike - longStrike) * shares
      : putStrike * 100 * (shares / 100) + (mode === "covered" ? spot * 100 * (shares / 100) : 0);

  let maxGain;
  if (mode === "put") maxGain = p.putPrem * shares;
  else if (mode === "spread") maxGain = (p.putPrem - p.longPrem) * shares;
  else if (mode === "strangle") maxGain = (p.putPrem + p.callPrem) * shares;
  else maxGain = (callStrike - spot + p.putPrem + p.callPrem) * shares;

  const move = dropPct / 100;
  const moveLbl = trimNum(dropPct);

  // σ-anchored scenario prices when IV is available, else fall back to dropPct
  const hasIv = iv > 0 && dte > 0;
  const T = (dte || 30) / 365;
  const sigma1 = hasIv ? spot * iv * Math.sqrt(T) : 0;

  const down1Price = hasIv ? Math.max(0.01, spot - sigma1) : putStrike * (1 - move);
  const down2Price = hasIv ? Math.max(0.01, spot - 2 * sigma1) : putStrike * (1 - move * 1.5);
  const upPrice = (mode === "put" || mode === "spread" ? putStrike : callStrike) * (1 + move);
  const flatPrice =
    mode === "covered" ? spot
    : mode === "strangle" ? (putStrike + callStrike) / 2
    : putStrike;

  const down1Pnl = stratPnl(down1Price, p);
  const down2Pnl = stratPnl(down2Price, p);
  const flatPnl = stratPnl(flatPrice, p);
  const upPnl = stratPnl(upPrice, p);
  const midPnl = mode === "spread" ? stratPnl((putStrike + longStrike) / 2, p) : null;

  // Labels for σ scenarios
  const down1Lbl = hasIv
    ? `1σ drop → ${money2(down1Price)}`
    : `−${moveLbl}% → ${money2(down1Price)}`;
  const down2Lbl = hasIv
    ? `2σ drop → ${money2(down2Price)}`
    : `−${trimNum(dropPct * 1.5)}% → ${money2(down2Price)}`;

  const scenarios =
    mode === "spread"
      ? [
          {
            key: "down",
            title: "Falls below long strike",
            sub: `below ${money2(longStrike)} · max loss`,
            pnl: stratPnl(longStrike * 0.97, p),
            isWorst: true,
            note: `Both puts are deep in the money. Your long put offsets the short put exactly — loss is capped here. You can't lose more than ${money2(Math.max(0, putStrike - longStrike) - (p.putPrem - p.longPrem))} per share no matter how far it falls.`,
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
            sub: `between ${money2(longStrike)} and ${money2(putStrike)}`,
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
            sub: `between ${money2(putStrike)} and ${money2(callStrike)}`,
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
  let loseCondition = null;
  let probProfit = null;

  // chart range
  let xMin, xMax;
  if (mode === "spread") {
    xMin = longStrike * 0.82;
    xMax = putStrike * 1.15;
  } else if (mode === "put") {
    xMin = Math.min(down2Price, putStrike * 0.7);
    xMax = putStrike * 1.15;
  } else {
    xMin = Math.min(down2Price, putStrike * 0.6);
    xMax = Math.max(upPrice, callStrike * 1.35);
  }

  const N = 160;
  const samples = [];
  for (let i = 0; i <= N; i++) {
    const x = xMin + ((xMax - xMin) * i) / N;
    samples.push([x, stratPnl(x, p)]);
  }

  // breakevens via zero-crossings
  const breakevens = [];
  for (let i = 1; i < samples.length; i++) {
    const [x0, y0] = samples[i - 1];
    const [x1, y1] = samples[i];
    if ((y0 <= 0 && y1 > 0) || (y0 >= 0 && y1 < 0)) {
      if (y1 !== y0) breakevens.push(round2(x0 + (-y0 / (y1 - y0)) * (x1 - x0)));
    }
  }
  const breakevenLabel = breakevens.length ? breakevens.map((b) => money2(b)).join(" / ") : "—";

  // "What would have to happen to lose" — computed from first breakeven on the put side
  if (breakevens.length > 0 && spot > 0) {
    const be = breakevens[0]; // lowest breakeven (put side)
    const pctDrop = ((spot - be) / spot) * 100;
    if (pctDrop > 0) {
      if (hasIv && sigma1 > 0) {
        const sigmas = (spot - be) / sigma1;
        const prob = normCdf(sigmas);
        probProfit = Math.round(prob * 10) / 10;
        const losePct = Math.round((1 - prob) * 1000) / 10;
        loseCondition = `You lose money only if ${p.ticker || "the stock"} drops more than ${pctDrop.toFixed(1)}% by expiration. At current IV (${(iv * 100).toFixed(0)}%) that's a ${sigmas.toFixed(1)}σ move — the market prices this as a ${losePct}% chance.`;
      } else {
        loseCondition = `You lose money only if the stock drops more than ${pctDrop.toFixed(1)}% by expiration. Pull a live premium to see the IV-based probability.`;
      }
    }
  }

  // chart markers and dots
  const markers =
    mode === "spread"
      ? [
          { x: longStrike, label: `long ${money2(longStrike)}` },
          { x: putStrike, label: `short ${money2(putStrike)}` },
        ]
      : [{ x: putStrike, label: `put ${money2(putStrike)}` }];
  if (mode === "strangle" || mode === "covered") markers.push({ x: callStrike, label: `call ${money2(callStrike)}` });

  const dots =
    mode === "spread"
      ? [
          { x: longStrike * 0.97, y: stratPnl(longStrike * 0.97, p) },
          { x: (putStrike + longStrike) / 2, y: midPnl },
        ]
      : [{ x: down1Price, y: down1Pnl }, ...(hasIv ? [{ x: down2Price, y: down2Pnl }] : [])];
  if (mode === "strangle" || mode === "covered") dots.push({ x: upPrice, y: upPnl });

  // stat strip — max loss first
  let worstLabel, worstValue;
  if (mode === "strangle") {
    worstLabel = `Loss if +${moveLbl}% (no ceiling)`;
    worstValue = money(upPnl);
  } else if (mode === "spread") {
    const maxLoss = stratPnl(longStrike * 0.97, p);
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
