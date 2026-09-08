import { useState, useEffect } from "react";
import { styles } from "../styles";
import type { Bar } from "../types";

// ─── Price chart — daily OHLC candlesticks ────────────────────────────────
// Its own tab, deliberately separate from every scan/score elsewhere in the
// app: this draws the same bars Alex's scan and Holdings already fetch and
// grade (`/api/history`), with no verdict, grade, or score attached. Just
// the shape of the price, for a ticker you type in. Pure hand-rolled SVG,
// same approach as Chart.tsx's P&L curve — no charting library dependency.

const DAY_OPTIONS = [90, 180, 365] as const;
const UP_COLOR = "#3aa56b"; // matches Chart.tsx's gain color
const DOWN_COLOR = "#e14c4c"; // matches Chart.tsx's loss color

interface PriceChartProps {
  initialTicker?: string;
}

interface FetchState {
  status: "idle" | "loading" | "loaded" | "error";
  ticker?: string;
  bars?: Bar[];
}

export function PriceChart({ initialTicker = "" }: PriceChartProps) {
  const [ticker, setTicker] = useState(initialTicker);
  const [days, setDays] = useState<number>(180);
  const [state, setState] = useState<FetchState>({ status: "idle" });

  // Arriving here via a "view chart" link elsewhere (Alex's scan, Holdings,
  // Today's picks) hands a ticker and should show that chart immediately,
  // not just prefill the field and wait for a second click. A manual visit
  // to this tab with no ticker (initialTicker="") leaves the form idle.
  useEffect(() => {
    if (initialTicker.trim()) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally mount-only, using the initial ticker/days this component was given
  }, []);

  async function load(e?: React.FormEvent) {
    e?.preventDefault();
    const t = ticker.trim().toUpperCase();
    if (!t) return;
    setState({ status: "loading" });
    try {
      const res = await fetch(`/api/history?symbol=${encodeURIComponent(t)}&days=${days}`);
      const data = res.ok ? await res.json() : null;
      const bars: Bar[] | undefined = data?.available ? data.bars : undefined;
      if (!bars || bars.length === 0) {
        setState({ status: "error", ticker: t });
        return;
      }
      setState({ status: "loaded", ticker: t, bars });
    } catch {
      setState({ status: "error", ticker: t });
    }
  }

  return (
    <div>
      <div style={{ fontWeight: 700, fontSize: 16, color: "#0f172a", marginBottom: 4 }}>🕯️ Price chart</div>
      <div style={{ fontSize: 12.5, color: "#64748b", marginBottom: 14, lineHeight: 1.5 }}>
        Daily OHLC candles from the same data this app scores against — a look at the shape
        behind a grade, not a signal of its own. No score, no verdict, nothing to act on here.
      </div>

      <form onSubmit={load} style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 16 }}>
        <label style={styles.field}>
          <span style={styles.fieldLabel}>Ticker</span>
          <span style={styles.inputWrap}>
            <input
              value={ticker}
              onChange={(e) => setTicker(e.target.value.toUpperCase())}
              placeholder="AAPL"
              style={{ ...styles.input, width: 90 }}
            />
          </span>
        </label>

        <div style={{ display: "flex", gap: 6 }}>
          {DAY_OPTIONS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDays(d)}
              aria-pressed={days === d}
              style={{
                border: "1px solid #d6deea",
                borderRadius: 8,
                background: days === d ? "#0f172a" : "#fff",
                color: days === d ? "#fff" : "#475569",
                fontSize: 12.5,
                fontWeight: 700,
                padding: "8px 12px",
                cursor: "pointer",
              }}
            >
              {d}d
            </button>
          ))}
        </div>

        <button
          type="submit"
          disabled={state.status === "loading"}
          style={{
            border: "none",
            borderRadius: 8,
            background: "#0f172a",
            color: "#fff",
            fontSize: 13,
            fontWeight: 700,
            padding: "10px 18px",
            cursor: state.status === "loading" ? "default" : "pointer",
            height: 38,
            opacity: state.status === "loading" ? 0.6 : 1,
          }}
        >
          {state.status === "loading" ? "Loading…" : "Load"}
        </button>
      </form>

      {state.status === "error" && (
        <div style={{ fontSize: 13, color: DOWN_COLOR }}>
          Couldn't load price history for {state.ticker} — check the ticker, or Alpaca
          credentials may not be configured (see api/history.ts).
        </div>
      )}

      {state.status === "loaded" && state.bars && <Candlesticks ticker={state.ticker as string} bars={state.bars} />}
    </div>
  );
}

