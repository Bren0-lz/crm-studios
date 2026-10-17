import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(`${process.cwd()}/src/styles/06-modals.css`, "utf8");

describe("labels with the same size (V7)", () => {
  it("styles the client picker and template labels like the form labels around them", () => {
    expect(css).toMatch(
      /\.patient-picker-header label,\s*\.template-body-input > label \{[^}]*font-size: var\(--text-sm\);[^}]*font-weight: 700;/,
    );
    expect(css).toMatch(
      /\.document-form \.patient-picker-header label,\s*\.document-form \.template-body-input > label \{[^}]*font-size: var\(--text-xs\);/,
    );
    expect(css).toMatch(
      /\.patient-filters \.checkbox-field \{[^}]*font-size: var\(--text-sm\);/,
    );
    expect(css).toMatch(
      /\.activity-form > \.span-2 \{\s*grid-column: 1 \/ -1;/,
    );
  });
});
