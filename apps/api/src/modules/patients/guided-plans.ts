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
    { plan: input.plan, groupId: input.groupId, document: input.document },
    ...(input.additionalPlans ?? []),
  ];
}

/**
 * Planos vendidos no cadastro guiado (avulso do passo `single` ou os do passo `plan`), com o
 * documento para assinar e as sessões reservadas de cada um.
 */
export function guidedSales(input: GuidedPatientInput) {
  if (input.next === "single")
    return [
      {
        plan: { ...input.plan, kind: "single" as const },
        groupId: undefined,
        document: input.document,
        appointments: input.appointments ?? [],
      },
    ];
  return guidedSubscriptions(input).map((item) => ({
    ...item,
    appointments:
      ("appointments" in item ? item.appointments : undefined) ?? [],
  }));
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
