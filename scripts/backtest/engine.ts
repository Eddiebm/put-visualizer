// The walk-forward core of the backtest — pure, no network, fully unit
// tested (see engine.test.ts). Everything that touches Alpaca lives in
// dataSource.ts; this file only ever sees bars it's handed.
//
// The one property this file lives or dies on: at "as of" day i, it must
// never call analyzeStock() with a bar dated after day i. A backtest that
// leaks a single future bar into the score it's grading makes every result
// downstream fiction — the score would "know" things the live app never
// could have known that day. engine.test.ts has a regression test that
// plants a deliberate future price jump and asserts the score at i is
// unaffected by it.

import { analyzeStock } from "../../src/lib/technicals";
import type { Bar } from "../../src/types";

export interface WalkForwardSample {
  sym: string;
  asOfDate: string; // bar's own date/timestamp, or its index as a fallback
  score: number;
  grade: string; // grade.label — the thing the live UI actually shows
  // horizon (trading days) -> forward return, or null if the run ended
  // before that horizon (shouldn't happen given the loop's own stopping
  // condition below, but kept nullable rather than assumed).
  forwardReturns: Record<number, number | null>;
}

export interface WalkForwardOptions {
  capital: number;
  horizons: number[]; // e.g. [5, 10, 20] trading days
  stride: number; // evaluate every Nth eligible day — see the module docstring in stats.ts for why this isn't 1
  minLookback: number; // trailing bars required before the first evaluation (200 for a full sma200 read)
  // Optional point-in-time universe gate (see universe.ts) — when given, a
  // day is only evaluated if this returns true for that day's date. This
  // is how the backtest avoids survivorship bias in the ticker list
  // itself: without it, every day in `bars` is fair game regardless of
  // whether the symbol was actually eligible (e.g. a real index member)
  // on that date.
  isEligible?: (dateIso: string) => boolean;
}

// Aligns spyBars to `bars` by calendar date (the first 10 chars of each
// bar's `t`), producing one entry per `bars` index — a matching SPY bar, or
// null when SPY didn't trade that exact date (rare, but names/halts differ).
// Matching by date rather than by array index matters because a ticker's
// own fetched series can start on a different date than SPY's (a later
// IPO, a data gap) — index-aligning two series with different start dates
// silently pairs the wrong days together.
export function alignByDate(bars: Bar[], spyBars: Bar[]): (Bar | null)[] {
  const spyByDate = new Map<string, Bar>();
  for (const b of spyBars) {
    if (b.t) spyByDate.set(b.t.slice(0, 10), b);
  }
  return bars.map((b) => (b.t ? (spyByDate.get(b.t.slice(0, 10)) ?? null) : null));
}

export function walkForward(
  sym: string,
  bars: Bar[],
  spyBars: Bar[],
  opts: WalkForwardOptions
): WalkForwardSample[] {
  if (opts.horizons.length === 0) throw new Error("walkForward: at least one horizon is required");
  const samples: WalkForwardSample[] = [];
  const maxHorizon = Math.max(...opts.horizons);
  const alignedSpy = alignByDate(bars, spyBars);

  for (let i = opts.minLookback - 1; i < bars.length; i += opts.stride) {
    // Not enough forward data left for the longest horizon — every later i
    // has even less, so stop rather than skip.
    if (i + maxHorizon >= bars.length) break;

    // Not an eligible day for this symbol (e.g. not an index constituent
    // yet, or no longer one) — skip, don't stop: a delisted-then-relisted
    // or a since-added symbol can have multiple eligible windows.
    if (opts.isEligible && bars[i].t && !opts.isEligible(bars[i].t as string)) continue;

    const barsSoFar = bars.slice(0, i + 1); // never includes bars[i+1] or later
    const spyBarsSoFar = alignedSpy
      .slice(0, i + 1)
      .filter((b): b is Bar => b != null);

    // hasEarnings is fixed to `false` here rather than looked up — a real
    // historical earnings calendar isn't wired up yet (see the README note
    // this script's usage doc points to). This means the backtest can't
    // validate the earnings-blackout rule (score forced to 0), and any
    // ticker that actually had earnings inside a sampled window is scored
    // as if it hadn't — a known, documented gap, not a silent one.
    const result = analyzeStock({
      sym,
      name: sym,
      bars: barsSoFar,
      capital: opts.capital,
      hasEarnings: false,
      spyBars: spyBarsSoFar,
    });
    if (!result) continue;

    const forwardReturns: Record<number, number | null> = {};
    for (const h of opts.horizons) {
      const idx = i + h;
      forwardReturns[h] = idx < bars.length ? (bars[idx].c - bars[i].c) / bars[i].c : null;
    }

    samples.push({
      sym,
      asOfDate: bars[i].t ?? String(i),
      score: result.score,
      grade: result.grade.label,
      forwardReturns,
    });
  }

  return samples;
}
