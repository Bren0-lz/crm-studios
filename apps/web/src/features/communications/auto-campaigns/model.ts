import {
  autoCampaignBlockedReasonLabels,
  autoCampaignCooldownUnitLabels,
  autoCampaignLeadOptionalTriggers,
  autoCampaignLeadTriggers,
  autoCampaignSkipReasonLabels,
  autoCampaignTriggerSchema,
  autoCampaignTriggerTiming,
  autoCampaignTriggerVariables,
  type AutoCampaign,
  type AutoCampaignCooldownUnit,
  type AutoCampaignInput,
  type AutoCampaignItem,
  type AutoCampaignItemStatus,
  type AutoCampaignPromotion,
  type AutoCampaignTrigger,
  type LeadAudienceFilter,
} from "@crm/contracts";
import { formatIsoDate } from "../../../shared/lib/formatting";

export const autoCampaignTriggers = autoCampaignTriggerSchema.options;

/** Rótulo e exemplo de cada código das campanhas automáticas (etiquetas verdes do editor). */
const autoCampaignVariableInfo: Record<
  string,
  { label: string; example: string }
> = {
  nome: { label: "Nome", example: "Maria" },
  nome_completo: { label: "Nome completo", example: "Maria Souza" },
  data: { label: "Data", example: "23/10" },
  idade: { label: "Idade", example: "35" },
  hora: { label: "Hora", example: "09:00" },
  endereco: {
    label: "Endereço",
    example: "Rua das Flores, 100 · Centro · Campinas/SP",
  },
  link_mapa: {
    label: "Link do mapa",
    example:
      "https://www.google.com/maps/search/?api=1&query=Rua%20das%20Flores%2C%20100%20Campinas%20SP",
  },
  servico: { label: "Serviço", example: "Pilates" },
  plano: { label: "Plano", example: "Pilates 2x semana" },
  sessoes: { label: "Sessões", example: "2 sessões" },
  parcelas: { label: "Parcelas", example: "2 parcelas" },
  nota: { label: "Nota", example: "5" },
  interesse: { label: "Interesse", example: "Pilates" },
};

/**
 * Códigos oferecidos no editor para o evento: `{{nome}}`, `{{nome_completo}}` e os do
 * evento. Um array por evento, sempre o mesmo (o editor pede `variables` estável).
 */
export const autoCampaignEditorVariables = Object.fromEntries(
  autoCampaignTriggerSchema.options.map((trigger) => [
    trigger,
    ["nome", "nome_completo", ...autoCampaignTriggerVariables[trigger]].map(
      (name) => ({
        code: `{{${name}}}`,
        label: autoCampaignVariableInfo[name]?.label ?? name,
        example: autoCampaignVariableInfo[name]?.example ?? name,
      }),
    ),
  ]),
) as Record<
  AutoCampaignTrigger,
  { code: string; label: string; example: string }[]
>;

export const autoCampaignStatusLabels: Record<AutoCampaignItemStatus, string> =
  {
    pending: "Pendente",
    sent: "Enviada",
    skipped: "Não enviada",
  };

export const autoCampaignStatusPill: Record<AutoCampaignItemStatus, string> = {
  pending: "in_progress",
  sent: "completed",
  skipped: "cancelled",
};

/** Por que a mensagem não foi enviada: motivo escolhido pela equipe ou apontado pelo sistema. */
export function skippedReason(item: AutoCampaignItem) {
  if (item.blockedReason)
    return autoCampaignBlockedReasonLabels[item.blockedReason];
  const delivery = item.delivery;
  if (!delivery?.skipReason) return "";
  const label = autoCampaignSkipReasonLabels[delivery.skipReason];
  return delivery.note ? `${label}: ${delivery.note}` : label;
}

/** Texto do campo do momento: "dias antes", "dias depois" ou "sessões restantes". */
export function offsetUnit(trigger: AutoCampaignTrigger) {
  const timing = autoCampaignTriggerTiming[trigger];
  return timing === "before"
    ? "dias antes"
    : timing === "after"
      ? "dias depois"
      : "sessões restantes";
}

export interface StepDraft {
  key: string;
  id?: string | undefined;
  offset: string;
  message: string;
}

