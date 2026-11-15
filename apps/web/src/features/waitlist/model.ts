import {
  activeWaitlistStatuses,
  groupWaitlistItemKey,
  patientFirstName,
  waitlistItemKey,
  type GroupWaitlistItem,
  type WaitlistEntry,
  type WaitlistStatus,
} from "@crm/contracts";

/** "Na fila" junta aguardando e avisado; "Todas" mostra também quem já saiu. */
export type WaitlistStatusFilter = "queue" | WaitlistStatus | "all";

export const statusFilterLabels: Record<WaitlistStatusFilter, string> = {
  queue: "Na fila",
  waiting: "Aguardando",
  contacted: "Avisado",
  served: "Atendido",
  cancelled: "Desistiu",
  all: "Todas",
};

/** Classe do `status-pill` de cada situação. */
export const statusPillClass: Record<WaitlistStatus, string> = {
  waiting: "scheduled",
  contacted: "in_progress",
  served: "completed",
  cancelled: "cancelled",
};

export function filterWaitlist(
  entries: readonly WaitlistEntry[],
  filters: { search: string; item: string; status: WaitlistStatusFilter },
) {
  const term = filters.search.trim().toLocaleLowerCase("pt-BR");
  return entries.filter(
    (entry) =>
      (filters.status === "all" ||
        (filters.status === "queue"
          ? activeWaitlistStatuses.includes(entry.status)
          : entry.status === filters.status)) &&
      (!filters.item || waitlistItemKey(entry) === filters.item) &&
      (!term || entry.patientName.toLocaleLowerCase("pt-BR").includes(term)),
  );
}

/**
 * Espera da turma (RE14) com os mesmos filtros: conta como "Aguardando" (na fila), o item é o
 * serviço da turma e a busca é pelo nome do cliente.
 */
export function filterGroupWaitlist(
  items: readonly GroupWaitlistItem[],
  filters: { search: string; item: string; status: WaitlistStatusFilter },
) {
  const term = filters.search.trim().toLocaleLowerCase("pt-BR");
  return items.filter(
    (item) =>
      ["all", "queue", "waiting"].includes(filters.status) &&
      (!filters.item || groupWaitlistItemKey(item) === filters.item) &&
      (!term ||
        item.enrollment.patientName.toLocaleLowerCase("pt-BR").includes(term)),
  );
}

/**
 * A vaga pode ser oferecida a este cliente da espera: a turma tem vaga e ele está dentro das
 * vagas abertas da fila (com 1 vaga, só o 1º — como o alerta "Oferecer a vaga").
 */
export function groupOfferOpen({ enrollment, group }: GroupWaitlistItem) {
  const vacancies = group.active ? group.capacity - group.activeEnrollments : 0;
  return (
    enrollment.status === "waitlisted" &&
    enrollment.queuePosition !== undefined &&
    enrollment.queuePosition <= vacancies
  );
}

/** Dias inteiros desde a entrada na fila (hoje = 0). */
export function daysWaiting(since: string, now = new Date()) {
  return Math.max(
    0,
    Math.floor((now.getTime() - Date.parse(since)) / 86_400_000),
  );
}

export function waitingLabel(days: number) {
  return days === 0 ? "Hoje" : days === 1 ? "1 dia" : `${days} dias`;
}

/** Mensagem sugerida para avisar o cliente de que a vaga ou o produto chegou. */
export function availabilityMessage(entry: WaitlistEntry) {
  const name = patientFirstName(entry.patientName);
  return entry.kind === "service"
    ? `Olá, ${name}! Abrimos vaga em ${entry.itemName}. Ainda tem interesse?`
    : `Olá, ${name}! ${entry.itemName} chegou. Quer que separemos para você?`;
}
