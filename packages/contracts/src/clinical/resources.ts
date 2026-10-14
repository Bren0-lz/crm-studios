import { z } from "zod";
import { assessmentFieldSchema, assessmentValueSchema } from "./model.js";

export const clinicalResourceKindSchema = z.enum([
  "equipment",
  "exercise",
  "evolution_template",
  "evolution",
  "training",
  "training_execution",
  "clinical_document",
]);
export type ClinicalResourceKind = z.infer<typeof clinicalResourceKindSchema>;
const name = z.string().trim().min(2).max(160),
  text = z.string().trim().max(5000);
const image = z
  .string()
  .max(7_000_000)
  .regex(/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+=*$/)
  .optional()
  .or(z.literal(""));
const common = { name, active: z.boolean().default(true) };
export const clinicalResourceInputSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("equipment"),
    ...common,
    description: text.default(""),
    image,
  }),
  z.object({
    kind: z.literal("exercise"),
    ...common,
    description: text.default(""),
    equipmentId: z.uuid().optional().or(z.literal("")),
    muscleGroupId: z.uuid().optional().or(z.literal("")),
    level: z.string().max(80).optional(),
    image,
    videoUrl: z
      .url()
      .refine((value) => /^https?:\/\//.test(value))
      .optional()
      .or(z.literal("")),
  }),
  z.object({
    kind: z.literal("evolution_template"),
    ...common,
    format: z.enum(["soap", "text", "questionnaire"]),
    status: z.enum(["draft", "published"]).default("draft"),
    body: text.default(""),
    soap: z
      .object({
        subjective: text.default(""),
        objective: text.default(""),
        assessment: text.default(""),
        plan: text.default(""),
      })
      .optional(),
    fields: z.array(assessmentFieldSchema).max(60).default([]),
  }),
  z.object({
    kind: z.literal("evolution"),
    name,
    patientId: z.uuid(),
    sourceType: z.enum(["appointment", "group_attendance"]),
    sourceId: z.uuid(),
    professionalId: z.uuid(),
    templateId: z.uuid().optional().or(z.literal("")),
    format: z.enum(["soap", "text", "questionnaire"]),
    body: text.default(""),
    subjective: text.default(""),
    objective: text.default(""),
    assessment: text.default(""),
    plan: text.default(""),
    values: z.record(z.string(), assessmentValueSchema).default({}),
    equipmentIds: z.array(z.uuid()).max(30).default([]),
    exerciseIds: z.array(z.uuid()).max(60).default([]),
  }),
  z.object({
    kind: z.literal("training"),
    ...common,
    patientId: z.uuid(),
    professionalId: z.uuid(),
    validFrom: z.iso.date(),
    validUntil: z.iso.date().optional().or(z.literal("")),
    sessionLimit: z.number().int().min(1).max(1000).optional(),
    notes: text.default(""),
    exercises: z
      .array(
        z.object({
          exerciseId: z.uuid(),
          sets: z.number().int().min(1).max(100),
          repetitions: z.string().trim().min(1).max(80),
          restSeconds: z.number().int().min(0).max(3600).default(0),
          notes: z.string().max(1000).default(""),
        }),
      )
      .min(1)
      .max(60),
  }),
  z.object({
    kind: z.literal("training_execution"),
    name,
    patientId: z.uuid(),
    trainingId: z.uuid(),
    startedAt: z.iso.datetime({ offset: true }),
    endedAt: z.iso.datetime({ offset: true }).optional(),
    notes: text.default(""),
  }),
  z.object({
    kind: z.literal("clinical_document"),
    name,
    patientId: z.uuid(),
    professionalId: z.uuid(),
    documentKind: z.enum(["report", "prescription"]),
    body: text.min(10),
  }),
]);
export type ClinicalResourceInput = z.infer<typeof clinicalResourceInputSchema>;
export interface ClinicalSource {
  id: string;
  type: "appointment" | "group_attendance";
  patientId: string;
  patientName: string;
  professionalId: string;
  professionalName: string;
  startsAt: string;
}
export interface ClinicalResource {
  originStartsAt?: string;
  id: string;
  clinicId: string;
  kind: ClinicalResourceKind;
  name: string;
  patientId?: string;
  data: ClinicalResourceInput;
  status: "draft" | "published" | "finalized" | "active" | "inactive";
  familyId: string;
  version: number;
  authorId: string;
  authorName: string;
  createdAt: string;
  updatedAt: string;
  history: Array<{
    templateSnapshot?: ClinicalResource["templateSnapshot"];
    version: number;
    data: ClinicalResourceInput;
    authorName: string;
    occurredAt: string;
  }>;
  templateSnapshot?: {
    name: string;
    version: number;
    fields: z.infer<typeof assessmentFieldSchema>[];
  };
}
export const clinicalResourceLabels: Record<ClinicalResourceKind, string> = {
  equipment: "Aparelhos",
  exercise: "Exercícios e procedimentos",
  evolution_template: "Modelos de evolução",
  evolution: "Evoluções",
  training: "Treinos",
  training_execution: "Treinos executados",
  clinical_document: "Relatórios e prescrições",
};