export interface AutoCampaignDraft {
  name: string;
  trigger: AutoCampaignTrigger;
  active: boolean;
  steps: StepDraft[];
  promotional: boolean;
  /** Validade em dias depois do evento ou até uma data final (fora do aniversário). */
  validityMode: PromotionValidityMode;
  validDays: string;
  validUntil: string;
  cooldown: boolean;
  cooldownAmount: string;
  cooldownUnit: AutoCampaignCooldownUnit;
  /** Promoção com desconto (em % ou R$) e os planos em que ele vale. */
  discount: boolean;
  discountType: "percentage" | "amount";
  discountPercent: string;
  discountAmountInCents: number | null;
  /** O desconto vale em planos: em todos ou só nos de `planTemplateIds`. */
  discountOnPlans: boolean;
  planScope: DiscountScope;
  planTemplateIds: string[];
  /** O desconto vale em produtos: em todos ou só nos de `productIds`. */
  discountOnProducts: boolean;
  productScope: DiscountScope;
  productIds: string[];
  /** Aniversário: também os leads com data de nascimento. */
  includeLeads: boolean;
  /** Quais leads entram (aniversário com leads ou eventos de lead). */
  leadFilter: LeadAudienceFilter;
}

/** `all` = em qualquer plano/produto; `selected` = só nos marcados. */
export type DiscountScope = "all" | "selected";

export type PromotionValidityMode = "days" | "date";

/** Aniversário só aceita dias contados do aniversário do cliente. */
export function promotionAllowsFixedDate(trigger: AutoCampaignTrigger) {
  return trigger !== "birthday";
}

export const cooldownUnits = Object.keys(
  autoCampaignCooldownUnitLabels,
) as AutoCampaignCooldownUnit[];

