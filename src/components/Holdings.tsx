import { useState, useEffect, useCallback } from "react";
import { money, money2, moneySigned } from "../lib/format";
import {
  holdingPnl, ruleVerdict, technicalVerdict, consensusVerdict, entryVerdict,
  type Holding, type Verdict, type RuleVerdict, type EntryVerdict, type EntryRead,
} from "../lib/holdings";
import type { Bar } from "../types";

// ─── Holdings — shares you already own (and shares you might buy) ─────────
// Every other tab in this app is about selling options. This is the one
// place that answers two questions instead: "should I buy this stock" and
// "I already own this stock — when should I sell it?" Independent, honest
// reads per position (your own target rule, a plain technical read, and
// what happens when they agree or don't) — see src/lib/holdings.ts for the
// actual logic. Nothing here places an order; this only tells you what the
// numbers say.

const STORAGE_KEY = "csp_holdings_v1";

function loadHoldings(): Holding[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

interface LiveData {
  price: number | null;
  bars: Bar[] | null;
}

const VERDICT_STYLE: Record<Verdict, { label: string; color: string; bg: string }> = {
  sell:  { label: "SELL",  color: "#e14c4c", bg: "#fff5f5" },
  watch: { label: "WATCH", color: "#d97706", bg: "#fffbeb" },
  hold:  { label: "HOLD",  color: "#16a34a", bg: "#f0fdf4" },
};

function VerdictBadge({ verdict }: { verdict: Verdict }) {
  const s = VERDICT_STYLE[verdict];
  return (
    <span style={{
      display: "inline-block", fontSize: 11, fontWeight: 800, letterSpacing: "0.03em",
      color: s.color, background: s.bg, border: `1px solid ${s.color}30`,
      borderRadius: 6, padding: "2px 8px", flexShrink: 0,
    }}>
      {s.label}
    </span>
  );
}

const ENTRY_VERDICT_STYLE: Record<EntryVerdict, { label: string; color: string; bg: string }> = {
  buy:   { label: "BUY",   color: "#16a34a", bg: "#f0fdf4" },
  wait:  { label: "WAIT",  color: "#d97706", bg: "#fffbeb" },
  avoid: { label: "AVOID", color: "#e14c4c", bg: "#fff5f5" },
};

function EntryBadge({ verdict }: { verdict: EntryVerdict }) {
  const s = ENTRY_VERDICT_STYLE[verdict];
  return (
    <span style={{
      display: "inline-block", fontSize: 11, fontWeight: 800, letterSpacing: "0.03em",
      color: s.color, background: s.bg, border: `1px solid ${s.color}30`,
      borderRadius: 6, padding: "2px 8px", flexShrink: 0,
    }}>
      {s.label}
    </span>
  );
}

interface CheckResult {
  ticker: string;
  price: number | null;
  entry: EntryRead;
}

function TickerCheck({ onAdd }: { onAdd: (ticker: string, price: number) => void }) {
  const [ticker, setTicker] = useState("");
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [explainOpen, setExplainOpen] = useState(false);

  async function check(e: React.FormEvent) {
    e.preventDefault();
    const t = ticker.trim().toUpperCase();
    if (!t) return;
    setChecking(true);
    setResult(null);
    setExplainOpen(false);
    const [quoteData, histData] = await Promise.all([
      fetch(`/api/quote?symbol=${encodeURIComponent(t)}`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch(`/api/history?symbol=${encodeURIComponent(t)}&days=220`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]);
    const price = typeof quoteData?.price === "number" ? quoteData.price : null;
    const bars = histData?.available ? (histData.bars ?? null) : null;
    setResult({ ticker: t, price, entry: entryVerdict(bars) });
    setChecking(false);
  }

  return (
    <div style={{ marginBottom: 20, padding: 14, background: "#f8fafc", border: "1px solid #eef2f7", borderRadius: 12 }}>
      <div style={{ fontWeight: 700, fontSize: 14, color: "#0f172a", marginBottom: 4 }}>🔎 Check a ticker before you buy</div>
      <div style={{ fontSize: 12, color: "#64748b", marginBottom: 12, lineHeight: 1.5 }}>
        The mirror of the sell signals below, aimed the other way: a confirmed uptrend, not
        an extended one you'd be chasing.
      </div>
      <form onSubmit={check} style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
        <Field label="Ticker" value={ticker} onChange={(v) => setTicker(v.toUpperCase())} placeholder="MSFT" width={90} />
        <button
          type="submit" disabled={checking}
          style={{
            border: "none", borderRadius: 8, background: "#0f172a", color: "#fff",
            fontSize: 13, fontWeight: 700, padding: "10px 18px", cursor: checking ? "default" : "pointer",
            height: 38, opacity: checking ? 0.6 : 1,
          }}
        >
          {checking ? "Checking…" : "Check"}
        </button>
      </form>

      {result && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #eef2f7" }}>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
            <div style={{ minWidth: 90 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: "#0f172a" }}>{result.ticker}</div>
              <div style={{ fontSize: 11.5, color: "#94a3b8" }}>{result.price != null ? money2(result.price) : "price unavailable"}</div>
            </div>
            <EntryBadge verdict={result.entry.verdict} />
            <div style={{ fontSize: 12.5, color: "#475569", lineHeight: 1.5, flex: 1, minWidth: 180 }}>
              {result.entry.reason}
            </div>
            <ExplainToggle open={explainOpen} onToggle={() => setExplainOpen((o) => !o)} />
            {result.price != null && (
              <button
                type="button"
                onClick={() => onAdd(result.ticker, result.price as number)}
                style={{
                  border: "1px solid #d6deea", borderRadius: 8, background: "#fff", color: "#1f2937",
                  fontSize: 12, fontWeight: 700, padding: "6px 12px", cursor: "pointer", flexShrink: 0,
                }}
              >
                + Add as a holding
              </button>
            )}
          </div>
          {explainOpen && (
            <div style={{
              marginTop: 8, fontSize: 11.5, color: "#64748b",
              background: "#fff", border: "1px solid #eef2f7", borderRadius: 8, padding: "8px 12px", lineHeight: 1.6,
            }}>
              {result.entry.detail}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Every verdict row shows the plain-English reason by default, and an
// "Explain" toggle to the analyst-grade detail behind it — the actual
// price/SMA/RSI values and thresholds, not just the conclusion (mirrors
// ExplainCheckItem's pattern in shared.tsx, used the same way on Alex's
// scan and Today's picks).
function VerdictRow({ label, v, strong }: { label: string; v: RuleVerdict; strong?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ padding: "7px 0" }}>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        <div style={{ width: 92, flexShrink: 0, fontSize: 11.5, fontWeight: 700, color: "#64748b", marginTop: 2 }}>
          {label}
        </div>
        <VerdictBadge verdict={v.verdict} />
        <div style={{ fontSize: 12.5, color: strong ? "#0f172a" : "#475569", lineHeight: 1.5, fontWeight: strong ? 600 : 400, flex: 1 }}>
          {v.reason}
        </div>
        <ExplainToggle open={open} onToggle={() => setOpen((o) => !o)} />
      </div>
      {open && (
        <div style={{
          marginTop: 6, marginLeft: 102, fontSize: 11.5, color: "#64748b",
          background: "#f8fafc", borderRadius: 8, padding: "8px 12px", lineHeight: 1.6,
        }}>
          {v.detail}
        </div>
      )}
    </div>
  );
}

function ExplainToggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      style={{
        flexShrink: 0, background: "none", border: "1px solid #e2e8f0",
        borderRadius: 20, fontSize: 10, fontWeight: 700, color: "#64748b",
        padding: "1px 7px", cursor: "pointer", letterSpacing: "0.03em",
      }}
    >
      {open ? "Less" : "Explain"}
    </button>
  );
}

interface FormState {
  ticker: string;
  shares: string;
  costBasis: string;
  takeProfitPct: string;
  stopLossPct: string;
}

const EMPTY_FORM: FormState = { ticker: "", shares: "", costBasis: "", takeProfitPct: "20", stopLossPct: "10" };

export function Holdings() {
  const [holdings, setHoldings] = useState<Holding[]>(loadHoldings);
  const [live, setLive] = useState<Record<string, LiveData>>({});
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(holdings)); } catch { /* ignore */ }
  }, [holdings]);

  const refresh = useCallback(async () => {
    if (holdings.length === 0) { setLive({}); return; }
    setLoading(true);
    const tickers = [...new Set(holdings.map((h) => h.ticker))];
    const entries = await Promise.all(tickers.map(async (t): Promise<[string, LiveData]> => {
      const [quoteData, histData] = await Promise.all([
        fetch(`/api/quote?symbol=${encodeURIComponent(t)}`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
        fetch(`/api/history?symbol=${encodeURIComponent(t)}&days=220`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      ]);
      return [t, {
        price: typeof quoteData?.price === "number" ? quoteData.price : null,
        bars: histData?.available ? (histData.bars ?? null) : null,
      }];
    }));
    setLive(Object.fromEntries(entries));
    setLoading(false);
  }, [holdings]);

  // Ticker list, not the holdings array itself — adding a 2nd position in
  // the same stock (or editing a field that isn't the ticker) shouldn't
  // re-fetch data that hasn't changed.
  const tickerKey = [...new Set(holdings.map((h) => h.ticker))].sort().join(",");
  // eslint-disable-next-line react-hooks/exhaustive-deps -- tickerKey is the intentional dependency, see comment above
  useEffect(() => { refresh(); }, [tickerKey]);

  function addHolding(e: React.FormEvent) {
    e.preventDefault();
    const ticker = form.ticker.trim().toUpperCase();
    const shares = parseFloat(form.shares);
    const costBasis = parseFloat(form.costBasis);
    if (!ticker || !Number.isFinite(shares) || shares <= 0 || !Number.isFinite(costBasis) || costBasis <= 0) return;
    const takeProfitPct = Number.isFinite(parseFloat(form.takeProfitPct)) ? parseFloat(form.takeProfitPct) : 20;
    const stopLossPct = Number.isFinite(parseFloat(form.stopLossPct)) ? parseFloat(form.stopLossPct) : 10;
    const holding: Holding = {
      id: `${ticker}-${Date.now()}`,
      ticker, shares, costBasis, takeProfitPct, stopLossPct,
      acquiredAt: new Date().toISOString().slice(0, 10),
    };
    setHoldings((hs) => [...hs, holding]);
    setForm(EMPTY_FORM);
  }

  function removeHolding(id: string) {
    setHoldings((hs) => hs.filter((h) => h.id !== id));
  }

  function prefillFromCheck(ticker: string, price: number) {
    setForm((f) => ({ ...f, ticker, costBasis: String(price) }));
  }

  return (
    <div style={{ paddingTop: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 4 }}>
        <div style={{ fontWeight: 700, fontSize: 17, color: "#0f172a" }}>💼 Holdings</div>
        {holdings.length > 0 && (
          <button
            type="button" onClick={refresh} disabled={loading}
            style={{
              border: "1px solid #e2e8f0", borderRadius: 8, background: "#f8fafc", color: "#475569",
              fontSize: 12, fontWeight: 600, padding: "6px 12px", cursor: loading ? "default" : "pointer",
              opacity: loading ? 0.6 : 1, flexShrink: 0,
            }}
          >
            {loading ? "Refreshing…" : "↻ Refresh"}
          </button>
        )}
      </div>
      <div style={{ fontSize: 13, color: "#64748b", marginBottom: 18, maxWidth: 640 }}>
        Shares you already own — tracked separately from the options positions above. Three independent
        reads per position: your own target rule, a plain technical read, and what happens when they
        agree or don't. None of this places an order, and none of it is a guarantee — a % target is a
        number you chose, not a law of markets, and a technical read can be wrong.
      </div>

      <TickerCheck onAdd={prefillFromCheck} />

      <form onSubmit={addHolding} style={{
        display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end",
        marginBottom: 20, padding: 14, background: "#f8fafc", border: "1px solid #eef2f7", borderRadius: 12,
      }}>
        <Field label="Ticker" value={form.ticker} onChange={(v) => setForm((f) => ({ ...f, ticker: v.toUpperCase() }))} placeholder="AAPL" width={90} />
        <Field label="Shares" value={form.shares} onChange={(v) => setForm((f) => ({ ...f, shares: v }))} placeholder="100" width={80} type="number" />
        <Field label="Cost basis / share" value={form.costBasis} onChange={(v) => setForm((f) => ({ ...f, costBasis: v }))} placeholder="150.00" width={110} type="number" prefix="$" />
        <Field label="Take-profit %" value={form.takeProfitPct} onChange={(v) => setForm((f) => ({ ...f, takeProfitPct: v }))} width={80} type="number" suffix="%" />
        <Field label="Stop-loss %" value={form.stopLossPct} onChange={(v) => setForm((f) => ({ ...f, stopLossPct: v }))} width={80} type="number" suffix="%" />
        <button
          type="submit"
          style={{
            border: "none", borderRadius: 8, background: "#0f172a", color: "#fff",
            fontSize: 13, fontWeight: 700, padding: "10px 18px", cursor: "pointer", height: 38,
          }}
        >
          Add holding
        </button>
      </form>

      {holdings.length === 0 ? (
        <div style={{ textAlign: "center", padding: "48px 24px", background: "#f8fafc", borderRadius: 16, border: "1.5px solid #e2e8f0" }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>💼</div>
          <div style={{ fontWeight: 700, fontSize: 16, color: "#0f172a", marginBottom: 6 }}>No holdings tracked yet</div>
          <div style={{ fontSize: 13, color: "#94a3b8", maxWidth: 340, margin: "0 auto" }}>
            Add a stock you already own above — from anywhere, not just from an assignment in this app.
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {holdings.map((h) => {
            const l = live[h.ticker];
            const price = l?.price ?? null;
            const pnl = holdingPnl(h, price);
            const rule = ruleVerdict(h, price);
            const technical = technicalVerdict(l?.bars ?? null);
            const consensus = consensusVerdict(rule, technical);

            return (
              <div key={h.id} style={{ border: "1px solid #eef2f7", borderRadius: 12, padding: "14px 16px", background: "#fff" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: "#0f172a" }}>
                      {h.ticker} · {h.shares} share{h.shares !== 1 ? "s" : ""} @ {money2(h.costBasis)}
                    </div>
                    <div style={{ fontSize: 11.5, color: "#94a3b8", marginTop: 2 }}>
                      {price != null ? (
                        <>
                          Now {money2(price)} · {money(pnl.currentValue ?? 0)} ·{" "}
                          <span style={{ color: (pnl.gainLoss ?? 0) < 0 ? "#e14c4c" : "#16a34a", fontWeight: 700 }}>
                            {moneySigned(pnl.gainLoss ?? 0)} ({pnl.gainLossPct != null ? `${pnl.gainLossPct >= 0 ? "+" : ""}${(pnl.gainLossPct * 100).toFixed(1)}%` : "—"})
                          </span>
                        </>
                      ) : (
                        <span style={{ color: "#cbd5e1" }}>{loading ? "Loading price…" : "Price unavailable"}</span>
                      )}
                    </div>
                  </div>
                  <button
                    type="button" onClick={() => removeHolding(h.id)}
                    style={{ border: "none", background: "transparent", color: "#cbd5e1", fontSize: 15, cursor: "pointer", padding: "2px 4px", flexShrink: 0 }}
                    title="Remove holding"
                  >
                    ✕
                  </button>
                </div>

                <div style={{ marginTop: 8, borderTop: "1px solid #f1f5f9" }}>
                  <VerdictRow label="Your rule" v={rule} />
                  <VerdictRow label="Technical" v={technical} />
                  <div style={{ borderTop: "1px dashed #f1f5f9" }}>
                    <VerdictRow label="Bottom line" v={consensus} strong />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface FieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  width: number;
  type?: string;
  prefix?: string;
  suffix?: string;
}

function Field({ label, value, onChange, placeholder, width, type = "text", prefix, suffix }: FieldProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <label style={{ fontSize: 11, fontWeight: 600, color: "#475569" }}>{label}</label>
      <div style={{ display: "flex", alignItems: "center", border: "1px solid #e2e8f0", borderRadius: 8, background: "#fff", padding: "0 8px", width, height: 38 }}>
        {prefix && <span style={{ color: "#94a3b8", fontSize: 13 }}>{prefix}</span>}
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          style={{ border: "none", outline: "none", background: "transparent", width: "100%", fontSize: 13, padding: "0 4px", color: "#0f172a" }}
        />
        {suffix && <span style={{ color: "#94a3b8", fontSize: 13 }}>{suffix}</span>}
      </div>
    </div>
  );
}
