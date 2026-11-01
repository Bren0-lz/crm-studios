import { patientProfileFilterSchema } from "../patients/segments.js";
import { z } from "zod";
import { emptyQueryToUndefined } from "../common/model.js";
import { patientStatusSchema } from "../patients/model.js";
import type {
  AutoCampaignCooldownUnit,
  AutoCampaignSkipReason,
  AutoCampaignTiming,
  AutoCampaignTrigger,
  BroadcastSkipReason,
} from "./types.js";

export const communicationChannelSchema = z.enum(["whatsapp", "email"]);

export const communicationKindSchema = z.enum([
  "appointment_reminder",
  "payment_reminder",
  "manual",
  "birthday_reminder",
  "satisfaction_followup",
]);

export const communicationPreferenceInputSchema = z.object({
  patientId: z.uuid(),
  channel: communicationChannelSchema,
  allowed: z.boolean(),
});

export const manualMessageInputSchema = z.object({
  patientId: z.uuid(),
  channel: communicationChannelSchema,
  body: z.string().trim().min(1).max(500),
  scheduledFor: z.iso.datetime().optional(),
});

export const reminderGenerationInputSchema = z.object({
  referenceDate: z.iso.date(),
  appointments: z.boolean().optional(),
  payments: z.boolean().optional(),
  birthdays: z.boolean().optional(),
  satisfaction: z.boolean().optional(),
});

/**
 * Comunicado segmentado. Segmento vazio = todos os clientes. Etiquetas: basta
 * uma das informadas. `activePlan` ausente = com ou sem plano ativo.
 * `birthdayMonth` = aniversariantes do mês corrente da clínica.
 */
export const broadcastSegmentSchema = z.object({
  ...patientProfileFilterSchema.omit({ segment: true }).shape,
  tags: z.array(z.string().trim().min(1).max(40)).max(50).default([]),
  status: z.preprocess(emptyQueryToUndefined, patientStatusSchema.optional()),
  activePlan: z.preprocess(emptyQueryToUndefined, z.boolean().optional()),
  birthdayMonth: z.boolean().default(false),
});

export const broadcastInputSchema = z.object({
  segment: broadcastSegmentSchema.default({ tags: [], birthdayMonth: false }),
  channel: communicationChannelSchema,
  /** Texto com `{{nome}}` (primeiro nome do cliente). */
  body: z.string().trim().min(1).max(500),
});

export const broadcastSkipReasons = [
  "opt_out",
  "no_destination",
  "message_too_long",
  "no_appointment",
] as const;

export const broadcastSkipReasonLabels: Record<BroadcastSkipReason, string> = {
  opt_out: "Não autorizou mensagens neste canal",
  no_destination: "Sem contato cadastrado para o canal",
  message_too_long: "Mensagem passa de 500 caracteres com o nome",
  no_appointment: "Sem atendimento agendado",
};

export const messageTemplateSchema = z
  .string()
  .trim()
  .min(1, "Informe a mensagem.")
  .max(1000);

/** Primeiro nome para `{{nome}}` e saudações ("Viviane Araújo" → "Viviane"). */
export function patientFirstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? "";
}

/** Preenche a mensagem do cliente: `{{nome}}` sempre vira o primeiro nome. */
export function fillPatientMessage(
  template: string,
  fullName: string,
  vars: Readonly<Record<string, string>> = {},
): string {
  return fillMessageTemplate(template, {
    ...vars,
    nome: patientFirstName(fullName),
  });
}

/** Substitui `{{variavel}}` pelos valores informados; variáveis desconhecidas ficam como estão. */
export function fillMessageTemplate(
  template: string,
  vars: Readonly<Record<string, string>>,
): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(vars, key)
      ? (vars[key] ?? match)
      : match,
  );
}

// Campanhas de WhatsApp manuais: mensagens padrão (texto + imagens) enviadas
// uma a uma pela equipe, sem API do WhatsApp.

