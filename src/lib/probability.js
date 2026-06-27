// Honest probability layer — market-implied numbers only, no directional forecast.
// delta-as-probability is an approximation (technically dual-delta / N(d2))
// but is the standard market shorthand and directionally correct for OTM options.

export function popFromDelta(strategy, legs) {
  if (strategy === "put" || strategy === "spread") {
    return 1 - Math.abs(legs.shortPutDelta ?? 0);
  }
  if (strategy === "strangle") {
    return 1 - Math.abs(legs.putDelta ?? 0) - Math.abs(legs.callDelta ?? 0);
  }
  if (strategy === "covered") {
    return {
      keepPremium: 1 - Math.abs(legs.callDelta ?? 0),
      assignmentRisk: Math.abs(legs.putDelta ?? 0),
    };
  }
  return null;
}

export function expectedMove(spot, atmIV, dte) {
  if (!(spot > 0) || !(atmIV > 0) || !(dte > 0)) return 0;
  return spot * atmIV * Math.sqrt(dte / 365);
}

// How many "expected moves" away the strike is from current price.
// >1.0 means you're outside the typical range the market expects.
export function cushionSigma(spot, strike, expMove) {
  if (!(expMove > 0)) return 0;
  return (spot - strike) / expMove;
}

// Plain English — what the win-rate number means for a regular person.
export function popPlain(pop) {
  if (pop == null || isNaN(pop)) return null;
  const n = Math.round(pop * 100);
  if (n >= 80) return `About ${n} out of 100 trades set up like this expire with a profit`;
  if (n >= 65) return `About ${n} out of 100 trades like this expire with a profit — decent odds, but always size for the loss`;
  if (n >= 50) return `About ${n} out of 100 — roughly a coin flip. The premium needs to be fat to make this worthwhile`;
  return `Less than half of trades at this setup end in profit — the premium better be very fat`;
}

// Plain English — what the buffer number means.
export function cushionPlain(sigma) {
  if (sigma == null || isNaN(sigma)) return null;
  const s = sigma.toFixed(1);
  if (sigma >= 1.5) return `The stock would need to fall ${s}× further than its normal range before you lose — a lot of room`;
  if (sigma >= 1.0) return `The stock would need to have a bigger-than-normal move to hit your loss zone`;
  if (sigma >= 0.5) return `Thin buffer — any bad week could put you near a loss`;
  return `Very little room — even a small drop could hurt`;
}
