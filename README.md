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
  support, relative strength vs. SPY, momentum, volume) across the `COMPANIES` watchlist
  (76 stocks/ETFs — see **Watchlist size** below for why not more), independent from the
  options-pricing scan on **Today's picks**. Ported from a companion project,
  [`stock-coach`](https://github.com/Eddiebm/stock-coach).
- **Calculator + journal** — structure a trade, log it, and record how it actually closed
  (wins *and* losses, never netted away).
- **📋 Sarah's book** — "what's open, and what does it add up to?" A cross-position view:
  total collateral locked, aggregate bad-week loss, days to expiration, and an earnings-risk
  flag per position — the numbers no single trade's calculator page shows on its own.
- **💼 Holdings** — "should I buy this stock?" and "I already own this — when should I sell
  it?" Every other tab is about selling options; this is the one place for a plain stock
  position, wherever it came from. See **Buying and selling shares you already (or might)
  own** below.
- **📈 Elena's report** — "how did the week go?" Realized P&L grouped by the week a trade
  closed, wins and losses both, with average return on collateral always shown next to the
  worst single loss, never alone.
- **🕯️ Chart** — daily OHLC candlesticks for any ticker, straight from the same
  `/api/history` data every scan/score above already fetches. No grade, no verdict, no
  score attached — just the shape of the price, for a ticker you type in, or a "🕯️ View
  chart" link from Alex's scan, Holdings, or Today's picks.
- **Compare stocks**, **Review**, and **📚 Learn** — a manual options screener, a daily
  discipline scorecard, and a 60-day plain-English options curriculum.

All of this reads from the same trade journal, which lives in `localStorage` and,
optionally, an actual database (see **Backing up the journal** below) so it survives
clearing browser data. The one live-trading path in the app (`api/tasty.ts`, tastytrade
order placement) is untouched by any of the above; those views are read/aggregate-only,
and connecting it now requires reading an explicit live-trading warning first (see
**A note on the tastytrade integration**).

## Run it

```bash
npm install   # once
npm run dev
```

Then open the local address it prints (usually http://localhost:5173).

Stack: Vite + React, plus two tiny Vercel Edge functions (`api/quote.ts`,
`api/option.ts`).

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
device, and it's gone. `api/journal.ts` adds an optional durable backup on Cloudflare D1;
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
(full-replace sync, not incremental — see the comment atop `api/journal.ts`) and a small
status badge shows whether the last sync succeeded, failed, or the backup isn't configured
at all. Losing the connection just falls back to the local copy, same as every other
optional integration in this app.

## Securing the AI features

`api/chat.ts`, `api/analyze.ts`, and `api/lesson.ts` all proxy to the Anthropic API using
this app's own `ANTHROPIC_API_KEY` — every request they serve is billed to whoever set
that key up, not to the person asking. Without a required, user-set access key, anyone who
finds the deployed URL can call these endpoints directly (no browser, no origin needed) and
run up that bill. They're gated the same way the journal backup is above: one shared secret,
checked server-side.

**One-time setup:**

1. Pick your own secret passphrase — same caveat as the journal key: don't reuse a real
   password, this is a single shared secret standing between "just you" and "anyone with
   the URL."
2. Set it as a Vercel env var:
   ```bash
   printf '%s' 'YOUR_OWN_SECRET' | vercel env add AI_ACCESS_KEY production
   ```
3. Redeploy. In the app, click the 🔑 button (bottom-left, above the 🗄 journal-sync
   button) and enter the same secret from step 1.

Until `AI_ACCESS_KEY` is set on the server, the AI features report themselves as
unavailable rather than staying open by default — same "fail closed" behavior as the
journal backup when its own env vars are missing. A key mismatch between client and server
surfaces as a plain-English message pointing back at the 🔑 settings, not a silent failure.

## Locking down which origins can call the API

Every `api/*.ts` endpoint now checks the request's `Origin` header (`rejectOrigin()` in
`api/_cors.ts`) and rejects anything that isn't this app itself or localhost dev, so someone
can't script requests against your deployment from an unrelated page in a browser. By
default that allowlist is a regex — `put-visualizer(-[a-z0-9]+)?.vercel.app` — meant to
match Vercel's own preview-deployment subdomains for *this* project. It has a real gap: a
different Vercel account can deploy their own project literally named e.g.
`put-visualizer-anything` and get a domain that also matches the regex, since `*.vercel.app`
subdomains aren't scoped per-project the way a custom domain is.

None of this app's endpoints rely on cookies, so this isn't a classic CSRF hole — the risk
is narrower: an attacker's own page on a matching domain could ask a victim's browser to
call your API using whatever access key that victim's browser already has (e.g. in
`localStorage`), the same way any cross-origin page could if you'd allowed it explicitly.
Recommended for any real deployment:

```bash
printf '%s' 'https://your-actual-domain.vercel.app' | vercel env add ALLOWED_ORIGIN production
```

Once set, `ALLOWED_ORIGIN` replaces the regex entirely with an exact match — see
`isAllowed()` in `api/_cors.ts`.

Note this only gates *browser* requests carrying an `Origin` header — a request made with no
`Origin` at all (plain `curl`, a server-side script) always passes this check, same as a
same-origin browser request would. It's not a substitute for the shared-secret keys above on
endpoints that actually cost money to call; it's what stops a malicious *webpage* from using
someone else's browser session against your API.

## Rate limiting

Every `api/*.ts` endpoint now caps how many requests one client can make in a 5-minute
window (`api/_rateLimit.ts`) — a plain fixed-window counter, keyed by IP
(`x-forwarded-for`), returning `429` past the limit. It runs *before* any access-key check,
so wrong-key guesses count against the limit too, not just successful requests — this is
what actually caps a brute-force attempt against `JOURNAL_ACCESS_KEY` or `AI_ACCESS_KEY`,
which the constant-time comparison above only made *slower* to guess correctly, not
*impossible* to attempt without limit. `api/tasty.ts`'s `auth` action (the one place here
that doesn't need a valid session token first, making it a real credential-stuffing surface
against tastytrade itself) gets its own much tighter limit on top of the general one.

**Be honest about what this is and isn't.** It's a module-scope in-memory counter — no
shared state across regions or isolates, and it resets on every cold start. It is NOT a
hard, globally-consistent guarantee the way a shared store (Vercel KV, Upstash Redis) would
be: a determined, distributed attacker spreading requests across enough isolates can evade
it. What it does do, at zero infra cost and zero new env vars, is cap what a single warm
isolate serves a single client — enough to blunt the realistic cases here (a runaway
client-side retry loop, a single-source burst, a scripted key-guessing attempt), which is
most of what this app actually needed defending against. Building an untested Redis/KV
integration wasn't an option from this environment — there are no live credentials here to
validate one against — so this is the honest, verifiable version of "add rate limiting,"
not a stand-in for a production-grade one. If you deploy this somewhere that faces real
distributed abuse, wire up Vercel KV or Upstash Redis instead and swap out `_rateLimit.ts`'s
internals; every call site (`rateLimit()`/`clientKey()`/`rateLimitResponse()`) stays the
same.

