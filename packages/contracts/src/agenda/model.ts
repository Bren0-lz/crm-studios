import { z } from "zod";
import {
  addDaysToIsoDate,
  addMonthsToIsoDate,
  clockTimeSchema,
  joinWithAnd,
} from "../common/model.js";
import type {
  Appointment,
  GroupEnrollment,
  GroupSession,
  GroupWeeklySlot,
} from "./types.js";

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

/**
 * Edição de um atendimento ainda não finalizado (QM6): serviço, sala e observação.
 * Data, horário e profissional mudam só pela remarcação. `notes` vazio limpa a observação.
 */
export const appointmentUpdateInputSchema = z.object({
  serviceId: z.uuid(),
  roomId: z.uuid(),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
});

/**
 * Repetição de um atendimento: a cada `intervalWeeks` semanas ou, com `customStartsAt`,
 * nas datas escolhidas à mão (além de `startsAt`, que é sempre a primeira ocorrência).
 */
export const recurringAppointmentInputSchema = appointmentInputSchema
  .extend({
    occurrences: z.number().int().min(2).max(52),
    intervalWeeks: z.number().int().min(1).max(4).default(1),
    customStartsAt: z
      .array(z.iso.datetime({ offset: true }))
      .max(51)
      .optional(),
  })
  .superRefine((input, context) => {
    if (!input.customStartsAt) return;
    if (input.customStartsAt.length !== input.occurrences - 1)
      context.addIssue({
        code: "custom",
        path: ["customStartsAt"],
        message: "Informe uma data para cada ocorrência.",
      });
    const times = [input.startsAt, ...input.customStartsAt].map((value) =>
      new Date(value).getTime(),
    );
    if (new Set(times).size !== times.length)
      context.addIssue({
        code: "custom",
        path: ["customStartsAt"],
        message: "Há datas repetidas na recorrência.",
      });
  });

/** Início de cada ocorrência da recorrência, em ordem cronológica (ISO UTC). */
export function recurringOccurrenceStarts(input: {
  startsAt: string;
  occurrences: number;
  intervalWeeks: number;
  customStartsAt?: string[] | undefined;
}): string[] {
  if (input.customStartsAt)
    return [input.startsAt, ...input.customStartsAt]
      .map((value) => new Date(value).toISOString())
      .sort();
  return Array.from({ length: input.occurrences }, (_, index) => {
    const startsAt = new Date(input.startsAt);
    startsAt.setUTCDate(
      startsAt.getUTCDate() + index * input.intervalWeeks * 7,
    );
    return startsAt.toISOString();
  });
}

/** Dia fixo da semana (0 = domingo … 6 = sábado) e horário "HH:MM" de um pacote. */
export interface PackageWeeklySlot {
  weekday: number;
  time: string;
}

/**
 * Datas de um pacote de sessões com dias e horários fixos na semana: a partir de
 * `fromDate` (AAAA-MM-DD, inclusive), percorre os dias em ordem e marca cada dia/horário
 * fixo até completar `count` sessões. Devolve data e hora locais ("AAAA-MM-DDTHH:MM"),
 * em ordem cronológica e sem repetição; a conversão para UTC fica com quem chama.
 */
export function packageScheduleStarts(input: {
  fromDate: string;
  slots: PackageWeeklySlot[];
  count: number;
}): string[] {
  const slots = [
    ...new Map(
      input.slots
        .filter(
          (slot) =>
            Number.isInteger(slot.weekday) &&
            slot.weekday >= 0 &&
            slot.weekday <= 6 &&
            clockTimeSchema.safeParse(slot.time).success,
        )
        .map((slot) => [`${slot.weekday}-${slot.time}`, slot] as const),
    ).values(),
  ].sort((a, b) => a.time.localeCompare(b.time));
  const starts: string[] = [];
  if (!slots.length || input.count < 1) return starts;
  for (let offset = 0; starts.length < input.count; offset += 1) {
    const date = addDaysToIsoDate(input.fromDate, offset);
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
    for (const slot of slots) {
      if (slot.weekday !== weekday || starts.length >= input.count) continue;
      starts.push(`${date}T${slot.time}`);
    }
  }
  return starts;
}

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

