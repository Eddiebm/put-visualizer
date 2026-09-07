import { describe, it, expect } from "vitest";
import { timingSafeEqual } from "./_auth";

describe("timingSafeEqual", () => {
  it("returns true for identical strings", async () => {
    expect(await timingSafeEqual("my-secret-key", "my-secret-key")).toBe(true);
  });

  it("returns false for different strings of the same length", async () => {
    expect(await timingSafeEqual("my-secret-key", "my-secret-kex")).toBe(false);
  });

  it("returns false for different-length strings, including a prefix match", async () => {
    // A naive `!==` compare would still just say false here too — the point
    // of this helper isn't a different verdict, it's that the two calls
    // below take the same amount of work regardless of how much of the
    // prefix matches, so no timing signal leaks either way.
    expect(await timingSafeEqual("my-secret", "my-secret-key")).toBe(false);
    expect(await timingSafeEqual("wrong", "my-secret-key")).toBe(false);
  });

  it("returns false against an empty string (missing header case)", async () => {
    expect(await timingSafeEqual("", "my-secret-key")).toBe(false);
  });

  it("returns true for two empty strings", async () => {
    expect(await timingSafeEqual("", "")).toBe(true);
  });
});
