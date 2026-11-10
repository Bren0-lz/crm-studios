import { describe, expect, it } from "vitest";
import {
  eventDateTime,
  eventExportFileName,
  eventMoment,
  eventStartsAt,
  eventPhone,
} from "./model";

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
  it("formats the contact moment in the clinic timezone", () => {
    expect(eventMoment("2039-11-09T13:05:00.000Z", "America/Manaus")).toBe(
      "09 de nov. às 09:05",
    );
  });
});

describe("event participant phone", () => {
  it("formats domestic numbers and preserves other contacts without truncating", () => {
    expect(eventPhone("11999991234")).toBe("(11) 99999-1234");
    expect(eventPhone("+55 11 99999-1234")).toBe("(11) 99999-1234");
    expect(eventPhone("+1 415 555 1234")).toBe("+1 415 555 1234");
    expect(eventPhone("123")).toBe("123");
    expect(eventPhone("")).toBe("Não informado");
  });
});

describe("event export file name", () => {
  it("usa o nome do evento sem acentos nem símbolos", () => {
    expect(eventExportFileName("Aulão na Praça (2ª ed.)")).toBe(
      "participantes-aulao-na-praca-2-ed.xlsx",
    );
    expect(eventExportFileName("!!!")).toBe("participantes.xlsx");
  });
});
