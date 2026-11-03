import { z } from "zod";
import {
  addDaysToIsoDate,
  addMonthsToIsoDate,
  clockTimeSchema,
  joinWithAnd,
  paymentMethodSchema,
} from "../common/model.js";
import type {
  AgendaConflict,
  Appointment,
  GroupEnrollment,
  GroupSession,
  GroupWeeklySlot,
} from "./types.js";

type PaymentMethod = z.infer<typeof paymentMethodSchema>;

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

/** Promoção escolhida ao agendar: a campanha e o evento em que o cliente recebeu a mensagem. */
export const appointmentPromotionSchema = z.object({
  /** `manual` = campanha manual (WhatsApp); ausente = campanha automática. */
  source: z.literal("manual").optional(),
  campaignId: z.uuid(),
  occurrenceKey: z.string().trim().min(1).max(200),
});

/** `POST /appointments`: o atendimento e, se for o caso, a promoção que ele usa. */
export const appointmentCreateInputSchema = appointmentInputSchema.extend({
  promotion: appointmentPromotionSchema.optional(),
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

/** `POST /appointments/recurring`: a promoção, se houver, fica com a 1ª ocorrência. */
export const recurringAppointmentCreateInputSchema =
  recurringAppointmentInputSchema.and(
    z.object({ promotion: appointmentPromotionSchema.optional() }),
  );

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

/**
 * `POST /appointments/conflicts`: verifica, sem gravar, se cada horário planejado (ex.: as
 * sessões de um plano avulso antes de confirmar a contratação) conflita com a agenda.
 * `key` identifica o item na resposta.
 */
export const agendaConflictCheckInputSchema = z.object({
  items: z
    .array(
      z.object({
        key: z.string().trim().min(1).max(64),
        professionalId: z.uuid(),
        roomId: z.uuid(),
        serviceId: z.uuid(),
        startsAt: z.iso.datetime({ offset: true }),
      }),
    )
    .min(1)
    .max(120),
});

/** Motivo padrão de cada tipo de conflito, como aparece no resumo das sessões. */
export const agendaConflictLabels = {
  appointment: "Profissional ou sala com outro atendimento",
  block: "Horário bloqueado",
  group: "Horário de turma",
  holiday: "Feriado",
  batch: "Outra sessão deste plano no mesmo horário",
} as const;

export function agendaConflict(
  key: string,
  kind: keyof typeof agendaConflictLabels,
  label: string = agendaConflictLabels[kind],
): AgendaConflict {
  return { key, kind, label };
}

/** Limite da observação da aula experimental: a tela usa o mesmo número no `maxLength`. */
export const leadAppointmentNotesMaxLength = 1000;

// Atendimento de lead ainda não convertido: só experimental ou avaliação.
export const leadAppointmentInputSchema = z.object({
  professionalId: z.uuid(),
  roomId: z.uuid(),
  serviceId: z.uuid(),
  startsAt: z.iso.datetime({ offset: true }),
  notes: z
    .string()
    .trim()
    .max(leadAppointmentNotesMaxLength)
    .optional()
    .or(z.literal("")),
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

type PlanScheduleItem = {
  installmentNumber: number;
  dueDate: string;
  amountInCents: number;
  /** Forma prevista da cobrança (a da parte, no plano picado). */
  paymentMethod?: PaymentMethod;
};

type PlanSchedulePart = {
  paymentMethod: PaymentMethod;
  amountInCents: number;
  installments: number;
};

/**
 * Parcelas de um plano: uma por mês a partir do primeiro vencimento (dia
 * limitado ao fim do mês), com o resto da divisão nos primeiros centavos. Com
 * `proratedChargeInCents` (recorrente que começa antes do 1º vencimento), vem antes
 * uma cobrança a mais com esse valor, vencendo no início do plano (`validFrom`).
 */
export function planInstallmentSchedule(plan: {
  totalValueInCents: number;
  installments: number;
  firstDueDate: string;
  validFrom?: string | undefined;
  proratedChargeInCents?: number | undefined;
  paymentMethod?: PaymentMethod | undefined;
  paymentParts?: readonly PlanSchedulePart[] | undefined;
}): PlanScheduleItem[] {
  const parts = plan.paymentParts;
  const method = parts?.[0]?.paymentMethod ?? plan.paymentMethod;
  const regular =
    parts && parts.length > 1
      ? splitPlanSchedule(plan.firstDueDate, parts)
      : regularPlanSchedule(plan, method);
  const prorated =
    plan.proratedChargeInCents && plan.validFrom
      ? proratedPlanCharges(
          plan.proratedChargeInCents,
          plan.validFrom,
          parts && parts.length > 1 ? parts : undefined,
          method,
        )
      : [];
  return [...prorated, ...regular].map((item, index) => ({
    ...item,
    installmentNumber: index + 1,
  }));
}

/**
 * Quantas cobranças proporcionais (as primeiras de `planInstallmentSchedule`) o plano gera:
 * uma, ou uma por forma no plano picado; 0 sem `proratedChargeInCents`.
 */
export function planProratedChargeCount(plan: {
  validFrom?: string | undefined;
  proratedChargeInCents?: number | undefined;
  paymentParts?: readonly PlanSchedulePart[] | undefined;
}): number {
  if (!plan.proratedChargeInCents || !plan.validFrom) return 0;
  return plan.paymentParts && plan.paymentParts.length > 1
    ? plan.paymentParts.length
    : 1;
}

function regularPlanSchedule(
  plan: {
    totalValueInCents: number;
    installments: number;
    firstDueDate: string;
  },
  method: PaymentMethod | undefined,
): PlanScheduleItem[] {
  const baseAmount = Math.floor(plan.totalValueInCents / plan.installments);
  const remainder = plan.totalValueInCents % plan.installments;
  return Array.from({ length: plan.installments }, (_, index) => ({
    installmentNumber: index + 1,
    dueDate: addMonthsToIsoDate(plan.firstDueDate, index),
    amountInCents: baseAmount + (index < remainder ? 1 : 0),
    ...(method ? { paymentMethod: method } : {}),
  }));
}

/**
 * Cobrança proporcional: no plano picado, repartida entre as formas na proporção do valor
 * de cada uma (o resto do arredondamento fica na última).
 */
function proratedPlanCharges(
  amountInCents: number,
  dueDate: string,
  parts: readonly PlanSchedulePart[] | undefined,
  method: PaymentMethod | undefined,
): PlanScheduleItem[] {
  if (!parts)
    return [
      {
        installmentNumber: 1,
        dueDate,
        amountInCents,
        ...(method ? { paymentMethod: method } : {}),
      },
    ];
  const total = parts.reduce((sum, part) => sum + part.amountInCents, 0);
  let used = 0;
  return parts.map((part, position) => {
    const amount =
      position === parts.length - 1
        ? amountInCents - used
        : total > 0
          ? Math.floor((part.amountInCents * amountInCents) / total)
          : 0;
    used += amount;
    return {
      installmentNumber: position + 1,
      dueDate,
      amountInCents: amount,
      paymentMethod: part.paymentMethod,
    };
  });
}

/**
 * Plano picado: cada forma divide o próprio valor nas cobranças dela, mês a mês a partir do
 * 1º vencimento. Ordem: vencimento e depois a ordem das formas.
 */
function splitPlanSchedule(
  firstDueDate: string,
  parts: readonly PlanSchedulePart[],
): PlanScheduleItem[] {
  const charges = parts.flatMap((part, partIndex) => {
    const count = Math.max(1, part.installments);
    const base = Math.floor(part.amountInCents / count);
    const remainder = part.amountInCents % count;
    return Array.from({ length: count }, (_, index) => ({
      partIndex,
      index,
      dueDate: addMonthsToIsoDate(firstDueDate, index),
      amountInCents: base + (index < remainder ? 1 : 0),
      paymentMethod: part.paymentMethod,
    }));
  });
  return charges
    .sort(
      (a, b) =>
        a.dueDate.localeCompare(b.dueDate) ||
        a.index - b.index ||
        a.partIndex - b.partIndex,
    )
    .map((charge, position) => ({
      installmentNumber: position + 1,
      dueDate: charge.dueDate,
      amountInCents: charge.amountInCents,
      paymentMethod: charge.paymentMethod,
    }));
}

export const holidayInputSchema = z.object({
  date: z.iso.date("Informe uma data válida."),
  name: z.string().trim().min(2, "Informe o nome do feriado.").max(120),
});
