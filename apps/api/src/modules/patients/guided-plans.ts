import type {
  GuidedPatientInput,
  GuidedPatientResult,
  Patient,
} from "@crm/contracts";

type GuidedPlanStep = Extract<GuidedPatientInput, { next: "plan" }>;

type CreatedGuidedPlan = NonNullable<
  GuidedPatientResult["additionalPlans"]
>[number];

/** Planos de assinatura do cadastro guiado, na ordem: o principal e depois os adicionais. */
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
): GuidedPatientResult {
  const [first, ...rest] = created;
  return {
    patient,
    ...first,
    ...(input.additionalPlans?.length ? { additionalPlans: rest } : {}),
  };
}
