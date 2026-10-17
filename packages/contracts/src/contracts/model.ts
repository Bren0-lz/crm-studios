import { z } from "zod";

export const documentKindSchema = z.enum([
  "contract",
  "attendance_declaration",
  "consent",
  "other",
]);

export const documentTemplateInputSchema = z.object({
  name: z.string().trim().min(3).max(120),
  kind: documentKindSchema,
  body: z.string().trim().min(20).max(20_000),
});

export const documentTemplateVersionInputSchema = z.object({
  body: z.string().trim().min(20).max(20_000),
});

export const issuedDocumentInputSchema = z.object({
  templateId: z.uuid(),
  patientId: z.uuid(),
  planId: z.uuid().optional(),
  professionalId: z.uuid().optional(),
  title: z.string().trim().min(3).max(160),
});

export const documentStatusSchema = z.enum(["draft", "issued", "cancelled"]);

export const documentTransitionSchema = z.enum(["issued", "cancelled"]);

export const documentSignatureInputSchema = z.object({
  signedOn: z.iso.date(),
  responsibleName: z.string().trim().min(2).max(160),
  fileName: z.string().trim().min(1).max(200),
  mimeType: z.enum(["application/pdf", "image/png", "image/jpeg"]),
  sizeInBytes: z.number().int().min(1).max(5242880),
  contentBase64: z.string().min(1).max(7000000),
});

/** Campos que a emissão de documentos substitui (memória e PostgreSQL). */
export const documentTemplateVariables = [
  { key: "paciente_nome", label: "Nome do cliente", example: "Maria da Silva" },
  { key: "plano_nome", label: "Plano", example: "Pilates 2x por semana" },
  {
    key: "plano_servicos",
    label: "Serviços do plano",
    example: "Pilates (8 sessões)",
  },
  {
    key: "profissional_nome",
    label: "Profissional",
    example: "Beatriz Lima",
  },
  {
    key: "profissional_crefito",
    label: "CREFITO do profissional",
    example: "CREFITO-3 223344-F",
  },
  { key: "data_emissao", label: "Data de hoje", example: "17/10/2026" },
  { key: "clinica_nome", label: "Nome da clínica", example: "Studios Aryana" },
] as const;

export type DocumentTemplateVariable =
  (typeof documentTemplateVariables)[number]["key"];

/** Texto do modelo com os campos preenchidos pelos valores de exemplo (prévia). */
export function previewDocumentTemplate(body: string): string {
  return documentTemplateVariables.reduce(
    (text, variable) =>
      text.replaceAll(`{{${variable.key}}}`, variable.example),
    body,
  );
}
