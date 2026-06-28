// 60-lesson curriculum — one per day, cycles after completion.
// Topics build on each other: basics → technicals → risk → options.

export const CURRICULUM = [
  // ── Week 1: What markets are ─────────────────────────────────────────────
  {
    day: 1,
    topic: "What is a stock — and why does owning one matter?",
    terms: ["stock", "share", "equity", "shareholder", "ownership stake"],
    hook: "You already own a piece of Apple every time you use this app.",
  },
  {
    day: 2,
    topic: "Why do stock prices go up and down every second?",
    terms: ["supply and demand", "buyer", "seller", "price discovery", "auction"],
    hook: "The stock market is just a giant yard sale running 6.5 hours a day.",
  },
  {
    day: 3,
    topic: "What is a stock market — and who actually runs it?",
    terms: ["NYSE", "Nasdaq", "exchange", "listing", "market maker", "liquidity"],
    hook: "There is no physical place where stocks trade — it's mostly servers in New Jersey.",
  },
  {
    day: 4,
    topic: "What is a broker and how do they make money off you?",
    terms: ["broker", "brokerage", "commission", "payment for order flow", "account"],
    hook: "Zero commission brokers aren't free — they sell your orders to someone else first.",
  },
  {
    day: 5,
    topic: "What is the bid price and the ask price — and what is the spread?",
    terms: ["bid", "ask", "spread", "market maker", "fill price"],
    hook: "The gap between bid and ask is a hidden tax on every trade you make.",
  },

  // ── Week 2: How orders work ───────────────────────────────────────────────
  {
    day: 6,
    topic: "Market orders vs limit orders — and why market orders can hurt you",
    terms: ["market order", "limit order", "fill", "slippage", "execution"],
    hook: "A market order says 'give me any price.' That's how you lose money before the trade starts.",
  },
  {
    day: 7,
    topic: "What is volume — and why thin volume is dangerous",
    terms: ["volume", "liquidity", "thin market", "spread", "price impact"],
    hook: "Trading a stock with no volume is like selling your house in a ghost town.",
  },
  {
    day: 8,
    topic: "What is market capitalization — large cap, small cap, what does it mean?",
    terms: ["market cap", "large cap", "mid cap", "small cap", "micro cap"],
    hook: "Apple's market cap is larger than the entire GDP of most countries.",
  },
  {
    day: 9,
    topic: "What is the S&P 500 — and why does everyone keep talking about it?",
    terms: ["S&P 500", "index", "benchmark", "weighting", "index fund"],
    hook: "When the news says 'the market was up today,' they mean the S&P 500 was up.",
  },
  {
    day: 10,
    topic: "What is a bull market and a bear market — where do the names come from?",
    terms: ["bull market", "bear market", "20% rule", "rally", "correction", "drawdown"],
    hook: "A bull thrusts upward with its horns. A bear swipes downward with its paw. That's it.",
  },

  // ── Week 3: The macro picture ─────────────────────────────────────────────
  {
    day: 11,
    topic: "What is inflation — and why rising prices are the enemy of your investments",
    terms: ["inflation", "CPI", "purchasing power", "real return", "nominal return"],
    hook: "If your investment earns 5% but inflation is 6%, you actually lost money.",
  },
  {
    day: 12,
    topic: "What is the Federal Reserve — and why eight meetings a year move markets",
    terms: ["Federal Reserve", "Fed", "FOMC", "interest rate", "monetary policy", "fed funds rate"],
    hook: "One person — the Fed Chair — can move the entire stock market with a single sentence.",
  },
  {
    day: 13,
    topic: "What are earnings — the single most important number a company reports",
    terms: ["earnings", "EPS", "revenue", "profit", "beat", "miss", "guidance"],
    hook: "A company can lose money every year and its stock can still go up. Earnings expectations are everything.",
  },
  {
    day: 14,
    topic: "What is the VIX — Wall Street's fear thermometer",
    terms: ["VIX", "volatility index", "implied volatility", "fear gauge", "CBOE"],
    hook: "The VIX is the single most important number for options sellers. High VIX = fat premiums = more income.",
  },
  {
    day: 15,
    topic: "What is a dividend — getting paid just for owning a stock",
    terms: ["dividend", "yield", "ex-dividend date", "payout ratio", "income investing"],
    hook: "Some stocks pay you cash every three months just for holding them. McDonald's has done it for 47 years.",
  },

  // ── Week 4: Reading charts ────────────────────────────────────────────────
  {
    day: 16,
    topic: "What is a moving average — smoothing out the noise to see the trend",
    terms: ["moving average", "SMA", "20-day", "50-day", "200-day", "trend filter"],
    hook: "A moving average is just an average price over time. Nothing more. The magic is what it filters out.",
  },
  {
    day: 17,
    topic: "What is the 200-day moving average — the most important line on any chart",
    terms: ["200-day MA", "long-term trend", "above/below", "institutional benchmark"],
    hook: "Every major pension fund, hedge fund, and endowment watches whether stocks are above or below their 200-day average.",
  },
  {
    day: 18,
    topic: "What is RSI — measuring momentum on a 0 to 100 scale",
    terms: ["RSI", "Relative Strength Index", "overbought", "oversold", "momentum"],
    hook: "RSI doesn't tell you direction. It tells you speed. A car going 100mph can still crash.",
  },
  {
    day: 19,
    topic: "What is ATR — measuring how much a stock actually moves day to day",
    terms: ["ATR", "Average True Range", "daily range", "volatility", "stop sizing"],
    hook: "ATR answers one question: how much does this stock move on a normal day? That tells you exactly where to put your stop.",
  },
  {
    day: 20,
    topic: "What is a trend — and why trading against it is the most expensive mistake beginners make",
    terms: ["trend", "uptrend", "downtrend", "higher highs", "lower lows", "trend following"],
    hook: "The most profitable sentence in trading: 'The trend is your friend until it ends.'",
  },
  {
    day: 21,
    topic: "What is volume confirmation — why price moves without volume are fake",
    terms: ["volume confirmation", "conviction", "accumulation", "distribution", "buying pressure"],
    hook: "A stock going up on low volume is like a crowd cheering quietly — something doesn't add up.",
  },
  {
    day: 22,
    topic: "What is a gap — and why they happen overnight while you sleep",
    terms: ["gap", "gap up", "gap down", "earnings gap", "overnight risk", "gap fill"],
    hook: "Stop-losses do not protect you from gaps. The stock opens 10% lower before you can react.",
  },

  // ── Week 5: Risk management ───────────────────────────────────────────────
  {
    day: 23,
    topic: "What is a stop-loss — the most important rule in all of trading",
    terms: ["stop-loss", "stop order", "exit rule", "capital protection", "non-negotiable"],
    hook: "Every trader who has blown up an account has one thing in common: they moved their stop-loss just once.",
  },
  {
    day: 24,
    topic: "What is position sizing — why HOW MUCH you trade matters more than WHAT you trade",
    terms: ["position size", "1% rule", "risk per trade", "account size", "Kelly criterion"],
    hook: "You can be right 80% of the time and still go broke if you size your trades wrong.",
  },
  {
    day: 25,
    topic: "What is risk/reward ratio — the math that makes losing trades survivable",
    terms: ["risk/reward", "R multiple", "2:1", "3:1", "expected value", "positive expectancy"],
    hook: "At 2:1 risk/reward, you can lose more than half your trades and still make money. That's math, not luck.",
  },
  {
    day: 26,
    topic: "What is a drawdown — understanding losing streaks before they happen",
    terms: ["drawdown", "peak to trough", "max drawdown", "recovery time", "losing streak"],
    hook: "Every strategy has drawdowns. The ones that survive are built expecting them.",
  },
  {
    day: 27,
    topic: "What is expected value — the only number that tells you if a strategy works long-term",
    terms: ["expected value", "EV", "win rate", "average win", "average loss", "edge"],
    hook: "A casino doesn't win every hand. It wins because every hand has positive expected value for the house.",
  },
  {
    day: 28,
    topic: "What is diversification — why putting everything in one stock is not investing, it's gambling",
    terms: ["diversification", "correlation", "concentration risk", "portfolio", "uncorrelated"],
    hook: "Diversification is the only free lunch in investing. Everything else comes with a cost.",
  },
  {
    day: 29,
    topic: "What is the PDT rule — the $25,000 rule that limits small accounts",
    terms: ["PDT", "Pattern Day Trader", "$25,000", "day trade", "swing trade", "overnight hold"],
    hook: "The SEC created the PDT rule to protect beginners. It accidentally made swing trading more profitable for them.",
  },
  {
    day: 30,
    topic: "What is margin — borrowing money to trade and why it doubles your risk",
    terms: ["margin", "leverage", "buying power", "margin call", "forced liquidation"],
    hook: "Margin is borrowing money from your broker to trade more than you have. It amplifies both wins and losses equally.",
  },

  // ── Week 6: Options basics ────────────────────────────────────────────────
  {
    day: 31,
    topic: "What is an option contract — the right but not the obligation",
    terms: ["option", "contract", "100 shares", "right not obligation", "buyer", "seller"],
    hook: "An option is like a coupon that lets you buy something at a fixed price. The coupon expires. The price doesn't move.",
  },
  {
    day: 32,
    topic: "What is a call option — betting a stock will go up",
    terms: ["call option", "right to buy", "strike price", "expiration", "premium", "long call"],
    hook: "Buying a call is like putting a deposit on a house at today's price. If the price rises, you win.",
  },
  {
    day: 33,
    topic: "What is a put option — insurance against a stock falling",
    terms: ["put option", "right to sell", "downside protection", "long put", "short put"],
    hook: "A put option is insurance. You pay a premium. If the stock crashes, you get paid. If it doesn't, you lose the premium.",
  },
  {
    day: 34,
    topic: "What is the strike price — choosing your bet before the game starts",
    terms: ["strike price", "in the money", "out of the money", "at the money", "ITM", "OTM", "ATM"],
    hook: "The strike price is the price you've agreed to buy or sell at — locked in before expiration, no matter what happens.",
  },
  {
    day: 35,
    topic: "What is option expiration — and what happens when it arrives",
    terms: ["expiration", "expire worthless", "assignment", "exercise", "DTE", "days to expiration"],
    hook: "Every option has an expiration date. After that date, it's worth zero. That expiration is our entire business model.",
  },
  {
    day: 36,
    topic: "What is option premium — the money that flows from buyer to seller",
    terms: ["premium", "intrinsic value", "time value", "extrinsic value", "price of the option"],
    hook: "Premium is what buyers pay and sellers collect. As a seller, premium is your salary. Time is always on your side.",
  },
  {
    day: 37,
    topic: "What is implied volatility — the market's forecast of future fear",
    terms: ["implied volatility", "IV", "expected move", "pricing of uncertainty", "vol"],
    hook: "IV is the market's best guess at how much a stock will move before expiration. When it's wrong — overestimating fear — you profit.",
  },
  {
    day: 38,
    topic: "What is time decay — why options lose value every single day even when nothing moves",
    terms: ["time decay", "theta", "theta burn", "daily erosion", "time value"],
    hook: "Time decay is gravity for option buyers. Every day that passes, their option is worth less. As a seller, you are gravity.",
  },
  {
    day: 39,
    topic: "What is a cash-secured put — collecting income while waiting to buy a stock you want",
    terms: ["cash-secured put", "CSP", "collateral", "cash secured", "assignment risk", "obligation"],
    hook: "Selling a cash-secured put is like agreeing to buy 100 shares at a price you're happy with — and getting paid to wait.",
  },
  {
    day: 40,
    topic: "What is a put credit spread — capping your risk with a safety net below",
    terms: ["put credit spread", "short put", "long put", "spread width", "max loss", "collateral"],
    hook: "A spread is like selling insurance but also buying cheaper insurance for yourself. You cap both your income and your loss.",
  },

  // ── Week 7: Advanced options ──────────────────────────────────────────────
  {
    day: 41,
    topic: "What is probability of profit — the market's own estimate of your chances",
    terms: ["POP", "probability of profit", "delta", "out of the money", "win probability"],
    hook: "The market calculates its own estimate of how likely your trade wins. It's baked into the option price already.",
  },
  {
    day: 42,
    topic: "What is IV rank — knowing if premiums are fat or thin today",
    terms: ["IV rank", "IV percentile", "rich premiums", "cheap premiums", "selling environment"],
    hook: "IV rank tells you if today's fear is high or low relative to the past year. High rank = best time to sell.",
  },
  {
    day: 43,
    topic: "What is the volatility risk premium — why selling options has a statistical edge",
    terms: ["volatility risk premium", "VRP", "implied vs realized", "edge", "structural advantage"],
    hook: "Implied volatility almost always overestimates actual movement. That gap is the seller's edge. It exists in every market, every year.",
  },
  {
    day: 44,
    topic: "What is delta — the option's speed dial",
    terms: ["delta", "0.30 delta", "directional exposure", "hedge ratio", "share equivalent"],
    hook: "Delta tells you how much your option moves when the stock moves $1. A 0.30 delta option moves $0.30 per $1 move in the stock.",
  },
  {
    day: 45,
    topic: "What is assignment risk — when someone exercises their option against you",
    terms: ["assignment", "exercise", "early assignment", "100 shares", "obligation", "ex-dividend"],
    hook: "Assignment means someone exercised their right and now you must buy 100 shares. It's rare but you must be prepared.",
  },

  // ── Week 8: The macro that moves markets ─────────────────────────────────
  {
    day: 46,
    topic: "What is the 10-year Treasury yield — the most important number in all of finance",
    terms: ["10-year yield", "Treasury", "risk-free rate", "bond", "yield curve", "bps"],
    hook: "Every stock valuation on earth is calculated relative to the 10-year Treasury yield. It's the anchor of the entire financial system.",
  },
  {
    day: 47,
    topic: "What is the dollar index — and why a strong dollar can sink your stocks",
    terms: ["dollar index", "DXY", "currency", "strong dollar", "weak dollar", "multinational"],
    hook: "When the dollar rises, American products get more expensive abroad. That hurts earnings for every company that sells overseas.",
  },
  {
    day: 48,
    topic: "What is Non-Farm Payrolls — the one report that moves markets most",
    terms: ["NFP", "non-farm payrolls", "jobs report", "unemployment rate", "BLS", "first Friday"],
    hook: "The first Friday of every month at 8:30am, one government report can move the S&P 500 by 2% in five minutes. That's NFP.",
  },
  {
    day: 49,
    topic: "What is CPI — and why inflation data can make or break your portfolio in one morning",
    terms: ["CPI", "consumer price index", "inflation", "core CPI", "headline CPI", "monthly release"],
    hook: "CPI measures whether your groceries cost more than last month. When it surprises, the Fed changes course and markets panic.",
  },
  {
    day: 50,
    topic: "What is the yield curve — the bond market's recession warning system",
    terms: ["yield curve", "inversion", "2-year", "10-year", "recession signal", "spread"],
    hook: "Every US recession since 1955 was predicted by the yield curve inverting. It's the most reliable economic indicator we have.",
  },

  // ── Week 9: Geopolitics & commodities ────────────────────────────────────
  {
    day: 51,
    topic: "What is oil price risk — and how a war 5,000 miles away affects your trades",
    terms: ["crude oil", "WTI", "Brent", "OPEC", "supply shock", "energy sector"],
    hook: "When oil spikes 5% overnight, every airline, trucking company, and consumer staple stock gets hit simultaneously.",
  },
  {
    day: 52,
    topic: "What is gold telling you — why it spikes when fear spikes",
    terms: ["gold", "safe haven", "flight to safety", "store of value", "inflation hedge"],
    hook: "Gold doesn't pay dividends or earn profits. Its only job is to hold value when everything else is falling apart.",
  },
  {
    day: 53,
    topic: "What is sector rotation — how money moves around the market in cycles",
    terms: ["sector rotation", "defensive", "cyclical", "growth", "value", "risk on", "risk off"],
    hook: "When the economy slows, money moves from tech and consumer discretionary into healthcare and utilities. This rotation is predictable.",
  },
  {
    day: 54,
    topic: "What is geopolitical risk — why wars, sanctions, and elections move your portfolio",
    terms: ["geopolitical risk", "black swan", "tail risk", "market shock", "safe haven flows"],
    hook: "Markets price in what they know. What they can't price in — wars, surprise elections — creates the most violent moves.",
  },
  {
    day: 55,
    topic: "What is earnings season — the four weeks every quarter when everything gets risky",
    terms: ["earnings season", "Q1", "Q2", "Q3", "Q4", "report date", "whisper number", "gap risk"],
    hook: "Four times a year, every company reports its results. The week before earnings is the single most dangerous time to sell options.",
  },

  // ── Week 10: Psychology & discipline ─────────────────────────────────────
  {
    day: 56,
    topic: "What is trading psychology — why smart people make dumb decisions with money",
    terms: ["loss aversion", "FOMO", "revenge trading", "overconfidence", "anchoring", "recency bias"],
    hook: "The enemy of every trader is not the market. It's the 3 inches between your ears.",
  },
  {
    day: 57,
    topic: "What is loss aversion — why losing $100 feels worse than winning $100 feels good",
    terms: ["loss aversion", "prospect theory", "emotional accounting", "paper loss", "realized loss"],
    hook: "Humans feel losses 2.5 times more intensely than equivalent gains. This is hardwired. It will make you move your stop-loss.",
  },
  {
    day: 58,
    topic: "What is a trading journal — why writing it down is worth more than any indicator",
    terms: ["trading journal", "review", "pattern recognition", "discipline", "process vs outcome"],
    hook: "The best traders in the world keep journals. Not because the market cares — because you need to see your own patterns.",
  },
  {
    day: 59,
    topic: "What is backtesting — proving a system works before you risk real money",
    terms: ["backtest", "historical data", "overfitting", "out of sample", "stress test", "regime"],
    hook: "A backtest can't prove a system will work. But it can prove it has worked — across bull markets, crashes, and everything between.",
  },
  {
    day: 60,
    topic: "Putting it all together — how every signal in this app connects to everything you have learned",
    terms: ["system thinking", "confluence", "edge", "process", "consistency", "compounding"],
    hook: "No single signal is enough. The app uses 8 signals together because that's where real edge lives — in the intersection.",
  },
];
