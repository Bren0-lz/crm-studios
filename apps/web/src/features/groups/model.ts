import type { GroupSession } from "@crm/contracts";
import {
  groupOperationRange,
  shortDate,
  timeLabel,
} from "../../shared/lib/formatting";

export function groupSessionLabel(session: GroupSession) {
  return `${session.groupName} · ${shortDate.format(new Date(session.startsAt))} · ${timeLabel.format(new Date(session.startsAt))}`;
}

export const groupSessionStatusLabels: Record<GroupSession["status"], string> =
  {
    scheduled: "Agendado",
    completed: "Concluído",
    cancelled: "Cancelado",
  };

/** Datas do calendário ("AAAA-MM-DD") calculadas ao meio-dia UTC: sem efeito de fuso. */
function utcNoon(date: string) {
  return new Date(`${date}T12:00:00Z`);
}

export function shiftIsoDate(date: string, days: number) {
  const value = utcNoon(date);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/** "2026-12" + 1 → "2027-01". */
export function shiftMonth(month: string, offset: number) {
  const [year, monthIndex] = month.split("-").map(Number) as [number, number];
  const value = new Date(Date.UTC(year, monthIndex - 1 + offset, 1, 12));
  return value.toISOString().slice(0, 7);
}

/** Dias da grade do mês, de segunda a domingo (semanas completas). */
export function calendarMonthDays(month: string) {
  const first = `${month}-01`;
  const start = shiftIsoDate(first, -((utcNoon(first).getUTCDay() + 6) % 7));
  const last = shiftIsoDate(`${shiftMonth(month, 1)}-01`, -1);
  const end = shiftIsoDate(last, 6 - ((utcNoon(last).getUTCDay() + 6) % 7));
  const days: string[] = [];
  for (let day = start; day <= end; day = shiftIsoDate(day, 1)) days.push(day);
  return days;
}

/**
 * Período consultado no workspace: a grade inteira do mês visível (com um dia de folga
 * para qualquer fuso) somada à janela operacional das reposições.
 */
export function groupCalendarRange(month: string, now = new Date()) {
  const days = calendarMonthDays(month);
  const operation = groupOperationRange(now);
  const from = `${shiftIsoDate(days[0]!, -1)}T00:00:00.000Z`;
  const to = `${shiftIsoDate(days[days.length - 1]!, 2)}T00:00:00.000Z`;
  return {
    from: from < operation.from ? from : operation.from,
    to: to > operation.to ? to : operation.to,
  };
}
