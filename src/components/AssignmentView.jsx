import { money, money2 } from "../lib/format.js";
import { assignmentSummary } from "../lib/pnl.js";

// ─── Assignment view ───────────────────────────────────────────────────────
// "What owning the shares at the strike would actually cost and look like" —
// item 5 from the original README roadmap. Every mode here sells at least
// one put, so assignment on that leg is always a live possibility; this
// answers "then what?" plainly rather than leaving it as an abstract risk.

export function AssignmentView({ mode, ticker, putStrike, putPrem, longStrike, spot, contracts, credit }) {
  const summary = assignmentSummary({ putStrike, putPrem, spot, contracts });
  if (!summary) return null;
  const { shares, totalCost, costBasisPerShare, currentValue, gainLoss, hasSpot } = summary;
  const sym = ticker || "the stock";

  const modeNote = {
    put: `That ties up the ${money(totalCost)} you set aside as cash-secured collateral — it converts from cash into ${shares} shares.`,
    spread: `Your long ${money2(longStrike)} put means you don't have to actually hold these shares — exercising it same-day locks in the spread's max loss instead. This view shows what happens if you hold the shares anyway, which most traders don't do.`,
    strangle: `You're not holding shares to cover this today — assignment means buying ${shares} new shares outright, on top of whatever else you own. (The short call side is a separate, uncapped risk — see the scenario above; it doesn't get better or worse based on this.)`,
    covered: `You already own ${shares} shares for this trade. Assignment on the put would double that to ${shares * 2} shares total — this card is about that second batch, not the ones you're covering with the call.`,
  }[mode];

  return (
    <section style={{ marginTop: 20, padding: "16px 18px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 12 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: "#1f2937", marginBottom: 10 }}>
        If you get assigned
      </div>
      <div style={{ fontSize: 13, color: "#334155", lineHeight: 1.6, marginBottom: 12 }}>
        You'd own <b>{shares} shares</b> of {sym} at {money2(putStrike)} each — {money(totalCost)} total.
        After the {money(credit)} you collected, your effective cost basis is{" "}
        <b>{money2(costBasisPerShare)}/share</b>.
      </div>
      {hasSpot && (
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 12 }}>
          <div style={{ background: "#fff", borderRadius: 8, padding: "8px 14px", border: "1px solid #e2e8f0" }}>
            <div style={{ fontSize: 11, color: "#64748b" }}>Position value at {money2(spot)}</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#0f172a" }}>{money(currentValue)}</div>
          </div>
          <div style={{ background: "#fff", borderRadius: 8, padding: "8px 14px", border: "1px solid #e2e8f0" }}>
            <div style={{ fontSize: 11, color: "#64748b" }}>Vs. your cost basis</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: gainLoss >= 0 ? "#16a34a" : "#e14c4c" }}>
              {gainLoss >= 0 ? "+" : ""}{money(gainLoss)}
            </div>
          </div>
        </div>
      )}
      {modeNote && <div style={{ fontSize: 12, color: "#64748b", lineHeight: 1.55 }}>{modeNote}</div>}
    </section>
  );
}