const groupClassNameSchema = z
  .string()
  .trim()
  .min(1, "Informe o nome da turma.")
  .max(120, "O nome da turma pode ter até 120 caracteres.");

export const groupClassRenameSchema = z
  .object({
    name: groupClassNameSchema,
  })
  .strict();

export const groupClassInputSchema = z.object({
  name: groupClassNameSchema.optional(),
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
  /** Data de início (aaaa-mm-dd, fuso da clínica); sem ela a matrícula começa hoje. */
  startsOn: z.iso.date("Informe uma data de início válida.").optional(),
});

/**
 * A matrícula participa do encontro quando começou até a data do encontro (fuso da clínica)
 * e ainda vale nessa data: ativa, ou cancelada com fim (`endedOn`) igual ou posterior.
 * Lista de espera não participa.
 */
export function groupEnrollmentCoversSession(
  enrollment: Pick<GroupEnrollment, "status" | "startsOn"> & {
    endedOn?: string | undefined;
  },
  session: Pick<GroupSession, "startsAt">,
  timeZone = "America/Sao_Paulo",
): boolean {
  if (enrollment.status === "waitlisted") return false;
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(session.startsAt));
  if (enrollment.startsOn > date) return false;
  if (enrollment.status === "active") return true;
  return enrollment.endedOn !== undefined && enrollment.endedOn >= date;
}

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

/** Limite do tempo de espera da finalização automática: 7 dias. */
export const autoFinalizationMaxDelayMinutes = 7 * 24 * 60;

/**
 * Finalização automática (por clínica): quando ligada, o atendimento que segue agendado ou
 * confirmado vira "realizado" depois de `delayMinutes` do término.
 */
export const autoFinalizationSettingsInputSchema = z.object({
  enabled: z.boolean(),
  delayMinutes: z.number().int().min(0).max(autoFinalizationMaxDelayMinutes),
});

/** Padrão de clínica que nunca configurou: desligada, 1 hora após o término. */
export const defaultAutoFinalizationSettings = {
  enabled: false,
  delayMinutes: 60,
} as const;

/** Instante-limite: atendimentos que terminaram até ele já podem ser finalizados. */
export function autoFinalizationCutoff(now: Date, delayMinutes: number): Date {
  return new Date(now.getTime() - delayMinutes * 60_000);
}

/** Pendente de finalização há pelo menos `delayMinutes` (término + espera ≤ agora). */
export function isAppointmentDueForAutoFinalization(
  appointment: Pick<Appointment, "status" | "endsAt">,
  delayMinutes: number,
  now: Date = new Date(),
): boolean {
  return (
    (appointment.status === "scheduled" ||
      appointment.status === "confirmed") &&
    Date.parse(appointment.endsAt) <=
      autoFinalizationCutoff(now, delayMinutes).getTime()
  );
}

/** Tempo de espera por extenso: "imediatamente", "45 minutos", "1 hora e 30 minutos", "2 dias". */
export function autoFinalizationDelayLabel(delayMinutes: number): string {
  if (delayMinutes <= 0) return "imediatamente";
  const days = Math.floor(delayMinutes / 1440);
  const hours = Math.floor((delayMinutes % 1440) / 60);
  const minutes = delayMinutes % 60;
  const parts = [
    days ? `${days} ${days === 1 ? "dia" : "dias"}` : "",
    hours ? `${hours} ${hours === 1 ? "hora" : "horas"}` : "",
    minutes ? `${minutes} ${minutes === 1 ? "minuto" : "minutos"}` : "",
  ].filter(Boolean);
  return joinWithAnd(parts);
}

/** Período da lista de concluídos (instantes com fuso, como a agenda). */
export const completedAppointmentsQuerySchema = z
  .object({
    from: z.iso.datetime({ offset: true }),
    to: z.iso.datetime({ offset: true }),
  })
  .refine((value) => Date.parse(value.from) < Date.parse(value.to), {
    message: "A data final precisa ser depois da inicial.",
  })
  .refine(
    (value) =>
      Date.parse(value.to) - Date.parse(value.from) <= 367 * 24 * 3600_000,
    { message: "Escolha um período de até 1 ano." },
  );

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
