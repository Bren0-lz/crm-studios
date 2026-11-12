import {
  extraFieldsSchema,
  leadPatientProfile,
  patientInputSchema,
  patientOptionalContactShape,
  type Lead,
  type LeadConversionInput,
  type Patient,
  type PatientImportInput,
  type PatientInput,
  withoutAutomaticPatientTags,
} from "@crm/contracts";
import { DomainError } from "../../repository.js";

export const leadNotFoundError = () =>
  new DomainError("LEAD_NOT_FOUND", "Lead não encontrado.", 404);

export const leadAlreadyConvertedError = () =>
  new DomainError(
    "LEAD_ALREADY_CONVERTED",
    "Este lead já foi convertido em cliente.",
    409,
  );

/** LC1: o cadastro guiado vindo do lead não vende para cliente já cadastrado (mesmo CPF). */
export const leadPatientExistsError = (patientName: string) =>
  new DomainError(
    "LEAD_PATIENT_EXISTS",
    `Já existe um cliente com este CPF (${patientName}). Converta só o cadastro e venda o plano na ficha do cliente.`,
    409,
  );

/**
 * LC1: cadastro guiado vindo do lead. O formulário já vem preenchido com o lead; aqui entram o
 * que só a conversão leva: etiquetas do lead (mais "Convertido do CRM"), interesses e o
 * "Outros" (`extraFields`).
 */
export function withLeadConversionExtras(
  patient: PatientInput,
  lead: Lead,
): PatientImportInput {
  const tags = [
    ...new Set([
      ...withoutAutomaticPatientTags(patient.tags),
      ...withoutAutomaticPatientTags(lead.tags),
      "Convertido do CRM",
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
      ...(patient.interests ?? []),
      ...(lead.interests ?? []),
      lead.interest,
    ]),
  ].filter((item) => item.trim() !== "");
  if (
    interests.length > 30 ||
    interests.some((interest) => interest.length > 80)
  )
    throw new DomainError(
      "LEAD_INTEREST_REVIEW",
      "Revise os interesses antes da conversão: até 30 itens, com até 80 caracteres cada.",
      409,
    );
  return {
    ...patient,
    tags,
    interests,
    ...(lead.extraFields ? { extraFields: lead.extraFields } : {}),
  };
}
/** Junta ao lead os dados informados na conversão (campos vazios não apagam nada). */
export function withConversionInput(
  lead: Lead,
  input?: LeadConversionInput,
): Lead {
  const filled = Object.fromEntries(
    Object.entries(input ?? {}).filter(
      ([, value]) =>
        typeof value === "boolean" ||
        (typeof value === "string" && value.trim() !== ""),
    ),
  );
  return { ...lead, ...filled };
}

export function leadConversionData(
  lead: Lead,
  existing?: Patient,
): PatientImportInput {
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
      ...withoutAutomaticPatientTags(existing?.tags ?? []),
      ...withoutAutomaticPatientTags(lead.tags),
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
  // CD1: o cliente novo nasce com WhatsApp e contato de emergência; quem já existia (cadastro
  // antigo) pode seguir sem eles, como na edição.
  if (
    !existing &&
    (!fields.whatsapp ||
      !fields.emergencyContactName ||
      !fields.emergencyContactPhone ||
      !fields.emergencyContactWhatsapp)
  )
    throw new DomainError(
      "LEAD_CONTACT_REQUIRED",
      "Informe o WhatsApp e o contato de emergência antes de converter o lead.",
      400,
    );
  const schema = (
    existing
      ? patientInputSchema.extend(patientOptionalContactShape)
      : patientInputSchema
  ).extend({ extraFields: extraFieldsSchema.optional() });
  return schema.parse({
    ...fields,
    fullName: existing?.fullName ?? lead.fullName,
    phone: existing?.phone ?? lead.phone,
    email: existing?.email || lead.email,
    notes: existing?.notes || lead.notes,
    tags,
    interests,
    // Entrega 10: o "Outros" do lead vai para o cliente (mesclado com o que ele já tem).
    ...(lead.extraFields ? { extraFields: lead.extraFields } : {}),
  });
}
