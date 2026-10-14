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
