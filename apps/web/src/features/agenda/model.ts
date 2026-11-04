import type {
  Appointment,
  AppointmentStatus,
  GroupSession,
  PackageWeeklySlot,
  ScheduleBlock,
} from "@crm/contracts";
import { localIsoDate, timeLabel } from "../../shared/lib/formatting";
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

export function storedShowNotes() {
  try {
    return localStorage.getItem("crm.agenda.showNotes") !== "false";
  } catch {
    return true;
  }
}
export function storeShowNotes(value: boolean) {
  try {
    localStorage.setItem("crm.agenda.showNotes", String(value));
  } catch {
    /* Preferência só nesta sessão. */
  }
}
export function sortAgendaEntriesWithNotes(
  input: Parameters<typeof sortAgendaEntries>[0] & {
    notes: import("@crm/contracts").AgendaNote[];
  },
) {
  return [
    ...sortAgendaEntries(input),
    ...input.notes.map((note) => ({
      kind: "note" as const,
      startsAt: note.startsAt,
      note,
    })),
  ].sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
}

/** Período máximo do "Compartilhar agenda", para a mensagem caber no WhatsApp. */
export const agendaShareMaxDays = 31;

/**
 * Dica do campo de WhatsApp no "Compartilhar agenda". Sem número no cadastro, explica onde
 * cadastrá-lo: quem gerencia usuários recebe o caminho em Configurações; os demais, a quem pedir.
 */
export function agendaShareWhatsappHint({
  hasWhatsapp,
  canManageUsers,
}: {
  hasWhatsapp: boolean;
  canManageUsers: boolean;
}) {
  if (hasWhatsapp)
    return "Número do cadastro do usuário; altere só para este envio, se precisar.";
  return canManageUsers
    ? "Sem WhatsApp no cadastro do usuário: informe o número para este envio ou cadastre-o no usuário."
    : "Sem WhatsApp no cadastro do usuário: informe o número para este envio ou peça a um administrador que o cadastre.";
}

/** Dias corridos entre duas datas aaaa-mm-dd, contando as duas pontas. */
export function agendaShareDays(from: string, to: string) {
  const start = new Date(`${from}T12:00:00`).getTime();
  const end = new Date(`${to}T12:00:00`).getTime();
  return Math.round((end - start) / 86_400_000) + 1;
}

/**
 * Texto da agenda de um profissional no período (datas aaaa-mm-dd, inclusivas), agrupado por
 * dia. Cancelados ficam de fora; atendimentos e aulas de turma seguem a ordem do horário.
 */
export function agendaShareMessage({
  professional,
  from,
  to,
  appointments,
  groupSessions,
}: {
  professional: { id: string; fullName: string };
  from: string;
  to: string;
  appointments: Appointment[];
  groupSessions: GroupSession[];
}) {
  const day = new Intl.DateTimeFormat("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  });
  const fullDate = (iso: string) =>
    new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR");
  const localDay = (value: string) => localIsoDate(new Date(value));
  const range = (startsAt: string, endsAt: string) =>
    `${timeLabel.format(new Date(startsAt))}–${timeLabel.format(new Date(endsAt))}`;
  const entries = sortAgendaEntries({
    appointments: appointments.filter(
      (item) =>
        item.professionalId === professional.id && item.status !== "cancelled",
    ),
    groupSessions: groupSessions.filter(
      (item) =>
        item.professionalId === professional.id && item.status !== "cancelled",
    ),
  }).filter((entry) => {
    const key = localDay(entry.startsAt);
    return key >= from && key <= to;
  });
  const lines = [
    `*Agenda de ${professional.fullName}*`,
    from === to ? fullDate(from) : `${fullDate(from)} a ${fullDate(to)}`,
  ];
  if (entries.length === 0) {
    lines.push("", "Nenhum atendimento agendado no período.");
    return lines.join("\n");
  }
  let currentDay = "";
  for (const entry of entries) {
    const key = localDay(entry.startsAt);
    if (key !== currentDay) {
      currentDay = key;
      lines.push("", `*${day.format(new Date(entry.startsAt))}*`);
    }
    if (entry.kind === "appointment") {
      const item = entry.appointment;
      const name = item.patientName || item.leadName || "Cliente";
      lines.push(
        `${range(item.startsAt, item.endsAt)} · ${name} — ${item.serviceName}${item.roomName ? ` (${item.roomName})` : ""}`,
      );
    } else if (entry.kind === "group") {
      const item = entry.session;
      lines.push(
        `${range(item.startsAt, item.endsAt)} · Turma ${item.groupName}${item.roomName ? ` (${item.roomName})` : ""}`,
      );
    }
  }
  return lines.join("\n");
}

export const packageWeekdayNames = [
  "Domingo",
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
];

/** Dia e horário iniciais do pacote: os do atendimento escolhido (ou segunda, 09:00). */
export function initialPackageSlot(startsAt: string): PackageWeeklySlot {
  const [date, time] = startsAt.split("T");
  return date && time
    ? { weekday: new Date(`${date}T00:00:00Z`).getUTCDay(), time }
    : { weekday: 1, time: time || "09:00" };
}
