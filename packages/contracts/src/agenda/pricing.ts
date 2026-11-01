import { autoCampaignDiscountInCents } from "../communications/model.js";
import type { AutoCampaignPromotionOffer } from "../communications/types.js";
import {
  isSinglePlanTemplate,
  sessionValueInCents,
  singlePlanSessionPrices,
} from "../plans/model.js";
import type { PatientPlan, PlanTemplate } from "../plans/types.js";

/** Plano vigente do cliente com saldo no serviço: as próximas sessões saem dele. */
export interface AppointmentPlanPrice {
  planId: string;
  planTemplateId?: string | undefined;
  planName: string;
  /** Saldo atual do serviço no plano. */
  remainingSessions: number;
  /** Valor de uma sessão do serviço no plano (valor ÷ sessões contratadas). */
  sessionValueInCents: number;
}

/** Plano avulso ativo do serviço: valor de referência das sessões sem plano. */
export interface AppointmentSinglePrice {
  planTemplateId: string;
  planName: string;
  sessionValueInCents: number;
}

/** `GET /appointments/pricing`: de onde sai o valor de cada sessão do serviço para o cliente. */
export interface AppointmentPricing {
  serviceId: string;
  /** Na ordem em que o saldo é consumido (vence primeiro, sai primeiro). */
  plans: AppointmentPlanPrice[];
  single?: AppointmentSinglePrice | undefined;
}

/**
 * Monta o `AppointmentPricing`: planos ativos e vigentes hoje com saldo no serviço (mesma
 * ordem do consumo: validade mais próxima primeiro) e o plano avulso do serviço.
 */
export function appointmentPricing(
  serviceId: string,
  plans: readonly PatientPlan[],
  templates: readonly PlanTemplate[],
  today: string,
): AppointmentPricing {
  const planPrices = plans
    .filter(
      (plan) =>
        plan.status === "active" &&
        plan.validFrom <= today &&
        (!plan.validUntil || plan.validUntil >= today),
    )
    .flatMap((plan) => {
      const service = (plan.services ?? []).find(
        (item) => item.serviceId === serviceId && item.remainingSessions > 0,
      );
      return service ? [{ plan, service }] : [];
    })
    .sort((a, b) =>
      (a.plan.validUntil || "9999-12-31").localeCompare(
        b.plan.validUntil || "9999-12-31",
      ),
    );
  const singlePrice = singlePlanSessionPrices(templates).get(serviceId);
  const singleTemplate =
    singlePrice === undefined
      ? undefined
      : [...templates]
          .filter(
            (template) =>
              template.active &&
              isSinglePlanTemplate(template) &&
              template.services.some(
                (item) =>
                  item.serviceId === serviceId && item.totalSessions > 0,
              ),
          )
          .sort(
            (a, b) =>
              a.createdAt.localeCompare(b.createdAt) ||
              a.id.localeCompare(b.id),
          )[0];
  return {
    serviceId,
    plans: planPrices.map(({ plan, service }) => ({
      planId: plan.id,
      ...(plan.planTemplateId ? { planTemplateId: plan.planTemplateId } : {}),
      planName: plan.name,
      remainingSessions: service.remainingSessions,
      sessionValueInCents: sessionValueInCents(service, 0),
    })),
    ...(singleTemplate && singlePrice !== undefined
      ? {
          single: {
            planTemplateId: singleTemplate.id,
            planName: singleTemplate.name,
            sessionValueInCents: singlePrice,
          },
        }
      : {}),
  };
}

export interface AppointmentSummaryLine {
  /** Posição da ocorrência (0 = a primeira, que leva a promoção). */
  index: number;
  startsAt: string;
  /** `plan`: sai do saldo de um plano do cliente; `single`: valor do plano avulso. */
  source: "plan" | "single" | "none";
  planName?: string | undefined;
  planTemplateId?: string | undefined;
  valueInCents: number;
  discountInCents: number;
}

export interface AppointmentSummary {
  lines: AppointmentSummaryLine[];
  subtotalInCents: number;
  discountInCents: number;
  totalInCents: number;
  /**
   * A promoção marcada tem desconto, mas ele não vale para o plano da 1ª ocorrência
   * (a promoção fica sempre com a 1ª ocorrência).
   */
  discountNotApplicable: boolean;
}

/** O desconto da promoção vale para o plano? Lista vazia = qualquer plano. */
export function promotionAppliesToPlan(
  promotion: Pick<AutoCampaignPromotionOffer, "planTemplateIds">,
  planTemplateId: string | undefined,
): boolean {
  const allowed = promotion.planTemplateIds ?? [];
  return (
    allowed.length === 0 ||
    (planTemplateId !== undefined && allowed.includes(planTemplateId))
  );
}

/**
 * Resumo do agendamento (estilo sacola): valor de cada ocorrência — do saldo dos planos do
 * cliente, na ordem de consumo, e depois do plano avulso —, o desconto da promoção na 1ª
 * ocorrência (se valer para o plano dela) e o total.
 */
export function appointmentSummary({
  starts,
  pricing,
  promotion,
}: {
  starts: readonly string[];
  pricing: AppointmentPricing;
  promotion?:
    | Pick<AutoCampaignPromotionOffer, "discount" | "planTemplateIds">
    | undefined;
}): AppointmentSummary {
  const balances = pricing.plans.map((plan) => plan.remainingSessions);
  let discountNotApplicable = false;
  const lines = starts.map((startsAt, index): AppointmentSummaryLine => {
    const planIndex = balances.findIndex((balance) => balance > 0);
    const plan = planIndex >= 0 ? pricing.plans[planIndex] : undefined;
    if (plan) balances[planIndex]! -= 1;
    const base = plan
      ? {
          source: "plan" as const,
          planName: plan.planName,
          planTemplateId: plan.planTemplateId,
          valueInCents: plan.sessionValueInCents,
        }
      : pricing.single
        ? {
            source: "single" as const,
            planName: pricing.single.planName,
            planTemplateId: pricing.single.planTemplateId,
            valueInCents: pricing.single.sessionValueInCents,
          }
        : { source: "none" as const, valueInCents: 0 };
    let discountInCents = 0;
    if (index === 0 && promotion?.discount) {
      if (promotionAppliesToPlan(promotion, base.planTemplateId))
        discountInCents = autoCampaignDiscountInCents(
          promotion.discount,
          base.valueInCents,
        );
      else discountNotApplicable = true;
    }
    return { index, startsAt, ...base, discountInCents };
  });
  const subtotalInCents = lines.reduce(
    (sum, line) => sum + line.valueInCents,
    0,
  );
  const discountInCents = lines.reduce(
    (sum, line) => sum + line.discountInCents,
    0,
  );
  return {
    lines,
    subtotalInCents,
    discountInCents,
    totalInCents: subtotalInCents - discountInCents,
    discountNotApplicable,
  };
}
