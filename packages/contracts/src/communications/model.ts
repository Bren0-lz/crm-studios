import { patientProfileFilterSchema } from "../patients/segments.js";
import { z } from "zod";
import { emptyQueryToUndefined } from "../common/model.js";
import { patientStatusSchema } from "../patients/model.js";
import type { BroadcastSkipReason } from "./types.js";

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
] as const;

export const broadcastSkipReasonLabels: Record<BroadcastSkipReason, string> = {
  opt_out: "Não autorizou mensagens neste canal",
  no_destination: "Sem contato cadastrado para o canal",
  message_too_long: "Mensagem passa de 500 caracteres com o nome",
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