interface CandlesticksProps {
  ticker: string;
  bars: Bar[];
}

// Pure SVG OHLC candlesticks with a volume subplot underneath — no
// charting library, same viewBox-scaling approach as Chart.tsx's P&L
// curve. Every layout number here is a fraction of W/H, so this scales
// with `bars.length` without special-casing dense vs. sparse series.
function Candlesticks({ ticker, bars }: CandlesticksProps) {
  const W = 760;
  const H = 420;
  const pad = { top: 16, right: 54, bottom: 24, left: 8 };
  const volH = 70; // volume subplot height, carved out of the bottom of the drawing area
  const gap = 10; // between the price area and the volume subplot
  const priceH = H - pad.top - pad.bottom - volH - gap;
  const plotW = W - pad.left - pad.right;

  if (bars.length === 0) return null;

  const highs = bars.map((b) => b.h);
  const lows = bars.map((b) => b.l);
  const yMax = Math.max(...highs);
  const yMin = Math.min(...lows);
  const yPad = (yMax - yMin) * 0.06 || 1; // flat series (all bars equal) still gets breathing room
  const yTop = yMax + yPad;
  const yBot = yMin - yPad;

  const vMax = Math.max(...bars.map((b) => b.v ?? 0), 1);

  const n = bars.length;
  const slot = plotW / n;
  const bodyW = Math.max(1, slot * 0.6);

  const xAt = (i: number) => pad.left + slot * i + slot / 2;
  const yAt = (price: number) => pad.top + ((yTop - price) / (yTop - yBot)) * priceH;
  const volBase = H - pad.bottom;
  const volTopAt = (v: number) => volBase - (v / vMax) * volH;

  const GRID_LINES = 4;
  const gridPrices = Array.from({ length: GRID_LINES + 1 }, (_, i) => yBot + ((yTop - yBot) * i) / GRID_LINES);

  // A handful of date labels along the x-axis — first, middle, last bar —
  // rather than one per bar, which would overlap into illegibility at any
  // real `days` value.
  const labelIndices = n === 1 ? [0] : [0, Math.floor((n - 1) / 2), n - 1];

  return (
    <div style={styles.chartWrap}>
      <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", marginBottom: 6 }}>
        {ticker} · {bars.length} daily bars
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`${ticker} candlestick chart`}>
        {gridPrices.map((p, i) => (
          <g key={i}>
            <line x1={pad.left} y1={yAt(p)} x2={W - pad.right} y2={yAt(p)} stroke="#eef2f7" strokeWidth="1" />
            <text x={W - pad.right + 6} y={yAt(p) + 4} style={{ fontSize: 10, fill: "#94a3b8" }}>
              {p.toFixed(2)}
            </text>
          </g>
        ))}

        {bars.map((b, i) => {
          const open = b.o ?? b.c;
          const up = b.c >= open;
          const color = up ? UP_COLOR : DOWN_COLOR;
          const x = xAt(i);
          const bodyTop = yAt(Math.max(open, b.c));
          const bodyBot = yAt(Math.min(open, b.c));
          const v = b.v ?? 0;
          return (
            <g key={b.t ?? i}>
              <line x1={x} y1={yAt(b.h)} x2={x} y2={yAt(b.l)} stroke={color} strokeWidth="1" />
              <rect x={x - bodyW / 2} y={bodyTop} width={bodyW} height={Math.max(1, bodyBot - bodyTop)} fill={color} />
              <rect x={x - bodyW / 2} y={volTopAt(v)} width={bodyW} height={volBase - volTopAt(v)} fill={color} opacity="0.25" />
            </g>
          );
        })}

        {labelIndices.map((i) => (
          <text key={i} x={xAt(i)} y={H - 4} textAnchor="middle" style={{ fontSize: 10, fill: "#94a3b8" }}>
            {(bars[i].t ?? "").slice(0, 10)}
          </text>
        ))}
      </svg>
    </div>
  );
}
