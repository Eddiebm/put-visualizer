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
      ? `bad-week scenario loss ${s.badWeekPnl < 0 ? "-" : "+"}$${Math.abs(Math.round(s.badWeekPnl))}`
      : "";
    const nums = [yld, cush, loss].filter(Boolean).join(", ");
    return `- ${s.sym} (${s.name}): $${s.price.toFixed(2)} → $${s.strike.toFixed(2)} strike. ${nums}`;
  }).join("\n");

  const prompt = `You are a blunt, plain-English options risk analyst helping a small retail trader with $${Math.round(capital)} decide which stocks are better or worse candidates for selling a ${stratLabel}.

Here are the stocks they are comparing, with live option data:
${lines}

For each stock, give:
1. A one-word verdict: FAVORABLE, CAUTION, or AVOID
2. One sentence on WHY it is or isn't a good put-selling candidate (company stability, sector risk, typical volatility)
3. One specific flag to watch (e.g. earnings risk, sector cyclicality, regulatory risk, low option liquidity)

Rules:
- Be honest — if the premium is too thin for the risk, say so
- Do NOT make price predictions or say "it will go up/down"
- Do NOT give investment advice — frame as "factors to consider"
- Keep each entry under 60 words total
- If you don't have enough information about a company, say so rather than guessing
- Your training data has a cutoff — flag that recent events may change the picture

Return ONLY valid JSON in this exact shape, no prose outside it:
{
  "verdicts": [
    { "sym": "AAPL", "verdict": "FAVORABLE", "reason": "...", "flag": "..." }
  ],
  "caveat": "one sentence about limitations of this analysis"
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
