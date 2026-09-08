// Suitability gate — the ONLY thing in this app allowed to say "pick" or
// "don't pick." Deliberately built from facts already known today, never
// a forecast of what the stock will do next:
//
//   - can you afford it (cash/collateral fits the account)
//   - is there a known earnings date before expiration (a known gap risk,
//     not a guess about direction)
//   - is the market paying fairly-or-richly for this stock's own recent
//     movement (richnessSignal — a quote fact: IV vs. realized vol today,
//     not a prediction of where IV or the stock goes next)
//   - do you actually accept this trade's real worst case (owning the
//     shares at strike for a plain cash-secured put; the defined max loss,
//     usually same-day exercise of a long put rather than open-ended stock
//     ownership, for a spread — see AssignmentView.tsx) — this is the one
//     gate no data source can answer, so this function never infers or
//     defaults it: `worstCaseAccepted` only ever reflects what the person
//     themself answered, e.g. a checkbox in the UI naming their trade's
//     actual worst case, and stays "unknown" — blocking a "pick" verdict —
//     until they do
//
// What this deliberately does NOT use, because backtesting this app's
// three recommendation systems (see README's "Backtesting this app's
// buy/sell signals") showed none of them predict a forward return: win
// rate, probability of profit (delta-derived), annualized yield, cushion,
// or Alex's scan / Holdings' score or grade. Those numbers describe what a
// trade looks like, not whether it's a good idea — mixing them into a
// pick/don't-pick verdict is exactly the "0-100 score" this file exists to
// not be. They can still be shown elsewhere as information (the modeled
// CSPs backtest showed ~78% win rates with a ~-9% left tail in every
// grade, which is what short-premium structurally looks like, not
// evidence of a good pick) — just never as the reason to act.
//
// A verdict is "pick" only when every knowable fact passes. Any fact this
// app genuinely doesn't have (earnings/richness unavailable) blocks "pick"
// too — an unknown is not a pass. "dont-pick" only fires on a fact that's
// actually known to be bad; a genuine unknown gets "manual-check-needed"
// instead, distinct from a hard no.

import type { Richness } from "../types";

export type SuitabilityVerdict = "pick" | "dont-pick" | "manual-check-needed";

export interface SuitabilityCheck {
  key: "afford" | "earnings" | "richness" | "ownership";
  label: string;
  // true = known and satisfied, false = known and failed, null = this app
  // has no way to know (either data wasn't available, or — "ownership" —
  // it's never something a data source can answer).
  pass: boolean | null;
  detail: string;
}

export interface SuitabilityInput {
  canAfford: boolean;
  hasEarnings: boolean | null; // null = no historical/live earnings-calendar data for this check
  richnessTag: Richness["tag"] | null | undefined; // null/undefined = IV or realized vol unavailable
  // Never inferred, never defaulted to true — only ever set by the person
  // actually answering "do you accept this trade's real worst case,"
  // e.g. a checkbox in the UI. null = not yet answered.
  worstCaseAccepted: boolean | null;
}

export interface SuitabilityResult {
  verdict: SuitabilityVerdict;
  checks: SuitabilityCheck[];
}

export function suitabilityVerdict({ canAfford, hasEarnings, richnessTag, worstCaseAccepted }: SuitabilityInput): SuitabilityResult {
  const checks: SuitabilityCheck[] = [
    {
      key: "afford",
      label: "Fits your account size",
      pass: canAfford,
      detail: canAfford
        ? "The collateral this trade locks up fits inside your account size."
        : "This trade's collateral is larger than your account can absorb — a fact about your account, not the stock.",
    },
    {
      key: "earnings",
      label: "No earnings before expiration",
      pass: hasEarnings === true ? false : hasEarnings === false ? true : null,
      detail:
        hasEarnings === true
          ? "Earnings land before expiration — a known gap-risk event, not a guess about direction."
          : hasEarnings === false
            ? "No earnings report is scheduled before this trade's expiration."
            : "No earnings-calendar data available for this ticker right now — this can't be confirmed either way.",
    },
    {
      key: "richness",
      label: "Priced fair or rich vs. this stock's own recent movement",
      pass: richnessTag === "cheap" ? false : richnessTag === "fair" || richnessTag === "rich" ? true : null,
      detail:
        richnessTag === "cheap"
          ? "Implied vol is running below this stock's own realized vol — you would not be paid enough for the risk today."
          : richnessTag === "fair" || richnessTag === "rich"
            ? "Implied vol is at or above this stock's own realized vol — the market is paying fairly (or better) for the risk today."
            : "No implied-vol/realized-vol comparison available for this ticker right now — this can't be confirmed either way.",
    },
    {
      key: "ownership",
      label: "You accept this trade's actual worst case",
      pass: worstCaseAccepted, // only ever true/false when the person themself answered — see SuitabilityInput
      detail:
        worstCaseAccepted === true
          ? "You've confirmed you accept this trade's real worst-case outcome, not just the premium collected."
          : worstCaseAccepted === false
            ? "You've said you would not accept this trade's real worst-case outcome — that alone makes this a don't-pick, whatever the other checks say."
            : "Only you can answer this. Assignment (or, on a spread, the defined max loss) is the product being sold here, not an edge case — if you wouldn't accept that outcome, this isn't a pick, whatever the other checks say.",
    },
  ];

  const hardFail = checks.some((c) => c.pass === false);
  const anyUnknown = checks.some((c) => c.pass === null);
  const verdict: SuitabilityVerdict = hardFail ? "dont-pick" : anyUnknown ? "manual-check-needed" : "pick";

  return { verdict, checks };
}
