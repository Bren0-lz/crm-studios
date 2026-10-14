import { z } from "zod";
import { patientInputSchema } from "./model.js";
import type { Patient } from "./types.js";

export const patientStatusUpdateSchema = z.object({
  status: z.enum(["active", "inactive"]),
});
export const patientInactivationPreviewSchema = z.object({
  months: z.coerce.number().int().min(3).max(120),
});
export const patientInactivationSchema =
  patientInactivationPreviewSchema.extend({
    patientIds: z.array(z.uuid()).min(1).max(1000),
  });
export const patientMergePreviewSchema = z
  .object({ sourceId: z.uuid(), targetId: z.uuid() })
  .refine(
    (input) => input.sourceId !== input.targetId,
    "Escolha dois clientes diferentes.",
  );
export const patientMergeSchema = patientMergePreviewSchema.safeExtend({
  fieldSources: z.record(z.string(), z.enum(["source", "target"])),
});
export type PatientMergeInput = z.infer<typeof patientMergeSchema>;
export interface PatientMergePreview {
  source: Patient;
  target: Patient;
  fields: Array<{ key: string; source: string; target: string }>;
  conflicts: string[];
}
export const patientEditableKeys = Object.keys(
  patientInputSchema.shape,
) as (keyof z.infer<typeof patientInputSchema>)[];
export function mergedPatientInput(
  source: Patient,
  target: Patient,
  selections: PatientMergeInput["fieldSources"],
): z.infer<typeof patientInputSchema> {
  const result: Record<string, unknown> = {};
  for (const key of patientEditableKeys) {
    result[key] =
      selections[key] === "source"
        ? source[key]
        : selections[key] === "target"
          ? target[key]
          : target[key] === undefined || target[key] === ""
            ? source[key]
            : target[key];
  }
  result.tags = [...new Set([...target.tags, ...source.tags])];
  result.interests = [
    ...new Set([...(target.interests ?? []), ...(source.interests ?? [])]),
  ];
  result.notes = [target.notes, source.notes]
    .filter(Boolean)
    .join("\n")
    .slice(0, 2000);
  return patientInputSchema.parse(result);
}
