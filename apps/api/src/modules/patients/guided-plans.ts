import type {
  GuidedPatientInput,
  GuidedPatientResult,
  Patient,
  WaitlistEntry,
} from "@crm/contracts";

type GuidedPlanStep = Extract<GuidedPatientInput, { next: "plan" }>;

type CreatedGuidedPlan = NonNullable<
  GuidedPatientResult["additionalPlans"]
>[number];

/**
 * Planos do passo "plan" do cadastro guiado, na ordem: o principal e depois os adicionais
 * (assinaturas e serviços avulsos; avulso não tem turma).
 */
export function guidedSubscriptions(input: GuidedPatientInput) {
  if (input.next !== "plan") return [];
  return [
    { plan: input.plan, groupId: input.groupId },
    ...(input.additionalPlans ?? []),
  ];
}

/** O primeiro plano criado fica em `plan`/`enrollment`; os demais em `additionalPlans`. */
export function guidedPlansResult(
  patient: Patient,
  created: CreatedGuidedPlan[],
  input: GuidedPlanStep,
  waitlistEntries: WaitlistEntry[] = [],
): GuidedPatientResult {
  const [first, ...rest] = created;
  return {
    patient,
    ...first,
    ...(input.additionalPlans?.length ? { additionalPlans: rest } : {}),
    ...(waitlistEntries.length ? { waitlistEntries } : {}),
  };
}

/** Serviços de turma cheia do cadastro guiado que vão para a Lista de espera (TW3). */
export function guidedWaitlist(input: GuidedPatientInput) {
  return input.next === "plan" || input.next === "waitlist"
    ? (input.waitlist ?? [])
    : [];
}
