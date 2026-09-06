import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InsightCard, Scenarios } from "./ChartExtras.jsx";

describe("InsightCard", () => {
  it("shows the label and text", () => {
    render(<InsightCard icon="🎯" label="Your odds" text="About 70 in 100" />);
    expect(screen.getByText("Your odds")).toBeInTheDocument();
    expect(screen.getByText("About 70 in 100")).toBeInTheDocument();
  });

  it("reveals detail only after clicking Why?", async () => {
    const user = userEvent.setup();
    render(<InsightCard icon="🛡️" label="Buffer" text="Some buffer" detail="More detail here" />);
    expect(screen.queryByText("More detail here")).not.toBeInTheDocument();
    await user.click(screen.getByText("Why?"));
    expect(screen.getByText("More detail here")).toBeInTheDocument();
  });
});

describe("Scenarios", () => {
  it("renders a card per scenario with its P&L", () => {
    const cards = [
      { key: "flat", title: "Stays above strike", sub: "worthless", pnl: 200, note: "Best case" },
      { key: "down", title: "Bad drop", sub: "-20%", pnl: -800, isWorst: true, note: "Worst case" },
    ];
    render(<Scenarios cards={cards} />);
    expect(screen.getByText("Stays above strike")).toBeInTheDocument();
    expect(screen.getByText("Bad drop")).toBeInTheDocument();
    expect(screen.getByText("WORST CASE — SIZE FOR THIS")).toBeInTheDocument();
  });
});
