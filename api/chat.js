export const config = { runtime: "edge" };

export default async function handler(req) {
  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return json({ available: false, reason: "no_key" }, 200);
  }

  const { messages, context } = await req.json();
  if (!Array.isArray(messages) || messages.length === 0) {
    return json({ error: "messages required" }, 400);
  }

  const picksText = (context?.picks ?? [])
    .map((p, i) =>
      `${i + 1}. ${p.sym} (${p.name ?? ""}) — Score ${p.score}/100 (${p.grade}). ` +
      `Collect $${p.earn} if it works, lose up to $${p.lose} in the worst case. ` +
      `Odds: ${Math.round((p.pop ?? 0) * 100)} in 100. ` +
      `Uses $${p.collateralUsed ?? "?"} of your account. ` +
      `Buffer: stock needs a ${p.cushionDesc ?? "large"} move to hurt you. ` +
      `Richness: ${p.richnessTag ?? "unknown"} — ${p.richnessHeadline ?? ""}`
    )
    .join("\n");

  const systemPrompt = `You are an options trading coach. You help someone with a $${context?.capital ?? 500} account who is learning to sell put spreads to generate income.

TODAY'S MARKET: ${context?.marketCondition?.label ?? "unknown"}
${context?.marketCondition?.summary ?? ""}

TODAY'S TOP OPPORTUNITIES:
${picksText || "None found yet."}

YOUR RULES — never break these:
- Use zero jargon. Never say: delta, gamma, theta, vega, IV, implied volatility, historical volatility, Black-Scholes, Greeks, OTM, ITM, ATM, sigma, volatility surface.
- Translate everything. "Delta 0.18" → "about 82% probability of expiring safely." "IV > HV by 14%" → "options are overpriced today."
- Keep answers short: 2-4 sentences unless the user asks for more.
- This user has $${context?.capital ?? 500}. Always keep that in mind. Never suggest trades that would use more than 70% of their account.
- When asked "why X?", explain it in terms of the numbers above (score, earnings, cushion, richness) without using those words.
- You do NOT know future prices. Never say a stock will go up or down. You can say what the market is implying.
- If asked about earnings, remind them to check manually — you don't have that data.
- If the question is outside options trading, say so politely and redirect.
- Be encouraging but honest. If conditions are bad, say so plainly.`;

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 400,
        system: systemPrompt,
        messages: messages.slice(-12),
      }),
    });

    if (!r.ok) {
      const err = await r.text();
      console.error("Anthropic error", r.status, err);
      return json({ error: "ai_unavailable" }, 502);
    }

    const data = await r.json();
    const reply = data?.content?.[0]?.text ?? "I couldn't process that. Please try again.";
    return json({ reply });
  } catch (e) {
    return json({ error: "ai_unavailable" }, 502);
  }
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
