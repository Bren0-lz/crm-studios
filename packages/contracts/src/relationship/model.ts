import { z } from "zod";
import { saoPauloToday } from "../common/model.js";
import { messageTemplateSchema } from "../communications/model.js";
import type {
  RelationshipSettings,
  SatisfactionCategory,
  SatisfactionSummary,
} from "./types.js";

// Central de relacionamento

export const contactReasonSchema = z.enum([
  "birthday",
  "single_no_return",
  "plan_expiring",
  "low_balance",
  "expired_with_balance",
  "treatment_paused",
  "repeated_no_show",
  "former_client",
  "overdue_payment",
  "nps_detractor",
]);

export const contactOutcomeSchema = z.enum([
  "contacted",
  "no_answer",
  "scheduled",
  "not_interested",
  "snoozed",
  "dismissed",
]);

export const relationshipDaysSchema = z.number().int().min(1).max(3650);

export const relationshipSettingsSchema = z
  .object({
    birthdayDaysAhead: z.number().int().min(0).max(60),
    singleNoReturnDays: relationshipDaysSchema,
    planExpiringDays: relationshipDaysSchema,
    lowBalanceSessions: z.number().int().min(0).max(100),
    expiredWithBalanceDays: relationshipDaysSchema,
    treatmentPausedDays: relationshipDaysSchema,
    repeatedNoShowCount: z.number().int().min(1).max(50),
    repeatedNoShowWindowDays: relationshipDaysSchema,
    formerClientMinDays: z.number().int().min(0).max(3650),
    formerClientMaxDays: relationshipDaysSchema,
    messages: z.object({
      birthday: messageTemplateSchema,
      single_no_return: messageTemplateSchema,
      plan_expiring: messageTemplateSchema,
      low_balance: messageTemplateSchema,
      expired_with_balance: messageTemplateSchema,
      treatment_paused: messageTemplateSchema,
      repeated_no_show: messageTemplateSchema,
      former_client: messageTemplateSchema,
      overdue_payment: messageTemplateSchema,
      nps_detractor: messageTemplateSchema,
    }),
  })
  .refine((value) => value.formerClientMinDays <= value.formerClientMaxDays, {
    message: "O prazo mínimo deve ser menor ou igual ao máximo.",
    path: ["formerClientMaxDays"],
  });

export const defaultRelationshipSettings: RelationshipSettings = {
  birthdayDaysAhead: 7,
  singleNoReturnDays: 60,
  planExpiringDays: 7,
  lowBalanceSessions: 2,
  expiredWithBalanceDays: 60,
  treatmentPausedDays: 30,
  repeatedNoShowCount: 2,
  repeatedNoShowWindowDays: 30,
  formerClientMinDays: 30,
  formerClientMaxDays: 90,
  messages: {
    birthday:
      "Olá, {{nome}}! Toda a equipe deseja um feliz aniversário, com muita saúde e movimento. Um abraço!",
    single_no_return:
      "Olá, {{nome}}! Tudo bem? Sentimos sua falta por aqui. Quer agendar um novo horário?",
    plan_expiring:
      "Olá, {{nome}}! Seu plano está chegando ao fim. Vamos conversar sobre a renovação para você seguir com os atendimentos?",
    low_balance:
      "Olá, {{nome}}! Restam poucas sessões no seu plano. Quer que a gente já prepare a renovação?",
    expired_with_balance:
      "Olá, {{nome}}! Seu plano venceu com sessões ainda disponíveis. Vamos conversar sobre como aproveitá-las?",
    treatment_paused:
      "Olá, {{nome}}! Faz um tempo desde o seu último atendimento. Como você está? Quer agendar um horário?",
    repeated_no_show:
      "Olá, {{nome}}! Notamos que você não conseguiu vir nos últimos atendimentos. Está tudo bem? Podemos ajustar seus horários.",
    former_client:
      "Olá, {{nome}}! Sentimos sua falta. Temos horários disponíveis e adoraríamos ter você de volta.",
    overdue_payment:
      "Olá, {{nome}}! Identificamos uma parcela em aberto. Podemos ajudar com a forma de pagamento?",
    nps_detractor:
      "Olá, {{nome}}! Obrigado pela sua avaliação. Queremos entender o que podemos melhorar. Podemos conversar?",
  },
};

// snoozeUntil é comparado com saoPauloToday() no momento da validação:
// precisa ser posterior a hoje no fuso da clínica.
export const contactActivityInputSchema = z
  .object({
    patientId: z.uuid(),
    reason: contactReasonSchema,
    referenceKey: z.string().trim().min(1).max(200),
    outcome: contactOutcomeSchema,
    notes: z.string().trim().max(2000).optional(),
    snoozeUntil: z.iso.date().optional(),
  })
  .refine(
    (value) =>
      value.outcome !== "snoozed" ||
      (value.snoozeUntil !== undefined && value.snoozeUntil > saoPauloToday()),
    {
      message: "Informe uma data futura para adiar o contato.",
      path: ["snoozeUntil"],
    },
  );

/** Pesquisa de satisfação (NPS): nota 0–10, opcionalmente ligada a um atendimento concluído. */
export const satisfactionSurveyInputSchema = z.object({
  sourceMessageId: z.uuid().optional(),
  patientId: z.uuid(),
  appointmentId: z.uuid().optional(),
  score: z.number().int().min(0).max(10),
  comment: z.string().trim().max(1000).optional(),
});

/** `GET /satisfaction?from&to` (aaaa-mm-dd, data da clínica). Padrão: do dia 1º do mês de `to` até `to`; `to` padrão = hoje. */
export const satisfactionFilterSchema = z.object({
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
});

export function satisfactionCategory(score: number): SatisfactionCategory {
  if (score >= 9) return "promoter";
  if (score >= 7) return "passive";
  return "detractor";
}

export function summarizeSatisfaction(
  surveys: ReadonlyArray<{ score: number }>,
): SatisfactionSummary {
  let promoters = 0;
  let passives = 0;
  let detractors = 0;
  for (const survey of surveys) {
    const category = satisfactionCategory(survey.score);
    if (category === "promoter") promoters += 1;
    else if (category === "passive") passives += 1;
    else detractors += 1;
  }
  const total = surveys.length;
  const nps =
    total === 0
      ? null
      : Math.round(((promoters - detractors) / total) * 100) || 0;
  return { total, promoters, passives, detractors, nps };
}
