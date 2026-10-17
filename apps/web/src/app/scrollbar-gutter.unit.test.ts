import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(`${process.cwd()}/src/styles/01-base.css`, "utf8");

describe("page scrollbar (V9)", () => {
  it("keeps the scrollbar space so the page does not jump between views", () => {
    expect(css).toMatch(
      /html \{[^}]*overflow-y: scroll;[^}]*scrollbar-gutter: stable;/,
    );
  });

  it("locks the html (not only the body) while a modal is open", () => {
    expect(css).toMatch(
      /html\.modal-open,\s*body\.modal-open \{\s*overflow: hidden;/,
    );
  });
});
