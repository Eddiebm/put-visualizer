import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Tour, buildTourSteps } from "./Tour.jsx";

const putInputs = {
  mode: "put", strike: 50, premium: 1.5, longStrike: 45, longPremium: 0.5,
  callStrike: 60, callPremium: 1.2, spot: 55, contracts: 2, dropPct: 20,
};

describe("buildTourSteps", () => {
  it("builds a 6-step walkthrough for a cash-secured put", () => {
    const steps = buildTourSteps("AAPL", putInputs, null);
    expect(steps.length).toBe(6);
    expect(steps[0].tag).toBe("The trade");
  });

  it("builds a walkthrough for a strangle with different scenario tags", () => {
    const steps = buildTourSteps("TSLA", { ...putInputs, mode: "strangle" }, null);
    expect(steps.some((s) => /strangle/i.test(s.title))).toBe(true);
  });

  it("builds a walkthrough for a covered strangle", () => {
    const steps = buildTourSteps("AAPL", { ...putInputs, mode: "covered" }, null);
    expect(steps.some((s) => /covered strangle/i.test(s.title))).toBe(true);
  });

  it("falls back to 'the stock' when no ticker is selected", () => {
    const steps = buildTourSteps("", putInputs, null);
    expect(steps[0].title).toMatch(/the stock/);
  });
});

describe("Tour", () => {
  const steps = buildTourSteps("AAPL", putInputs, null);

  it("shows the current step's title and body", () => {
    render(<Tour step={0} steps={steps} onNext={() => {}} onDone={() => {}} onSkip={() => {}} />);
    expect(screen.getByText(steps[0].title)).toBeInTheDocument();
  });

  it("calls onNext when Next is clicked on a non-final step", async () => {
    const onNext = vi.fn();
    const user = userEvent.setup();
    render(<Tour step={0} steps={steps} onNext={onNext} onDone={() => {}} onSkip={() => {}} />);
    await user.click(screen.getByText("Next →"));
    expect(onNext).toHaveBeenCalledOnce();
  });

  it("shows 'Got it' instead of 'Next' on the final step, and calls onDone", async () => {
    const onDone = vi.fn();
    const user = userEvent.setup();
    render(<Tour step={steps.length - 1} steps={steps} onNext={() => {}} onDone={onDone} onSkip={() => {}} />);
    expect(screen.getByText("Got it")).toBeInTheDocument();
    await user.click(screen.getByText("Got it"));
    expect(onDone).toHaveBeenCalledOnce();
  });

  it("calls onSkip when Skip is clicked", async () => {
    const onSkip = vi.fn();
    const user = userEvent.setup();
    render(<Tour step={0} steps={steps} onNext={() => {}} onDone={() => {}} onSkip={onSkip} />);
    await user.click(screen.getByText("Skip"));
    expect(onSkip).toHaveBeenCalledOnce();
  });
});
