import { describe, it, expect } from "vitest";
import { toOccSymbol, buildTastyOrder } from "./tastyOrder";

describe("toOccSymbol", () => {
  it("builds a correctly formatted OCC option symbol", () => {
    // AAPL put, exp 2026-09-18, strike 280 -> AAPL  260918P00280000
    expect(toOccSymbol("AAPL", "2026-09-18", "put", 280)).toBe("AAPL  260918P00280000");
  });
  it("uses C for calls", () => {
    expect(toOccSymbol("SPY", "2026-01-16", "call", 500)).toMatch(/C00500000$/);
  });
});

describe("buildTastyOrder", () => {
  it("builds a single sell-to-open leg for a cash-secured put", () => {
    const order = buildTastyOrder({ mode: "put", ticker: "AAPL", expiration: "2026-09-18", putStrike: 280, putPrem: 3.5, contracts: 2 });
    expect(order.legs).toHaveLength(1);
    expect(order.legs[0].action).toBe("Sell to Open");
    expect(order.legs[0].quantity).toBe(2);
    expect(order["price-effect"]).toBe("Credit");
    expect(order.price).toBe("3.50");
  });

  it("builds two legs (sell short, buy long) for a put credit spread with the NET credit as price", () => {
    const order = buildTastyOrder({
      mode: "spread", ticker: "MSFT", expiration: "2026-09-18",
      putStrike: 370, putPrem: 4, longStrike: 360, longPrem: 1, contracts: 1,
    });
    expect(order.legs).toHaveLength(2);
    expect(order.legs[0].action).toBe("Sell to Open");
    expect(order.legs[1].action).toBe("Buy to Open");
    expect(order.price).toBe("3.00"); // 4 - 1
  });

  it("builds a put + call leg for a strangle", () => {
    const order = buildTastyOrder({
      mode: "strangle", ticker: "TSLA", expiration: "2026-09-18",
      putStrike: 350, putPrem: 6, callStrike: 420, callPrem: 5, contracts: 1,
    });
    expect(order.legs).toHaveLength(2);
    expect(order.legs.every((l) => l.action === "Sell to Open")).toBe(true);
  });

  it("never produces a zero-or-negative limit price, even for a razor-thin spread", () => {
    const order = buildTastyOrder({
      mode: "spread", ticker: "X", expiration: "2026-09-18",
      putStrike: 50, putPrem: 1, longStrike: 45, longPrem: 1, contracts: 1,
    });
    expect(parseFloat(order.price)).toBeGreaterThan(0);
  });

  it("defaults to 1 contract when none is given", () => {
    const order = buildTastyOrder({ mode: "put", ticker: "AAPL", expiration: "2026-09-18", putStrike: 280, putPrem: 3.5 });
    expect(order.legs[0].quantity).toBe(1);
  });
});
