import { z } from "zod";
import type { ExtraFields } from "../common/extra-fields.js";
import { leadInputSchema } from "./model.js";
import {
  EVENT_IMPORT_EXTRA_FIELD,
  eventImportFieldLabels,
  importMappingSchema,
  relaxedLeadInputSchema,
  type ContactImportAnalysis,
} from "./events.js";

/**
 * Importação de leads por planilha na tela do CRM comercial (LI1): sem evento, com a origem e a
 * etapa escolhidas no modal. Contato repetido (cliente, lead ou outra linha) não bloqueia: a
 * prévia só avisa.
 */
export const LEAD_IMPORT_DEFAULT_SOURCE = "Planilha";
/** Interesse do lead importado enquanto a planilha não traz um. */
export const LEAD_IMPORT_DEFAULT_INTEREST = "Não informado";

/**
 * Lead de uma linha: a origem da coluna "Origem", se houver, vale sobre a do modal. Sem evento:
 * participante se importa pela página do evento.
 */
export const leadImportInputSchema = relaxedLeadInputSchema
  .omit({ eventId: true })
  .extend({
    source: leadInputSchema.shape.source.optional(),
    interest: leadInputSchema.shape.interest.default(
      LEAD_IMPORT_DEFAULT_INTEREST,
    ),
  });
export type LeadImportRowInput = z.infer<typeof leadImportInputSchema> & {
  extraFields?: ExtraFields;
};

export const leadImportFieldLabels = {
  fullName: eventImportFieldLabels.fullName,
  phone: eventImportFieldLabels.phone,
  whatsapp: eventImportFieldLabels.whatsapp,
  email: eventImportFieldLabels.email,
  cpf: eventImportFieldLabels.cpf,
  source: "Origem",
  interest: eventImportFieldLabels.interest,
  notes: eventImportFieldLabels.notes,
  phoneAreaCode: eventImportFieldLabels.phoneAreaCode,
  whatsappAreaCode: eventImportFieldLabels.whatsappAreaCode,
  extra: eventImportFieldLabels.extra,
} as const;
export const leadImportFieldSchema = z.enum([
  "fullName",
  "phone",
  "whatsapp",
  "email",
  "cpf",
  "source",
  "interest",
  "notes",
  "phoneAreaCode",
  "whatsappAreaCode",
  EVENT_IMPORT_EXTRA_FIELD,
]);
export type LeadImportField = z.infer<typeof leadImportFieldSchema>;

/** Prévia: o arquivo e o mapeamento das colunas. */
export const leadImportPreviewSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  contentBase64: z.string().min(1),
  mapping: importMappingSchema(leadImportFieldSchema, leadImportFieldLabels),
});
export type LeadImportPreviewInput = z.infer<typeof leadImportPreviewSchema>;

/** Gravação: a prévia + a origem padrão e a etapa aberta em que todos os leads entram. */
export const leadImportFileSchema = leadImportPreviewSchema.extend({
  source: z
    .string()
    .trim()
    .min(2, "Escolha a origem dos leads.")
    .max(80, "A origem deve ter até 80 caracteres."),
  stage: z.string().trim().min(1, "Escolha a etapa do funil.").max(64),
});
export type LeadImportFileInput = z.infer<typeof leadImportFileSchema>;

export type LeadImportAnalysis = ContactImportAnalysis<
  LeadImportField,
  LeadImportRowInput
>;

/** `created` leads gravados, `warnings` linhas gravadas com aviso, `errors` linhas com erro. */
export interface LeadImportResult {
  created: number;
  warnings: number;
  errors: number;
}
