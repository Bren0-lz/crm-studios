/** Origem do feriado sugerido na importação. */
export type SuggestedHolidayScope = "national" | "state" | "municipal";

export interface SuggestedHoliday {
  /** aaaa-mm-dd */
  date: string;
  name: string;
  scope: SuggestedHolidayScope;
  /** Ponto facultativo: depende de decreto, a gestão decide se fecha. */
  optional: boolean;
}

export const suggestedHolidayScopeLabels: Record<
  SuggestedHolidayScope,
  string
> = {
  national: "Nacional",
  state: "Estadual (RJ)",
  municipal: "Municipal",
};

function isoDate(year: number, month: number, day: number) {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Domingo de Páscoa (calendário gregoriano, algoritmo de Meeus/Jones/Butcher). */
export function easterSunday(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return isoDate(year, month, day);
}

function shiftDate(date: string, days: number) {
  const shifted = new Date(`${date}T00:00:00Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

/**
 * Feriados sugeridos para o estúdio (Bom Jesus do Itabapoana/RJ): nacionais,
 * estaduais do RJ, municipais e pontos facultativos com data previsível.
 * Datas definidas por decreto a cada ano continuam no cadastro manual.
 */
export function suggestedHolidays(year: number): SuggestedHoliday[] {
  const easter = easterSunday(year);
  const fixed = (
    month: number,
    day: number,
    name: string,
    scope: SuggestedHolidayScope = "national",
  ): SuggestedHoliday => ({
    date: isoDate(year, month, day),
    name,
    scope,
    optional: false,
  });
  const fromEaster = (
    days: number,
    name: string,
    optional: boolean,
  ): SuggestedHoliday => ({
    date: shiftDate(easter, days),
    name,
    scope: "national",
    optional,
  });
  const holidays: SuggestedHoliday[] = [
    fixed(1, 1, "Confraternização Universal"),
    fromEaster(-48, "Carnaval (segunda-feira)", true),
    fromEaster(-47, "Carnaval (terça-feira)", true),
    fromEaster(-2, "Sexta-feira Santa", false),
    fixed(4, 21, "Tiradentes"),
    fixed(4, 23, "Dia de São Jorge", "state"),
    fixed(5, 1, "Dia do Trabalho"),
    fromEaster(60, "Corpus Christi", true),
    fixed(9, 7, "Independência do Brasil"),
    fixed(10, 12, "Nossa Senhora Aparecida"),
    fixed(11, 2, "Finados"),
    fixed(11, 15, "Proclamação da República"),
    fixed(12, 14, "Aniversário de Bom Jesus do Itabapoana", "municipal"),
    fixed(12, 25, "Natal"),
  ];
  // Lei 14.759/2023: feriado nacional a partir de 2024.
  if (year >= 2024)
    holidays.push(
      fixed(11, 20, "Dia Nacional de Zumbi e da Consciência Negra"),
    );
  return holidays.sort((a, b) => a.date.localeCompare(b.date));
}
