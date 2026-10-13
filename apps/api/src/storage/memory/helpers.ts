import type { RecurringPayable } from "@crm/contracts";

export const CLINIC_ID = "11111111-1111-4111-8111-111111111111";

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

export function dateAt(hour: number, minute = 0, addDays = 0) {
  const date = new Date();
  date.setDate(date.getDate() + addDays);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
}
