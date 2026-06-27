// Pure Black-Scholes math — no UI, no dependencies.
// Single export interface: getTheoretical({ spot, strike, dte, rate, vol, type })
// Swap this file for QuantLib later without touching the UI.

const SQRT2PI = Math.sqrt(2 * Math.PI);

export function normCdf(z) {
  const a = [0.3193815, -0.3565638, 1.7814779, -1.821256, 1.3302744];
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  let poly = 0;
  for (let i = a.length - 1; i >= 0; i--) poly = poly * t + a[i];
  const d = (Math.exp(-0.5 * z * z) / SQRT2PI) * t * poly;
  return z >= 0 ? 1 - d : d;
}

function normPdf(z) {
  return Math.exp(-0.5 * z * z) / SQRT2PI;
}

function d1d2(spot, strike, dte, rate, vol) {
  const T = dte / 365;
  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(spot / strike) + (rate + 0.5 * vol * vol) * T) / (vol * sqrtT);
  return { d1, d2: d1 - vol * sqrtT, T, sqrtT };
}

export function bsPrice(spot, strike, dte, rate, vol, type) {
  if (dte <= 0) return type === "call" ? Math.max(0, spot - strike) : Math.max(0, strike - spot);
  if (vol <= 0) return type === "call" ? Math.max(0, spot - strike) : Math.max(0, strike - spot);
  const { d1, d2, T } = d1d2(spot, strike, dte, rate, vol);
  const df = Math.exp(-rate * T);
  return type === "call"
    ? spot * normCdf(d1) - strike * df * normCdf(d2)
    : strike * df * normCdf(-d2) - spot * normCdf(-d1);
}

export function bsGreeks(spot, strike, dte, rate, vol, type) {
  if (dte <= 0 || vol <= 0) {
    return { delta: type === "call" ? (spot >= strike ? 1 : 0) : (spot <= strike ? -1 : 0), gamma: 0, theta: 0, vega: 0 };
  }
  const { d1, d2, T, sqrtT } = d1d2(spot, strike, dte, rate, vol);
  const df = Math.exp(-rate * T);
  const nd1 = normPdf(d1);
  const gamma = nd1 / (spot * vol * sqrtT);
  const vega = spot * nd1 * sqrtT / 100; // per 1% vol change
  const thetaBase = -(spot * nd1 * vol) / (2 * sqrtT) / 365;
  const delta = type === "call" ? normCdf(d1) : normCdf(d1) - 1;
  const theta = type === "call"
    ? thetaBase - rate * strike * df * normCdf(d2) / 365
    : thetaBase + rate * strike * df * normCdf(-d2) / 365;
  return { delta, gamma, theta, vega };
}

// Newton-Raphson IV solver, bisection fallback.
export function solveIv(marketPrice, spot, strike, dte, rate, type) {
  if (!(marketPrice > 0) || !(dte > 0)) return null;
  const intrinsic = type === "call" ? Math.max(0, spot - strike) : Math.max(0, strike - spot);
  if (marketPrice < intrinsic - 0.001) return null;

  // Brenner-Subrahmanyam initial guess
  const T = dte / 365;
  let vol = Math.max(0.01, Math.min(Math.sqrt(2 * Math.PI / T) * (marketPrice / spot), 5));

  const TOL = 1e-6;
  for (let i = 0; i < 100; i++) {
    const price = bsPrice(spot, strike, dte, rate, vol, type);
    const { vega } = bsGreeks(spot, strike, dte, rate, vol, type);
    const vegaScaled = vega * 100;
    const diff = price - marketPrice;
    if (Math.abs(diff) < TOL) return vol;
    if (Math.abs(vegaScaled) < 1e-10) break;
    vol = vol - diff / vegaScaled;
    if (vol <= 0 || vol > 5) break;
  }

  // Bisection fallback
  let lo = 1e-4, hi = 5;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    const diff = bsPrice(spot, strike, dte, rate, mid, type) - marketPrice;
    if (Math.abs(diff) < TOL || (hi - lo) < 1e-7) return mid;
    diff > 0 ? (hi = mid) : (lo = mid);
  }
  return (lo + hi) / 2;
}

// Annualized realized volatility from an array of daily closing prices.
export function realizedVol(closes, window = 30) {
  if (!closes || closes.length < 3) return null;
  const slice = closes.slice(-Math.min(window + 1, closes.length));
  const logRets = [];
  for (let i = 1; i < slice.length; i++) {
    if (slice[i - 1] > 0 && slice[i] > 0) logRets.push(Math.log(slice[i] / slice[i - 1]));
  }
  if (logRets.length < 2) return null;
  const mean = logRets.reduce((s, r) => s + r, 0) / logRets.length;
  const variance = logRets.reduce((s, r) => s + (r - mean) ** 2, 0) / (logRets.length - 1);
  return Math.sqrt(variance * 252);
}

// Lognormal probability density — used for the chart shading overlay.
export function lnDensity(S, S0, iv, T) {
  if (S <= 0 || S0 <= 0 || !(iv > 0) || !(T > 0)) return 0;
  const sigma = iv * Math.sqrt(T);
  const mu = Math.log(S0) - 0.5 * sigma * sigma;
  const z = (Math.log(S) - mu) / sigma;
  return Math.exp(-0.5 * z * z) / (S * sigma * SQRT2PI);
}

// Main swappable interface.
export function getTheoretical({ spot, strike, dte, rate = 0.05, vol, type = "put" }) {
  return { price: bsPrice(spot, strike, dte, rate, vol, type), ...bsGreeks(spot, strike, dte, rate, vol, type) };
}
