import { money, money2, trimNum, num } from "../lib/format";
import { stratPnl } from "../lib/pnl";
import { COMPANIES } from "../appConstants";
import { styles } from "../styles";
import type { Defaults } from "../appConstants";
import type { PnlModel } from "../types";

export interface TourStep {
  tag: string;
  title: string;
  setup: string;
  outcome: string | null;
  good: boolean | null;
  body: string;
}

export function buildTourSteps(ticker: string, inputs: Defaults, model: PnlModel | null): TourStep[] {
  const company = COMPANIES.find((c) => c.ticker === ticker);
  const sym = ticker || "the stock";
  const name = company ? company.name : sym;
  const mode = inputs.mode;
  const putStrike = num(inputs.strike);
  const putPrem = num(inputs.premium);
  const callStrike = num(inputs.callStrike);
  const callPrem = num(inputs.callPremium);
  const spot = num(inputs.spot);
  const contracts = Math.max(1, Math.round(num(inputs.contracts)));
  const shares = contracts * 100;
  const dropPct = num(inputs.dropPct);
  const moveLbl = trimNum(dropPct);

  const p = { mode, putStrike, putPrem, callStrike, callPrem: callPrem, spot, shares };
  const credit = model ? model.credit : putPrem * shares;
  const collateral = model ? model.collateral : putStrike * shares;

  const downPrice = putStrike * (1 - dropPct / 100);
  const upAnchor = mode === "put" ? putStrike : callStrike;
  const upPrice = upAnchor * (1 + dropPct / 100);
  const flatPrice = mode === "covered" ? spot : mode === "strangle" ? (putStrike + callStrike) / 2 : putStrike;

  const downPnl = stratPnl(downPrice, p);
  const flatPnl = stratPnl(flatPrice, p);
  const upPnl = stratPnl(upPrice, p);

  const fmt = (n: number) => (n >= 0 ? "+" : "−") + "$" + Math.abs(Math.round(n)).toLocaleString();

  if (mode === "put") {
    return [
      {
        tag: "The trade",
        title: `You sell ${contracts > 1 ? contracts + " puts" : "a put"} on ${name}`,
        setup: `${contracts} contract${contracts !== 1 ? "s" : ""} · ${money2(putStrike)} strike · ${money2(putPrem)} premium`,
        outcome: fmt(credit),
        good: true,
        body: `You collect ${money(credit)} upfront and set aside ${money(collateral)} in cash. If ${sym} falls below ${money2(putStrike)} by expiration, you're obligated to buy ${shares} shares at that price.`,
      },
      {
        tag: `Scenario 1 — ${sym} drops`,
        title: `${name} falls to ${money2(downPrice)}`,
        setup: `−${moveLbl}% · below your ${money2(putStrike)} strike`,
        outcome: fmt(downPnl),
        good: downPnl >= 0,
        body: `You're assigned — forced to buy ${shares} shares of ${sym} at ${money2(putStrike)} when they're worth ${money2(downPrice)}. That's a ${money(Math.abs(downPnl - credit))} stock loss, minus the ${money(credit)} you collected. Net: ${fmt(downPnl)}. This is the side the ads skip.`,
      },
      {
        tag: `Scenario 2 — ${sym} flat`,
        title: `${name} stays near ${money2(putStrike)}`,
        setup: "At or above your strike",
        outcome: fmt(flatPnl),
        good: true,
        body: `The put expires worthless. Nobody will make you buy ${sym} at ${money2(putStrike)} when it's trading at that price or higher — the option has no value. You keep ${money(credit)} and your ${money(collateral)} is released.`,
      },
      {
        tag: `Scenario 3 — ${sym} rises`,
        title: `${name} climbs to ${money2(upPrice)}`,
        setup: `+${moveLbl}% · above your strike`,
        outcome: fmt(upPnl),
        good: true,
        body: `Put expires worthless. You keep ${money(credit)}. But ${sym} gained ${money((upPrice - putStrike) * shares)} — and you didn't own it, so that upside wasn't yours. Your gain is always capped at the premium, no matter how high ${sym} climbs.`,
      },
      {
        tag: "The asymmetry",
        title: "The gap is the whole point",
        setup: `Max gain: ${money(credit)} · Bad-week loss: ${money(Math.abs(downPnl))}`,
        outcome: null,
        good: null,
        body: `Scenarios 2 and 3 both pay ${money(credit)}. Scenario 1 loses ${money(Math.abs(downPnl))} — and gets worse the further ${sym} falls. The chart below draws this: flat green ceiling on top, red drop below. That gap is the trade you're making.`,
      },
      {
        tag: "Now try it",
        title: "Adjust the numbers above",
        setup: "Change strike, premium, or contracts",
        outcome: null,
        good: null,
        body: `Pick any stock or ETF to auto-fill the price. Change the strike or premium and every number — the chart, scenarios, and order ticket — updates live. Hit "How does this work?" any time to rerun this walkthrough with your current inputs.`,
      },
    ];
  }

  if (mode === "strangle") {
    return [
      {
        tag: "The trade",
        title: `You sell a strangle on ${name}`,
        setup: `${contracts} contract${contracts !== 1 ? "s" : ""} · ${money2(putStrike)}P / ${money2(callStrike)}C`,
        outcome: fmt(credit),
        good: true,
        body: `You collect ${money(credit)} upfront — both a put and a call premium. You profit as long as ${sym} stays between ${money2(putStrike)} and ${money2(callStrike)} by expiration. Outside that range, you start losing.`,
      },
      {
        tag: `Scenario 1 — ${sym} drops`,
        title: `${name} falls to ${money2(downPrice)}`,
        setup: `−${moveLbl}% · below your ${money2(putStrike)} put strike`,
        outcome: fmt(downPnl),
        good: downPnl >= 0,
        body: `The put is in the money. You're assigned on ${shares} shares at ${money2(putStrike)} when they're worth ${money2(downPrice)}. The call expires worthless. Net: ${fmt(downPnl)}.`,
      },
      {
        tag: `Scenario 2 — ${sym} flat`,
        title: `${name} stays between strikes`,
        setup: `Between ${money2(putStrike)} and ${money2(callStrike)}`,
        outcome: fmt(flatPnl),
        good: true,
        body: `Both options expire worthless. You keep the full ${money(credit)} — this is the sweet spot. The trade pays best when the stock goes nowhere.`,
      },
      {
        tag: `Scenario 3 — ${sym} rises`,
        title: `${name} climbs to ${money2(upPrice)}`,
        setup: `+${moveLbl}% · above your ${money2(callStrike)} call strike`,
        outcome: fmt(upPnl),
        good: upPnl >= 0,
        body: `The call is in the money — you're short a naked call with no shares to cover it. The loss is ${fmt(upPnl)} here, but it keeps growing with no ceiling as long as ${sym} keeps rising. This is the unlimited-risk side.`,
      },
      {
        tag: "The asymmetry",
        title: "The gap is the whole point",
        setup: `Max gain: ${money(credit)} · Upside: no ceiling`,
        outcome: null,
        good: null,
        body: `The sweet spot is ${money(credit)} and it's a narrow band. Either wing — down past the put or up past the call — starts costing you, and the call side never stops.`,
      },
      {
        tag: "Now try it",
        title: "Adjust the numbers above",
        setup: "Change strikes, premiums, or contracts",
        outcome: null,
        good: null,
        body: `Widen the strikes to make the tent bigger but cheaper. Narrow them for more premium but less room. Hit "How does this work?" any time to rerun this with your current inputs.`,
      },
    ];
  }

  // covered strangle
  return [
    {
      tag: "The trade",
      title: `You run a covered strangle on ${name}`,
      setup: `Own ${shares} shares · sell ${money2(putStrike)}P + ${money2(callStrike)}C`,
      outcome: fmt(credit),
      good: true,
      body: `You own ${shares} shares of ${sym} at ${money2(spot)} and sell both a put and a call. You collect ${money(credit)} in premium. Your upside is capped at the call strike; your downside is doubled — you lose on the shares AND get assigned on the put.`,
    },
    {
      tag: `Scenario 1 — ${sym} drops`,
      title: `${name} falls to ${money2(downPrice)}`,
      setup: `−${moveLbl}% · below your ${money2(putStrike)} put strike`,
      outcome: fmt(downPnl),
      good: downPnl >= 0,
      body: `Your shares lose value AND you're assigned on the put — buying another ${shares} shares at ${money2(putStrike)} when they're worth ${money2(downPrice)}. Double the downside. Net: ${fmt(downPnl)}.`,
    },
    {
      tag: `Scenario 2 — ${sym} flat`,
      title: `${name} stays near ${money2(spot)}`,
      setup: "Between your put and call strikes",
      outcome: fmt(flatPnl),
      good: flatPnl >= 0,
      body: `Both options expire worthless. You keep ${money(credit)} in premium, your shares are unchanged, and you still own them. Best outcome.`,
    },
    {
      tag: `Scenario 3 — ${sym} rises`,
      title: `${name} climbs to ${money2(upPrice)}`,
      setup: `+${moveLbl}% · above your ${money2(callStrike)} call strike`,
      outcome: fmt(upPnl),
      good: upPnl >= 0,
      body: `Your shares get called away at ${money2(callStrike)}. You don't lose money, but you miss the gain above that price. Your profit is capped at ${money2(callStrike)} per share plus the premium collected.`,
    },
    {
      tag: "The asymmetry",
      title: "Capped upside, doubled downside",
      setup: `Max gain: ${money(upPnl)} · Bad-week loss: ${money(Math.abs(downPnl))}`,
      outcome: null,
      good: null,
      body: `The covered strangle sells off your upside for premium income but doesn't reduce the downside — it adds to it. Make sure you're comfortable holding ${sym} at lower prices before running this.`,
    },
    {
      tag: "Now try it",
      title: "Adjust the numbers above",
      setup: "Change strikes, premiums, or share cost",
      outcome: null,
      good: null,
      body: `Hit "How does this work?" any time to rerun this walkthrough with your current ${sym} inputs.`,
    },
  ];
}