### Watchlist size — why `COMPANIES` isn't bigger

`src/appConstants.ts`'s `COMPANIES` (76 tickers as of the last expansion, up from 41) feeds
every automated scan in the app — Today's picks and Alex's scan both loop over the full
list on every run. Today's picks calls `/api/quote`, `/api/history`, and `/api/option` once
per ticker; Alex's scan calls `/api/history` once per ticker plus one shared `/api/earnings`
call. Both hit `/api/history` — the same rate limiter, same 5-minute window (see **Rate
limiting** above, 200 requests/5min) — so a user running Today's picks and then Alex's scan
inside the same window sums their `/api/history` calls against one shared ceiling: roughly
`2 × COMPANIES.length + 1` requests. At 76 tickers that's ~153, leaving real headroom for a
refresh click or a Holdings ticker check in the same window; at 100 it's ~201, already over
the limit *before* accounting for anything else. That's the actual ceiling on this list's
size — not an arbitrary choice, and not something more rows alone can fix.

Growing meaningfully past ~100 (S&P 500-scale) needs a different architecture: a
scheduled/cached pre-scan (cron job populates results server-side, the live app reads the
cache) instead of an on-demand per-visit fetch of every ticker's quote/history/option. That's
a real project, not a bigger array — tracked as a "Next steps" item on the backtest side
(`scripts/backtest/` already supports scanning far more than 76 via `--tickers`/`--universe`,
since it's offline and not rate-limited the same way) but not yet built for the live app.

## Security headers

`vercel.json` sends a `Content-Security-Policy` on every response, alongside
`X-Content-Type-Options`, `X-Frame-Options`, and `Referrer-Policy`. It's tight almost
everywhere on purpose — `default-src 'self'` and no external scripts/fonts/images/connect
targets at all, since the app never actually needs any (every third-party call — Alpaca,
Finnhub, Anthropic, tastytrade, Cloudflare D1 — happens server-side in `api/*.ts`, never
from the browser). Verified with a real browser enforcing this exact policy against the
built app, clicking through every tab: zero violations, zero page errors.

The one real compromise: `style-src 'self' 'unsafe-inline'`. Every component in this app
sets styles via React's `style={{...}}` prop (rendered as inline `style="..."` attributes),
not CSS classes or a stylesheet — a CSP without `'unsafe-inline'` in `style-src` would
break the entire UI. Tightening that further would mean rewriting the app's whole styling
approach, not a CSP tweak; not worth it for an app with no XSS vector to defend against in
the first place (no `dangerouslySetInnerHTML`, `eval`, or `new Function` anywhere in `src/`).
This CSP is defense-in-depth against a vulnerability that doesn't currently exist, not a
response to one that does.

## Buying and selling shares you already (or might) own

Everywhere else in this app is about selling options — collecting premium, not owning the
stock outright (unless you get assigned). **💼 Holdings** is the one tab for two different
questions: "should I buy this stock" and "I already own this stock — when should I sell
it?" Add a ticker, share count, and cost basis (shares from anywhere, not just an assignment
logged in this app), and each position gets three independent, honest sell-side reads
(`src/lib/holdings.ts`):

1. **Your rule** — the take-profit % / stop-loss % you set when you added the position
   (defaults: +20% / -10%), checked against the live price.
2. **Technical** — a plain trend/momentum read on the stock itself (50-/200-day averages,
   RSI), independent of what you paid. Deliberately simpler than Alex's scan's full score,
   which is calibrated for "is this a good new entry" (position sizing, affordability,
   earnings risk) — none of which answers "should I exit a position I already hold." A
   "sell" verdict here requires a **confirmed** downtrend — below both the 50- and 200-day
   averages; a holding with under 200 days of history has no 200-day average yet, and that's
   treated as "unconfirmed," not "broken."
3. **Bottom line** — what happens when the two agree, or don't. Not a vote that gets settled
   by "2 out of 2" false precision: both saying sell is a sell; one saying sell and the other
   not is called out as mixed, explicitly, rather than averaged into something that looks
   more confident than it is.

Every one of those (the buy read included) carries two parallel explanations, not one:
a plain-English reason shown by default, and an **Explain** toggle (same pattern as Alex's
scan and Today's picks) revealing the analyst-grade version underneath — the actual live
price, SMA20/50/200 values, RSI reading, and the exact thresholds compared, not just the
conclusion. "Past your 10% stop-loss" is the simple-English layer; "Stop-loss triggers at or
below $90.00 (-10%)" is the sophisticated one sitting right below it. A verdict you can't
audit down to the numbers behind it isn't rigorous, it's just an opinion in a colored box.

**🔎 Check a ticker before you buy**, above the holdings list, is the buy-side mirror:
`entryVerdict()` reuses the same building blocks (50-/200-day averages, RSI) as the sell
read but aimed the other way, and holds itself to a higher bar on purpose — "unconfirmed"
(above the 50-day but not yet the 200-day) is a fine reason to keep holding something you
already own, but a poor reason to buy something you don't, so it reads **WAIT**, not **BUY**,
in that case. A **BUY** verdict needs a *confirmed* uptrend (above both averages) *and* a
tight, non-extended pullback to the 20-day average with RSI not overbought — otherwise it's
**WAIT** ("uptrend intact but extended — you'd be chasing it") or **AVOID** (trend not
confirmed at all). Check any ticker, not just ones you own, and "+ Add as a holding" carries
the ticker and current price straight into the add-holding form.

**Be honest about what this is.** A take-profit/stop-loss percentage is a number you chose,
not a law of markets. A technical read can be wrong, and both of these are simple few-input
reads, not a sophisticated model. None of it places an order — every verdict is something to
read and decide on, the same as everywhere else in this app. Live price and history come
from the same `/api/quote` and `/api/history` endpoints Alex's scan uses (see **Enabling
live Alpaca data** above); without a live feed configured, positions still track and their
rule-based verdict still works — only the technical reads need price history to say
anything. Holdings are saved to `localStorage` only (`csp_holdings_v1`) — there's no
server-side backup for this tab the way there is for the journal.

## A note on the tastytrade integration

`api/tasty.ts` and the "Connect Tastytrade" button talk to tastytrade's **live production
API** by default. Nothing else in this app touches it: the calculator, journal, scans, and
reports all work fully without ever connecting it. If you don't actually place real orders
through this, there's no reason to connect it at all.

If you do connect live: connecting requires reading a warning and checking a box before
the login form even appears (re-required every 24 hours, not a one-time dismissal), and
placing an actual order requires typing `PLACE` into a confirmation field — a single click
used to be all that stood between the confirm screen and a real order.