function plural(count: number, singular: string, pluralForm: string) {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

/** "Vale 10 dias · fora da campanha por 2 meses depois de usar". */
export function promotionSummary(promotion: AutoCampaignPromotion) {
  const validity = promotion.validUntil
    ? `Vale até ${formatIsoDate(promotion.validUntil)}`
    : `Vale ${plural(promotion.validDays ?? 0, "dia", "dias")}`;
  if (!promotion.cooldown) return validity;
  const unit = autoCampaignCooldownUnitLabels[promotion.cooldown.unit];
  return `${validity} · fora da campanha por ${plural(
    promotion.cooldown.amount,
    unit.singular,
    unit.plural,
  )} depois de usar`;
}

/**
 * Até quando a promoção vale: `validDays` dias depois do evento (validade de 5 dias: até 5
 * dias depois do evento). Avisa quando alguma mensagem sai depois de a promoção vencer.
 */
export function promotionValidityHint(
  trigger: AutoCampaignTrigger,
  offsets: number[],
  validDays: number,
) {
  const timing = autoCampaignTriggerTiming[trigger];
  if (timing === "sessions")
    return `A promoção vale ${plural(validDays, "dia", "dias")} a partir do envio da mensagem.`;
  const until =
    trigger === "birthday"
      ? `A promoção vale até ${plural(validDays, "dia", "dias")} depois do aniversário do cliente (data do cadastro).`
      : `A promoção vale até ${plural(validDays, "dia", "dias")} depois do evento.`;
  const late = timing === "after" ? Math.max(0, ...offsets) : 0;
  return late > validDays
    ? `${until} A mensagem de ${plural(late, "dia", "dias")} depois chega com a promoção vencida.`
    : until;
}

let stepKey = 0;
export const newStepKey = () => `step-${++stepKey}`;

export function autoCampaignDraft(campaign?: AutoCampaign): AutoCampaignDraft {
  const promotion = campaign?.promotion;
  const promotionDraft = {
    promotional: Boolean(promotion),
    validityMode: promotion?.validUntil ? "date" : "days",
    validDays: promotion?.validDays ? String(promotion.validDays) : "",
    validUntil: promotion?.validUntil ?? "",
    cooldown: Boolean(promotion?.cooldown),
    cooldownAmount: promotion?.cooldown
      ? String(promotion.cooldown.amount)
      : "",
    cooldownUnit: promotion?.cooldown?.unit ?? "days",
    discount: Boolean(promotion?.discount),
    discountType: promotion?.discount?.type ?? "percentage",
    discountPercent:
      promotion?.discount?.type === "percentage"
        ? String(promotion.discount.percent).replace(".", ",")
        : "",
    discountAmountInCents:
      promotion?.discount?.type === "amount"
        ? promotion.discount.amountInCents
        : null,
    discountOnPlans: promotion?.appliesToPlans !== false,
    planScope: promotion?.planTemplateIds?.length ? "selected" : "all",
    planTemplateIds: promotion?.planTemplateIds ?? [],
    discountOnProducts: promotion?.appliesToProducts === true,
    productScope: promotion?.productIds?.length ? "selected" : "all",
    productIds: promotion?.productIds ?? [],
  } satisfies Partial<AutoCampaignDraft>;
  if (!campaign)
    return {
      name: "",
      trigger: "birthday",
      active: true,
      steps: [{ key: newStepKey(), offset: "0", message: "" }],
      ...promotionDraft,
      includeLeads: false,
      leadFilter: {},
    };
  return {
    name: campaign.name,
    trigger: campaign.trigger,
    active: campaign.active,
    ...promotionDraft,
    includeLeads: Boolean(campaign.includeLeads),
    leadFilter: campaign.leadFilter ?? {},
    // Do momento mais distante para o mais próximo do evento.
    steps: [...campaign.steps]
      .sort((a, b) =>
        autoCampaignTriggerTiming[campaign.trigger] === "after"
          ? a.offset - b.offset
          : b.offset - a.offset,
      )
      .map((step) => ({
        key: newStepKey(),
        id: step.id,
        offset: String(step.offset),
        message: step.message,
      })),
  };
}

/** O evento aceita incluir leads (aniversário). */
export function triggerAcceptsLeads(trigger: AutoCampaignTrigger) {
  return (autoCampaignLeadOptionalTriggers as readonly string[]).includes(
    trigger,
  );
}

/** Evento só de leads (lead novo, lead sem contato). */
export function isLeadTrigger(trigger: AutoCampaignTrigger) {
  return (autoCampaignLeadTriggers as readonly string[]).includes(trigger);
}

export function autoCampaignInput(draft: AutoCampaignDraft): AutoCampaignInput {
  const includeLeads = triggerAcceptsLeads(draft.trigger) && draft.includeLeads;
  return {
    name: draft.name.trim(),
    trigger: draft.trigger,
    active: draft.active,
    ...(includeLeads ? { includeLeads } : {}),
    ...(includeLeads || isLeadTrigger(draft.trigger)
      ? { leadFilter: draft.leadFilter }
      : {}),
    steps: draft.steps.map((step) => ({
      ...(step.id ? { id: step.id } : {}),
      offset: Number(step.offset),
      message: step.message.trim(),
    })),
    ...(draft.promotional
      ? {
          promotion: {
            ...(draft.validityMode === "date" &&
            promotionAllowsFixedDate(draft.trigger)
              ? { validUntil: draft.validUntil }
              : { validDays: Number(draft.validDays) }),
            ...(draft.discount
              ? {
                  discount:
                    draft.discountType === "percentage"
                      ? {
                          type: "percentage" as const,
                          percent: Number(
                            draft.discountPercent.replace(",", "."),
                          ),
                        }
                      : {
                          type: "amount" as const,
                          amountInCents: draft.discountAmountInCents ?? 0,
                        },
                  ...discountScopeInput(draft),
                }
              : {}),
            ...(draft.cooldown
              ? {
                  cooldown: {
                    amount: Number(draft.cooldownAmount),
                    unit: draft.cooldownUnit,
                  },
                }
              : {}),
          },
        }
      : {}),
  };
}

/** Onde o desconto vale, no formato da promoção (planos e/ou produtos, todos ou só os marcados). */
function discountScopeInput(draft: AutoCampaignDraft) {
  return {
    ...(draft.discountOnPlans
      ? {
          planTemplateIds:
            draft.planScope === "selected" ? draft.planTemplateIds : [],
        }
      : { appliesToPlans: false }),
    ...(draft.discountOnProducts
      ? {
          appliesToProducts: true,
          productIds: draft.productScope === "selected" ? draft.productIds : [],
        }
      : {}),
  };
}

/** Escolheu "só nos marcados" e não marcou nenhum: mensagem para o formulário. */
export function discountScopeError(draft: AutoCampaignDraft): string {
  if (!draft.promotional || !draft.discount) return "";
  if (
    draft.discountOnPlans &&
    draft.planScope === "selected" &&
    draft.planTemplateIds.length === 0
  )
    return "Marque pelo menos um plano em que o desconto vale.";
  if (
    draft.discountOnProducts &&
    draft.productScope === "selected" &&
    draft.productIds.length === 0
  )
    return "Marque pelo menos um produto em que o desconto vale.";
  return "";
}
