// Synthetic price series for `--dry-run` only — lets the harness's plumbing
// (fetch/walk-forward/bucket/report) be exercised end-to-end with no
// network access and no Alpaca credentials, so it can be proven to run
// correctly before anyone points it at real data. This is NOT a validation
// of Alex's scan — a random walk has no real trend/momentum/relative
// strength for the scoring to be right or wrong about — and run.ts labels
// every `--dry-run` report as such so the output can't be mistaken for a
// real result.

import type { Bar } from "../../src/types";

// mulberry32 — a small, dependency-free, deterministic PRNG. Same seed,
// same series every time, so a --dry-run run is reproducible and diffable.
function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return function () {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateSyntheticBars(
  startPrice: number,
  days: number,
  seed: number,
  driftPerDay = 0.0003,
  volPerDay = 0.012
): Bar[] {
  const rng = mulberry32(seed);
  const bars: Bar[] = [];
  let price = startPrice;
  const start = new Date("2019-01-02T00:00:00Z");
  let calendarDay = 0;

  for (let i = 0; i < days; i++) {
    // Sum of 3 uniforms, centered and scaled — cheap approximation of a
    // roughly bell-shaped daily return, good enough for smoke-testing the
    // pipeline (not meant to model real market microstructure).
    const noise = (rng() + rng() + rng() - 1.5) / 1.5;
    price = Math.max(0.5, price * (1 + driftPerDay + volPerDay * noise));

    // Walk the calendar forward skipping weekends, so bar dates look like a
    // real trading calendar even though this is fake data.
    do {
      calendarDay++;
    } while ([0, 6].includes(new Date(start.getTime() + calendarDay * 86400000).getUTCDay()));
    const date = new Date(start.getTime() + calendarDay * 86400000);

    const o = price * (1 - 0.002 * rng());
    const h = price * (1 + 0.004 * rng());
    const l = price * (1 - 0.004 * rng());
    const v = Math.round(1_000_000 + rng() * 500_000);
    bars.push({ t: date.toISOString(), o, h, l, c: price, v });
  }
  return bars;
}
