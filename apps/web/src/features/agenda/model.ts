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

export type DayLayout = "grid" | "list";

const dayLayoutStorageKey = "crm.agenda.dayLayout";

/** Formato da visão Dia neste navegador: grade por profissional (padrão) ou lista. */
export function storedDayLayout(): DayLayout {
  try {
    return localStorage.getItem(dayLayoutStorageKey) === "list"
      ? "list"
      : "grid";
  } catch {
    return "grid";
  }
}

export function storeDayLayout(layout: DayLayout) {
  try {
    localStorage.setItem(dayLayoutStorageKey, layout);
  } catch {
    // Sem armazenamento: o formato só não é lembrado.
  }
}

/** Classes de status dos cartões da agenda (V4): cor por status; cancelado riscado. */
export function appointmentStatusClass(status: AppointmentStatus) {
  return `appt-status-${status}${status === "cancelled" ? " is-cancelled" : ""}`;
}

/** Legenda: faltas e ausências compartilham o âmbar. */
export const agendaStatusLegend: Array<{
  status: AppointmentStatus;
  label: string;
}> = [
  { status: "scheduled", label: "Agendado" },
  { status: "confirmed", label: "Confirmado" },
  { status: "completed", label: "Finalizado" },
  { status: "no_show", label: "Falta ou ausência" },
  { status: "cancelled", label: "Cancelado" },
];
