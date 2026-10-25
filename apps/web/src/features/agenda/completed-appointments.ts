import type { Appointment } from "@crm/contracts";
import { localIsoDate } from "../../shared/lib/formatting";

/** Período em datas locais (AAAA-MM-DD), ambas inclusivas. */
export type CompletedPeriod = { from: string; to: string };

export type CompletedPeriodPreset =
  "today" | "last7" | "month" | "previousMonth" | "custom";

export type CompletedOrigin = "automatic" | "team";

export const completedPeriodPresets: Array<{
  key: CompletedPeriodPreset;
  label: string;
}> = [
  { key: "today", label: "Hoje" },
  { key: "last7", label: "7 dias" },
  { key: "month", label: "Este mês" },
  { key: "previousMonth", label: "Mês passado" },
  { key: "custom", label: "Personalizado" },
];

/** Datas do atalho; "Personalizado" mantém os últimos 7 dias como ponto de partida. */
export function completedPeriodRange(
  preset: CompletedPeriodPreset,
  today = new Date(),
): CompletedPeriod {
  const day = (offset: number) =>
    localIsoDate(
      new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset),
    );
  if (preset === "today") return { from: day(0), to: day(0) };
  if (preset === "month")
    return {
      from: localIsoDate(new Date(today.getFullYear(), today.getMonth(), 1)),
      to: day(0),
    };
  if (preset === "previousMonth")
    return {
      from: localIsoDate(
        new Date(today.getFullYear(), today.getMonth() - 1, 1),
      ),
      to: localIsoDate(new Date(today.getFullYear(), today.getMonth(), 0)),
    };
  return { from: day(-6), to: day(0) };
}

/** Datas preenchidas, em ordem e com no máximo 1 ano (limite da API). */
export function isCompletedPeriodValid(period: CompletedPeriod) {
  if (!period.from || !period.to || period.from > period.to) return false;
  const span =
    Date.parse(`${period.to}T00:00:00Z`) -
    Date.parse(`${period.from}T00:00:00Z`);
  return span <= 365 * 24 * 3600_000;
}

export function completedOrigin(appointment: Appointment): CompletedOrigin {
  return appointment.autoCompletedAt ? "automatic" : "team";
}

/** Agrupa por dia local de início, mantendo a ordem recebida. */
export function groupByDay(items: Appointment[]) {
  const days = new Map<string, Appointment[]>();
  for (const item of items) {
    const date = localIsoDate(new Date(item.startsAt));
    days.set(date, [...(days.get(date) ?? []), item]);
  }
  return [...days.entries()].map(([date, dayItems]) => ({
    date,
    items: dayItems,
  }));
}