interface TourProps {
  step: number;
  steps: TourStep[];
  onNext: () => void;
  onDone: () => void;
  onSkip: () => void;
}

export function Tour({ step, steps, onNext, onDone, onSkip }: TourProps) {
  const s = steps[Math.min(step, steps.length - 1)];
  const isLast = step >= steps.length - 1;
  const hasOutcome = s.outcome != null;
  return (
    <div style={styles.tourOverlay}>
      <div style={styles.tourCard}>
        <div style={styles.tourTag}>{s.tag} · {step + 1}/{steps.length}</div>
        <div style={styles.tourTitle}>{s.title}</div>
        {s.setup && <div style={styles.tourSetup}>{s.setup}</div>}

        {hasOutcome && (
          <div style={{
            ...styles.tourOutcome,
            color: s.good ? "#16a34a" : "#e14c4c",
            background: s.good ? "#f0fdf4" : "#fff5f5",
            border: `1px solid ${s.good ? "#bbf7d0" : "#fecaca"}`,
          }}>
            {s.outcome}
          </div>
        )}

        <div style={styles.tourBody}>{s.body}</div>

        <div style={styles.tourActions}>
          <button type="button" onClick={onSkip} style={styles.tourSkip}>
            Skip
          </button>
          <button type="button" onClick={isLast ? onDone : onNext} style={styles.tourNext}>
            {isLast ? "Got it" : "Next →"}
          </button>
        </div>
        <div style={styles.tourDots}>
          {steps.map((_, i) => (
            <span key={i} style={{ ...styles.tourDot, background: i === step ? "#1f2937" : "#e2e8f0" }} />
          ))}
        </div>
      </div>
    </div>
  );
}