**Sandbox mode.** A **Live / Sandbox** toggle above the connect panel switches which
Tastytrade environment the whole session talks to — Sandbox routes every call
(`api/tasty.ts`'s `baseFor()`) to `api.cert.tastyworks.com`, Tastytrade's own testing
environment: orders never reach a real market, quotes are always 15-minute delayed, and
the system resets every 24 hours (trades/positions/balances cleared; the sandbox account
itself persists). It needs a *separate* sandbox account, set up at
[developer.tastytrade.com/sandbox](https://developer.tastytrade.com/sandbox/) — not your
regular login. Picking Sandbox skips the live-trading warning gate entirely (there's
nothing to warn about — no real money is ever at risk), and every screen in the connect/
confirm flow relabels itself accordingly (a blue "SANDBOX" badge instead of the red "LIVE"
one, "Sandbox order — no real money" instead of the real-money warning, "Sandbox order
sent" on completion). A connected session remembers which environment it authenticated
against (`TastySession.env`) and sends it on every subsequent call — dry-run, place, and
token refresh alike — so a sandbox session can never accidentally hit prod or vice versa.
Defaults to Live, matching every session from before this existed.

## Project layout

```
src/
  App.tsx                  top-level state + tab switching (~650 lines)
  types.ts                 shared domain types (Mode, JournalEntry, PnlModel, …)
  appConstants.ts          storage keys, COMPANIES/MODES/DEFAULTS, load*() helpers
  styles.ts                the shared inline-style object + keyframes
  lib/                     pure logic — no React, all unit-tested
    blackScholes.ts  probability.ts  richness.ts  score.ts  technicals.ts
    pnl.ts  journal.ts  dates.ts  format.ts  tastyOrder.ts
  components/              one file per view/widget (Chart, Journal, Screener,
                            AlexScan, PortfolioView, WeeklyReport, DayReview,
                            Tastytrade, JournalSync, TodayView, Tour, LearnView, …)
api/                        Vercel Edge functions (quote, option, history, earnings,
                            morning, analyze, chat, lesson, tasty, journal)
```

`App.jsx` used to be a single ~4,000-line file holding every component; it's now split
by feature, matching the app's own tabs. `src/lib/` holds everything with no React
dependency, which is what makes it unit-testable without rendering anything. The whole
tree is TypeScript now (`strict: true`) — see **Since then** below.

## Running the tests and linter

```bash
npm test          # Vitest — 482 tests: every pure module in src/lib/, every api/*.ts
                  # Edge function, every component in src/components/ (RTL),
                  # App.tsx's own orchestration (tabs, sync, tour, journal, Tasty),
                  # and the Alex's-scan backtest harness (scripts/backtest/)
npm run typecheck # tsc --noEmit — the primary safety net now (strict: true)
npm run lint      # ESLint — react-hooks rules (rules-of-hooks, exhaustive-deps)
```

`tsc --noEmit` is doing the heavy lifting now: every component has a real prop-type
interface, and the compiler catches a wrong shape or a typo'd prop name before it ever
reaches a test, let alone production. Before the TypeScript migration, ESLint's `no-undef`
was standing in for that — the cheapest guard against a component silently referencing
something that was never imported — and it did catch three missing-import bugs on the
first pass of the original file split. `no-undef` is retired now (redundant with what
`tsc` already guarantees, and prone to false positives on TS-only constructs); ESLint's
job has narrowed to what the type checker doesn't check — the react-hooks rules — parsed
via `@babel/eslint-parser` rather than `typescript-eslint`, which as of this writing
doesn't support the TypeScript version this project pins (see `eslint.config.js`).

The component tests caught two more real bugs of a different kind on their first pass:
`entryBadWeekPnl` could render a literal `"$NaN"` in Sarah's book for an entry missing
`putPrem`, and `AssignmentView`'s mode-specific note was a plain object literal that
eagerly evaluated *all four* branches on every render — including `money2(longStrike)`
for non-spread modes, where `longStrike` is `undefined` — crashing the whole card. Both
are fixed and covered by regression tests now.

The two most safety-critical components — the tastytrade live-trading warning gate and the
type-`PLACE`-to-confirm order screen — have dedicated test files
(`Tastytrade.test.tsx`, `TastyOrderConfirm.test.tsx`) specifically to make it hard for
either gate to regress back to "one click" without a test failing.

CI (`.github/workflows/ci.yml`) runs lint, typecheck, test, and build on every push and PR.

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
stock/ETF screener, `src/lib/technicals.ts`) and **📈 Elena's report** (weekly
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
10. Migrated the entire app to TypeScript (`strict: true`) — every `src/lib/` module,
    every component (with a real prop-type interface each), `App.jsx` itself, and all
    11 `api/` Edge functions. `entryCollateral`/`entryRiskNote`/`entryBadWeekPnl`/
    `summarizeWeek` in `src/lib/journal.ts` now take `Partial<JournalEntry>` rather than
    the full type — an honest reflection of what they actually do (tolerate incomplete
    or legacy entries), not a hole punched in the type system to make tests compile.
    ESLint's `no-undef` is retired (`tsc` supersedes it); `eslint.config.js` now parses
    TS/TSX via `@babel/eslint-parser` instead of `typescript-eslint`, which doesn't yet
    support the TypeScript version this project pins. `npm run typecheck` runs in CI
    alongside lint/test/build.
11. Closed a real, currently-exploitable hole found during a post-merge security pass:
    `api/chat.ts` and `api/analyze.ts` had CORS headers but never actually enforced them
    (`rejectOrigin` was imported but unused), and `api/lesson.ts` had no origin or method
    checks at all — meaning all three endpoints, which proxy to the Anthropic API on this
    app's own key, were callable by anyone with the URL, at the app owner's expense, with
    no browser required. Fixed with a shared-secret gate (`AI_ACCESS_KEY`) matching the
    journal backup's existing pattern — see **Securing the AI features** above.
12. Switched every shared-secret check (`JOURNAL_ACCESS_KEY`, `AI_ACCESS_KEY`) from `!==`
    to a constant-time comparison (`api/_auth.ts`). A plain `!==` on two strings
    short-circuits at the first mismatched byte, so how long a wrong guess takes leaks how
    many leading characters it got right — a real timing side channel given these
    endpoints have no rate limiting in front of them. The new helper hashes both sides
    first (SHA-256, always 32 bytes) so the comparison always does the same amount of work
    regardless of the secrets' length or content.
13. Mobile pass. Verified with Playwright at 320-390px viewports (real phone widths), not
    just by inspecting the CSS: the 4-way strategy toggle and the 8-tab main nav both
    squeezed long labels into flex:1 slots with no wrap, clipping/overlapping text; the
    floating status pills (journal backup, AI access key) and the Tastytrade connect
    button are independently `position: fixed` with no awareness of each other, and at
    320-375px wide their content literally overlapped (confirmed with bounding-box
    measurements, not eyeballing). Fixed by making the toggle and the tab bar scroll
    horizontally instead of squeezing (same `overflowX: auto` pattern already used for
    the data tables), capping every floating popup's width with `min()` so none can render
    off-screen, and collapsing the two bottom-left status pills to icon-only below 480px
    so they can't collide with the bottom-right buttons — tapping the icon still opens the
    full explanation. `page`/`shell` padding now uses `clamp()` instead of a fixed value.
14. Closed the same origin-check gap on the five market-data endpoints (`quote.ts`,
    `option.ts`, `history.ts`, `earnings.ts`, `morning.ts`) that items 11 and 12 closed on
    the AI endpoints: all five called `corsHeaders()` (or, for `earnings.ts`, nothing at
    all) without ever calling `rejectOrigin()`, so anyone with the URL could call them
    directly and consume the app owner's Alpaca/Finnhub quota. These don't carry a
    per-request cost the way the AI endpoints do, so they're origin-gated only (see
    **Locking down which origins can call the API** above) rather than given their own
    access key — that would be security theater for public market data with no real
    per-call cost to protect.
15. Added rate limiting to every `api/*.ts` endpoint (`api/_rateLimit.ts`) — previously
    none of them capped request volume at all, so even a correctly-keyed or same-origin
    request had no limit on how many times it could be sent. Runs before the access-key
    check, so it also caps brute-force guesses against `JOURNAL_ACCESS_KEY`/`AI_ACCESS_KEY`
    (the constant-time comparison in #12 made a wrong guess no faster to detect than a
    right one, but didn't cap *how many* guesses could be made). `tasty.ts`'s `auth` action
    gets its own tighter limit, since it's the one action there that doesn't need a valid
    session token first. Deliberately a zero-dependency, best-effort in-memory limiter, not
    a Vercel KV/Upstash Redis integration — see **Rate limiting** above for why, and what
    the honest limits of that choice are.
16. Added **💼 Holdings** — every other tab is about selling options, this is the only
    place for a plain stock position, wherever it came from. Three independent reads per
    position (`src/lib/holdings.ts`): a user-set take-profit/stop-loss rule, a plain
    technical trend/RSI read, and a "bottom line" that calls out mixed signals explicitly
    instead of averaging them into false confidence. Building `technicalVerdict()` caught a
    real bug in its own first draft before it shipped: a holding under 200 days old (no
    200-day average yet) was reading as a confirmed downtrend ("sell") just because that
    average was `null`, rather than "unconfirmed" ("watch") — the tests written to cover the
    watch-only case caught it immediately.
17. Added the buy-side counterpart, **🔎 Check a ticker before you buy**, inside the
    Holdings tab — `entryVerdict()` mirrors `technicalVerdict()`'s building blocks but holds
    a higher bar, since "unconfirmed" is a fine reason to keep holding something you own and
    a poor reason to buy something you don't. "+ Add as a holding" carries a checked ticker
    and its live price straight into the add form. See **Buying and selling shares you
    already (or might) own** above.
18. Every Holdings verdict now carries a second, analyst-grade explanation alongside its
    plain-English reason — an **Explain** toggle (mirroring `ExplainCheckItem`'s existing
    pattern from Alex's scan/Today's picks) reveals the actual price, SMA20/50/200 values,
    RSI reading, and thresholds compared, not just the conclusion. Every `RuleVerdict`/
    `EntryRead` now carries a required `detail` field alongside `reason`; new tests assert on
    the detail's actual numeric content (e.g. the exact stop-loss/take-profit dollar
    triggers), not just that it exists.
19. Made journal sync's upsert batches transactional. Each batch of `UPSERT_BATCH_SIZE`
    entries was previously sent as that many separate, individually-auto-committed D1
    requests (run concurrently, not atomically) — a failure partway through a batch could
    leave it partially written. Each batch is now ONE D1 request: a single SQL string
    wrapping all of that batch's upserts in an explicit `BEGIN TRANSACTION` / `COMMIT`,
    with one flat, positionally-matched params array. Standard SQLite transaction syntax,
    and D1 is documented SQLite-compatible — but **not verified against a live D1 database
    from this environment** (no credentials available here to test against). If D1's HTTP
    API rejects multi-statement `BEGIN`/`COMMIT` requests outright, the failure mode is
    still safe: a syntax-level rejection fails before any statement in the batch executes,
    surfacing as a normal sync error (502) rather than a silent partial write — but this
    needs a real end-to-end sync against your own D1 database to confirm before you trust
    it. This does not make the *entire* sync atomic — the delete step, and different
    batches from each other, are still separate requests, same limitation as before, just
    with a smaller blast radius (a batch of up to `UPSERT_BATCH_SIZE`, not a single row).
20. Added an accessible label to the AI Coach panel's close button (`×`) — every other
    icon-only close/delete/toggle button in the app already had a `title` or `aria-label`;
    this one was the single one left unlabeled.
21. Added a `Content-Security-Policy` header (see **Security headers** above), and fixed
    `index.html`'s script tag, which referenced `/src/main.jsx` — a file that has never
    existed in this all-TypeScript codebase; the actual file is `src/main.tsx`. The build
    only ever worked because Vite's resolver silently falls back to a same-named file with
    a different extension when the literal path doesn't exist. Corrected to the real
    filename rather than continuing to rely on that undocumented fallback.
22. Added `App.tsx`'s own test suite (`src/App.test.tsx`, 12 tests) — every child
    component already had its own tests, but the orchestration logic in `App.tsx` itself
    (tab switching, `localStorage` persistence, the journal-sync pull/push gating, the
    Tastytrade buying-power sync, the first-run tour) had none. Writing it caught a real
    bug: loading a trade from **Today's picks** or **Compare stocks** set the calculator's
    strike to the exact one the scan validated has a real premium, then immediately called
    `selectCompany()`, which reset that strike back to the ticker's generic
    snapshot-rounded price — silently swapping in a different, unvalidated strike (e.g. a
    real MSFT pick at $300 landed on $375 instead). `selectCompany` now takes a
    `keepStrike` option, set by both of those call sites, so a caller that already picked
    a specific strike keeps it.
23. Made the Journal's options stop-loss user-configurable, closing the gap with
    **💼 Holdings**' stock stop-loss (a user-set %). The two mechanisms are legitimately
    different — options risk is naturally sized in multiples of the credit collected, not
    a percentage of a share price — but the Journal's was a fixed `credit × 2` with no way
    to change it, while Holdings let you set your own threshold per position. Added a
    "Stop-loss (× credit)" calculator field (`inputs.stopLossMultiplier`, defaulting to the
    original 2×), stored per-entry (`JournalEntry.stopLossMultiplier`) at log time so past
    trades keep whatever rule was in effect when they were logged, with older entries
    (logged before this existed) falling back to 2× exactly as before.
24. Built the walk-forward backtest harness for Alex's scan (`scripts/backtest/`, see
    below) — the scoring itself is untouched, this only builds the tooling to validate it
    against real history once there's a live deployment's Alpaca credentials to validate
    it with. The pure sampling/bucketing logic (`engine.ts`/`stats.ts`) is fully unit
    tested now (14 tests), including a regression test proving it never leaks a future
    bar into a historical day's score.
