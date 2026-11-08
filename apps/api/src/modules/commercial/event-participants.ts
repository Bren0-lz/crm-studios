import {
  matchingContactFields,
  type ContactDuplicateCandidate,
  type ExtraFields,
  type LeadInput,
} from "@crm/contracts";

/** Participante vindo da planilha: o lead e o "Outros" da linha. */
export type EventParticipantImport = LeadInput & { extraFields?: ExtraFields };

/** Cliente para o vínculo: `canonicalId` segue o `merged_into_patient_id`. */
export interface EventImportPatient extends ContactDuplicateCandidate {
  canonicalId: string;
}

export type EventParticipantPlan =
  | { kind: "create"; input: EventParticipantImport }
  | { kind: "link"; input: EventParticipantImport; patientId: string }
  | { kind: "skip" };

export interface EventImportCounts {
  created: number;
  linked: number;
  skipped: number;
}

const contactOf = (input: EventParticipantImport) => ({
  phone: input.phone,
  email: input.email,
  cpf: input.cpf,
});

/**
 * EN1 (entrega 1): decide cada linha da importação de participantes.
 * - Já é participante do evento (mesmo telefone, e-mail ou CPF, comparados normalizados; inclui
 *   as linhas anteriores do arquivo) → ignorada.
 * - Já é cliente (mesma regra) → participante criado já ligado ao cliente, sem cliente novo.
 * - Senão → participante novo. Só o nome não basta para dizer que é a mesma pessoa.
 */
export function planEventParticipants(
  inputs: readonly EventParticipantImport[],
  patients: readonly EventImportPatient[],
  participants: readonly ContactDuplicateCandidate[],
): EventParticipantPlan[] {
  const seen: ContactDuplicateCandidate[] = [...participants];
  return inputs.map((input, index) => {
    const query = contactOf(input);
    if (seen.some((item) => matchingContactFields(query, item).length))
      return { kind: "skip" };
    seen.push({ id: `row-${index}`, fullName: input.fullName, ...query });
    const patient = patients.find(
      (item) => matchingContactFields(query, item).length,
    );
    return patient
      ? { kind: "link", input, patientId: patient.canonicalId }
      : { kind: "create", input };
  });
}

export function countEventParticipantPlans(
  plans: readonly EventParticipantPlan[],
): EventImportCounts {
  return {
    created: plans.filter((plan) => plan.kind === "create").length,
    linked: plans.filter((plan) => plan.kind === "link").length,
    skipped: plans.filter((plan) => plan.kind === "skip").length,
  };
}
