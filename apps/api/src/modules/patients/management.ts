import {
  mergedPatientInput,
  patientEditableKeys,
  type Patient,
  type PatientMergeInput,
  type PatientMergePreview,
} from "@crm/contracts";
import { DomainError } from "../../repository.js";

export function mergePreview(
  source: Patient | undefined,
  target: Patient | undefined,
  conflicts: string[],
): PatientMergePreview {
  if (
    !source ||
    !target ||
    source.id === target.id ||
    source.clinicId !== target.clinicId
  )
    throw new DomainError("PATIENT_NOT_FOUND", "Cliente não encontrado.", 404);
  if (source.mergedIntoPatientId || target.mergedIntoPatientId)
    throw new DomainError(
      "PATIENT_ALREADY_MERGED",
      "Use o cadastro principal deste cliente.",
      409,
    );
  const fields = patientEditableKeys
    .filter(
      (key) =>
        !["tags", "interests", "notes"].includes(key) &&
        source[key] !== undefined &&
        target[key] !== undefined &&
        source[key] !== "" &&
        target[key] !== "" &&
        source[key] !== target[key],
    )
    .map((key) => ({
      key,
      source: String(source[key]),
      target: String(target[key]),
    }));
  return {
    source: structuredClone(source),
    target: structuredClone(target),
    fields,
    conflicts,
  };
}
export function validateMerge(
  preview: PatientMergePreview,
  input: PatientMergeInput,
) {
  if (preview.conflicts.length)
    throw new DomainError(
      "PATIENT_MERGE_CONFLICT",
      "Resolva os conflitos antes de mesclar.",
      409,
      { conflicts: preview.conflicts },
    );
  if (preview.fields.some((field) => !input.fieldSources[field.key]))
    throw new DomainError(
      "PATIENT_MERGE_FIELD_REQUIRED",
      "Escolha os dados que devem prevalecer.",
      400,
    );
  return mergedPatientInput(preview.source, preview.target, input.fieldSources);
}
export function inactivityCutoff(today: string, months: number) {
  const [year, month, day] = today.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1 - months, 1));
  const lastDay = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
  ).getUTCDate();
  date.setUTCDate(Math.min(day!, lastDay));
  return date.toISOString().slice(0, 10);
}
