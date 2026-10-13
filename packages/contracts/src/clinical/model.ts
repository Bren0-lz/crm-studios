import { z } from "zod";

export const clinicalRecordStatusSchema = z.enum(["draft", "finalized"]);

export const clinicalRecordInputSchema = z.object({
  appointmentId: z.uuid(),
  subjective: z.string().trim().max(5000).default(""),
  objective: z.string().trim().max(5000).default(""),
  assessment: z.string().trim().max(5000).default(""),
  plan: z.string().trim().max(5000).default(""),
  painScale: z.number().int().min(0).max(10).optional(),
});

export const assessmentFieldSchema = z.object({
  key: z
    .string()
    .trim()
    .regex(/^[a-z][a-z0-9_]*$/)
    .max(60),
  label: z.string().trim().min(2).max(120),
  type: z.enum(["text", "number", "scale", "boolean"]),
  required: z.boolean().default(false),
  unit: z.string().trim().max(30).optional().or(z.literal("")),
  min: z.number().optional(),
  max: z.number().optional(),
});

export const assessmentTemplateInputSchema = z.object({
  name: z.string().trim().min(3).max(120),
  specialty: z.string().trim().min(2).max(100),
  fields: z.array(assessmentFieldSchema).min(1).max(60),
});

export const assessmentValueSchema = z.union([
  z.string().max(5000),
  z.number(),
  z.boolean(),
]);

export const clinicalAssessmentInputSchema = z.object({
  patientId: z.uuid(),
  templateId: z.uuid(),
  appointmentId: z.uuid().optional().or(z.literal("")),
  values: z.record(z.string(), assessmentValueSchema),
  notes: z.string().trim().max(5000).optional().or(z.literal("")),
});

export const therapeuticGoalInputSchema = z.object({
  patientId: z.uuid(),
  title: z.string().trim().min(3).max(160),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
  baselineValue: z.number().optional(),
  targetValue: z.number().optional(),
  unit: z.string().trim().max(30).optional().or(z.literal("")),
  targetDate: z.iso.date().optional().or(z.literal("")),
});

export const therapeuticGoalStatusSchema = z.enum([
  "active",
  "achieved",
  "cancelled",
]);

export const clinicalMeasurementInputSchema = z.object({
  patientId: z.uuid(),
  goalId: z.uuid().optional().or(z.literal("")),
  name: z.string().trim().min(2).max(120),
  value: z.number(),
  unit: z.string().trim().min(1).max(30),
  measuredAt: z.iso.datetime({ offset: true }),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
});

export const treatmentClosureInputSchema = z.object({
  patientId: z.uuid(),
  kind: z.enum(["discharge", "referral", "abandonment"]),
  summary: z.string().trim().min(10).max(5000),
  recommendations: z.string().trim().max(3000).optional().or(z.literal("")),
  occurredAt: z.iso.datetime({ offset: true }),
});

export const clinicalAttachmentInputSchema = z.object({
  patientId: z.uuid(),
  fileName: z.string().trim().min(1).max(180),
  mimeType: z.enum(["application/pdf", "image/png", "image/jpeg"]),
  sizeInBytes: z
    .number()
    .int()
    .min(1)
    .max(5 * 1024 * 1024),
  contentBase64: z.string().min(4).max(7_000_000),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
});

export const clinicalAddendumInputSchema = z.object({
  clinicalRecordId: z.uuid(),
  reason: z.string().trim().min(5).max(500),
  content: z.string().trim().min(10).max(5000),
});
