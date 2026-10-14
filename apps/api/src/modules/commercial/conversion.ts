import {
  leadPatientProfile,
  patientInputSchema,
  type Lead,
  type Patient,
  type PatientInput,
} from "@crm/contracts";
import { DomainError } from "../../repository.js";
export function leadConversionData(
  lead: Lead,
  existing?: Patient,
): PatientInput {
  const fields: Record<string, unknown> = { ...leadPatientProfile(lead) };
  if (existing)
    for (const [key, value] of Object.entries(leadPatientProfile(existing)))
      if (
        value !== undefined &&
        value !== "" &&
        (!Array.isArray(value) || value.length)
      )
        fields[key] = value;
  const tags = [
    ...new Set([
      ...(existing?.tags ?? []),
      ...lead.tags,
      ...(lead.tags.length < 20 ? ["Convertido do CRM"] : []),
    ]),
  ];
  if (tags.length > 20)
    throw new DomainError(
      "LEAD_TAG_LIMIT",
      "Revise as etiquetas do cliente antes de converter: a união excede 20 etiquetas.",
      409,
    );
  const interests = [
    ...new Set([
      ...(existing?.interests ?? []),
      ...(lead.interests ?? []),
      lead.interest,
    ]),
  ];
  if (
    interests.length > 30 ||
    interests.some((interest) => interest.length > 80)
  )
    throw new DomainError(
      "LEAD_INTEREST_REVIEW",
      "Revise os interesses antes da conversão: até 30 itens, com até 80 caracteres cada.",
      409,
    );
  return patientInputSchema.parse({
    ...fields,
    fullName: existing?.fullName ?? lead.fullName,
    phone: existing?.phone ?? lead.phone,
    email: existing?.email || lead.email,
    notes: existing?.notes || lead.notes,
    tags,
    interests,
  });
}
