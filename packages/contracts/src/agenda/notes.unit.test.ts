import { describe, expect, it } from "vitest";
import {
  agendaNoteInputSchema,
  agendaNoteOccurrenceDates,
  agendaNotePalette,
  agendaNoteTextColor,
} from "./notes.js";

const input = {
  description: "Reunião da equipe",
  professionalId: null,
  backgroundColor: "#facc15" as const,
  startsAt: "2026-10-23T09:00:00-03:00",
  endsAt: "2026-10-23T10:00:00-03:00",
};
describe("agenda notes contracts", () => {
  it("validates description, palette, intervals and weekdays", () => {
    expect(
      agendaNoteInputSchema.parse({ ...input, description: " Lembrete " })
        .description,
    ).toBe("Lembrete");
    for (const patch of [
      { description: " " },
      { description: "x".repeat(301) },
      { backgroundColor: "#123456" },
      { endsAt: input.startsAt },
      { endsAt: "2026-10-23T08:00:00-03:00" },
      { repeat: { until: "2026-10-30", weekdays: [] } },
      { repeat: { until: "2026-10-30", weekdays: [7] } },
      { repeat: { until: "2026-10-30", weekdays: [1, 1] } },
    ])
      expect(
        agendaNoteInputSchema.safeParse({ ...input, ...patch }).success,
      ).toBe(false);
    expect(
      agendaNoteInputSchema.safeParse({
        ...input,
        description: "x".repeat(300),
      }).success,
    ).toBe(true);
  });
  it("includes the initial occurrence and repeats on selected local weekdays through the last date", () => {
    expect(
      agendaNoteOccurrenceDates({
        ...input,
        repeat: { until: "2026-10-30", weekdays: [1, 5] },
      }),
    ).toEqual(["2026-10-23", "2026-10-26", "2026-10-30"]);
    expect(
      agendaNoteOccurrenceDates({
        ...input,
        startsAt: "2026-10-24T01:00:00Z",
        repeat: { until: "2026-10-24", weekdays: [6] },
      }),
    ).toEqual(["2026-10-23", "2026-10-24"]);
    expect(() =>
      agendaNoteOccurrenceDates({
        ...input,
        repeat: { until: "2026-10-22", weekdays: [5] },
      }),
    ).toThrow("posterior");
  });
  it("accepts 120 occurrences and rejects 121 without truncating", () => {
    const daily = {
      ...input,
      startsAt: "2026-01-01T12:00:00Z",
      repeat: { until: "2026-04-30", weekdays: [0, 1, 2, 3, 4, 5, 6] },
    };
    expect(agendaNoteOccurrenceDates(daily)).toHaveLength(120);
    expect(() =>
      agendaNoteOccurrenceDates({
        ...daily,
        repeat: { ...daily.repeat, until: "2026-05-01" },
      }),
    ).toThrow("120");
  });
  it("gives every palette color at least AA contrast for small text", () => {
    function luminance(hex: string) {
      const rgb = [1, 3, 5]
        .map((start) => parseInt(hex.slice(start, start + 2), 16) / 255)
        .map((value) =>
          value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
        );
      return rgb[0]! * 0.2126 + rgb[1]! * 0.7152 + rgb[2]! * 0.0722;
    }
    for (const { color } of agendaNotePalette) {
      const text = agendaNoteTextColor(color);
      const a = luminance(color),
        b = luminance(text);
      expect(
        (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
      ).toBeGreaterThanOrEqual(4.5);
    }
    expect(agendaNoteTextColor("#facc15")).toBe("#000000");
    expect(agendaNoteTextColor("#276749")).toBe("#ffffff");
  });
});
