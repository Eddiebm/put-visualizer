import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Stat, ExplainCheckItem, BacktestDisclosure } from "./shared";

describe("Stat", () => {
  it("renders the label and value", () => {
    render(<Stat label="Realized P&L" value="+$500" />);
    expect(screen.getByText("Realized P&L")).toBeInTheDocument();
    expect(screen.getByText("+$500")).toBeInTheDocument();
  });

  it("colors a 'bad' tone differently from a 'good' one", () => {
    render(<Stat label="Loss" value="-$100" tone="bad" />);
    render(<Stat label="Win" value="+$100" tone="good" />);
    const badValue = screen.getByText("-$100");
    const goodValue = screen.getByText("+$100");
    expect(badValue.style.color).not.toBe(goodValue.style.color);
    expect(badValue.style.color).not.toBe("");
  });
});

describe("ExplainCheckItem", () => {
  it("shows the text but no Explain button when there's no detail", () => {
    render(<ExplainCheckItem check={{}} accent="#000" icon="✓" text="All good" />);
    expect(screen.getByText("All good")).toBeInTheDocument();
    expect(screen.queryByText("Explain")).not.toBeInTheDocument();
  });

  it("reveals detail text only after clicking Explain, and hides it again on toggle", async () => {
    const user = userEvent.setup();
    render(<ExplainCheckItem check={{ key: "x", label: "x", detail: "Here's why this matters." }} accent="#000" icon="✓" text="Some check" />);

    expect(screen.queryByText("Here's why this matters.")).not.toBeInTheDocument();

    await user.click(screen.getByText("Explain"));
    expect(screen.getByText("Here's why this matters.")).toBeInTheDocument();
    expect(screen.getByText("Less")).toBeInTheDocument();

    await user.click(screen.getByText("Less"));
    expect(screen.queryByText("Here's why this matters.")).not.toBeInTheDocument();
  });
});

describe("BacktestDisclosure", () => {
  it("renders the fixed prefix alongside the caller-supplied finding", () => {
    render(<BacktestDisclosure finding="this specific claim has no edge." />);
    expect(screen.getByText(/Backtested, not proven/)).toBeInTheDocument();
    expect(screen.getByText(/this specific claim has no edge\./)).toBeInTheDocument();
  });
});
