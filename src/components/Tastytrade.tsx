import { useState, useEffect } from "react";
import { money } from "../lib/format";
import { buildTastyOrder } from "../lib/tastyOrder";
import { TASTY_LIVE_ACK_KEY, TASTY_LIVE_ACK_TTL_MS } from "../appConstants";
import type { TastySession, TastyOrderRequest } from "../types";

export function loadTastyAckAt(): number | null {
  try {
    const raw = localStorage.getItem(TASTY_LIVE_ACK_KEY);
    return raw ? parseInt(raw, 10) : null;
  } catch { return null; }
}

interface TastyConnectProps {
  tasty: TastySession | null;
  onConnect: (session: TastySession) => void;
  onDisconnect: () => void;
}

export function TastyConnect({ tasty, onConnect, onDisconnect }: TastyConnectProps) {
  const [open, setOpen] = useState(false);
  const [ackAt, setAckAt] = useState<number | null>(loadTastyAckAt);
  const [ackChecked, setAckChecked] = useState(false);
  const [env, setEnv] = useState<"prod" | "cert">("prod");
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The live-trading acknowledgment only guards prod — sandbox never risks
  // real money (Tastytrade's cert environment: orders never reach a real
  // market, everything resets every 24h), so gating it behind the same
  // "I understand this places real orders" checkbox would be actively
  // misleading, not extra safety.
  const needsAck = env === "prod" && (!ackAt || (Date.now() - ackAt) > TASTY_LIVE_ACK_TTL_MS);

  function acknowledge() {
    const now = Date.now();
    try { localStorage.setItem(TASTY_LIVE_ACK_KEY, String(now)); } catch {}
    setAckAt(now);
    setAckChecked(false);
  }

  async function connect() {
    if (!login || !password) return;
    setBusy(true); setError(null);
    try {
      const authRes = await fetch("/api/tasty", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "auth", login, password, env }),
      });
      const authData = await authRes.json();
      if (!authRes.ok) { setError(authData.error ?? "Login failed"); setBusy(false); return; }

      const acctRes = await fetch("/api/tasty", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "accounts", token: authData.token, env }),
      });
      const acctData = await acctRes.json();
      const first = acctData.accounts?.[0];
      if (!first) { setError("No accounts found"); setBusy(false); return; }

      onConnect({
        token: authData.token,
        rememberToken: authData.rememberToken,
        accountNumber: first.accountNumber,
        nickname: first.nickname,
        buyingPower: first.buyingPower,
        netLiq: first.netLiq,
        env,
      });
      setPassword(""); setOpen(false);
    } catch { setError("Connection failed — check your internet"); }
    setBusy(false);
  }

  if (tasty) {
    return (
      <div style={{
        position: "fixed", bottom: 84, right: 24, zIndex: 150,
        background: "#f0fdf4", border: "1.5px solid #bbf7d0",
        borderRadius: 12, padding: "10px 14px", fontSize: 12,
        display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
        maxWidth: "calc(100vw - 48px)",
        boxShadow: "0 2px 12px rgba(0,0,0,0.10)",
      }}>
        <div>
          <div style={{ fontWeight: 700, color: "#16a34a" }}>
            ✓ Tastytrade connected{" "}
            {tasty.env === "cert" ? (
              <span style={{ color: "#fff", background: "#0369a1", borderRadius: 4, padding: "1px 6px", fontSize: 10, letterSpacing: "0.04em", marginLeft: 2 }}>
                SANDBOX
              </span>
            ) : (
              <span style={{ color: "#fff", background: "#e14c4c", borderRadius: 4, padding: "1px 6px", fontSize: 10, letterSpacing: "0.04em", marginLeft: 2 }}>
                LIVE
              </span>
            )}
          </div>
          <div style={{ color: "#475569" }}>{tasty.nickname} · BP: {money(tasty.buyingPower)}</div>
        </div>
        <button type="button" onClick={onDisconnect} style={{ background: "none", border: "none", color: "#94a3b8", fontSize: 11, cursor: "pointer", textDecoration: "underline" }}>
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <div style={{ position: "fixed", bottom: 84, right: 24, zIndex: 150 }}>
      {open && (
        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", marginBottom: 8 }}>
          <button
            type="button"
            onClick={() => setEnv("prod")}
            style={{
              border: "1px solid " + (env === "prod" ? "#e14c4c" : "#e2e8f0"),
              background: env === "prod" ? "#fef2f2" : "#fff",
              color: env === "prod" ? "#991b1b" : "#64748b",
              borderRadius: 20, padding: "4px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer",
            }}
          >
            Live
          </button>
          <button
            type="button"
            onClick={() => setEnv("cert")}
            style={{
              border: "1px solid " + (env === "cert" ? "#0369a1" : "#e2e8f0"),
              background: env === "cert" ? "#eff6ff" : "#fff",
              color: env === "cert" ? "#0369a1" : "#64748b",
              borderRadius: 20, padding: "4px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer",
            }}
            title="Tastytrade's sandbox — orders never reach a real market, resets every 24h"
          >
            Sandbox
          </button>
        </div>
      )}
      {open && needsAck && (
        <div style={{
          marginBottom: 8, background: "#fff", border: "1.5px solid #fecaca",
          borderRadius: 14, padding: 18, width: "min(300px, calc(100vw - 48px))",
          boxShadow: "0 8px 32px rgba(0,0,0,0.14)",
        }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: "#991b1b", marginBottom: 8 }}>
            ⚠ This is live trading, not a demo
          </div>
          <div style={{ fontSize: 12.5, color: "#475569", lineHeight: 1.6, marginBottom: 12 }}>
            Connecting talks to Tastytrade's <b>production</b> API — any order you place from this
            app trades <b>real money</b> in your real account. Everything else in this app (the
            calculator, journal, scans, reports) works fully without ever connecting this. Want to
            test the order flow risk-free first? Pick <b>Sandbox</b> above instead — no real money,
            no acknowledgment needed.
          </div>
          <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12, color: "#0f172a", marginBottom: 14, cursor: "pointer" }}>
            <input type="checkbox" checked={ackChecked} onChange={(e) => setAckChecked(e.target.checked)} style={{ marginTop: 2 }} />
            <span>I understand this places real orders with real money, and there is no practice mode.</span>
          </label>
          <button
            type="button" onClick={acknowledge} disabled={!ackChecked}
            style={{
              width: "100%", padding: "10px 0", background: ackChecked ? "#991b1b" : "#e2e8f0",
              color: ackChecked ? "#fff" : "#94a3b8", border: "none", borderRadius: 8, fontSize: 13,
              fontWeight: 700, cursor: ackChecked ? "pointer" : "default", marginBottom: 8,
            }}
          >
            I understand, continue
          </button>
          <button type="button" onClick={() => setOpen(false)} style={{ width: "100%", padding: "8px 0", background: "none", border: "none", color: "#94a3b8", fontSize: 12, cursor: "pointer" }}>
            Cancel
          </button>
        </div>
      )}
      {open && !needsAck && (
        <div style={{
          marginBottom: 8, background: "#fff", border: "1px solid #e2e8f0",
          borderRadius: 14, padding: 18, width: "min(280px, calc(100vw - 48px))",
          boxShadow: "0 8px 32px rgba(0,0,0,0.14)",
        }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: "#0f172a", marginBottom: 4 }}>
            Connect Tastytrade{" "}
            {env === "cert" ? (
              <span style={{ color: "#0369a1", fontSize: 11 }}>(sandbox)</span>
            ) : (
              <span style={{ color: "#e14c4c", fontSize: 11 }}>(live)</span>
            )}
          </div>
          <div style={{ fontSize: 12, color: "#64748b", marginBottom: 14 }}>
            Your password is never stored — only a session token.
            {env === "cert" && (
              <> Uses your Tastytrade <b>sandbox</b> account (set one up at{" "}
                <span style={{ fontFamily: "monospace" }}>developer.tastytrade.com/sandbox</span> if
                you haven't) — separate from your live login. No real money; resets every 24h.</>
            )}
          </div>
          <input
            type="email" placeholder="Email" value={login}
            onChange={e => setLogin(e.target.value)}
            style={{ width: "100%", border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 10px", fontSize: 13, marginBottom: 8, boxSizing: "border-box" }}
          />
          <input
            type="password" placeholder="Password" value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === "Enter" && connect()}
            style={{ width: "100%", border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 10px", fontSize: 13, marginBottom: 8, boxSizing: "border-box" }}
          />
          {error && <div style={{ fontSize: 12, color: "#e14c4c", marginBottom: 8 }}>{error}</div>}
          <button
            type="button" onClick={connect} disabled={busy || !login || !password}
            style={{
              width: "100%", padding: "10px 0", background: busy ? "#94a3b8" : "#0f172a",
              color: "#fff", border: "none", borderRadius: 8, fontSize: 13,
              fontWeight: 700, cursor: busy ? "default" : "pointer",
            }}
          >
            {busy ? "Connecting…" : "Connect →"}
          </button>
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          background: "#0f172a", color: "#fff", border: "none",
          borderRadius: 10, padding: "9px 16px", fontSize: 12,
          fontWeight: 700, cursor: "pointer",
          boxShadow: "0 2px 10px rgba(0,0,0,0.18)",
        }}
      >
        {open ? "✕" : "🔗 Connect Tastytrade"}
      </button>
    </div>
  );
}

// ─── Tastytrade: order confirmation modal ─────────────────────────────────────

type OrderStage = "dry-run" | "confirm" | "placing" | "done" | "error";

interface TastyOrderConfirmProps {
  order: TastyOrderRequest;
  tasty: TastySession;
  onClose: () => void;
  onRefreshSession: (updated: { token: string; rememberToken?: string }) => void;
}

export function TastyOrderConfirm({ order, tasty, onClose, onRefreshSession }: TastyOrderConfirmProps) {
  const [stage, setStage] = useState<OrderStage>("dry-run");
  const [dryRunResult, setDryRunResult] = useState<any>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const confirmed = confirmText.trim().toUpperCase() === "PLACE";

  const tastyOrder = buildTastyOrder(order);
  const credit = parseFloat(tastyOrder.price);
  const qty = order.contracts || 1;
  const maxGain = Math.round(credit * 100 * qty);
  const maxLoss = order.mode === "spread"
    ? Math.round(((order.putStrike || 0) - (order.longStrike || 0) - credit) * 100 * qty)
    : null;

  useEffect(() => { runDryRun(); }, []);

  async function callTasty(body: Record<string, unknown>) {
    const r = await fetch("/api/tasty", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...body, token: tasty.token, accountNumber: tasty.accountNumber, env: tasty.env }),
    });
    if (r.status === 401) {
      // Try refresh
      const ref = await fetch("/api/tasty", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "refresh", rememberToken: tasty.rememberToken, env: tasty.env }),
      });
      const refData = await ref.json();
      if (!ref.ok) throw new Error("Session expired — please reconnect Tastytrade");
      onRefreshSession({ token: refData.token, rememberToken: refData.rememberToken });
      // Retry with new token
      const r2 = await fetch("/api/tasty", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...body, token: refData.token, accountNumber: tasty.accountNumber, env: tasty.env }),
      });
      return r2.json();
    }
    return r.json();
  }

  async function runDryRun() {
    setStage("dry-run");
    try {
      const data = await callTasty({ action: "dry-run", order: tastyOrder });
      if (data.error) { setErr(data.error); setStage("error"); return; }
      setDryRunResult(data);
      setStage("confirm");
    } catch (e: any) { setErr(e.message); setStage("error"); }
  }

  async function placeOrder() {
    setStage("placing");
    try {
      const data = await callTasty({ action: "place", order: tastyOrder });
      if (data.error) { setErr(data.error); setStage("error"); return; }
      setOrderId(data.orderId);
      setStage("done");
    } catch (e: any) { setErr(e.message); setStage("error"); }
  }

  const bpEffect = dryRunResult?.buyingPowerEffect;
  const bpChange = bpEffect ? Math.abs(parseFloat(bpEffect?.["change-in-buying-power"] ?? 0)) : null;
  const fees = dryRunResult?.feeCalculation ? parseFloat(dryRunResult.feeCalculation?.["total-fees"] ?? 0) : null;

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)",
      zIndex: 500, display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
    }}>
      <div style={{
        background: "#fff", borderRadius: 16, padding: 28,
        width: "100%", maxWidth: 420,
        boxShadow: "0 16px 48px rgba(0,0,0,0.22)",
      }}>
        {stage === "dry-run" && (
          <div style={{ textAlign: "center", padding: "24px 0" }}>
            <div style={{ fontSize: 28, marginBottom: 12 }}>⏳</div>
            <div style={{ fontWeight: 600, color: "#0f172a" }}>Validating order…</div>
            <div style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>Checking with Tastytrade before anything is sent</div>
          </div>
        )}

        {stage === "confirm" && (
          <>
            <div style={{ fontWeight: 700, fontSize: 17, color: "#0f172a", marginBottom: 4 }}>Confirm your order</div>
            <div style={{ fontSize: 12, color: "#64748b", marginBottom: 18 }}>
              {tasty.nickname} · {tasty.accountNumber}
            </div>

            <div style={{ background: "#f8fafc", borderRadius: 10, padding: "14px 16px", marginBottom: 16, fontSize: 13 }}>
              {tastyOrder.legs.map((l, i) => (
                <div key={i} style={{ color: l.action.startsWith("Sell") ? "#16a34a" : "#475569", marginBottom: 3 }}>
                  <b>{l.action}</b> · {l.symbol.trim()} ×{l.quantity}
                </div>
              ))}
              <div style={{ borderTop: "1px solid #e2e8f0", marginTop: 10, paddingTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 16px" }}>
                <span style={{ color: "#64748b" }}>Net credit</span>
                <span style={{ fontWeight: 700, color: "#16a34a" }}>+{money(maxGain)}</span>
                {maxLoss != null && <>
                  <span style={{ color: "#64748b" }}>Max loss</span>
                  <span style={{ fontWeight: 700, color: "#e14c4c" }}>−{money(maxLoss)}</span>
                </>}
                {bpChange != null && <>
                  <span style={{ color: "#64748b" }}>Buying power used</span>
                  <span style={{ color: "#0f172a" }}>{money(bpChange)}</span>
                </>}
                {fees != null && <>
                  <span style={{ color: "#64748b" }}>Fees</span>
                  <span style={{ color: "#0f172a" }}>{money(fees)}</span>
                </>}
              </div>
            </div>

            {tasty.env === "cert" ? (
              <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 8, padding: "10px 12px", fontSize: 12, color: "#0369a1", marginBottom: 18 }}>
                🧪 Sandbox order — no real money, orders never reach a real market. Good for testing the flow.
              </div>
            ) : (
              <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, padding: "10px 12px", fontSize: 12, color: "#92400e", marginBottom: 18 }}>
                ⚠ This places a real order with real money in your Tastytrade account. Double-check the details above.
              </div>
            )}

            <label style={{ display: "block", fontSize: 12, color: "#64748b", marginBottom: 6 }}>
              Type <b>PLACE</b> to confirm
            </label>
            <input
              type="text" value={confirmText} onChange={(e) => setConfirmText(e.target.value)}
              placeholder="PLACE" autoComplete="off"
              style={{ width: "100%", border: "1px solid #e2e8f0", borderRadius: 8, padding: "9px 10px", fontSize: 14, marginBottom: 12, boxSizing: "border-box", textAlign: "center", letterSpacing: "0.08em", fontWeight: 700 }}
            />

            <button
              type="button" onClick={placeOrder} disabled={!confirmed}
              style={{
                width: "100%", padding: "13px 0", background: confirmed ? "#16a34a" : "#e2e8f0",
                color: confirmed ? "#fff" : "#94a3b8", border: "none", borderRadius: 10,
                fontSize: 15, fontWeight: 700, cursor: confirmed ? "pointer" : "default", marginBottom: 10,
              }}
            >
              Yes — Place This Order
            </button>
            <button type="button" onClick={onClose} style={{ width: "100%", padding: "10px 0", background: "none", border: "1px solid #e2e8f0", borderRadius: 10, fontSize: 13, color: "#64748b", cursor: "pointer" }}>
              Cancel
            </button>
          </>
        )}

        {stage === "placing" && (
          <div style={{ textAlign: "center", padding: "32px 0" }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>📤</div>
            <div style={{ fontWeight: 600, color: "#0f172a" }}>Sending order…</div>
          </div>
        )}

        {stage === "done" && (
          <div style={{ textAlign: "center", padding: "16px 0" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
            <div style={{ fontWeight: 700, fontSize: 18, color: "#16a34a", marginBottom: 6 }}>
              {tasty.env === "cert" ? "Sandbox order sent" : "Order sent"}
            </div>
            <div style={{ fontSize: 13, color: "#475569", marginBottom: 4 }}>
              {tasty.env === "cert"
                ? "Working limit order in the sandbox — no real money moved."
                : "Working limit order — check Tastytrade for fill status."}
            </div>
            {orderId && <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 18 }}>Order ID: {orderId}</div>}
            <button type="button" onClick={onClose} style={{ padding: "10px 32px", background: "#0f172a", color: "#fff", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
              Done
            </button>
          </div>
        )}

        {stage === "error" && (
          <div style={{ textAlign: "center", padding: "16px 0" }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>❌</div>
            <div style={{ fontWeight: 700, fontSize: 16, color: "#e14c4c", marginBottom: 8 }}>Order not placed</div>
            <div style={{ fontSize: 13, color: "#475569", marginBottom: 18 }}>{err}</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" onClick={runDryRun} style={{ flex: 1, padding: "10px 0", background: "#0f172a", color: "#fff", border: "none", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                Try again
              </button>
              <button type="button" onClick={onClose} style={{ flex: 1, padding: "10px 0", background: "none", border: "1px solid #e2e8f0", borderRadius: 10, fontSize: 13, color: "#64748b", cursor: "pointer" }}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
