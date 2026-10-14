import { describe, expect, it } from "vitest";
import {
  clinicIsoDate,
  formatIsoDate,
  initials,
  localIsoDate,
  statusLabel,
  toLocalDateTimeInput,
} from "./formatting";

describe("display helpers", () => {
  it("preserves a clinic date and converts timestamps in the selected timezone", () => {
    expect(clinicIsoDate("2040-06-01")).toBe("2040-06-01");
    expect(clinicIsoDate("2040-06-02T01:00:00Z")).toBe("2040-06-01");
    expect(clinicIsoDate(new Date("2040-06-02T01:00:00Z"), "UTC")).toBe(
      "2040-06-02",
    );
  });
  it("formats ISO dates without timezone conversion", () => {
    expect(formatIsoDate("2026-10-12")).toBe("12/10/2026");
  });
  it.each([
    ["Maria Souza", "MS"],
    ["Ana", "A"],
    ["maria souza santos", "MS"],
    ["", ""],
  ])("extracts initials from %s", (name, expected) => {
    expect(initials(name)).toBe(expected);
  });
  it("pads local date and time fields", () => {
    const date = new Date(2026, 0, 2, 3, 4);
    expect(localIsoDate(date)).toBe("2026-01-02");
    expect(toLocalDateTimeInput(date)).toBe("2026-01-02T03:04");
    expect(localIsoDate()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  it.each([
    ["scheduled", "Agendado"],
    ["confirmed", "Confirmado"],
    ["completed", "Finalizado"],
    ["no_show", "Não compareceu"],
    ["excused_absence", "Ausência justificada"],
    ["professional_absence", "Ausência profissional"],
    ["cancelled", "Cancelado"],
  ] as const)("labels %s", (status, expected) => {
    expect(statusLabel(status)).toBe(expected);
  });
});
