import type { RecurringPayable } from "@crm/contracts";

export const CLINIC_ID = "11111111-1111-4111-8111-111111111111";

/** Filial padrão ("Matriz") da clínica de demonstração. */
export const DEFAULT_BRANCH_ID = "99999999-0000-4000-8000-000000000001";

export type StoredRecurringPayable = Omit<
  RecurringPayable,
  "categoryName" | "costCenterName" | "lastCompetence"
>;

export const now = () => new Date().toISOString();

export const uuid = () => crypto.randomUUID();

export const today = () => new Date().toISOString().slice(0, 10);

export function addMonths(dateValue: string, months: number) {
  const [year, month, day] = dateValue.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1 + months, 1));
  const lastDay = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
  ).getUTCDate();
  date.setUTCDate(Math.min(day!, lastDay));
  return date.toISOString().slice(0, 10);
}

export const localDate = (date: Date) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);

/** Deslocamento do fuso da clínica em relação ao UTC, em minutos (ex.: -180). */
function clinicOffsetMinutes(at: Date) {
  const name =
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Sao_Paulo",
      timeZoneName: "longOffset",
    })
      .formatToParts(at)
      .find((part) => part.type === "timeZoneName")?.value ?? "GMT";
  const match = name.match(/GMT([+-])(\d{2}):?(\d{2})?/);
  if (!match) return 0;
  const minutes = Number(match[2]) * 60 + Number(match[3] ?? 0);
  return match[1] === "-" ? -minutes : minutes;
}

/**
 * Hora do dia da clínica (America/Sao_Paulo), em UTC, `addDays` dias depois de hoje. Usa o
 * fuso da clínica e não o do processo: com `setHours` o seed mudava de horário conforme o
 * `TZ` da máquina e, entre 21h e 24h em São Paulo, caía no dia seguinte.
 */
export function dateAt(hour: number, minute = 0, addDays = 0) {
  const current = new Date();
  const [year, month, day] = localDate(current).split("-").map(Number);
  const wallClock = Date.UTC(year!, month! - 1, day! + addDays, hour, minute);
  return new Date(
    wallClock - clinicOffsetMinutes(new Date(wallClock)) * 60_000,
  ).toISOString();
}
