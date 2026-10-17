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
