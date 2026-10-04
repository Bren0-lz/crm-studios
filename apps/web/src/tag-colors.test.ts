import { describe, expect, it } from "vitest";
import { DEFAULT_PATIENT_TAG_COLOR } from "@crm/contracts";
import { contrastRatio, normalizeTagColor, patientTagPalette, tagColorStyle, tagTextColor } from "./tag-colors";

describe("tag colors", () => {
  it("picks black or white text with AA contrast (4.5:1) for any background", () => {
    for (let r = 0; r <= 255; r += 17) {
      for (let g = 0; g <= 255; g += 17) {
        for (let b = 0; b <= 255; b += 17) {
          const color = `#${[r, g, b].map((value) => value.toString(16).padStart(2, "0")).join("")}`;
          expect(contrastRatio(color, tagTextColor(color))).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
    expect(tagTextColor("#ffffff")).toBe("#000000");
    expect(tagTextColor("#000000")).toBe("#ffffff");
    expect(tagTextColor("#facc15")).toBe("#000000");
    expect(tagTextColor("#2563eb")).toBe("#ffffff");
  });

  it("keeps every suggested palette color readable", () => {
    for (const { color } of patientTagPalette) {
      expect(contrastRatio(color, tagTextColor(color))).toBeGreaterThanOrEqual(4.5);
    }
    expect(new Set(patientTagPalette.map((item) => item.color)).size).toBe(patientTagPalette.length);
  });

  it("falls back to the default color for invalid values", () => {
    expect(normalizeTagColor("#ABCDEF")).toBe("#abcdef");
    expect(normalizeTagColor("red")).toBe(DEFAULT_PATIENT_TAG_COLOR);
    expect(normalizeTagColor(undefined)).toBe(DEFAULT_PATIENT_TAG_COLOR);
    expect(tagColorStyle("#facc15")).toEqual({ "--tag-color": "#facc15", "--tag-text": "#000000" });
  });
});
