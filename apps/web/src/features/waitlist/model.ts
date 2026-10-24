import {
  activeWaitlistStatuses,
  patientFirstName,
  waitlistItemKey,
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
