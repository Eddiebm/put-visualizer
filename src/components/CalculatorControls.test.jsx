import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ModeToggle, Field, SizingHint } from "./CalculatorControls.jsx";

describe("ModeToggle", () => {
  it("renders all four strategy modes", () => {
    render(<ModeToggle mode="put" onChange={() => {}} />);
    expect(screen.getByText("Cash-secured put")).toBeInTheDocument();
    expect(screen.getByText("Put credit spread")).toBeInTheDocument();
    expect(screen.getByText("Short strangle")).toBeInTheDocument();
    expect(screen.getByText("Covered strangle")).toBeInTheDocument();
  });

  it("calls onChange with the clicked mode's key", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<ModeToggle mode="put" onChange={onChange} />);
    await user.click(screen.getByText("Put credit spread"));
    expect(onChange).toHaveBeenCalledWith("spread");
  });
});

describe("Field", () => {
  it("renders the label, prefix, and suffix", () => {
    render(<Field label="Strike price" prefix="$" value={50} onChange={() => {}} />);
    expect(screen.getByText("Strike price")).toBeInTheDocument();
    expect(screen.getByText("$")).toBeInTheDocument();
    expect(screen.getByDisplayValue("50")).toBeInTheDocument();
  });

  it("calls onChange with the raw string value on input", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Field label="Contracts" value="" onChange={onChange} />);
    await user.type(screen.getByRole("spinbutton"), "3");
    expect(onChange).toHaveBeenLastCalledWith("3");
  });
});

describe("SizingHint", () => {
  const basePut = { mode: "put", putStrike: 50, putPrem: 2, shares: 100 };

  it("renders nothing when capital or per-contract cash is zero", () => {
    const { container } = render(
      <SizingHint mode="put" capital={0} perContractCash={5000} maxContracts={0} contracts={1} dropPct={20} model={{}} p={basePut} onApply={() => {}} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the 'not enough for one contract' message when capital can't cover it", () => {
    render(
      <SizingHint mode="put" capital={1000} perContractCash={5000} maxContracts={0} contracts={1} dropPct={20} model={{}} p={basePut} onApply={() => {}} />
    );
    expect(screen.getByText(/isn't enough for even one contract/)).toBeInTheDocument();
  });

  it("shows a sizing table with a row per suggested contract count", () => {
    render(
      <SizingHint
        mode="put" capital={30000} perContractCash={5000} maxContracts={6} contracts={1} dropPct={20}
        model={{ hasIv: false, dte: 30 }} p={basePut} onApply={() => {}}
      />
    );
    expect(screen.getAllByText((_, el) => el.tagName === "DIV" && /secures up to/.test(el.textContent)).length).toBeGreaterThan(0);
    expect(screen.getByText("6 contracts")).toBeInTheDocument();
  });

  it("flags a size as dangerous (>50% of account) with a warning icon", () => {
    render(
      <SizingHint
        mode="put" capital={5000} perContractCash={5000} maxContracts={1} contracts={1} dropPct={80}
        model={{ hasIv: false, dte: 30 }} p={{ ...basePut, putPrem: 2 }} onApply={() => {}}
      />
    );
    // An 80% drop on a $50 put with 1 contract loses far more than 50% of a $5,000 account.
    expect(screen.getByText(/⚠/)).toBeInTheDocument();
  });

  it("calls onApply with the suggested contract count when 'Use' is clicked", async () => {
    const onApply = vi.fn();
    const user = userEvent.setup();
    render(
      <SizingHint
        mode="put" capital={30000} perContractCash={5000} maxContracts={6} contracts={1} dropPct={20}
        model={{ hasIv: false, dte: 30 }} p={basePut} onApply={onApply}
      />
    );
    const useButtons = screen.getAllByText("Use");
    await user.click(useButtons[useButtons.length - 1]); // the max-contracts row
    expect(onApply).toHaveBeenCalledWith(6);
  });
});
