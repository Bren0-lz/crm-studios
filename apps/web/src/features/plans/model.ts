import {
  addDaysToIsoDate,
  isTabCreditPlan,
  nextPlanPeriod,
  patientTagKey,
  paymentMethodLabels,
  planDisplayStatus,
  planDisplayStatusLabels,
  planTypeKind,
  tabCreditAwaitingLabel,
  type PatientPlan,
  type PlanTemplate,
} from "@crm/contracts";
import { currency, shortDate } from "../../shared/lib/formatting";

export const planKindLabels: Record<PatientPlan["kind"], string> = {
  single: "Avulso",
  fixed_package: "Pacote fixo",
  recurring: "Recorrente",
  custom: "Personalizado",
};

/** Atalho da ficha do cliente: avulso (sessões soltas) ou recorrente (pacotes e períodos). */
export type PlanCatalogKind = "single" | "recurring";

export function planTemplateCatalogKind(
  template: PlanTemplate,
): PlanCatalogKind {
  const kind = template.planType
    ? planTypeKind(template.planType)
    : template.kind;
  return kind === "single" ? "single" : "recurring";
}

export type PlanListFilter =
  | "all"
  | "active"
  | "paused"
  | "exhausted"
  | "expired"
  | "cancelled"
  | "tab_credit"
  | "expiring";

export const planListFilterLabels: Record<PlanListFilter, string> = {
  all: "Todos",
  active: "Ativo",
  paused: "Pausado",
  exhausted: "Esgotado",
  expired: "Expirado",
  cancelled: "Cancelado",
  tab_credit: "Pago na comanda",
  expiring: "Vencendo",
};

/**
 * Filtros que dividem a lista: cada plano entra em exatamente um, e a soma dá "Todos".
 * Crédito pago na comanda não é plano contratado: fica só em "Pago na comanda" (como no card
 * "planos ativos"). "Vencendo" fica de fora: é um recorte de "Ativo".
 */
export const planPartitionFilters = [
  "active",
  "paused",
  "exhausted",
  "expired",
  "cancelled",
  "tab_credit",
] as const satisfies readonly PlanListFilter[];

/** "Vencendo" = plano ativo com validade de hoje até daqui a 15 dias. */
export const PLAN_EXPIRING_DAYS = 15;

export function planMatchesFilter(
  plan: PatientPlan,
  filter: PlanListFilter,
  today: string,
): boolean {
  const status = planDisplayStatus(plan);
  if (filter === "all") return true;
  if (filter === "tab_credit") return isTabCreditPlan(plan);
  if (isTabCreditPlan(plan)) return false;
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

/** Texto do selo: o crédito da comanda aguarda o atendimento até ser consumido. */
export function planBadgeLabel(
  plan: Pick<PatientPlan, "sourceTabId" | "status" | "remainingSessions">,
): string {
  if (
    plan.sourceTabId &&
    plan.status === "active" &&
    plan.remainingSessions > 0
  )
    return tabCreditAwaitingLabel;
  if (
    plan.sourceTabId &&
    plan.status === "expired" &&
    plan.remainingSessions === 0
  )
    return "Utilizado";
  return planDisplayStatusLabels[planDisplayStatus(plan)];
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

/** Texto da renovação: plano seguinte já criado, automática (com a data) ou manual. */
export function planRenewalLabel(
  plan: PatientPlan,
  plans: PatientPlan[],
): string {
  if (plan.renewedByPlanId) {
    const next = plans.find((item) => item.id === plan.renewedByPlanId);
    return next
      ? `Renovado a partir de ${shortDate.format(new Date(`${next.validFrom}T12:00:00`))}`
      : "Renovado";
  }
  if (plan.autoRenew && plan.validUntil) {
    return `Automática em ${shortDate.format(new Date(`${nextPlanPeriod(plan)!.validFrom}T12:00:00`))}`;
  }
  return "Manual";
}

/** Como o plano é pago: forma combinada e quantidade de parcelas ("Cartão · 3 parcelas"). */
export function planPaymentTerms(
  plan: Pick<PatientPlan, "paymentMethod" | "installments" | "kind">,
) {
  const method = plan.paymentMethod
    ? paymentMethodLabels[plan.paymentMethod]
    : "A combinar";
  if (plan.kind === "recurring") return `${method} · 1 cobrança por ciclo`;
  return `${method} · ${plan.installments === 1 ? "à vista" : `${plan.installments} parcelas`}`;
}

/** Situação das parcelas: "1 de 3 pagas · R$ 200,00 em aberto (1 vencida)". */
export function planPaymentProgress(plan: Pick<PatientPlan, "paymentSummary">) {
  const summary = plan.paymentSummary;
  if (!summary) return "";
  const paid = `${summary.paidCount} de ${summary.installmentCount} ${summary.installmentCount === 1 ? "paga" : "pagas"}`;
  if (!summary.openCount) return `${paid} · quitado`;
  const overdue = summary.overdueCount
    ? ` (${summary.overdueCount} ${summary.overdueCount === 1 ? "vencida" : "vencidas"})`
    : "";
  return `${paid} · ${currency.format(summary.openInCents / 100)} em aberto${overdue}`;
}
