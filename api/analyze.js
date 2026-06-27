export const config = { runtime: "edge" };

export default async function handler(req) {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return json({ available: false, reason: "no_key" }, 200);

  let body;
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }

  const { stocks, capital, mode } = body;
  if (!Array.isArray(stocks) || stocks.length === 0) return json({ error: "no_stocks" }, 400);

  const stratLabel =
    mode === "spread" ? "put credit spread (capped loss, good for small accounts)"
    : mode === "strangle" ? "short strangle (naked call — unlimited upside risk)"
    : mode === "covered" ? "covered strangle (own the shares)"
    : "cash-secured put";

  const lines = stocks.map((s) => {
    const yld = s.annYield != null ? `${s.annYield.toFixed(1)}% annualized yield` : "no live premium";
    const cush = s.cushion != null ? `${s.cushion.toFixed(1)}% cushion to breakeven` : "";
    const loss = s.badWeekPnl != null
      ? `adverse-move loss $${Math.abs(Math.round(s.badWeekPnl))}`
      : "";
    const lossRatio = s.badWeekPnl != null && s.collateral > 0
      ? `max-loss-to-collateral ${(Math.abs(s.badWeekPnl) / s.collateral * 100).toFixed(0)}%`
      : "";
    const nums = [yld, cush, loss, lossRatio].filter(Boolean).join(", ");
    return `- ${s.sym} (${s.name}): $${s.price.toFixed(2)} → $${s.strike.toFixed(2)} strike. ${nums || "no premium data yet"}`;
  }).join("\n");

  const prompt = `You are a blunt, plain-English options risk analyst. A small retail trader with $${Math.round(capital)} is comparing these stocks for selling a ${stratLabel}.

Here are the structured numbers for each stock — yield, cushion to breakeven, adverse-move loss, and max-loss-to-collateral ratio:
${lines}

Your job: explain the TRADEOFF each stock's numbers represent. Do NOT simply rank stocks or pick winners. Surface the risk that the yield is hiding.

For each stock:
1. A one-word signal: FAVORABLE, CAUTION, or AVOID — based on whether the yield compensates for the cushion and max-loss ratio
2. One sentence explaining the tradeoff: "Higher yield but thinner cushion — the premium is compensation for real tail risk" beats "this is a good stock"
3. One specific flag: sector risk, earnings binary, thin option market, high beta vs. low cushion, etc.

Rules:
- NEVER say a stock will go up or down
- NEVER make investment recommendations — explain the tradeoff in the numbers
- If yield is high but cushion is thin, flag it explicitly
- If max-loss-to-collateral is >30%, call it out
- Keep each entry under 70 words
- Your training cutoff means recent events may change the picture — say so in the caveat

Return ONLY valid JSON, no prose outside it:
{
  "verdicts": [
    { "sym": "AAPL", "verdict": "FAVORABLE", "reason": "...", "flag": "..." }
  ],
  "caveat": "one sentence about what these numbers can and can't tell you"
}`;

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
        max_tokens: 1200,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!r.ok) return json({ error: "upstream_error", status: r.status }, 502);

    const data = await r.json();
    const text = data?.content?.[0]?.text ?? "";

    // extract JSON from response (model may wrap it in markdown)
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return json({ error: "bad_response" }, 502);

    const parsed = JSON.parse(match[0]);
    return json({ available: true, ...parsed }, 200, {
      "cache-control": "s-maxage=300, stale-while-revalidate=600",
    });
  } catch {
    return json({ error: "analysis_failed" }, 502);
  }
}

function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...extra },
  });
}
