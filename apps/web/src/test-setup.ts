import "@testing-library/jest-dom/vitest";

// jsdom hides [popover] through its UA stylesheet but does not implement the
// top-layer methods. Model visibility for interaction tests only; real-browser
// checks are still needed for rendering and clipping.
if (!HTMLElement.prototype.showPopover) {
  Object.defineProperties(HTMLElement.prototype, {
    showPopover: { configurable: true, value: function (this: HTMLElement) { this.style.display = "block"; } },
    hidePopover: { configurable: true, value: function (this: HTMLElement) { this.style.display = "none"; } },
  });
}
