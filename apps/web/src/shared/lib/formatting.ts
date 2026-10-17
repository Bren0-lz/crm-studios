import type {
  Appointment,
  AppointmentStatus,
  AppointmentVisitType,
  GroupClass,
  LeadAppointmentInput,
} from "@crm/contracts";
import {
  type PatientTag,
  patientTagKey,
  type UserRole,
  userRoleLabels,
} from "@crm/contracts";
import { normalizeTagColor } from "../../tag-colors";

export const appointmentVisitTypes: AppointmentVisitType[] = [
  "regular",
  "trial",
  "evaluation",
];

export const currency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

export const dateLabel = new Intl.DateTimeFormat("pt-BR", {
  weekday: "long",
  day: "2-digit",
  month: "long",
});

export const escapeStack: symbol[] = [];

export function formatIsoDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

export function groupOperationRange() {
  const from = new Date();
  from.setDate(from.getDate() - 30);
  const to = new Date();
  to.setDate(to.getDate() + 120);
  return { from: from.toISOString(), to: to.toISOString() };
}

export function groupSlotLabel(
  slot: GroupClass["weeklySlots"][number],
  weekDayNames: string[],
) {
  return `${weekDayNames[slot.weekday]} · ${slot.startTime}–${slot.endTime}`;
}

export function initials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export const leadVisitTypes: LeadAppointmentInput["visitType"][] = [
  "trial",
  "evaluation",
];

export function localIsoDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function reaisToCents(value: string) {
  return parseMoneyToCents(value);
}

/**
 * Converte o valor digitado em centavos: aceita "45,90", "45.90", "1.234,56", "1234" e
 * "R$ 10"; vazio, negativo ou inválido devolve null.
 */
export function parseMoneyToCents(value: string): number | null {
  const text = value.replace(/R\$|\s/g, "");
  if (!text) return null;
  const commas = text.split(",").length - 1;
  const dots = text.split(".").length - 1;
  let normalized = text;
  if (commas > 0 && dots > 0) {
    const decimal = text.lastIndexOf(",") > text.lastIndexOf(".") ? "," : ".";
    const thousands = decimal === "," ? "." : ",";
    normalized = text.split(thousands).join("").replace(decimal, ".");
  } else if (commas === 1) normalized = text.replace(",", ".");
  else if (commas > 1) return null;
  else if (dots > 1 || (dots === 1 && text.length - text.indexOf(".") === 4))
    normalized = text.split(".").join("");
  if (!/^(\d+(\.\d{0,2})?|\.\d{1,2})$/.test(normalized)) return null;
  return Math.round(Number(normalized) * 100);
}

/** Texto de um valor em centavos para campo de edição ("1.234,56"); null vira vazio. */
export function centsToMoneyText(cents: number | null) {
  if (cents === null) return "";
  return (cents / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export const roleLabels: Record<UserRole, string> = userRoleLabels;

export const shortDate = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
});

export function statusLabel(status: AppointmentStatus) {
  return {
    scheduled: "Agendado",
    confirmed: "Confirmado",
    completed: "Finalizado",
    no_show: "Não compareceu",
    excused_absence: "Ausência justificada",
    professional_absence: "Ausência profissional",
    cancelled: "Cancelado",
  }[status];
}

export function tagColorLookup(tags: readonly PatientTag[] | null) {
  const colors = new Map(
    (tags ?? []).map((tag) => [patientTagKey(tag.name), tag.color]),
  );
  return (name: string) => normalizeTagColor(colors.get(patientTagKey(name)));
}

export function tagCounts(lists: ReadonlyArray<{ tags: string[] }>) {
  const counts = new Map<string, number>();
  for (const item of lists)
    for (const tag of item.tags)
      counts.set(patientTagKey(tag), (counts.get(patientTagKey(tag)) ?? 0) + 1);
  return (name: string) => counts.get(patientTagKey(name)) ?? 0;
}

export const timeLabel = new Intl.DateTimeFormat("pt-BR", {
  hour: "2-digit",
  minute: "2-digit",
});

export function toLocalDateTimeInput(date: Date) {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${localIsoDate(date)}T${hours}:${minutes}`;
}

export function visitTypeBadgeText(appointment: Appointment) {
  if (
    appointment.visitType !== "trial" &&
    appointment.visitType !== "evaluation"
  )
    return null;
  return `${visitTypeLabels[appointment.visitType]}${appointment.leadId ? " · lead" : ""}`;
}

export const visitTypeLabels: Record<AppointmentVisitType, string> = {
  regular: "Atendimento",
  trial: "Experimental",
  evaluation: "Avaliação",
};

export function clinicIsoDate(
  value: string | Date,
  timezone = "America/Sao_Paulo",
) {
  return typeof value === "string" && value.length === 10
    ? value
    : new Intl.DateTimeFormat("en-CA", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(value));
}