/** Códigos que o editor oferece; viram dados do cliente em cada envio. */
export const messageVariables = [
  { code: "{{nome}}", label: "Nome", example: "Maria" },
  { code: "{{nome_completo}}", label: "Nome completo", example: "Maria Souza" },
  {
    code: "{{data_atendimento}}",
    label: "Data do atendimento",
    example: "23/10",
  },
  {
    code: "{{hora_atendimento}}",
    label: "Hora do atendimento",
    example: "09:00",
  },
] as const;

/** Data e hora do atendimento que entram em `{{data_atendimento}}`/`{{hora_atendimento}}`. */
export interface CampaignAppointmentValues {
  date: string;
  time: string;
}

/** A mensagem usa algum código do atendimento (data ou hora). */
export function usesAppointmentVariables(body: string): boolean {
  return /\{\{\s*(data|hora)_atendimento\s*\}\}/.test(body);
}

export const MESSAGE_TEMPLATE_MAX_IMAGES = 3;
export const MESSAGE_TEMPLATE_IMAGE_MAX_BYTES = 2 * 1024 * 1024;

const messageImageDataUrlPattern =
  /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/;

/** Imagem já salva (`id`) ou nova (`dataUrl`). */
export const messageTemplateImageInputSchema = z.union([
  z.object({ id: z.uuid() }).strict(),
  z
    .object({
      fileName: z.string().trim().min(1).max(120),
      dataUrl: z
        .string()
        .max(Math.ceil((MESSAGE_TEMPLATE_IMAGE_MAX_BYTES * 4) / 3) + 64)
        .regex(
          messageImageDataUrlPattern,
          "Envie uma imagem PNG, JPEG ou WebP.",
        ),
    })
    .strict(),
]);

export const messageTemplateInputSchema = z.object({
  title: z.string().trim().min(1, "Informe o título.").max(80),
  body: messageTemplateSchema,
  images: z
    .array(messageTemplateImageInputSchema)
    .max(
      MESSAGE_TEMPLATE_MAX_IMAGES,
      `Use no máximo ${MESSAGE_TEMPLATE_MAX_IMAGES} imagens.`,
    )
    .default([]),
});

export const messageTemplateArchiveInputSchema = z.object({
  archived: z.boolean(),
});

/** Tipo e tamanho decodificado de um data URL de imagem (sem validar o conteúdo). */
export function imageDataUrlInfo(dataUrl: string) {
  const match = messageImageDataUrlPattern.exec(dataUrl);
  if (!match) return null;
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return {
    mimeType: `image/${match[1]}` as "image/png" | "image/jpeg" | "image/webp",
    base64,
    sizeBytes: (base64.length * 3) / 4 - padding,
  };
}

/**
 * Preenche a mensagem padrão: `{{nome}}` = primeiro nome; `{{nome_completo}}`;
 * com `appointment`, também `{{data_atendimento}}` e `{{hora_atendimento}}`.
 */
export function fillCampaignMessage(
  body: string,
  fullName: string,
  appointment?: CampaignAppointmentValues,
): string {
  return fillPatientMessage(body, fullName, {
    nome_completo: fullName.trim().replace(/\s+/g, " "),
    ...(appointment
      ? {
          data_atendimento: appointment.date,
          hora_atendimento: appointment.time,
        }
      : {}),
  });
}

const optionalDays = z.number().int().min(1).max(3650).optional();

/** Atendimentos que contam no filtro de período: em aberto, realizados ou qualquer um não cancelado. */
export const campaignAppointmentStatusSchema = z.enum([
  "open",
  "completed",
  "any",
]);

export const campaignAppointmentStatusLabels = {
  open: "Agendados ou confirmados",
  completed: "Realizados",
  any: "Qualquer um (menos cancelados)",
} as const;

/**
 * Filtros da campanha: os do comunicado (perfil, etiquetas, situação, plano) e
 * outros para atingir grupos bem específicos. Tudo opcional e combinado com "e".
 */
