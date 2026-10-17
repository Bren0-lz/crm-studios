import {
  addDaysToIsoDate,
  patientTagKey,
  planDisplayStatus,
  type PatientPlan,
} from "@crm/contracts";

export const planKindLabels: Record<PatientPlan["kind"], string> = {
  single: "Avulso",
  fixed_package: "Pacote fixo",
  recurring: "Recorrente",
  custom: "Personalizado",
};

export type PlanListFilter =
  "all" | "active" | "paused" | "exhausted" | "expiring";

export const planListFilterLabels: Record<PlanListFilter, string> = {
  all: "Todos",
  active: "Ativo",
  paused: "Pausado",
  exhausted: "Esgotado",
  expiring: "Vencendo",
};

/** "Vencendo" = plano ativo com validade de hoje até daqui a 15 dias. */
export const PLAN_EXPIRING_DAYS = 15;

export function planMatchesFilter(
  plan: PatientPlan,
  filter: PlanListFilter,
  today: string,
): boolean {
  const status = planDisplayStatus(plan);
  if (filter === "all") return true;
  if (filter === "expiring")
    return (
      status === "active" &&
      !!plan.validUntil &&
      plan.validUntil >= today &&
      plan.validUntil <= addDaysToIsoDate(today, PLAN_EXPIRING_DAYS)
    );
  return status === filter;
}

/** Busca pelo nome do cliente, sem diferenciar acentos nem maiúsculas. */
export function planMatchesSearch(plan: PatientPlan, search: string): boolean {
  const term = patientTagKey(search);
  return !term || patientTagKey(plan.patientName).includes(term);
}

/**
 * Subtítulo do cartão sem repetir o serviço: "Dançaterapia 2x" quando o nome já cita o
 * serviço; com vários serviços, o nome seguido da lista.
 */
export function planSubtitle(plan: PatientPlan): string {
  const names =
    plan.services.length > 1
      ? plan.services.map((entry) => entry.serviceName ?? "").filter(Boolean)
      : [plan.serviceName].filter(Boolean);
  const planKey = patientTagKey(plan.name);
  const missing = names.filter(
    (name) => !planKey.includes(patientTagKey(name)),
  );
  return missing.length ? `${plan.name} · ${missing.join(", ")}` : plan.name;
}
