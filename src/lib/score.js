// Opportunity score — one number that drives whether the app shows a trade.
// All inputs are already computed; this just weighs and sums them.

export function opportunityScore({ richness, pop, cushion, canAfford, capitalPct, annYield, maxLossPct }) {
  if (!canAfford) return 0;

  let score = 0;

  // Volatility richness — are you being paid more than the stock deserves? (35 pts)
  if (richness?.tag === "rich") score += 35;
  else if (richness?.tag === "fair") score += 16;

  // Probability of profit (25 pts)
  if (pop >= 0.80) score += 25;
  else if (pop >= 0.70) score += 18;
  else if (pop >= 0.60) score += 10;
  else if (pop >= 0.50) score += 4;

  // Downside cushion in σ-units (20 pts)
  if (cushion >= 1.5) score += 20;
  else if (cushion >= 1.0) score += 14;
  else if (cushion >= 0.7) score += 8;
  else if (cushion >= 0.5) score += 3;

  // Position sizing vs account (10 pts)
  if (capitalPct <= 0.40) score += 10;
  else if (capitalPct <= 0.70) score += 5;
  else score += 1;

  // Annualized yield (10 pts)
  if (annYield >= 25) score += 10;
  else if (annYield >= 15) score += 7;
  else if (annYield >= 10) score += 3;

  // Penalty: if max loss is catastrophic relative to account, cap the score
  if (maxLossPct > 0.80) score = Math.min(score, 30);

  return Math.min(100, Math.round(score));
}

export function scoreGrade(score) {
  if (score >= 80) return { label: "Excellent", color: "#16a34a", bg: "#f0fdf4" };
  if (score >= 65) return { label: "Good",      color: "#22c55e", bg: "#f7fdf9" };
  if (score >= 50) return { label: "Average",   color: "#d97706", bg: "#fffbeb" };
  if (score >= 35) return { label: "Weak",      color: "#f97316", bg: "#fff7ed" };
  return                  { label: "Avoid",     color: "#e14c4c", bg: "#fff5f5" };
}

export function autopilotChecks({ richness, pop, canAfford, maxLossPct, cushion, capitalPct }) {
  return [
    {
      key: "conditions",
      label: "Market conditions favor premium sellers",
      detail: "We compare what the market is pricing in vs how much the stock has actually moved. When fear is high relative to actual movement, option sellers have an edge.",
      pass: richness?.tag === "rich" || richness?.tag === "fair",
      warn: richness?.tag === "fair",
      fail: "Market is calm — option premiums are thin and not worth the risk right now.",
    },
    {
      key: "richness",
      label: "Options are priced above their actual movement",
      detail: "The best time to sell options is when the market is paying for fear that hasn't shown up in actual stock prices. That gap is money in your pocket.",
      pass: richness?.tag === "rich",
      warn: richness?.tag === "fair",
      warnLabel: "Options are fairly priced — no extra edge today.",
      fail: "Options are cheaply priced — you're not being paid enough for the risk.",
    },
    {
      key: "pop",
      label: "Probability of profit is above 65%",
      detail: "This is the market's own estimate, based on current option prices, of how likely your trade expires with a profit. Above 65% is a reasonable threshold.",
      pass: pop >= 0.65,
      warn: pop >= 0.55 && pop < 0.65,
      warnLabel: "Odds are slightly below our 65% threshold.",
      fail: "Odds of winning are below 55% — not enough edge.",
    },
    {
      key: "cushion",
      label: "Plenty of room before you lose money",
      detail: "Your strike price is far enough below the current stock price that the stock would have to make an unusually large move to hurt you.",
      pass: cushion >= 1.0,
      warn: cushion >= 0.7,
      warnLabel: "Buffer is a bit thin — a bad week could put you near a loss.",
      fail: "Strike is too close to current price — very thin margin for error.",
    },
    {
      key: "affordable",
      label: "This trade fits your account",
      detail: "The collateral required is within your available balance.",
      pass: canAfford,
      fail: "You cannot afford this trade with your current account balance.",
    },
    {
      key: "risk",
      label: "Maximum loss is manageable",
      detail: "Even in the worst case, this trade would not wipe out your account. Protecting capital is more important than any single trade.",
      pass: maxLossPct <= 0.50,
      warn: maxLossPct <= 0.70,
      warnLabel: "Max loss is more than half your account — consider sizing down.",
      fail: "Maximum loss is too large relative to your account.",
    },
    {
      key: "sizing",
      label: "Not over-concentrating in one trade",
      detail: "Using more than 70% of your account on a single trade leaves no room for error — or for other opportunities.",
      pass: capitalPct <= 0.70,
      warn: capitalPct <= 0.85,
      warnLabel: "Using a large portion of your account — be cautious.",
      fail: "This trade would use almost all of your account.",
    },
    {
      key: "earnings",
      label: "No earnings before expiration",
      detail: "Earnings announcements can cause sudden price swings that blow up option trades. Always check the earnings calendar before entering.",
      manual: true,
    },
  ];
}

// Aggregate market condition from a set of richness tags
export function marketCondition(richnessTags) {
  if (!richnessTags.length) return null;
  const rich = richnessTags.filter(t => t === "rich").length;
  const pct = rich / richnessTags.length;
  if (pct >= 0.40) return {
    emoji: "🟢", label: "Good conditions", color: "#16a34a",
    summary: "The market is pricing in more fear than stocks have actually shown. That gap is money for option sellers.",
  };
  if (pct >= 0.20) return {
    emoji: "🟡", label: "Average conditions", color: "#d97706",
    summary: "Conditions are neutral. Some opportunities exist but premiums are not unusually fat today.",
  };
  return {
    emoji: "🔴", label: "No edge today", color: "#e14c4c",
    summary: "Option premiums are thin across the board. The market is calm. Cash is a position too — wait for a better day.",
  };
}