export const whatsappCampaignSegmentSchema = broadcastSegmentSchema
  .extend({
    /** `all`: precisa ter todas as etiquetas escolhidas (padrão: qualquer uma). */
    tagMode: z.enum(["any", "all"]).default("any"),
    /** Tira quem tem alguma destas etiquetas. */
    excludeTags: z.array(z.string().trim().min(1).max(40)).max(50).default([]),
    ageMin: z.number().int().min(0).max(120).optional(),
    ageMax: z.number().int().min(0).max(120).optional(),
    /** Aniversariantes de um mês específico (1–12). */
    birthMonth: z.number().int().min(1).max(12).optional(),
    /** Cliente desde (ou cadastrado) nos últimos N dias. */
    newClientDays: optionalDays,
    /** Teve atendimento (não cancelado) em algum destes serviços. */
    serviceIds: z.array(z.uuid()).max(50).default([]),
    /** Foi atendido por algum destes profissionais. */
    professionalIds: z.array(z.uuid()).max(50).default([]),
    /** Último atendimento realizado há pelo menos N dias (ou nunca veio). */
    absentDays: optionalDays,
    /** Teve atendimento realizado nos últimos N dias. */
    visitedWithinDays: optionalDays,
    /** Tem atendimento a partir deste dia (no fuso da clínica). */
    appointmentFrom: z.iso.date().optional(),
    /** Tem atendimento até este dia, inclusive (com `appointmentFrom`, um período). */
    appointmentTo: z.iso.date().optional(),
    /** Quais atendimentos do período contam (padrão: agendados ou confirmados). */
    appointmentStatus: campaignAppointmentStatusSchema.optional(),
    /** Sem nenhum atendimento futuro agendado. */
    noUpcomingAppointment: z.boolean().default(false),
    /** Plano ativo que vence nos próximos N dias. */
    planExpiringDays: optionalDays,
    /** Plano ativo com até N sessões restantes. */
    maxRemainingSessions: z.number().int().min(0).max(500).optional(),
    /** Com parcela vencida (exige acesso ao financeiro). */
    overdue: z.boolean().default(false),
    /** Tira quem recebeu alguma campanha nos últimos N dias. */
    excludeContactedDays: optionalDays,
  })
  .refine(
    (segment) =>
      !segment.appointmentFrom ||
      !segment.appointmentTo ||
      segment.appointmentFrom <= segment.appointmentTo,
    {
      message: "O fim do período não pode ser antes do início.",
      path: ["appointmentTo"],
    },
  );

/** Público da campanha: um segmento (filtros) ou clientes escolhidos. */
export const whatsappCampaignAudienceSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("segment"),
    segment: whatsappCampaignSegmentSchema.default({
      tags: [],
      birthdayMonth: false,
      tagMode: "any",
      excludeTags: [],
      serviceIds: [],
      professionalIds: [],
      noUpcomingAppointment: false,
      overdue: false,
    }),
  }),
  z.object({
    mode: z.literal("patients"),
    patientIds: z
      .array(z.uuid())
      .min(1, "Escolha pelo menos um cliente.")
      .max(2000),
  }),
]);

export const whatsappCampaignPreviewInputSchema = z.object({
  templateId: z.uuid(),
  audience: whatsappCampaignAudienceSchema,
});

/**
 * Promoção da campanha manual: vale `validDays` dias contados do dia em que a mensagem foi
 * marcada como enviada, ou até a data fixa `validUntil`. Cada cliente usa uma vez, ao agendar.
 */
export const whatsappCampaignPromotionSchema = z
  .object({
    validDays: z
      .number()
      .int()
      .min(1, "A promoção precisa valer pelo menos 1 dia.")
      .max(365, "Use no máximo 365 dias de validade.")
      .optional(),
    validUntil: z.iso.date("Informe até quando a promoção vale.").optional(),
  })
  .refine(
    (value) =>
      (value.validDays === undefined) !== (value.validUntil === undefined),
    {
      message:
        "Escolha a validade da promoção: dias depois do envio ou uma data final.",
      path: ["validDays"],
    },
  );

export const whatsappCampaignInputSchema =
  whatsappCampaignPreviewInputSchema.extend({
    name: z.string().trim().min(1, "Dê um nome para a campanha.").max(80),
    /** Sem promoção = campanha só de mensagem. */
    promotion: whatsappCampaignPromotionSchema.optional(),
  });

export const campaignRecipientStatusSchema = z.enum([
  "pending",
  "sent",
  "skipped",
]);

