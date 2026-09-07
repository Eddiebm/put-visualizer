import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Chart } from "./Chart";
import { buildModel } from "../lib/pnl";

describe("Chart", () => {
  it("renders an SVG for a normal cash-secured put model", () => {
    const model = buildModel(
      { mode: "put", putStrike: 50, putPrem: 2, spot: 52, shares: 100, iv: null, dte: 30 },
      20
    );
    const { container } = render(<Chart model={model} />);
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("shows a placeholder message instead of crashing when there's no usable model", () => {
    const { getByText } = render(<Chart model={{}} />);
    expect(getByText(/Enter strikes and at least one contract/)).toBeInTheDocument();
  });

  it("renders a probability-density overlay when IV is available", () => {
    const model = buildModel(
      { mode: "put", putStrike: 50, putPrem: 2, spot: 52, shares: 100, iv: 0.3, dte: 30 },
      20
    );
    const { container } = render(<Chart model={model} />);
    // The density overlay is a second polygon beyond the main P&L line.
    expect(container.querySelectorAll("polygon, polyline").length).toBeGreaterThan(1);
  });
});
