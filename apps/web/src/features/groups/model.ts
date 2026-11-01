import type { GroupClass, GroupSession } from "@crm/contracts";
import { groupOperationRange } from "../../shared/lib/formatting";

/** "Pilates Turma A · 18 de out. · 18:00", com data e hora no fuso da clínica (não no do navegador). */
export function groupSessionLabel(session: GroupSession, timezone: string) {
  const startsAt = new Date(session.startsAt);
  const date = new Intl.DateTimeFormat("pt-BR", {
    timeZone: timezone,
    day: "2-digit",
    month: "short",
  }).format(startsAt);
  const time = new Intl.DateTimeFormat("pt-BR", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
  }).format(startsAt);
  return `${session.groupName} · ${date} · ${time}`;
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

/** Filtros da tabela de turmas; "" ou "all" deixam o critério de fora. */
export interface GroupTableFilters {
  search: string;
  professionalId: string;
  serviceId: string;
  /** Dia da semana (0 = domingo) em texto, como vem do `<select>`. */
  weekday: string;
  occupancy: "all" | "available" | "full";
}

export const emptyGroupTableFilters: GroupTableFilters = {
  search: "",
  professionalId: "",
  serviceId: "",
  weekday: "",
  occupancy: "all",
};

const searchable = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

export function hasGroupTableFilters(filters: GroupTableFilters) {
  return (
    filters.search.trim() !== "" ||
    filters.professionalId !== "" ||
    filters.serviceId !== "" ||
    filters.weekday !== "" ||
    filters.occupancy !== "all"
  );
}

/**
 * Linhas da tabela de turmas que atendem a todos os filtros. A busca ignora
 * acentos e caixa e procura no nome da turma e no do profissional; "lotada" é
 * turma sem vaga disponível.
 */
export function filterGroupRows<
  T extends { group: GroupClass; freeSeats: number },
>(rows: T[], filters: GroupTableFilters): T[] {
  const term = searchable(filters.search);
  return rows.filter(({ group, freeSeats }) => {
    if (
      term &&
      !searchable(`${group.name} ${group.professionalName}`).includes(term)
    )
      return false;
    if (
      filters.professionalId &&
      group.professionalId !== filters.professionalId
    )
      return false;
    if (filters.serviceId && group.serviceId !== filters.serviceId)
      return false;
    if (
      filters.weekday !== "" &&
      !(group.weeklySlots ?? []).some(
        (slot) => slot.weekday === Number(filters.weekday),
      )
    )
      return false;
    if (filters.occupancy === "available" && freeSeats === 0) return false;
    if (filters.occupancy === "full" && freeSeats > 0) return false;
    return true;
  });
}

export {
  groupRevenueOverview,
  type GroupRevenueMember,
  type GroupRevenueRow,
} from "@crm/contracts";
