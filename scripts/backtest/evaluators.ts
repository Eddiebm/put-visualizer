// The three independent buy/sell recommendation systems this app actually
// ships, wired up as Evaluators (see engine.ts) so all three run through
// the exact same walk-forward loop and no-lookahead guarantee rather than
// three separately-maintained copies of that logic:
//
//   alexScanEvaluator     — Alex's scan (src/lib/technicals.ts,
//                           analyzeStock): a general buy-timing screener,
//                           feeds the options calculator. Has a numeric
//                           0-100 score.
//   holdingsEntryEvaluator — Holdings' buy signal ("should I buy this
//                            stock", src/lib/holdings.ts, entryVerdict):
//                            "buy" | "wait" | "avoid". No numeric score.
//   holdingsExitEvaluator  — Holdings' sell signal ("I already own this —
//                            is the trend broken", technicalVerdict):
//                            "sell" | "watch" | "hold". No numeric score.
//
// Every evaluator here calls the real, unmodified production function —
// never a backtest-only reimplementation — so a result can't silently
// drift from what the live app actually shows a user.

import { analyzeStock } from "../../src/lib/technicals";
import { entryVerdict, technicalVerdict } from "../../src/lib/holdings";
import type { Evaluator } from "./engine";

export function alexScanEvaluator(sym: string, capital: number): Evaluator {
  return (barsSoFar, spyBarsSoFar) => {
    // hasEarnings is fixed to `false` — no historical earnings calendar
    // wired up (see README.md's "What it doesn't validate" list), so the
    // score-forced-to-0 earnings-blackout rule is never exercised here.
    const result = analyzeStock({
      sym,
      name: sym,
      bars: barsSoFar,
      capital,
      hasEarnings: false,
      spyBars: spyBarsSoFar,
    });
    if (!result) return null;
    return { grade: result.grade.label, score: result.score };
  };
}

// entryVerdict/technicalVerdict both always return SOME verdict, even with
// too little history (a "wait"/"hold, not enough data yet" one) — unlike
// analyzeStock, which returns null outright below 50 bars. Replicating
// that same 50-bar floor here means a low-data day is skipped, the same
// way it is for Alex's scan, rather than counted as a real "wait"/"hold"
// signal read it never actually was.

export function holdingsEntryEvaluator(): Evaluator {
  return (barsSoFar) => {
    if (barsSoFar.length < 50) return null;
    const result = entryVerdict(barsSoFar);
    return { grade: result.verdict, score: null };
  };
}

export function holdingsExitEvaluator(): Evaluator {
  return (barsSoFar) => {
    if (barsSoFar.length < 50) return null;
    const result = technicalVerdict(barsSoFar);
    return { grade: result.verdict, score: null };
  };
}
