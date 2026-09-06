import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { JournalSync } from "./JournalSync.jsx";

describe("JournalSync", () => {
  it("shows no status badge when idle", () => {
    render(<JournalSync syncKey="" status="idle" onSetKey={() => {}} />);
    expect(screen.queryByText(/backed up|unreachable|Wrong sync key/)).not.toBeInTheDocument();
  });

  it("shows the synced badge", () => {
    render(<JournalSync syncKey="abc" status="synced" onSetKey={() => {}} />);
    expect(screen.getByText("✓ Journal backed up")).toBeInTheDocument();
  });

  it("shows the offline fallback badge", () => {
    render(<JournalSync syncKey="abc" status="offline" onSetKey={() => {}} />);
    expect(screen.getByText(/Backup unreachable/)).toBeInTheDocument();
  });

  it("opens the settings panel and saves a new key", async () => {
    const onSetKey = vi.fn();
    const user = userEvent.setup();
    render(<JournalSync syncKey="" status="idle" onSetKey={onSetKey} />);
    await user.click(screen.getByText("🗄"));
    await user.type(screen.getByPlaceholderText("Sync key"), "my-secret");
    await user.click(screen.getByText("Save"));
    expect(onSetKey).toHaveBeenCalledWith("my-secret");
  });

  it("shows a Remove button only when a key is already set", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<JournalSync syncKey="" status="idle" onSetKey={() => {}} />);
    await user.click(screen.getByText("🗄"));
    expect(screen.queryByText("Remove")).not.toBeInTheDocument();

    rerender(<JournalSync syncKey="existing-key" status="synced" onSetKey={() => {}} />);
    expect(screen.getByText("Remove")).toBeInTheDocument();
  });
});
