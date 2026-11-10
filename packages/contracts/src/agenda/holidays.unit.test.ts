import { describe, expect, it } from "vitest";
import { holidayBatchInputSchema } from "./model.js";
import { easterSunday, suggestedHolidays } from "./holidays.js";

function byName(year: number, name: string) {
  return suggestedHolidays(year).find((item) => item.name === name);
}

describe("feriados sugeridos", () => {
  it("calcula o domingo de Páscoa", () => {
    expect(easterSunday(2024)).toBe("2024-03-31");
    expect(easterSunday(2025)).toBe("2025-04-20");
    expect(easterSunday(2026)).toBe("2026-04-05");
    expect(easterSunday(2027)).toBe("2027-03-28");
    expect(easterSunday(2038)).toBe("2038-04-25");
  });

  it("deriva as datas móveis da Páscoa", () => {
    expect(byName(2027, "Carnaval (segunda-feira)")?.date).toBe("2027-02-08");
    expect(byName(2027, "Carnaval (terça-feira)")).toMatchObject({
      date: "2027-02-09",
      optional: true,
    });
    expect(byName(2026, "Sexta-feira Santa")).toMatchObject({
      date: "2026-04-03",
      optional: false,
    });
    expect(byName(2026, "Corpus Christi")).toMatchObject({
      date: "2026-06-04",
      optional: true,
    });
  });

  it("inclui os feriados do RJ e de Bom Jesus do Itabapoana", () => {
    expect(byName(2027, "Dia de São Jorge")).toMatchObject({
      date: "2027-04-23",
      scope: "state",
    });
    expect(
      byName(2027, "Aniversário de Bom Jesus do Itabapoana"),
    ).toMatchObject({ date: "2027-12-14", scope: "municipal" });
  });

  it("só inclui a Consciência Negra a partir de 2024", () => {
    const name = "Dia Nacional de Zumbi e da Consciência Negra";
    expect(byName(2023, name)).toBeUndefined();
    expect(byName(2024, name)?.date).toBe("2024-11-20");
  });

  it("devolve datas únicas em ordem e aceitas pelo lote", () => {
    const holidays = suggestedHolidays(2027);
    const dates = holidays.map((item) => item.date);
    expect(dates).toEqual([...dates].sort());
    expect(new Set(dates).size).toBe(dates.length);
    expect(
      holidayBatchInputSchema.safeParse({
        holidays: holidays.map(({ date, name }) => ({ date, name })),
      }).success,
    ).toBe(true);
  });

  it("recusa lote vazio ou com data repetida", () => {
    expect(holidayBatchInputSchema.safeParse({ holidays: [] }).success).toBe(
      false,
    );
    const repeated = { date: "2027-01-01", name: "Ano Novo" };
    expect(
      holidayBatchInputSchema.safeParse({ holidays: [repeated, repeated] })
        .success,
    ).toBe(false);
  });
});
