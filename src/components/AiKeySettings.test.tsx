import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AiKeySettings } from "./AiKeySettings";

describe("AiKeySettings", () => {
  it("shows the unset warning badge when no key is saved", () => {
    render(<AiKeySettings aiKey="" onSetKey={() => {}} />);
    expect(screen.getByText("AI features need a key")).toBeInTheDocument();
  });

  it("shows the set badge once a key is saved", () => {
    render(<AiKeySettings aiKey="abc" onSetKey={() => {}} />);
    expect(screen.getByText("✓ AI access key set")).toBeInTheDocument();
  });

  it("opens the settings panel and saves a new key", async () => {
    const onSetKey = vi.fn();
    const user = userEvent.setup();
    render(<AiKeySettings aiKey="" onSetKey={onSetKey} />);
    await user.click(screen.getByText("🔑"));
    await user.type(screen.getByPlaceholderText("Access key"), "my-secret");
    await user.click(screen.getByText("Save"));
    expect(onSetKey).toHaveBeenCalledWith("my-secret");
  });

  it("shows a Remove button only when a key is already set", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<AiKeySettings aiKey="" onSetKey={() => {}} />);
    await user.click(screen.getByText("🔑"));
    expect(screen.queryByText("Remove")).not.toBeInTheDocument();

    rerender(<AiKeySettings aiKey="existing-key" onSetKey={() => {}} />);
    expect(screen.getByText("Remove")).toBeInTheDocument();
  });

  it("clears the key when Remove is clicked", async () => {
    const onSetKey = vi.fn();
    const user = userEvent.setup();
    render(<AiKeySettings aiKey="existing-key" onSetKey={onSetKey} />);
    await user.click(screen.getByText("🔑"));
    await user.click(screen.getByText("Remove"));
    expect(onSetKey).toHaveBeenCalledWith("");
  });
});
