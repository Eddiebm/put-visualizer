export const config = { runtime: "edge" };

// Mirror of the curriculum topic list — must stay in sync with src/lib/curriculum.js
// (edge functions can't import from src/)
const CURRICULUM = [
  { topic: "What is a stock — and why does owning one matter?",                   terms: ["stock","share","equity","shareholder","ownership stake"]           },
  { topic: "Why do stock prices go up and down every second?",                    terms: ["supply and demand","buyer","seller","price discovery","auction"]    },
  { topic: "What is a stock market — and who actually runs it?",                  terms: ["NYSE","Nasdaq","exchange","listing","market maker","liquidity"]     },
  { topic: "What is a broker and how do they make money off you?",                terms: ["broker","brokerage","commission","payment for order flow","account"] },
  { topic: "What is the bid price and the ask price — and what is the spread?",   terms: ["bid","ask","spread","market maker","fill price"]                    },
  { topic: "Market orders vs limit orders — and why market orders can hurt you",  terms: ["market order","limit order","fill","slippage","execution"]          },
  { topic: "What is volume — and why thin volume is dangerous",                   terms: ["volume","liquidity","thin market","spread","price impact"]          },
  { topic: "What is market capitalization — large cap, small cap, what does it mean?", terms: ["market cap","large cap","mid cap","small cap","micro cap"]    },
  { topic: "What is the S&P 500 — and why does everyone keep talking about it?",  terms: ["S&P 500","index","benchmark","weighting","index fund"]              },
  { topic: "What is a bull market and a bear market — where do the names come from?", terms: ["bull market","bear market","20% rule","rally","correction","drawdown"] },
  { topic: "What is inflation — and why rising prices are the enemy of your investments", terms: ["inflation","CPI","purchasing power","real return","nominal return"] },
  { topic: "What is the Federal Reserve — and why eight meetings a year move markets", terms: ["Federal Reserve","Fed","FOMC","interest rate","monetary policy","fed funds rate"] },
  { topic: "What are earnings — the single most important number a company reports", terms: ["earnings","EPS","revenue","profit","beat","miss","guidance"]      },
  { topic: "What is the VIX — Wall Street's fear thermometer",                    terms: ["VIX","volatility index","implied volatility","fear gauge","CBOE"]   },
  { topic: "What is a dividend — getting paid just for owning a stock",           terms: ["dividend","yield","ex-dividend date","payout ratio","income investing"] },
  { topic: "What is a moving average — smoothing out the noise to see the trend", terms: ["moving average","SMA","20-day","50-day","200-day","trend filter"]  },
  { topic: "What is the 200-day moving average — the most important line on any chart", terms: ["200-day MA","long-term trend","above/below","institutional benchmark"] },
  { topic: "What is RSI — measuring momentum on a 0 to 100 scale",               terms: ["RSI","Relative Strength Index","overbought","oversold","momentum"]  },
  { topic: "What is ATR — measuring how much a stock actually moves day to day",  terms: ["ATR","Average True Range","daily range","volatility","stop sizing"] },
  { topic: "What is a trend — and why trading against it is the most expensive mistake beginners make", terms: ["trend","uptrend","downtrend","higher highs","lower lows","trend following"] },
  { topic: "What is volume confirmation — why price moves without volume are fake", terms: ["volume confirmation","conviction","accumulation","distribution","buying pressure"] },
  { topic: "What is a gap — and why they happen overnight while you sleep",       terms: ["gap","gap up","gap down","earnings gap","overnight risk","gap fill"] },
  { topic: "What is a stop-loss — the most important rule in all of trading",     terms: ["stop-loss","stop order","exit rule","capital protection","non-negotiable"] },
  { topic: "What is position sizing — why HOW MUCH you trade matters more than WHAT you trade", terms: ["position size","1% rule","risk per trade","account size","Kelly criterion"] },
  { topic: "What is risk/reward ratio — the math that makes losing trades survivable", terms: ["risk/reward","R multiple","2:1","3:1","expected value","positive expectancy"] },
  { topic: "What is a drawdown — understanding losing streaks before they happen", terms: ["drawdown","peak to trough","max drawdown","recovery time","losing streak"] },
  { topic: "What is expected value — the only number that tells you if a strategy works long-term", terms: ["expected value","EV","win rate","average win","average loss","edge"] },
  { topic: "What is diversification — why putting everything in one stock is not investing, it's gambling", terms: ["diversification","correlation","concentration risk","portfolio","uncorrelated"] },
  { topic: "What is the PDT rule — the $25,000 rule that limits small accounts", terms: ["PDT","Pattern Day Trader","$25,000","day trade","swing trade","overnight hold"] },
  { topic: "What is margin — borrowing money to trade and why it doubles your risk", terms: ["margin","leverage","buying power","margin call","forced liquidation"] },
  { topic: "What is an option contract — the right but not the obligation",       terms: ["option","contract","100 shares","right not obligation","buyer","seller"] },
  { topic: "What is a call option — betting a stock will go up",                  terms: ["call option","right to buy","strike price","expiration","premium","long call"] },
  { topic: "What is a put option — insurance against a stock falling",            terms: ["put option","right to sell","downside protection","long put","short put"] },
  { topic: "What is the strike price — choosing your bet before the game starts", terms: ["strike price","in the money","out of the money","at the money","ITM","OTM","ATM"] },
  { topic: "What is option expiration — and what happens when it arrives",        terms: ["expiration","expire worthless","assignment","exercise","DTE","days to expiration"] },
  { topic: "What is option premium — the money that flows from buyer to seller",  terms: ["premium","intrinsic value","time value","extrinsic value","price of the option"] },
  { topic: "What is implied volatility — the market's forecast of future fear",   terms: ["implied volatility","IV","expected move","pricing of uncertainty","vol"] },
  { topic: "What is time decay — why options lose value every single day even when nothing moves", terms: ["time decay","theta","theta burn","daily erosion","time value"] },
  { topic: "What is a cash-secured put — collecting income while waiting to buy a stock you want", terms: ["cash-secured put","CSP","collateral","cash secured","assignment risk","obligation"] },
  { topic: "What is a put credit spread — capping your risk with a safety net below", terms: ["put credit spread","short put","long put","spread width","max loss","collateral"] },
  { topic: "What is probability of profit — the market's own estimate of your chances", terms: ["POP","probability of profit","delta","out of the money","win probability"] },
  { topic: "What is IV rank — knowing if premiums are fat or thin today",         terms: ["IV rank","IV percentile","rich premiums","cheap premiums","selling environment"] },
  { topic: "What is the volatility risk premium — why selling options has a statistical edge", terms: ["volatility risk premium","VRP","implied vs realized","edge","structural advantage"] },
  { topic: "What is delta — the option's speed dial",                             terms: ["delta","0.30 delta","directional exposure","hedge ratio","share equivalent"] },
  { topic: "What is assignment risk — when someone exercises their option against you", terms: ["assignment","exercise","early assignment","100 shares","obligation","ex-dividend"] },
  { topic: "What is the 10-year Treasury yield — the most important number in all of finance", terms: ["10-year yield","Treasury","risk-free rate","bond","yield curve","bps"] },
  { topic: "What is the dollar index — and why a strong dollar can sink your stocks", terms: ["dollar index","DXY","currency","strong dollar","weak dollar","multinational"] },
  { topic: "What is Non-Farm Payrolls — the one report that moves markets most",  terms: ["NFP","non-farm payrolls","jobs report","unemployment rate","BLS","first Friday"] },
  { topic: "What is CPI — and why inflation data can make or break your portfolio in one morning", terms: ["CPI","consumer price index","inflation","core CPI","headline CPI","monthly release"] },
  { topic: "What is the yield curve — the bond market's recession warning system", terms: ["yield curve","inversion","2-year","10-year","recession signal","spread"] },
  { topic: "What is oil price risk — and how a war 5,000 miles away affects your trades", terms: ["crude oil","WTI","Brent","OPEC","supply shock","energy sector"] },
  { topic: "What is gold telling you — why it spikes when fear spikes",           terms: ["gold","safe haven","flight to safety","store of value","inflation hedge"] },
  { topic: "What is sector rotation — how money moves around the market in cycles", terms: ["sector rotation","defensive","cyclical","growth","value","risk on","risk off"] },
  { topic: "What is geopolitical risk — why wars, sanctions, and elections move your portfolio", terms: ["geopolitical risk","black swan","tail risk","market shock","safe haven flows"] },
  { topic: "What is earnings season — the four weeks every quarter when everything gets risky", terms: ["earnings season","Q1","Q2","Q3","Q4","report date","whisper number","gap risk"] },
  { topic: "What is trading psychology — why smart people make dumb decisions with money", terms: ["loss aversion","FOMO","revenge trading","overconfidence","anchoring","recency bias"] },
  { topic: "What is loss aversion — why losing $100 feels worse than winning $100 feels good", terms: ["loss aversion","prospect theory","emotional accounting","paper loss","realized loss"] },
  { topic: "What is a trading journal — why writing it down is worth more than any indicator", terms: ["trading journal","review","pattern recognition","discipline","process vs outcome"] },
  { topic: "What is backtesting — proving a system works before you risk real money", terms: ["backtest","historical data","overfitting","out of sample","stress test","regime"] },
  { topic: "Putting it all together — how every signal in this app connects to everything you have learned", terms: ["system thinking","confluence","edge","process","consistency","compounding"] },
];

