import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AssignmentView } from "./AssignmentView.jsx";

describe("AssignmentView", () => {
  it("renders nothing without a real position", () => {
    const { container } = render(<AssignmentView mode="put" putStrike={0} putPrem={0} contracts={0} credit={0} spot={0} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows shares owned, total cost, and cost basis for a cash-secured put", () => {
    const { container } = render(<AssignmentView mode="put" ticker="AAPL" putStrike={280} putPrem={3.5} contracts={1} credit={350} spot={284} />);
    expect(container.textContent).toContain("100 shares");
    expect(container.textContent).toContain("$28,000");
    expect(container.textContent).toContain("$276.50/share");
  });

  it("shows a gain vs. cost basis when spot is above it", () => {
    const { container } = render(<AssignmentView mode="put" ticker="AAPL" putStrike={280} putPrem={3.5} contracts={1} credit={350} spot={284} />);
    expect(container.textContent).toContain("+$750");
  });

  it("mentions the long put lets you exercise instead of holding, for a spread", () => {
    render(<AssignmentView mode="spread" ticker="MSFT" putStrike={370} putPrem={4} longStrike={360} contracts={1} credit={250} spot={373} />);
    expect(screen.getByText(/exercising it same-day locks in the spread's max loss/)).toBeInTheDocument();
  });

  it("does not crash for a spread missing longStrike, and still shows the core numbers", () => {
    // Regression case: the modeNote object used to eagerly evaluate
    // money2(longStrike) for every mode, crashing whenever longStrike was
    // undefined (e.g. a "put" mode render, where it's never passed).
    const { container } = render(<AssignmentView mode="put" ticker="AAPL" putStrike={280} putPrem={3.5} contracts={1} credit={350} spot={284} />);
    expect(container.textContent).toContain("100 shares");
  });

  it("warns that a naked strangle's assignment isn't covered by anything already owned", () => {
    render(<AssignmentView mode="strangle" ticker="TSLA" putStrike={350} putPrem={6} contracts={1} credit={1100} spot={380} />);
    expect(screen.getByText(/buying 100 new shares outright/)).toBeInTheDocument();
  });

  it("explains a covered strangle's put assignment doubles the share count", () => {
    render(<AssignmentView mode="covered" ticker="AAPL" putStrike={280} putPrem={3.5} contracts={1} credit={350} spot={284} />);
    expect(screen.getByText(/double that to 200 shares total/)).toBeInTheDocument();
  });

  it("omits the position-value comparison when there's no live spot price", () => {
    render(<AssignmentView mode="put" ticker="AAPL" putStrike={280} putPrem={3.5} contracts={1} credit={350} spot={0} />);
    expect(screen.queryByText(/Position value at/)).not.toBeInTheDocument();
  });
});
