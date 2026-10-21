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

// Campanhas de WhatsApp manuais: mensagens padrão (texto + imagens) enviadas
// uma a uma pela equipe, sem API do WhatsApp.

/** Códigos que o editor oferece; viram dados do cliente em cada envio. */
export const messageVariables = [
  { code: "{{nome}}", label: "Nome", example: "Maria" },
  { code: "{{nome_completo}}", label: "Nome completo", example: "Maria Souza" },
] as const;

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

/** Preenche a mensagem padrão: `{{nome}}` = primeiro nome; `{{nome_completo}}`. */
export function fillCampaignMessage(body: string, fullName: string): string {
  return fillPatientMessage(body, fullName, {
    nome_completo: fullName.trim().replace(/\s+/g, " "),
  });
}

/** Público da campanha: um segmento (mesmos filtros do comunicado) ou clientes escolhidos. */
export const whatsappCampaignAudienceSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("segment"),
    segment: broadcastSegmentSchema.default({ tags: [], birthdayMonth: false }),
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

export const whatsappCampaignInputSchema =
  whatsappCampaignPreviewInputSchema.extend({
    name: z.string().trim().min(1, "Dê um nome para a campanha.").max(80),
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