25. Added two more data sources to the backtest harness, `--source=tiingo` and
    `--source=norgate`, since Alpaca's free tier alone caps history at 2016. Tiingo is a
    real second HTTP fetcher (`dataSource.ts`), using adjusted prices rather than raw —
    correctly, since a raw series has a fake giant "move" at every stock split, which would
    otherwise get read as a real, enormous single-day price change. Norgate turned out not
    to have a REST API at all (it's a Windows-only desktop app requiring a running local
    process and a paid subscription — see `norgateSource.ts`'s docstring), so what's wired
    in instead is a CSV reader (`norgateSource.ts`) for the files Norgate's own Export Task
    Manager produces, matching columns by header name (case/order-insensitive, with an
    override flag for nonstandard exports) rather than assuming a fixed layout, since NDU's
    export format is user-configurable. Both the Alpaca/Tiingo raw-record mapping and the
    CSV parser are unit tested (14 more tests, 28 total in `scripts/backtest/`) — the CSV
    parser's tests cover quoted fields, bad rows, and a full custom column-map override.
    Verified the Norgate path end-to-end against a real (synthetic) exported CSV directory,
    not just the credential-check message.
26. Closed the survivorship-bias gap the previous entry left open: added `--universe=<path>`
    (`universe.ts`), a point-in-time index-membership gate independent of `--source` — a CSV
    of which symbol was eligible from when to when, so the backtest can include names that
    have since been delisted or dropped off today's `COMPANIES` watchlist instead of only
    ever grading today's survivors. Given without an explicit `--tickers`, the ticker list
    now expands to every symbol that ever appears in the universe file. Extracted the CSV
    header-matching helpers shared with `norgateSource.ts` into `csv.ts` rather than
    duplicating them a second time. 22 more tests (`universe.test.ts`'s parsing/eligibility
    cases, plus two in `engine.test.ts` covering the new gate — including that a symbol can
    be eligible again in a later, separate window after dropping out). Verified end-to-end
    against a synthetic Norgate-shaped export plus a synthetic constituents file, not just
    the unit tests in isolation.
27. Added a **Live / Sandbox** toggle to the Tastytrade integration (see **A note on the
    tastytrade integration** above) — Sandbox routes every call to Tastytrade's own testing
    environment (`api.cert.tastyworks.com`: no real money, orders never reach a real
    market, resets every 24h) instead of production, and skips the live-trading warning
    gate entirely since there's nothing to warn about. A connected session remembers which
    environment it authenticated against and sends it on every subsequent call — dry-run,
    place, refresh — so a session can't accidentally cross environments. Defaults to Live,
    matching every session from before this existed; every existing safety test
    (`Tastytrade.test.tsx`'s live-trading gate suite) still passes unchanged. 14 new tests
    across `api/tasty.test.ts` (env routes to the right base URL, defaults to prod when
    omitted — verified failing against a deliberately reintroduced routing bug, then fixed
    again), `Tastytrade.test.tsx` (gate skipped in sandbox, badge/label switching, `env`
    sent on connect), and `TastyOrderConfirm.test.tsx` (`env` sent on every call, sandbox-
    labeled copy). Checked visually with Playwright, not just jsdom, since this is a
    `position: fixed` corner widget where a new toggle row could plausibly have overlapped
    something.

28. Ran the backtest for real — 10 years, Tiingo, all 41 `COMPANIES` tickers, 17,490
    samples. See **Results** below in the "Backtesting Alex's scan" section: the scoring
    does not show a reliable edge. Also added an on-demand GitHub Actions workflow
    (`.github/workflows/backtest.yml`) that runs the backtest on GitHub's own runners,
    reading the Tiingo key from a repository secret rather than a workflow input — this
    repo is public, and a plain `workflow_dispatch` input value is visible in that run's
    summary to anyone, forever, whereas a repo secret never is.
29. Added three more lenses on the same backtest data, none needing a new fetch:
    `--split-date=YYYY-MM-DD` reports the grade/decile tables separately for samples
    before vs. on/after a date (`stats.ts`'s `splitByDate`) — the fit/test-period check: a
    pattern that only appears when two eras are pooled together is weaker evidence than
    one that holds in each era on its own. `--sector-breakdown` and `--cap-breakdown`
    (`tickerMeta.ts`, hand-classified sector/market-cap-tier per ticker, checked by a test
    against `COMPANIES` so it can't silently go stale) slice the same samples by sector and
    by rough cap tier. None of this touches `analyzeStock()` or influences the score being
    tested — purely after-the-fact stratification. 11 new tests.
30. Generalized the backtest harness to cover the app's other two buy/sell signals, not
    just Alex's scan — this app makes three independent recommendations
    (`analyzeStock`/`entryVerdict`/`technicalVerdict`, see the table in "Backtesting this
    app's buy/sell signals" below), and only the first had ever been checked against real
    data. `engine.ts`'s `walkForward` now takes a pluggable `evaluate` function
    (`WalkForwardOptions.evaluate: Evaluator`) instead of being hardcoded to call
    `analyzeStock` — one walk-forward loop and one no-lookahead guarantee shared by all
    three (`evaluators.ts`), rather than three parallel copies of that logic that could
    quietly drift apart. New `--signal=alex-scan|holdings-entry|holdings-exit` (default
    `alex-scan`, unchanged). `WalkForwardSample.score` is now `number | null` — Holdings'
    two signals are verdict-only (buy/wait/avoid, sell/watch/hold), no numeric score to
    bucket by decile, so `bucketByScoreDecile` skips those samples and the decile table is
    skipped in the report rather than printing empty headers. Also exposed `--signal` on
    the GitHub Actions workflow. 15 new tests, including one confirming the engine works
    with a genuinely different, non-`analyzeStock` evaluator (not just happening to work
    because it's secretly still calling `analyzeStock` somewhere) and one confirming the
    no-lookahead guarantee survived the refactor (re-verified the same way as the original:
    deliberately reintroduced the lookahead bug, watched the regression test catch it, then
    reverted).
31. Ran `holdings-entry` and `holdings-exit` for real (10 years, Tiingo, same 41 tickers,
    17,490 samples each) — see **Results** below: neither shows an edge either.
    `entryVerdict`'s `wait`/`avoid` beat `buy` at every horizon; `technicalVerdict`'s `sell`
    isn't followed by worse outcomes than `hold`. Also ported the methodology from an
    independent, more rigorous 20-year analysis of this same watchlist back into
    `scripts/backtest/` as tested code, rather than leaving it a one-off script: a Spearman
    rank correlation between score and forward return (`stats.ts`'s `spearmanCorrelation`/
    `scoreForwardReturnSpearman`, printed automatically for `alex-scan`, the only signal
    with a numeric score — 7 new tests including tie-handling and a nonlinear-but-monotonic
    check), a per-calendar-year breakdown (`bucketByYear`, `--year-breakdown`), and a
    modeled cash-secured-put overlay (`cspOverlay.ts`, `--csp-overlay`): a 45-DTE, 30-delta
    short put priced via this app's own `src/lib/blackScholes.ts` (reused, not
    re-implemented, so the overlay can't drift from the live app's own pricing math) off
    trailing realized volatility as an IV proxy, bucketed by grade with mean/median/p05
    return-on-collateral and assignment rate. The strike-for-delta search is a bisection
    against the app's own `bsGreeks`, not a separate inverse-normal implementation, for the
    same drift-proofing reason. 25 new tests total (`cspOverlay.test.ts`, plus additions to
    `stats.test.ts` and `engine.test.ts`), including one proving the CSP overlay sizes a
    trade from `bars[0..i]` only and a future price swing changes only the settlement, not
    the strike/premium — the same no-lookahead discipline the walk-forward engine itself is
    built on. Exposed `--year-breakdown` and `--csp-overlay` on the GitHub Actions workflow
    too.
32. Added a **🕯️ Chart** tab — daily OHLC candlesticks (`src/components/PriceChart.tsx`),
    pure hand-rolled SVG like `Chart.tsx`'s own P&L curve, no charting library. Fetches
    `/api/history` for a typed ticker (90/180/365-day range), the same endpoint every
    scan/score elsewhere already calls, and draws it with no grade, verdict, or score
    attached — a look at the shape of the price, not a signal of its own. A volume subplot
    sits underneath; up/down candle colors match `Chart.tsx`'s existing gain/loss palette.
    10 new tests (`PriceChart.test.tsx`), including one confirming a missing `open` (an
    optional `Bar` field) falls back to close rather than crashing.
33. Wired the Chart tab into the rest of the app — a "🕯️ View chart" link on every Alex's
    scan row, the Holdings ticker checker, each Holdings position card, and each Today's
    picks card, all jumping to Chart pre-loaded (and auto-loaded, no second click needed)
    with that ticker. Without this, Chart was a page nobody would actually visit — the point
    is seeing the candles behind a grade you're already looking at, not a separate
    destination you have to retype a ticker into. `App.tsx` gained a small `chartTicker`
    state + `viewChart(sym)` handler shared by all four call sites.
    Caught by an actual browser smoke test (Playwright against the real dev server, not
    just unit tests): the first pass labeled every one of those links "🕯️ Chart" — the
    *exact* same text as the Chart tab itself, so `getByText`/accessible-name lookups
    (and, in practice, a screen reader or browser find-in-page) couldn't tell a row's
    "jump to this ticker's chart" link apart from the tab button. Renamed the row-level
    links to "🕯️ View chart" to disambiguate; re-verified visually afterward (tab switch,
    ticker prefilled, chart auto-loads). 5 new tests across `AlexScan.test.tsx`,
    `Holdings.test.tsx`, `TodayView.test.tsx`, and `App.test.tsx`.
34. Expanded `COMPANIES` from 41 to 76 tickers — more sector ETFs (tech, industrials,
    utilities, health care, staples, discretionary, materials, real estate) and more names
    per sector (semis, industrials, financials, healthcare, consumer), still all liquid,
    optionable large-caps — not a jump to full market coverage. See the new **Watchlist
    size** note (under **Rate limiting**) for exactly why 76 and not more right now:
    Today's picks and Alex's scan both call `/api/history` once per ticker, share that
    endpoint's 200-requests/5-minute rate limit, and can both run in the same window — so
    the real ceiling is roughly `2 × COMPANIES.length + 1` against that one limit, not an
    arbitrary preference. Going meaningfully bigger (S&P 500-scale) needs a
    scheduled/cached pre-scan instead of the current on-demand per-visit fetch — a real
    architecture change, tracked as an open item, not done here. `TICKER_META`
    (`scripts/backtest/tickerMeta.ts`) updated in lockstep for the 35 new tickers so its
    own sync test doesn't fail. New `appConstants.test.ts` (3 tests) — including a
    guardrail that fails loudly if `COMPANIES` ever grows past the size that combined
    math can safely support, instead of letting it silently regress into live 429s.
    Verified visually (Alex's scan and Today's picks both render cleanly at the new count,
    no console errors beyond the expected missing-API-route 404 in this sandbox).
35. Built the suitability-gate redesign scoped in **Next steps** #4 below — see that entry
    for the full description. In short: `src/lib/suitability.ts` is now the only thing in
    this app allowed to say "pick"/"don't pick," built entirely from facts (afford it, no
    earnings, `richness` fair-or-rich, a person-confirmed worst-case acceptance), never the
    score. Wired into Today's picks as the primary verdict; Alex's scan and Holdings gained
    an in-app `BacktestDisclosure` banner stating their actual backtest result in place,
    not just in this README. 20 new tests. Verified visually (Playwright against the real
    dev server) that the disclosure banners render correctly on Alex's scan and Holdings.

## Backtesting this app's buy/sell signals (`scripts/backtest/`)

This app makes three independent buy/sell recommendations, and `scripts/backtest/` can
walk-forward test any of them via `--signal` (default `alex-scan`):

| `--signal` | Function | What it answers | Feeds |
|---|---|---|---|
| `alex-scan` (default) | `analyzeStock()` (`src/lib/technicals.ts`) | General buy-timing screener — is this a good technical setup right now? | The options calculator, via **🔭 Alex's scan** |
| `holdings-entry` | `entryVerdict()` (`src/lib/holdings.ts`) | Should I buy this stock, starting fresh? Independent of options entirely. | **💼 Holdings**' "Check a ticker before you buy" |
| `holdings-exit` | `technicalVerdict()` (`src/lib/holdings.ts`) | I already own this — has the trend broken? | **💼 Holdings**' sell signal for an existing position |

All three have now been run against real data (see **Results** below) — they share the
exact same walk-forward engine and no-lookahead guarantee (`engine.ts`'s `walkForward` is
generic over which evaluator runs each day; see `evaluators.ts`).

One scope note specific to Holdings' two signals: unlike Alex's scan (which feeds the
options calculator, so an untradeable name is out of scope), a `Holding` is just shares
and a cost basis — nothing requires it to be optionable. So testing `holdings-entry`/
`holdings-exit` across a broader range of stock classes, including smaller and lower-priced
names, is a legitimate question for those two signals specifically, not a mismatch the way
it would be for Alex's scan. The real caution there is data quality, not relevance: sparse
or unreliable price history, spreads wide enough that a backtested close-to-close return is
unrealistic, and heavy survivorship bias in anything that thin — worth a wider `--tickers`
list once there's a real run to look at, but read those results with that in mind.

### Results (2026-09-08 runs: Tiingo, 10 years, all 41 tickers, 17,490 samples each)

**None of the three signals shows a reliable edge.**

**`alex-scan`** — "Strong setup" was supposed to beat "Avoid." It doesn't hold up:

| Horizon | Strong setup | Watch | Avoid |
|---|---|---|---|
| 5-day  | 0.19% (n=878) | 0.50% | 0.40% |
| 10-day | 0.98% | 0.93% | 0.84% |
| 20-day | 2.15% | 1.57% | 1.81% |

At 5 days the ranking is inverted — Strong underperforms both Watch and Avoid. At 10 days
it's a statistical wash. Only at 20 days does the ordering look right. A real signal
should hold consistently across three overlapping, correlated horizons like these, not
flip sign. Win rates sit in a tight 53–59% band across every grade — including Avoid —
which looks more like "the market went up most of this decade" than a stock-specific
edge. The one encouraging number (the top score decile, 90–99, led at every horizon)
doesn't survive scrutiny either: it's 193 of 17,490 samples (1.1%), and the decile right
below it (80–89) is negative at 5 days — a real tail effect should degrade smoothly into
its neighbor, not crater next door. The Spearman rank correlation between score and
forward return (`--signal=alex-scan` prints this automatically; see **stats.ts**'s
`scoreForwardReturnSpearman`) is close to zero at every horizon — consistent with an
independent 20-year run of the same watchlist, which reported ρ ≈ −0.03: essentially no
monotonic relationship between a higher score and a better forward return.

**`holdings-entry`** (`entryVerdict()` — "should I buy this stock?") is, if anything,
backwards. `wait`/`avoid` beat `buy` at every horizon:

| Horizon | buy | wait | avoid |
|---|---|---|---|
| 5-day  | 0.37% | 0.46% | 0.40% |
| 10-day | 0.72% | 0.93% | 0.83% |
| 20-day | 1.41% | 1.67% | 1.91% |

**`holdings-exit`** (`technicalVerdict()` — "has the trend broken, should I sell?") isn't
protecting against downside the way its name implies. `sell` is not followed by worse
outcomes than `hold` — all three stay positive, and `watch` is the strongest bucket at
every horizon:

| Horizon | sell | watch | hold |
|---|---|---|---|
| 5-day  | 0.35% | 0.51% | 0.40% |
| 10-day | 0.75% | 1.00% | 0.80% |
| 20-day | 1.75% | 1.89% | 1.57% |

**Conclusion:** as currently weighted, none of this app's three buy/sell recommendation
systems shows a reliable edge over this sample. That doesn't necessarily indict the
underlying ideas (trend, pullback, relative strength, RSI) — the weights were hand-ported
from `stock-coach` and never fit to data, so this could be a calibration problem rather
than a conceptual one. But right now the app shows confident, color-coded "Strong setup" /
"buy" / "sell" labels this backtest cannot back up. This result has not yet been reflected
inside the app itself (no in-app disclosure has been added) — that's a deliberate,
separate decision, not an oversight.

**A sharper question than "did the stock go up": would a cash-secured put on it have paid
you for the risk?** `--csp-overlay` models a 45-DTE, 30-delta short put opened each day
(Black-Scholes off trailing realized vol — see `cspOverlay.ts`), which is the actual
product this app helps someone sell, not just a stock-direction bet. An independent
20-year run of this overlay found modeled CSPs were ~78% winners with roughly a −9%
5th-percentile (left-tail) return on collateral **in every grade bucket** — "Strong setup"
did not reduce the tail risk. High win rate and a fat left tail together are what
short-premium strategies structurally look like; they are not evidence a scan is picking
good setups. `bucketCspByGrade`'s `p05Return` is exactly the number to check this against
on any future run.

**Next steps, in order of how much they'd actually tell us:**
1. ~~**Fit/test split**~~ — done: `--split-date` reports the grade/decile tables separately
   for an early era and a later one, checking the *existing* fixed weights across both
   rather than just the pooled 10 years. An actual refit of the weights (not just checking
   whether the current ones generalize) would still need a parameterized variant of
   `analyzeStock`, kept separate from the production function so backtesting it never
   risks drifting from what ships.
2. ~~**Run `holdings-entry` and `holdings-exit` for real**~~ — done, see **Results** above.
   Neither shows an edge either.
3. ~~**Port the Spearman/CSP/per-year methodology into tested code**~~ — done:
   `spearmanCorrelation`/`scoreForwardReturnSpearman` and `bucketByYear` (`stats.ts`), and
   the modeled CSP overlay (`cspOverlay.ts`, `--csp-overlay`) are now part of this harness
   rather than a one-off script — every future run gets this level of rigor automatically.
4. ~~**Redesign what "pick" and "don't pick" mean.**~~ — done: `src/lib/suitability.ts`'s
   `suitabilityVerdict()` is now the only thing in this app allowed to say "pick" or "don't
   pick," built from exactly the facts this backtest evidence still supports — canAfford,
   no earnings before expiration, `richness` fair-or-rich vs. realized vol, and an explicit
   person-confirmed "you accept this trade's real worst case" (never inferred, never
   defaulted — see the module's own docstring for why). Deliberately does NOT use win rate,
   POP, annualized yield, cushion, or any of the three signals' own score/grade — those
   are exactly the ingredients this backtest showed don't predict anything. Wired into
   Today's picks as the primary verdict badge (replacing the giant score as the headline;
   the score still shows, demoted and labeled "tape"), with a required worst-case
   checkbox before a card can ever read "Pick." Alex's scan and Holdings keep their
   existing scores/verdicts as informational context but now carry an in-app
   `BacktestDisclosure` banner (`shared.tsx`) stating the actual backtest finding in plain
   English, in the exact place the score is shown — not a README-only confession. 20 new
   tests (`suitability.test.ts`, `TodayView.test.tsx`, `AlexScan.test.tsx`,
   `Holdings.test.tsx`, `shared.test.tsx`).
5. **Cross-sectional relative-strength scoring** — absolute-level technicals (RSI between
   45–60, etc.) are among the weaker-supported edges in the literature; ranking stocks
   against each other each day has more historical support. Lower priority than #4: a
   better *forecast* signal is a different, harder problem than a *defensible pick*, and
   the latter doesn't require solving the former.
6. **Earnings blackout** — needs a historical earnings-date source; Tiingo's free tier
   doesn't include one. Unresolved pending a data-source decision.
7. **Wider universe** — S&P 500 (~500 names) rather than 76 mega-caps/ETFs for `alex-scan`,
   both for statistical power and to check the sector/cap-tier breakdown
   (`--sector-breakdown`, `--cap-breakdown`) on a real spread of names. For
   `holdings-entry`/`holdings-exit` specifically, a broader range of stock classes
   (smaller/lower-priced names, not just large caps) is worth including too, since neither
   signal is options-gated the way `alex-scan` is — see the scope note above.

**How it works:** for each ticker and each historical trading day `i` (starting once
there's enough trailing history for a real `sma200` read), it calls the exact same
evaluator function the live app calls — `analyzeStock()`, `entryVerdict()`, or
`technicalVerdict()` depending on `--signal` — but only with bars up to and including day
`i`, never a bar from the future, then measures the actual forward return over several
horizons (5/10/20 trading days) and buckets those returns by the grade/verdict the live
app would have shown a user that day. If the signal means anything, its best label
("Strong setup," "buy," or "hold" depending on which one) should show a better mean
forward return than its worst one ("Avoid," "avoid," "sell"), and — for `alex-scan`, the
only one with a numeric score — mean return should trend upward score-decile by
score-decile.

```bash
# Sanity-check the harness itself — synthetic data, no credentials needed:
npm run backtest:alex -- --dry-run

# The real thing — pick a --source (see the comparison below):
npm run backtest:alex                                              # alex-scan, Alpaca, defaults
npm run backtest:alex -- --source=tiingo --years=10
npm run backtest:alex -- --source=norgate --norgate-dir=./norgate-export
npm run backtest:alex -- --source=norgate --norgate-dir=./norgate-export --universe=./sp500-constituents.csv
npm run backtest:alex -- --years=5 --horizons=5,10,20 --stride=5
npm run backtest:alex -- --tickers=AAPL,MSFT,NVDA --out=my-run.json

# Pick a different signal — see the table above (default is alex-scan):
npm run backtest:alex -- --signal=holdings-entry --source=tiingo --years=10
npm run backtest:alex -- --signal=holdings-exit --source=tiingo --years=10

# Fit/test split and extra breakdowns — see "Results" above for why:
npm run backtest:alex -- --source=tiingo --years=10 --split-date=2021-01-01
npm run backtest:alex -- --source=tiingo --years=10 --sector-breakdown --cap-breakdown
npm run backtest:alex -- --source=tiingo --years=10 --year-breakdown

# Model a cash-secured put overlay by grade (default 45-DTE, 30-delta — see "Results"):
npm run backtest:alex -- --source=tiingo --years=10 --csp-overlay
npm run backtest:alex -- --source=tiingo --years=10 --csp-overlay --csp-dte=30 --csp-delta=0.2
```

Or trigger `.github/workflows/backtest.yml` from the Actions tab (needs a `TIINGO_API_KEY`
repository secret set first) — same flags, exposed as workflow inputs, running on GitHub's
own runners rather than wherever you'd otherwise run this from.

**Three sources, `--source=alpaca|tiingo|norgate` (default `alpaca`):**

| Source | What it needs | History depth | Notes |
|---|---|---|---|
| `alpaca` | `ALPACA_KEY_ID`/`ALPACA_SECRET_KEY` (same as `api/history.ts`) | No trade data before 2016-01-01 on the free IEX feed | Called directly rather than through `api/history.ts`, which caps `days` at 400 — a live-app limit, not Alpaca's. Uses raw (unadjusted) prices, matching what the live app shows. |
| `tiingo` | `TIINGO_API_KEY` (free, tiingo.com) | Often decades, for tickers Tiingo has covered a long time | Free up to 50 symbols/hour. Uses split/dividend-**adjusted** prices — the more defensible default for a from-scratch backtest, since a raw series has a fake giant "move" at every stock split. Don't directly compare Alpaca-sourced and Tiingo-sourced runs without accounting for that difference. |
| `norgate` | `--norgate-dir=<path>`, a directory of `<SYMBOL>.csv` files **you export yourself** | Decades, survivorship-bias-free (includes delisted stocks) | Norgate has **no REST API** — data only reaches a machine via the Norgate Data Updater (NDU), a Windows/WSL2 desktop app requiring a paid subscription and a running NDU process. This script can't fetch that; it reads CSVs you export from NDU's Export Task Manager instead. `--norgate-columns=date:D,open:O,...` overrides the expected header names if your export doesn't match the (case-insensitive) defaults. See `norgateSource.ts`'s docstring for the full reasoning. |

Alpaca and Tiingo are called directly rather than through `api/history.ts` — that endpoint
caps `days` at 400 (a live-app design choice; no real caller ever needs more), but a
multi-year walk-forward backtest needs far more trailing history than any single live
request does.

**Survivorship bias in the ticker list itself** — Alex's scan's `COMPANIES` watchlist
(`src/appConstants.ts`) is today's ~76 large caps/ETFs, so backtesting against it, no
matter how deep the price history, still excludes whatever would have been in scope back
then but later got delisted or went to zero. `--universe=<path>` (a CSV of
`Symbol,StartDate,EndDate` membership intervals — blank `EndDate` means still a member)
closes this: it gates evaluation to only the days a symbol was actually eligible, and,
given without an explicit `--tickers`, expands the ticker list to every symbol that ever
appears in the file rather than just today's survivors. `--universe-columns` overrides its
header names the same way `--norgate-columns` does. This is source-agnostic — it works
with any `--source` — but getting a *delisted* name's actual price history still generally
needs `--source=norgate`, since Alpaca/Tiingo don't carry data for tickers that no longer
trade. Norgate's own `norgatedata` package can export this membership data directly (e.g.
S&P 500 constituents back to 1957); NDU's Export Task Manager is the path to a CSV of it,
same as for price bars.

**What it doesn't validate, on purpose, not by accident:**
- **Earnings risk.** `hasEarnings` is fixed to `false` throughout — there's no historical
  earnings calendar wired up, so the score-forced-to-0 earnings-blackout rule is never
  exercised. A ticker that actually had earnings inside a sampled window is scored as if
  it hadn't.
- **Sample independence.** Consecutive samples from the same ticker share most of their
  trailing bars and overlapping forward windows — they are not independent observations.
  The reported `±SE` is the naive i.i.d. formula; treat it as a rough sample-size guide,
  not a rigorous confidence interval.

The walk-forward/bucketing logic itself (`engine.ts`, `stats.ts`) is pure and fully unit
tested (`engine.test.ts`, `stats.test.ts`, 39 tests) — including a regression test that
plants a deliberate future price jump and asserts a day's score is unaffected by it, which
is the one property this kind of backtest lives or dies on. The modeled CSP overlay
(`cspOverlay.ts`, 9 tests) is tested the same way: a dedicated test proves it sizes the
trade (strike, premium) from `bars[0..i]` only, and that a future price swing changes the
settlement outcome without changing what the trade was sized at. The raw-record → `Bar`
mapping for Alpaca and Tiingo (`dataSource.test.ts`) and the Norgate CSV parser
(`norgateSource.test.ts`, covering header case/order-insensitivity, quoted fields, bad
rows, and a full custom column-map override) are unit tested too — only the actual
network/file-system calls (fetching from Alpaca/Tiingo, reading a real NDU export) need
live credentials or a real
export and are untestable offline.

**Do not** turn this into a "winning" app. Do not lead with annualized yield, win-rate, or
"X% of puts expire worthless." Do not hide, net, or downplay losses. Do not add streak
counters, confetti, or anything that makes selling puts feel like free money. If a change
makes the downside *less* visible than the upside, it's the wrong change — the red must always
be at least as loud as the green.