export const campaignRecipientStatusInputSchema = z.object({
  status: campaignRecipientStatusSchema,
});

export const campaignRecipientStatusLabels = {
  pending: "Pendente",
  sent: "Enviada",
  skipped: "Pulada",
} as const;

// Campanhas automáticas: eventos que o sistema já detecta, com várias mensagens
// por campanha, cada uma num momento (dias antes/depois do evento ou sessões restantes).

export const autoCampaignTriggerSchema = z.enum([
  "birthday",
  "appointment_upcoming",
  "plan_expiring",
  "low_balance",
  "overdue_payment",
  "expired_with_balance",
  "treatment_paused",
  "single_no_return",
  "former_client",
  "nps_detractor",
]);

/**
 * Como o momento de cada mensagem é medido: `before` = dias que faltam para o evento,
 * `after` = dias desde o evento, `sessions` = sessões restantes no plano.
 */
export const autoCampaignTriggerTiming: Record<
  AutoCampaignTrigger,
  AutoCampaignTiming
> = {
  birthday: "before",
  appointment_upcoming: "before",
  plan_expiring: "before",
  low_balance: "sessions",
  overdue_payment: "after",
  expired_with_balance: "after",
  treatment_paused: "after",
  single_no_return: "after",
  former_client: "after",
  nps_detractor: "after",
};

export const autoCampaignTriggerLabels: Record<AutoCampaignTrigger, string> = {
  birthday: "Aniversário",
  appointment_upcoming: "Atendimento agendado",
  plan_expiring: "Plano acabando",
  low_balance: "Saldo baixo de sessões",
  overdue_payment: "Pagamento atrasado",
  expired_with_balance: "Plano vencido com saldo",
  treatment_paused: "Tratamento parado",
  single_no_return: "Veio uma vez e não voltou",
  former_client: "Ex-cliente",
  nps_detractor: "Avaliação baixa",
};

export const autoCampaignTriggerDescriptions: Record<
  AutoCampaignTrigger,
  string
> = {
  birthday: "Clientes ativos que fazem aniversário.",
  appointment_upcoming: "Atendimentos agendados ou confirmados.",
  plan_expiring:
    "Planos ativos com data de término, sem renovação automática nem renovados.",
  low_balance: "Planos ativos (exceto avulsos) com poucas sessões restantes.",
  overdue_payment:
    "Parcelas em aberto com vencimento passado (conta a mais antiga do cliente).",
  expired_with_balance: "Planos vencidos que ainda têm sessões.",
  treatment_paused:
    "Último atendimento realizado sem nenhum outro agendado depois.",
  single_no_return:
    "Última compra avulsa sem atendimento ou plano depois dela.",
  former_client: "Plano cancelado e nenhum plano ativo.",
  nps_detractor: "Pesquisa de satisfação com nota de 0 a 6.",
};

/** Códigos extras de cada evento, além de `{{nome}}` e `{{nome_completo}}`. */
export const autoCampaignTriggerVariables: Record<
  AutoCampaignTrigger,
  readonly string[]
> = {
  birthday: ["data", "idade"],
  appointment_upcoming: ["data", "hora", "servico"],
  plan_expiring: ["data", "plano"],
  low_balance: ["plano", "sessoes"],
  overdue_payment: ["data", "parcelas"],
  expired_with_balance: ["data", "plano", "sessoes"],
  treatment_paused: ["data"],
  single_no_return: ["data"],
  former_client: ["data", "plano"],
  nps_detractor: ["data", "nota"],
};

/** Por quantos dias a última mensagem de um evento "depois" continua na fila. */
export const AUTO_CAMPAIGN_LAST_STEP_WINDOW_DAYS = 7;

/** Rótulo do momento da mensagem ("2 dias antes", "No dia", "1 sessão restante"…). */
export function autoCampaignStepLabel(
  trigger: AutoCampaignTrigger,
  offset: number,
): string {
  const timing = autoCampaignTriggerTiming[trigger];
  if (timing === "sessions")
    return offset === 0
      ? "Sem sessões restantes"
      : `${offset} ${offset === 1 ? "sessão restante" : "sessões restantes"}`;
  if (offset === 0) return "No dia";
  const days = `${offset} ${offset === 1 ? "dia" : "dias"}`;
  return timing === "before" ? `${days} antes` : `${days} depois`;
}

