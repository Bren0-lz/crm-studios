import { z } from "zod";
import {
  addMonthsToIsoDate,
  clockTimeSchema,
  joinWithAnd,
} from "../common/model.js";
import type { Appointment, GroupWeeklySlot } from "./types.js";

export const appointmentStatusSchema = z.enum([
  "scheduled",
  "confirmed",
  "completed",
  "no_show",
  "excused_absence",
  "professional_absence",
  "cancelled",
]);

// Tipo do atendimento: normal, aula experimental ou avaliação.
export const appointmentVisitTypeSchema = z.enum([
  "regular",
  "trial",
  "evaluation",
]);

export const appointmentInputSchema = z.object({
  patientId: z.uuid(),
  professionalId: z.uuid(),
  roomId: z.uuid(),
  serviceId: z.uuid(),
  startsAt: z.iso.datetime({ offset: true }),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
  visitType: appointmentVisitTypeSchema.default("regular"),
});

export const appointmentRescheduleInputSchema = z.object({
  professionalId: z.uuid(),
  roomId: z.uuid(),
  startsAt: z.iso.datetime({ offset: true }),
});

export const recurringAppointmentInputSchema = appointmentInputSchema.extend({
  occurrences: z.number().int().min(2).max(52),
  intervalWeeks: z.number().int().min(1).max(4).default(1),
});

// Atendimento de lead ainda não convertido: só experimental ou avaliação.
export const leadAppointmentInputSchema = z.object({
  professionalId: z.uuid(),
  roomId: z.uuid(),
  serviceId: z.uuid(),
  startsAt: z.iso.datetime({ offset: true }),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
  visitType: z.enum(["trial", "evaluation"]),
});

export const scheduleBlockInputSchema = z
  .object({
    professionalId: z.uuid().optional(),
    roomId: z.uuid().optional(),
    startsAt: z.iso.datetime({ offset: true }),
    endsAt: z.iso.datetime({ offset: true }),
    reason: z.string().trim().min(3).max(300),
  })
  .refine((value) => value.professionalId || value.roomId, {
    message: "Informe o profissional ou a sala.",
    path: ["professionalId"],
  })
  .refine(
    (value) =>
      new Date(value.endsAt).getTime() > new Date(value.startsAt).getTime(),
    {
      message: "O término deve ser posterior ao início.",
      path: ["endsAt"],
    },
  );

export const groupWeeklySlotsSchema = z
  .array(
    z
      .object({
        weekday: z.number().int().min(0).max(6),
        startTime: clockTimeSchema,
        endTime: clockTimeSchema,
      })
      .refine((slot) => slot.endTime > slot.startTime, {
        message: "O término deve ser posterior ao início.",
        path: ["endTime"],
      }),
  )
  .max(14)
  .refine(
    (slots) =>
      slots.every((slot, index) =>
        slots.every(
          (other, otherIndex) =>
            otherIndex === index ||
            other.weekday !== slot.weekday ||
            other.startTime >= slot.endTime ||
            other.endTime <= slot.startTime,
        ),
      ),
    "Os horários de um mesmo dia não podem se sobrepor.",
  );

export function groupLetter(sequence: number): string {
  let letters = "";
  for (let rest = sequence; rest > 0; rest = Math.floor((rest - 1) / 26)) {
    letters = String.fromCharCode(65 + ((rest - 1) % 26)) + letters;
  }
  return letters;
}

export function groupClassName(serviceName: string, sequence: number): string {
  return `${serviceName} Turma ${groupLetter(sequence)}`;
}

export const scheduleWeekdayNames = [
  "domingo",
  "segunda",
  "terça",
  "quarta",
  "quinta",
  "sexta",
  "sábado",
];

export const schedulePeriods = [
  { label: "da manhã", until: "12:00" },
  { label: "da tarde", until: "18:00" },
  { label: "da noite", until: "24:00" },
];

export function describeGroupSchedule(
  slots: readonly Pick<GroupWeeklySlot, "weekday" | "startTime">[],
): string {
  if (slots.length === 0) return "Horários ainda não definidos";
  const weekOrder = (weekday: number) => (weekday + 6) % 7;
  const parts = schedulePeriods.flatMap((period, index) => {
    const from = schedulePeriods[index - 1]?.until ?? "00:00";
    const days = [
      ...new Set(
        slots
          .filter(
            (slot) => slot.startTime >= from && slot.startTime < period.until,
          )
          .map((slot) => slot.weekday),
      ),
    ].sort((a, b) => weekOrder(a) - weekOrder(b));
    return days.length
      ? [
          `${joinWithAnd(days.map((day) => scheduleWeekdayNames[day]!))} ${period.label}`,
        ]
      : [];
  });
  return `Turma de ${joinWithAnd(parts)}`;
}