export default async function handler(req) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

  const { dayNumber, topicIndex } = await req.json();
  const entry = CURRICULUM[topicIndex ?? (dayNumber % CURRICULUM.length)];
  if (!entry) return json({ error: "bad topic index" }, 400);

  const prompt = `You are teaching someone who has NEVER studied finance, investing, or economics in their life. They are intelligent but know absolutely zero financial terminology. Your job is to explain this topic so completely that NOTHING is left to their imagination — no assumption is made, no jargon is left unexplained.

TODAY'S LESSON: "${entry.topic}"

Key terms you MUST define (in plain English, as if explaining to a 12-year-old): ${entry.terms.join(", ")}

RULES:
1. Start from zero. Assume they don't even know what a stock is unless this lesson is about stocks.
2. Every single financial term must be defined the moment you use it. In brackets. Like this: "The VIX [Wall Street's official fear thermometer] rose to 24."
3. Use ONE vivid real-world analogy. Make it something from everyday life — rent, restaurants, weather, sports.
4. Use today's real market context where possible. Today is a Saturday so markets are closed. Use hypothetical but realistic numbers.
5. No bullet points. Write in flowing, conversational paragraphs like a letter from a wise friend.
6. Keep each section under 100 words. Clear and punchy beats long and thorough.

Return ONLY valid JSON with this exact shape — no markdown, no code fences, just the JSON object:
{
  "what": "plain English explanation, 2-3 sentences, no jargon at all",
  "analogy": "one vivid real-world comparison that makes this concept impossible to forget",
  "todayExample": "a concrete example using realistic market numbers from this week",
  "whyItMatters": "direct connection to their trades in this app — what should they DO differently knowing this",
  "mistakeToAvoid": "the single most common mistake beginners make about this concept",
  "watchTomorrow": "one specific thing to look for when they open the app next trading day",
  "jargon": [
    { "term": "official term", "plain": "what it actually means in plain English, max 15 words" }
  ]
}

The "jargon" array must contain an entry for EVERY term in this list: ${entry.terms.join(", ")}`;

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key":         apiKey,
      "anthropic-version": "2023-06-01",
      "content-type":      "application/json",
    },
    body: JSON.stringify({
      model:      "claude-haiku-4-5-20251001",
      max_tokens: 1200,
      messages:   [{ role: "user", content: prompt }],
    }),
  });

  if (!r.ok) {
    const err = await r.text();
    return json({ error: "Anthropic API error", detail: err }, 502);
  }

  const data = await r.json();
  const raw  = data?.content?.[0]?.text ?? "";

  let parsed;
  try {
    // strip possible markdown code fence if model adds one
    const clean = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    parsed = JSON.parse(clean);
  } catch {
    parsed = { what: raw, analogy: "", todayExample: "", whyItMatters: "", mistakeToAvoid: "", watchTomorrow: "", jargon: [] };
  }

  return json({ ...parsed, topic: entry.topic, dayNumber }, 200, {
    "cache-control": "s-maxage=3600",
  });
}

function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...extra },
  });
}
