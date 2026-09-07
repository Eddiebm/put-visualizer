import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { LearnView } from "./LearnView";

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe("LearnView", () => {
  it("shows a loading state, then the lesson once it arrives", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ what: "An option is a contract." }),
    }));
    render(<LearnView capital={5000} />);
    expect(screen.getByText(/Preparing your lesson/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("An option is a contract.")).toBeInTheDocument());
  });

  it("shows an error message when the lesson fetch fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    render(<LearnView capital={5000} />);
    await waitFor(() => expect(screen.getByText(/Could not load today's lesson/)).toBeInTheDocument());
  });

  it("uses a cached lesson from sessionStorage instead of re-fetching", async () => {
    sessionStorage.setItem("pv_lesson_0", JSON.stringify({ what: "Cached lesson content." }));
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<LearnView capital={5000} />);
    await waitFor(() => expect(screen.getByText("Cached lesson content.")).toBeInTheDocument());
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
