import { readFileSync } from "node:fs";
import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useBodyScrollLock } from "./useBodyScrollLock";

const css = readFileSync(`${process.cwd()}/src/styles/01-base.css`, "utf8");

// QV1: uma única compensação. Com o modal aberto a calha estável é desligada
// (html.modal-open { scrollbar-gutter: auto }) e só o padding-right do body ocupa o lugar
// da barra; sem isso a calha e o padding somariam e o layout pularia.
function simulateScrollbar(width: number) {
  vi.spyOn(window, "innerWidth", "get").mockReturnValue(1366);
  vi.spyOn(
    document.documentElement,
    "getBoundingClientRect",
  ).mockReturnValue({ width: 1366 - width } as DOMRect);
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.style.paddingRight = "";
});

describe("useBodyScrollLock (QV1)", () => {
  it("turns the stable gutter off while locked, so the padding is the only compensation", () => {
    expect(css).toMatch(/html \{[^}]*scrollbar-gutter: stable;/);
    expect(css).toMatch(/html\.modal-open \{\s*scrollbar-gutter: auto;/);
  });

  it("pads the body by the scrollbar width once, even with nested locks, and restores it", () => {
    simulateScrollbar(10);
    document.body.style.paddingRight = "3px";
    const outer = renderHook(() => useBodyScrollLock());
    expect(document.body.style.paddingRight).toBe("10px");
    expect(document.documentElement.classList.contains("modal-open")).toBe(true);

    const inner = renderHook(() => useBodyScrollLock());
    expect(document.body.style.paddingRight).toBe("10px");
    inner.unmount();
    expect(document.body.style.paddingRight).toBe("10px");
    expect(document.documentElement.classList.contains("modal-open")).toBe(true);

    outer.unmount();
    expect(document.body.style.paddingRight).toBe("3px");
    expect(document.documentElement.classList.contains("modal-open")).toBe(false);
    expect(document.body.classList.contains("modal-open")).toBe(false);
  });

  it("adds no padding when the scrollbar takes no space (celular, barra sobreposta)", () => {
    simulateScrollbar(0);
    const lock = renderHook(() => useBodyScrollLock());
    expect(document.body.style.paddingRight).toBe("");
    lock.unmount();
    expect(document.documentElement.classList.contains("modal-open")).toBe(false);
  });
});
