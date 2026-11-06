import { describe, expect, it } from "vitest";
import { eventDateTime, eventStartsAt } from "./model";

describe("event clinic timezone", () => {
  it.each([
    ["America/Sao_Paulo", "2039-06-10T12:00:00.000Z"],
    ["America/Manaus", "2039-06-10T13:00:00.000Z"],
  ])(
    "converts clinic input independently from the browser (%s)",
    (timezone, iso) => {
      expect(eventStartsAt("2039-06-10T09:00", timezone)).toBe(iso);
      expect(eventDateTime(iso, timezone)).toBe("2039-06-10T09:00");
    },
  );
  it("rejects invalid dates and nonexistent daylight saving hours", () => {
    expect(() => eventStartsAt("", "America/Sao_Paulo")).toThrow();
    expect(() =>
      eventStartsAt("2039-02-30T09:00", "America/Sao_Paulo"),
    ).toThrow();
    expect(() => eventStartsAt("2026-03-08T02:30", "America/New_York")).toThrow(
      /Horário inválido/,
    );
  });
});
