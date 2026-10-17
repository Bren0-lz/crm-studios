import type {
  Appointment,
  AppointmentStatus,
  GroupSession,
  ScheduleBlock,
} from "@crm/contracts";
import type { AgendaEntry } from "./types";

export const agendaKindOrder: Record<AgendaEntry["kind"], number> = {
  block: 0,
  group: 1,
  appointment: 2,
};

export function sortAgendaEntries({
  appointments = [],
  groupSessions = [],
  blocks = [],
}: {
  appointments?: Appointment[];
  groupSessions?: GroupSession[];
  blocks?: ScheduleBlock[];
}): AgendaEntry[] {
  return [
    ...blocks.map((block) => ({
      kind: "block" as const,
      startsAt: block.startsAt,
      block,
    })),
    ...groupSessions.map((session) => ({
      kind: "group" as const,
      startsAt: session.startsAt,
      session,
    })),
    ...appointments.map((appointment) => ({
      kind: "appointment" as const,
      startsAt: appointment.startsAt,
      appointment,
    })),
  ].sort(
    (a, b) =>
      new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime() ||
      agendaKindOrder[a.kind] - agendaKindOrder[b.kind],
  );
}

/** Mensagem do aviso depois de mudar o status de um atendimento. */
export function appointmentStatusToast(status: AppointmentStatus) {
  return {
    scheduled: "Atendimento reaberto.",
    confirmed: "Presença confirmada.",
    completed: "Atendimento marcado como realizado.",
    no_show: "Falta registrada.",
    excused_absence: "Ausência registrada.",
    professional_absence: "Ausência do profissional registrada.",
    cancelled: "Atendimento cancelado.",
  }[status];
}

export type AgendaView = "day" | "week" | "month";

const viewStorageKey = "crm.agenda.view";

/** Última visão escolhida neste navegador (Dia, Semana ou Mês); Dia por padrão. */
export function storedAgendaView(): AgendaView {
  try {
    const value = localStorage.getItem(viewStorageKey);
    return value === "week" || value === "month" ? value : "day";
  } catch {
    return "day";
  }
}

export function storeAgendaView(view: AgendaView) {
  try {
    localStorage.setItem(viewStorageKey, view);
  } catch {
    // Sem armazenamento (janela privada): a visão só não é lembrada.
  }
}

/** Intervalo da semana: "19 – 25 de outubro", "28 de set. – 4 de out." ou com anos. */
export function weekRangeLabel(start: Date, end: Date) {
  const month = (date: Date, style: "long" | "short") =>
    date.toLocaleDateString("pt-BR", { month: style });
  if (start.getFullYear() !== end.getFullYear())
    return `${start.getDate()} de ${month(start, "short")} de ${start.getFullYear()} – ${end.getDate()} de ${month(end, "short")} de ${end.getFullYear()}`;
  if (start.getMonth() !== end.getMonth())
    return `${start.getDate()} de ${month(start, "short")} – ${end.getDate()} de ${month(end, "short")}`;
  return `${start.getDate()} – ${end.getDate()} de ${month(start, "long")}`;
}
