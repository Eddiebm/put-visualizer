# Cash-Secured Put — Honest P&L Visualizer

A small local app that draws the real profit-and-loss curve of a cash-secured put.
You type four things — **strike price**, **premium per share**, **number of contracts**,
and **how far the stock might fall in a bad week** — and it shows you the asymmetry the
options-selling videos tend to skip past:

- a **flat green ceiling** marking the most you can ever make (the premium), and
- a **red, pulsing dot** sitting on the curve where a bad-week drop drags you.

The green stays small and flat. The red opens up underneath. That gap *is* the point.

Below the chart it shows the four numbers that actually matter:

| Number | What it means |
| --- | --- |
| **Cash locked up** | `strike × 100 × contracts` — the collateral you can't touch |
| **Premium collected** | `premium × 100 × contracts` — your maximum possible gain |
| **Breakeven price** | `strike − premium` — below this you're losing money |
| **Bad-week loss** | your P&L if the stock falls by the % you entered |

Your inputs are saved to `localStorage`, so closing and reopening it keeps your last setup.

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

This tool exists to be **honest about risk**, not to flatter the trade. If you add features,
keep that intact. Specifically:

**Good next features (in priority order):**

1. **Paper-trade journal** — log each put you'd sell, then record how it *actually* closed.
   Crucially, track the **losing weeks too**, not just the wins. The whole value is an honest
   running record, including assignments and drawdowns. Show realized P&L with losses in red,
   never hidden or netted away.
2. **Annualized return on collateral** — but always shown next to max loss, never alone.
3. **Multiple positions** — portfolio view of total cash locked up and aggregate bad-week loss.
4. **Implied "bad week" presets** — e.g. 1σ / 2σ moves from a volatility input, so the
   bad-week drop isn't just a guess.
5. **Assignment view** — what owning the shares at the strike would actually cost and look like.

**Do not** turn this into a "winning" app. Do not lead with annualized yield, win-rate, or
"X% of puts expire worthless." Do not hide, net, or downplay losses. Do not add streak
counters, confetti, or anything that makes selling puts feel like free money. If a change
makes the downside *less* visible than the upside, it's the wrong change — the red must always
be at least as loud as the green.
