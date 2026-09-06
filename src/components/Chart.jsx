import { lnDensity } from "../lib/blackScholes.js";
import { money, moneySigned } from "../lib/format.js";
import { styles } from "../styles.js";

export function Chart({ model }) {
  const W = 720;
  const H = 380;
  const pad = { top: 44, right: 44, bottom: 56, left: 44 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;
  const { samples, xMin, xMax, maxGain, markers, dots, hasIv, iv, dte, spot } = model;

  if (!samples || samples.length < 2 || xMax <= xMin) {
    return (
      <div style={{ ...styles.chartWrap, display: "grid", placeItems: "center", color: "#64748b" }}>
        Enter strikes and at least one contract to draw the curve.
      </div>
    );
  }

  let yLo = 0;
  let yHi = Math.max(maxGain, 0);
  for (const [, y] of samples) {
    if (y < yLo) yLo = y;
    if (y > yHi) yHi = y;
  }
  const padY = (yHi - yLo) * 0.08 + 1;
  const yTop = yHi + padY;
  const yBot = yLo - padY;

  const xToPx = (x) => pad.left + ((x - xMin) / (xMax - xMin)) * plotW;
  const yToPx = (y) => pad.top + ((yTop - y) / (yTop - yBot)) * plotH;

  const line = samples.map(([x, y]) => `${xToPx(x).toFixed(1)},${yToPx(y).toFixed(1)}`).join(" ");
  const zeroY = yToPx(0);

  // Lognormal probability density overlay
  let densityPts = null;
  if (hasIv && iv > 0 && dte > 0 && spot > 0) {
    const T = dte / 365;
    const densities = samples.map(([x]) => lnDensity(x, spot, iv, T));
    const maxDen = Math.max(...densities, 1e-10);
    const denScale = plotH * 0.42 / maxDen;
    const bottom = H - pad.bottom;
    const pts = [`${xToPx(xMin).toFixed(1)},${bottom.toFixed(1)}`];
    samples.forEach(([x], i) => {
      const py = bottom - densities[i] * denScale;
      pts.push(`${xToPx(x).toFixed(1)},${py.toFixed(1)}`);
    });
    pts.push(`${xToPx(xMax).toFixed(1)},${bottom.toFixed(1)}`);
    densityPts = pts.join(" ");
  }

  const areaPts = [`${xToPx(xMin).toFixed(1)},${zeroY.toFixed(1)}`];
  for (const [x, y] of samples) areaPts.push(`${xToPx(x).toFixed(1)},${yToPx(Math.min(0, y)).toFixed(1)}`);
  areaPts.push(`${xToPx(xMax).toFixed(1)},${zeroY.toFixed(1)}`);

  const ceilingY = yToPx(maxGain);

  return (
    <div style={styles.chartWrap}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Profit and loss curve">
        <line x1={pad.left} y1={zeroY} x2={W - pad.right} y2={zeroY} stroke="#e9edf3" strokeWidth="1" />

        <polygon points={areaPts.join(" ")} fill="rgba(225,76,76,0.06)" />

        {densityPts && (
          <polygon
            points={densityPts}
            fill="rgba(99,102,241,0.10)"
            stroke="rgba(99,102,241,0.25)"
            strokeWidth="1"
          />
        )}

        {Number.isFinite(ceilingY) && (
          <>
            <line x1={pad.left} y1={ceilingY} x2={W - pad.right} y2={ceilingY} stroke="#3aa56b" strokeWidth="1" />
            <text x={pad.left} y={ceilingY - 10} textAnchor="start" style={styles.ceilingLabel}>
              max gain · {money(maxGain)}
            </text>
          </>
        )}

        {markers.map((m, i) => {
          const mx = xToPx(m.x);
          return (
            <g key={i}>
              <line x1={mx} y1={pad.top} x2={mx} y2={H - pad.bottom} stroke="#e2e8f0" strokeDasharray="2 5" />
              <text x={mx} y={H - pad.bottom + 22} textAnchor="middle" style={styles.axisLabel}>
                {m.label}
              </text>
            </g>
          );
        })}

        <polyline points={line} fill="none" stroke="#1f2937" strokeWidth="1.5" strokeLinejoin="round" />

        {dots.map((d, i) => {
          const dx = xToPx(d.x);
          const dy = yToPx(d.y);
          const loss = d.y < 0;
          return (
            <g key={i}>
              <circle cx={dx} cy={dy} r="10" fill={loss ? "rgba(225,76,76,0.16)" : "rgba(58,165,107,0.16)"}>
                <animate attributeName="r" values="7;13;7" dur="2.4s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.4;0.08;0.4" dur="2.4s" repeatCount="indefinite" />
              </circle>
              <circle cx={dx} cy={dy} r="4" fill={loss ? "#e14c4c" : "#3aa56b"} stroke="#fff" strokeWidth="1.5" />
              <text
                x={dx}
                y={loss ? dy + 24 : dy - 14}
                textAnchor="middle"
                style={loss ? styles.badLabel : styles.goodLabel}
              >
                {moneySigned(d.y)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

