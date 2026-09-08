// Models what selling a cash-secured put would actually have paid at a
// given walk-forward day, instead of only checking whether the underlying
// stock's own price went up. A stock backtest asks "did the price rise" —
// a CSP backtest asks "was the premium collected worth the risk actually
// taken," which is the real product this app's options calculator prices
// (see src/lib/blackScholes.ts, reused here rather than re-implemented so
// this overlay uses the exact same pricing/greeks math the live app shows
// a user — not a second copy of Black-Scholes that could quietly drift
// from it).
//
// Default trade shape (45 DTE, 30-delta) mirrors the external 20-year
// report this was ported from — see README.md's backtesting section.
//
// Important limitations, stated up front rather than buried:
//   - No historical options chain exists in this harness, so there is no
//     real implied vol to price off. Trailing realized volatility (see
//     src/lib/blackScholes.ts's realizedVol) is used as an IV proxy. Real
//     implied vol normally trades ABOVE realized (the variance risk
//     premium sellers are paid for carrying tail risk), so modeled
//     premiums here are, if anything, an underestimate of what a real
//     quote would have paid — this overlay is more likely to UNDERSTATE a
//     seller's edge than overstate it.
//   - European exercise (held to expiration) — no early assignment
//     modeling, no dividends, no commissions/fees.
//   - r (risk-free rate) is a fixed assumption, not a historical rates
//     series.
// None of this makes the overlay a substitute for real option prices; it's
// a consistent, reproducible stand-in for "would this grade have been
// worth trusting to sell premium on," not a claim of exact historical P/L.

import { bsPrice, bsGreeks, realizedVol as computeRealizedVol } from "../../src/lib/blackScholes";
import type { Bar } from "../../src/types";

export interface CspTradeParams {
  dte: number; // calendar days to expiration
  deltaTarget: number; // magnitude, e.g. 0.30 for a 30-delta short put
  ivLookback: number; // trailing bars for the realized-vol IV proxy
  rate: number; // risk-free rate assumption
}

export const DEFAULT_CSP_PARAMS: CspTradeParams = {
  dte: 45,
  deltaTarget: 0.3,
  ivLookback: 20,
  rate: 0.05,
};

export interface CspOutcome {
  strike: number;
  premium: number; // modeled premium collected, per share
  assigned: boolean; // finished ITM (priceAtExpiry < strike)
  netPL: number; // per share: premium - max(0, strike - priceAtExpiry)
  returnOnCollateral: number; // netPL / strike — what matters for a CASH-SECURED put, where strike*100 is the capital actually locked up
}

// Bisection search for the strike whose Black-Scholes put delta matches
// -deltaTarget. Put delta is monotonic in strike (a higher strike is
// always a more negative, more ITM-like, delta), so a numeric search
// directly against the app's own bsGreeks is both correct and can't drift
// out of sync with it the way a separate inverse-normal-CDF implementation
// could. Returns null for a nonsensical input rather than an infinite loop
// or a garbage strike.
export function strikeForPutDelta(
  spot: number,
  dte: number,
  rate: number,
  vol: number,
  deltaTarget: number
): number | null {
  if (!(spot > 0) || !(dte > 0) || !(vol > 0) || !(deltaTarget > 0) || deltaTarget >= 1) return null;
  let lo = spot * 0.01; // delta ~ 0 here
  let hi = spot * 3; // delta ~ -1 here
  for (let iter = 0; iter < 100; iter++) {
    const mid = (lo + hi) / 2;
    const { delta } = bsGreeks(spot, mid, dte, rate, vol, "put");
    // delta is negative for a put; more negative = higher strike needed to
    // pull it back down (toward less negative), so a too-negative delta
    // means we searched too high.
    if (delta < -deltaTarget) hi = mid;
    else lo = mid;
  }
  return (lo + hi) / 2;
}

// Rough trading-day count for `dte` calendar days, used to locate the
// expiration bar in a daily-bars series — the same 252/365 approximation
// run.ts already uses elsewhere in this harness to size synthetic data.
export function tradingDaysForDte(dte: number): number {
  return Math.round(dte * (252 / 365));
}

// Models one short-put trade opened "as of" bars[i] and held to expiration.
// Sizing (spot, strike, premium) uses ONLY bars[0..i] — the same
// no-lookahead discipline as the walk-forward loop's own score computation
// (see engine.ts). Settling the trade legitimately looks at
// bars[i + tradingDaysForDte(dte)], a genuinely future bar — exactly like
// engine.ts's own forwardReturns, which also measures an outcome using
// bars the score itself never saw.
//
// Returns null when there isn't enough trailing history for the vol
// lookback, or not enough forward history to reach expiration. The
// walk-forward loop's own stopping condition (see engine.ts) guarantees
// the latter for horizons it was asked for, but a CSP's DTE need not match
// any requested horizon, so this re-checks independently rather than
// assuming.
export function modelCspTrade(bars: Bar[], i: number, params: CspTradeParams = DEFAULT_CSP_PARAMS): CspOutcome | null {
  const { dte, deltaTarget, ivLookback, rate } = params;
  if (i < ivLookback || i < 0 || i >= bars.length) return null;
  const expiryIdx = i + tradingDaysForDte(dte);
  if (expiryIdx >= bars.length) return null;

  const spot = bars[i].c;
  if (!(spot > 0)) return null;
  const closes = bars.slice(i - ivLookback, i + 1).map((b) => b.c);
  const vol = computeRealizedVol(closes, ivLookback);
  if (vol == null || !(vol > 0)) return null;

  const strike = strikeForPutDelta(spot, dte, rate, vol, deltaTarget);
  if (strike == null || !(strike > 0)) return null;

  const premium = bsPrice(spot, strike, dte, rate, vol, "put");
  if (!(premium > 0)) return null;

  const priceAtExpiry = bars[expiryIdx].c;
  const assigned = priceAtExpiry < strike;
  const netPL = premium - Math.max(0, strike - priceAtExpiry);
  const returnOnCollateral = netPL / strike;

  return { strike, premium, assigned, netPL, returnOnCollateral };
}
