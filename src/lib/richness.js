// Are you being paid fairly to take this risk?
// Compares what the market is pricing in (implied vol) vs what the stock has
// actually been doing (realized vol). One signal, plain English only.

export function richnessSignal(marketIV, rvol) {
  if (!(marketIV > 0) || !(rvol > 0)) return null;

  const spread = marketIV - rvol;
  const mktPct = Math.round(marketIV * 100);
  const rvPct = Math.round(rvol * 100);
  const gapPct = Math.round(Math.abs(spread) * 100);

  if (spread > 0.05) {
    return {
      tag: "rich",
      emoji: "✅",
      headline: "Good time to sell — the market is paying above average",
      detail: `The market is pricing in ${mktPct}% annual movement, but this stock has only actually moved about ${rvPct}% recently. That ${gapPct}% gap is the market paying for fear that hasn't shown up. When you sell premium here, you collect more than the risk is probably worth.`,
    };
  }

  if (spread < -0.03) {
    return {
      tag: "cheap",
      emoji: "⚠️",
      headline: "Probably not worth selling right now",
      detail: `The stock has actually been moving ${rvPct}% annually, but the market is only paying you for ${mktPct}% movement. You're not being compensated for the real risk of how much this stock moves. Better to wait for a spike in fear.`,
    };
  }

  return {
    tag: "fair",
    emoji: "🟡",
    headline: "Premium is about average — not a steal, not a trap",
    detail: `The market is pricing in ${mktPct}% movement and the stock has actually been moving about ${rvPct}% recently. You're getting paid roughly fair value. Fine to trade, but don't expect an edge — you're just collecting the normal premium.`,
  };
}
