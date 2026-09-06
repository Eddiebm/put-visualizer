# Cash-Secured Put — Honest P&L Visualizer

A small local app that draws the real profit-and-loss curve of a cash-secured put (plus
put credit spreads, short strangles, and covered strangles). You type the trade's numbers
and it shows you the asymmetry the options-selling videos tend to skip past:

- a **flat green ceiling** marking the most you can ever make (the premium), and
- a **red, pulsing dot** sitting on the curve where a bad-week drop drags you.

The green stays small and flat. The red opens up underneath. That gap *is* the point.

Below the chart it shows the numbers that actually matter — cash locked up, premium
collected, breakeven price, and bad-week loss. Your inputs and trade journal are saved to
`localStorage`, so closing and reopening it keeps your history.

## What's here

The app is organized around three questions, framed as three people checking in — the
same shape a small trading desk actually runs:

- **🔭 Alex's scan** — "what's worth a look?" A technical read (trend, pullback to
  support, relative strength vs. SPY, momentum, volume) across ~40 stocks/ETFs, independent
  from the options-pricing scan on **Today's picks**. Ported from a companion project,
  [`stock-coach`](https://github.com/Eddiebm/stock-coach).
- **Calculator + journal** — structure a trade, log it, and record how it actually closed
  (wins *and* losses, never netted away).
- **📋 Sarah's book** — "what's open, and what does it add up to?" A cross-position view:
  total collateral locked, aggregate bad-week loss, days to expiration, and an earnings-risk
  flag per position — the numbers no single trade's calculator page shows on its own.
- **📈 Elena's report** — "how did the week go?" Realized P&L grouped by the week a trade
  closed, wins and losses both, with average return on collateral always shown next to the
  worst single loss, never alone.
- **Compare stocks**, **Review**, and **📚 Learn** — a manual options screener, a daily
  discipline scorecard, and a 60-day plain-English options curriculum.

All of this reads from the same trade journal, which lives in `localStorage` and,
optionally, an actual database (see **Backing up the journal** below) so it survives
clearing browser data. The one live-trading path in the app (`api/tasty.js`, tastytrade
order placement) is untouched by any of the above; those views are read/aggregate-only,
and connecting it now requires reading an explicit live-trading warning first (see
**A note on the tastytrade integration**).

## Run it

```bash
npm install   # once
npm run dev
```

Then open the local address it prints (usually http://localhost:5173).

Stack: Vite + React, plus two tiny Vercel Edge functions (`api/quote.js`,
`api/option.js`).

**On data and privacy:** the calculator itself runs entirely in your browser and
your inputs never leave your machine. The exception is the optional **Company**
picker, which calls two endpoints:

- `/api/quote` — current share price. Uses **Alpaca** (IEX feed) when keys are
  set, otherwise a keyless **Yahoo** fallback. If neither is reachable (including
  local `npm run dev`, which doesn't run the functions) it falls back to a bundled
  snapshot price, so the tool stays usable offline.
- `/api/option` — the real **put-option premium**. Pick an expiration and hit
  *Pull real premium*; it fetches Alpaca's option chain and fills the premium with
  the nearest contract's bid/ask midpoint. Without an Alpaca key it returns
  `available:false` and the premium simply stays a manual input.

### Enabling live Alpaca data

Set two Vercel env vars (a **paper-account / market-data key is enough** — never
use a live-trading key in a public app):

```bash
printf '%s' 'YOUR_KEY_ID' | vercel env add ALPACA_KEY_ID production
printf '%s' 'YOUR_SECRET' | vercel env add ALPACA_SECRET_KEY production
```

Redeploy (or let the next deploy pick them up) and quotes upgrade to Alpaca and
the premium button goes live. The free tier serves IEX stock quotes and
~15-min-delayed options data — fine for a risk visualizer. To exercise any of this
locally, run `vercel dev` instead of `npm run dev`.

## Backing up the journal (optional)

By default the trade journal — your only record of what you actually traded — lives
solely in this browser's `localStorage`. Clear site data, or open the app on a different
device, and it's gone. `api/journal.js` adds an optional durable backup on Cloudflare D1;
without setting it up, everything behaves exactly as before.

**One-time setup:**

1. Create a D1 database (e.g. via `wrangler d1 create put-visualizer-journal`, or the
   Cloudflare dashboard) and apply the schema:
   ```sql
   CREATE TABLE journal_entries (
     id TEXT PRIMARY KEY,
     status TEXT NOT NULL,
     data TEXT NOT NULL,
     updated_at TEXT NOT NULL
   );
   CREATE INDEX idx_journal_entries_status ON journal_entries(status);
   ```
2. Create a Cloudflare API token with D1 read/write permission for that database.
3. Pick your own secret passphrase — this app has no accounts, so this one shared key is
   what stands between "just you" and "anyone with the URL" for your trade history. Don't
   reuse a real password.
4. Set four Vercel env vars:
   ```bash
   printf '%s' 'YOUR_CF_ACCOUNT_ID'   | vercel env add CLOUDFLARE_ACCOUNT_ID production
   printf '%s' 'YOUR_D1_DATABASE_ID'  | vercel env add CLOUDFLARE_D1_DATABASE_ID production
   printf '%s' 'YOUR_CF_API_TOKEN'    | vercel env add CLOUDFLARE_API_TOKEN production
   printf '%s' 'YOUR_OWN_SECRET'      | vercel env add JOURNAL_ACCESS_KEY production
   ```
5. Redeploy. In the app, click the 🗄 button (bottom-left) and enter the same secret from
   step 3 as the sync key.

That's it — once a key is entered client-side, the journal round-trips to the database
(full-replace sync, not incremental — see the comment atop `api/journal.js`) and a small
status badge shows whether the last sync succeeded, failed, or the backup isn't configured
at all. Losing the connection just falls back to the local copy, same as every other
optional integration in this app.

## A note on the tastytrade integration

`api/tasty.js` and the "Connect Tastytrade" button talk to tastytrade's **live production
API** — there is no sandbox/paper mode. Nothing else in this app touches it: the calculator,
journal, scans, and reports all work fully without ever connecting it. If you don't
actually place real orders through this, there's no reason to connect it at all.

If you do: connecting now requires reading a warning and checking a box before the login
form even appears (re-required every 24 hours, not a one-time dismissal), and placing an
actual order requires typing `PLACE` into a confirmation field — a single click used to be
all that stood between the confirm screen and a real order.

## Project layout

```
src/
  App.jsx                 top-level state + tab switching (~600 lines)
  appConstants.js         storage keys, COMPANIES/MODES/DEFAULTS, load*() helpers
  styles.js               the shared inline-style object + keyframes
  lib/                    pure logic — no React, all unit-tested
    blackScholes.js  probability.js  richness.js  score.js  technicals.js
    pnl.js  journal.js  dates.js  format.js  tastyOrder.js
  components/             one file per view/widget (Chart, Journal, Screener,
                           AlexScan, PortfolioView, WeeklyReport, DayReview,
                           Tastytrade, JournalSync, TodayView, Tour, LearnView, …)
api/                       Vercel Edge functions (quote, option, history, earnings,
                           morning, analyze, chat, lesson, tasty, journal)
```

`App.jsx` used to be a single ~4,000-line file holding every component; it's now split
by feature, matching the app's own tabs. `src/lib/` holds everything with no React
dependency, which is what makes it unit-testable without rendering anything.

## Running the tests and linter

```bash
npm test    # Vitest — 229 tests: every pure module in src/lib/, api/journal.js,
            # and every component in src/components/ (React Testing Library)
npm run lint  # ESLint — no-undef (catches a missing import immediately) + react-hooks rules
```

`no-undef` is doing real work here: this project has no build-time type checking, so it's
the cheapest guard against a component silently referencing something that was never
imported — exactly the class of bug a file split like this one is most likely to introduce
(it caught three on the first pass). The component tests caught two more real bugs of a
different kind on their first pass: `entryBadWeekPnl` could render a literal `"$NaN"` in
Sarah's book for an entry missing `putPrem`, and `AssignmentView`'s mode-specific note was
a plain object literal that eagerly evaluated *all four* branches on every render —
including `money2(longStrike)` for non-spread modes, where `longStrike` is `undefined` —
crashing the whole card. Both are fixed and covered by regression tests now.

The two most safety-critical components — the tastytrade live-trading warning gate and the
type-`PLACE`-to-confirm order screen — have dedicated test files
(`Tastytrade.test.jsx`, `TastyOrderConfirm.test.jsx`) specifically to make it hard for
either gate to regress back to "one click" without a test failing.

CI (`.github/workflows/ci.yml`) runs lint, test, and build on every push and PR.

## The math (so you can trust the curve)

At expiration, for a stock price `S`:

```
intrinsic = max(0, strike − S)        # what assignment costs you, per share
pnl       = (premium − intrinsic) × 100 × contracts
```

Above the strike the put expires worthless and you keep the full premium (the green ceiling).
Below it, every dollar the stock falls past breakeven is a dollar of loss — and unlike the
premium, that side has real room to run.

---

## A note to Claude Code (if you extend this)

This tool exists to be **honest about risk**, not to flatter the trade. There is no such
thing as a trading app that "never loses" — if a future request asks for that, the honest
answer is no, not a UI that hides or reclassifies losses. If you add features, keep the
ethos intact. Specifically:

**Status of the original roadmap:**

1. ~~**Paper-trade journal**~~ — done (the Calculator tab's journal). Wins and losses both
   shown, realized P&L never netted away.
2. ~~**Annualized return on collateral shown next to max loss**~~ — done in two places:
   the "Compare stocks" screener (yield/yr next to the bad-week scenario column) and
   Elena's report (avg. return on collateral next to worst single loss).
3. ~~**Multiple positions / portfolio view**~~ — done as **Sarah's book**: total collateral
   locked and aggregate bad-week loss across every open position.
4. ~~**Implied "bad week" presets**~~ — done: when market IV or realized vol is available,
   1σ/2σ preset chips sit next to the drop-% field and fill it with the real expected-move
   percentage for the current expiration, one click.
5. ~~**Assignment view**~~ — done as the "If you get assigned" card below the trade stats:
   shares owned, total cost, cost basis after premium, and current value vs. that cost
   basis, with a mode-specific note (a spread's long put usually gets exercised same-day
   instead of holding the shares; a covered strangle's assignment doubles the share count
   rather than starting a fresh position).

New from the round that added Alex/Sarah/Elena: **🔭 Alex's scan** (a technical
stock/ETF screener, `src/lib/technicals.js`) and **📈 Elena's report** (weekly
aggregation, grouping closed trades by ISO week).

**Since then**, in priority order (real money and data-loss risk first, polish last):

1. Gated the tastytrade live-trading connect flow (explicit warning + checkbox,
   re-required every 24h) and added a type-to-confirm step before an order is actually
   placed. It was previously one click away with only a passive warning banner.
2. Added a real test suite (Vitest, 100+ tests) covering every pure/testable module —
   there were previously zero automated tests anywhere in this app. Writing the date
   tests caught and fixed a real bug: `defaultExpiration()` could land on a non-Friday
   date depending on the day of the week.
3. Split `App.jsx`'s pure math out into `src/lib/{format,dates,pnl,journal}.js` so it's
   unit-testable without rendering React — a first pass at the file being one ~4,000-line
   component; the UI components themselves are still all in `App.jsx`.
4. Added optional durable backup for the journal via Cloudflare D1 (`api/journal.js`,
   see **Backing up the journal** above) — previously the trade journal existed only in
   one browser's `localStorage`, with no recovery if that browser's data was cleared.
5. Finished splitting `App.jsx`: every component moved into `src/components/`, one file
   per view/widget, ~4,000 lines down to ~600. Added ESLint (`no-undef` + `react-hooks`)
   as part of doing this safely — it caught three real missing-import bugs the split
   introduced (each verified against a running instance before/after). See **Project
   layout** above.
6. Closed out the original roadmap's last two items — volatility-based bad-week presets
   and the assignment view — both above. The underlying math for both lives in
   `src/lib/pnl.js` (`assignmentSummary`) with its own unit tests.
7. `npm audit fix` — 3 high-severity transitive-dependency advisories (browserslist,
   nanoid, postcss), all fixed cleanly with no major-version bumps.
8. Added CI (`.github/workflows/ci.yml`): lint, test, build, and a non-blocking audit
   check on every push and PR. Previously all of that only ran when someone ran it by hand.
9. Component tests for every file in `src/components/` (106 new tests, 229 total), which
   caught two more real bugs on the first pass — see **Running the tests and linter**
   above for what they were and why "the build passed" hadn't caught them.

**Still open:** backtesting whether Alex's scan's scoring weights (ported as-is from
`stock-coach`) actually predict anything — they're currently unvalidated against
historical outcomes, and validating them needs a real deployment with live market-data
keys, not something that can be done from a sandbox with no credentials. Also worth
doing: migrating to TypeScript, which would catch a class of bug (wrong prop names,
mismatched shapes) that neither ESLint's `no-undef` nor the current tests are positioned
to catch structurally.

**Do not** turn this into a "winning" app. Do not lead with annualized yield, win-rate, or
"X% of puts expire worthless." Do not hide, net, or downplay losses. Do not add streak
counters, confetti, or anything that makes selling puts feel like free money. If a change
makes the downside *less* visible than the upside, it's the wrong change — the red must always
be at least as loud as the green.