export const groupClassInputSchema = z.object({
  serviceId: z.uuid(),
  professionalId: z.uuid(),
  roomId: z.uuid(),
  capacity: z.number().int().min(1).max(100),
  weeklySlots: groupWeeklySlotsSchema.min(1),
});

export const groupClassUpdateSchema = z.object({
  capacity: z.number().int().min(1).max(100),
  weeklySlots: groupWeeklySlotsSchema.min(1),
});

export const groupEnrollmentInputSchema = z.object({
  groupId: z.uuid(),
  patientId: z.uuid(),
});

export const groupAttendanceInputSchema = z.object({
  status: z.enum(["present", "absent", "excused_absence"]),
  notes: z.string().trim().max(500).optional().or(z.literal("")),
});

export const replacementBookingInputSchema = z.object({
  creditId: z.uuid(),
  sessionId: z.uuid(),
});

/** Rótulo do estado derivado de atendimento passado sem desfecho registrado. */
export const pendingFinalizationLabel = "Pendente de finalização";

/**
 * Atendimento "Pendente de finalização": ainda agendado ou confirmado e com o término já
 * passado. O término é um instante com fuso (ISO), então a comparação vale para o fuso da
 * clínica (America/Sao_Paulo) sem conversão. Não é um status gravado: é derivado na leitura.
 */
export function isAppointmentPendingFinalization(
  appointment: Pick<Appointment, "status" | "endsAt">,
  now: Date = new Date(),
): boolean {
  return (
    (appointment.status === "scheduled" ||
      appointment.status === "confirmed") &&
    Date.parse(appointment.endsAt) < now.getTime()
  );
}

/**
 * Tolerância (minutos antes do início) para registrar realizado/falta ou vincular evolução
 * clínica a um atendimento. Decisão do dono: constante, sem configuração.
 */
export const appointmentActionLeadMinutes = 15;

/** Instante a partir do qual realizado/falta/evolução ficam liberados. */
export function appointmentActionsAvailableAt(startsAt: string): Date {
  return new Date(Date.parse(startsAt) - appointmentActionLeadMinutes * 60_000);
}

/** Atendimento já "iniciado" para ações clínicas (início − 15 min ≤ agora). */
export function isAppointmentStarted(
  appointment: Pick<Appointment, "startsAt">,
  now: Date = new Date(),
): boolean {
  return (
    appointmentActionsAvailableAt(appointment.startsAt).getTime() <=
    now.getTime()
  );
}

/** "Disponível a partir de 19/10 às 09:45" no fuso da clínica (sem ponto final). */
export function appointmentNotStartedMessage(
  startsAt: string,
  timeZone = "America/Sao_Paulo",
): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("pt-BR", {
      timeZone,
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(appointmentActionsAvailableAt(startsAt))
      .map((part) => [part.type, part.value]),
  );
  return `Disponível a partir de ${parts.day}/${parts.month} às ${parts.hour}:${parts.minute}`;
}

export const appointmentStatusInputSchema = z.object({
  absenceReason: z.string().trim().min(2).max(500).optional(),
  status: appointmentStatusSchema,
});

/**
 * Parcelas de um plano: uma por mês a partir do primeiro vencimento (dia
 * limitado ao fim do mês), com o resto da divisão nos primeiros centavos.
 */
export function planInstallmentSchedule(plan: {
  totalValueInCents: number;
  installments: number;
  firstDueDate: string;
}): { installmentNumber: number; dueDate: string; amountInCents: number }[] {
  const baseAmount = Math.floor(plan.totalValueInCents / plan.installments);
  const remainder = plan.totalValueInCents % plan.installments;
  return Array.from({ length: plan.installments }, (_, index) => ({
    installmentNumber: index + 1,
    dueDate: addMonthsToIsoDate(plan.firstDueDate, index),
    amountInCents: baseAmount + (index < remainder ? 1 : 0),
  }));
}

export const holidayInputSchema = z.object({
  date: z.iso.date("Informe uma data válida."),
  name: z.string().trim().min(2, "Informe o nome do feriado.").max(120),
});