export const autoCampaignStepSchema = z.object({
  /** Mensagem já existente (mantém o histórico de envios); sem id = nova. */
  id: z.uuid().optional(),
  offset: z.number().int().min(0).max(365),
  message: messageTemplateSchema,
});

export const autoCampaignCooldownUnitSchema = z.enum([
  "days",
  "weeks",
  "months",
]);

export const autoCampaignCooldownUnitLabels: Record<
  AutoCampaignCooldownUnit,
  { singular: string; plural: string }
> = {
  days: { singular: "dia", plural: "dias" },
  weeks: { singular: "semana", plural: "semanas" },
  months: { singular: "mês", plural: "meses" },
};

/**
 * Campanha promocional: a promoção vale até `validDays` dias depois do evento; quem usar
 * fica fora desta campanha pelo `cooldown`, se houver.
 */
export const autoCampaignPromotionSchema = z.object({
  validDays: z
    .number()
    .int()
    .min(1, "A promoção precisa valer pelo menos 1 dia.")
    .max(365, "Use no máximo 365 dias de validade."),
  cooldown: z
    .object({
      amount: z
        .number()
        .int()
        .min(1, "O bloqueio precisa ser de pelo menos 1.")
        .max(365, "Use no máximo 365 no bloqueio."),
      unit: autoCampaignCooldownUnitSchema,
    })
    .optional(),
});

export const autoCampaignInputSchema = z
  .object({
    name: z.string().trim().min(1, "Dê um nome para a campanha.").max(80),
    trigger: autoCampaignTriggerSchema,
    active: z.boolean().default(true),
    steps: z
      .array(autoCampaignStepSchema)
      .min(1, "Adicione pelo menos uma mensagem.")
      .max(10, "Use no máximo 10 mensagens."),
    /** Sem promoção = campanha só de mensagens. */
    promotion: autoCampaignPromotionSchema.optional(),
  })
  .refine(
    (value) =>
      new Set(value.steps.map((step) => step.offset)).size ===
      value.steps.length,
    {
      message: "Cada mensagem precisa de um momento diferente.",
      path: ["steps"],
    },
  )
  .refine(
    (value) =>
      autoCampaignTriggerTiming[value.trigger] !== "sessions" ||
      value.steps.every((step) => step.offset <= 100),
    {
      message: "Use no máximo 100 sessões restantes.",
      path: ["steps"],
    },
  );

export const autoCampaignSkipReasonSchema = z.enum([
  "contacted_other_way",
  "not_appropriate",
  "wrong_number",
  "client_asked",
  "other",
]);

export const autoCampaignSkipReasonLabels: Record<
  AutoCampaignSkipReason,
  string
> = {
  contacted_other_way: "Já falei de outra forma",
  not_appropriate: "Não é o momento",
  wrong_number: "Número errado ou sem WhatsApp",
  client_asked: "Cliente pediu para não receber",
  other: "Outro motivo",
};

/** Motivos que o próprio sistema aponta (cliente na lista, mas sem como enviar). */
export const autoCampaignBlockedReasonLabels = {
  opt_out: "Cliente não autoriza mensagens no WhatsApp",
  no_destination: "Sem WhatsApp ou telefone cadastrado",
} as const;

export const autoCampaignDeliveryInputSchema = z
  .object({
    campaignId: z.uuid(),
    stepId: z.uuid(),
    patientId: z.uuid(),
    occurrenceKey: z.string().trim().min(1).max(200),
    status: z.enum(["sent", "skipped"]),
    skipReason: autoCampaignSkipReasonSchema.optional(),
    note: z.string().trim().max(300).optional(),
  })
  .refine((value) => value.status !== "skipped" || value.skipReason, {
    message: "Escolha o motivo de não enviar.",
    path: ["skipReason"],
  })
  .refine(
    (value) =>
      value.status !== "skipped" ||
      value.skipReason !== "other" ||
      (value.note ?? "").length > 0,
    { message: "Descreva o motivo.", path: ["note"] },
  );
