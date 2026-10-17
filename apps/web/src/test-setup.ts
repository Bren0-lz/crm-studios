import "@testing-library/jest-dom/vitest";
import { cleanup, configure } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// Lazy routes and real-handler workflows can take over one second under
// coverage on Windows. Keep async UI waits within Vitest's existing 20s limit.
configure({ asyncUtilTimeout: 5000 });

afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

// jsdom hides [popover] through its UA stylesheet but does not implement the
// top-layer methods. Model visibility for interaction tests only; real-browser
// checks are still needed for rendering and clipping.
if (!HTMLElement.prototype.showPopover) {
  Object.defineProperties(HTMLElement.prototype, {
    showPopover: {
      configurable: true,
      value: function (this: HTMLElement) {
        this.style.display = "block";
      },
    },
    hidePopover: {
      configurable: true,
      value: function (this: HTMLElement) {
        this.style.display = "none";
      },
    },
  });
}
