import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// jsdom doesn't implement scrollIntoView; several components call it on a
// ref (e.g. the chat assistant auto-scrolling to the latest message).
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

// Unmount rendered components and clear localStorage between tests so one
// component test can't leak state (a logged trade, a sync key) into the next.
afterEach(() => {
  cleanup();
  localStorage.clear();
});
