import { z } from "zod";
import {
  addDaysToIsoDate,
  addMonthsToIsoDate,
  paymentMethodSchema,
} from "../common/model.js";
import { patientDiscountSchema } from "./discount.js";
import {
  type PlanPaymentPart,
  paymentPartsTotal,
  planPaymentPartsSchema,
} from "../finance/payment-parts.js";
import type {
  PatientPlan,
  PlanPaymentSummary,
  PlanServiceInput,
  PlanTerms,
  PlanType,
} from "./types.js";

/** Reusable name and price; sold plans keep their own independent terms. */
export const planCatalogInputSchema = z.object({
  name: z.string().trim().min(3).max(120),
  totalValueInCents: z.number().int().min(0).max(2147483647),
});

export const planKindSchema = z.enum([
  "single",
  "fixed_package",
  "recurring",
  "custom",
]);

export const planServiceInputSchema = z.object({
  serviceId: z.uuid(),
  totalSessions: z.number().int().min(1).max(1000),
  totalValueInCents: z.number().int().min(0).max(2147483647),
});

export const planServicesSchema = z
  .array(planServiceInputSchema)
  .min(1)
  .refine(
    (items) =>
      new Set(items.map((item) => item.serviceId)).size === items.length,
    "Não repita serviços no plano.",
  );

export const planTypeSchema = z.enum([
  "single",
  "monthly",
  "quarterly",
  "semiannual",
  "annual",
  "promotional",
]);

export const planTypeLabels: Record<PlanType, string> = {
  single: "Plano avulso",
  monthly: "Plano mensal",
  quarterly: "Plano trimestral",
  semiannual: "Plano semestral",
  annual: "Plano anual",
  promotional: "Plano promocional",
};

export function planPeriodMonths(type?: PlanType | null): number {
  return type
    ? {
        single: 0,
        monthly: 1,
        quarterly: 3,
        semiannual: 6,
        annual: 12,
        promotional: 0,
      }[type]
    : 0;
}

export function planSessionsForPeriod(
  type: PlanType,
  sessionsPerWeek: number,
): number {
  return planPeriodMonths(type) * 4 * sessionsPerWeek;
}

export function planTypeKind(type: PlanType): z.infer<typeof planKindSchema> {
  return type === "single"
    ? "single"
    : type === "monthly"
      ? "recurring"
      : type === "promotional"
        ? "custom"
        : "fixed_package";
}

export function planPeriodEnd(type: PlanType, validFrom: string): string {
  if (!z.iso.date().safeParse(validFrom).success) return "";
  const months = planPeriodMonths(type);
  return months
    ? addDaysToIsoDate(addMonthsToIsoDate(validFrom, months), -1)
    : "";
}

export const planTemplateServicesSchema = z
  .array(
    planServiceInputSchema.extend({
      sessionsPerWeek: z.number().int().min(1).max(7).nullable().optional(),
    }),
  )
  .min(1)
  .refine(
    (items) =>
      new Set(items.map((item) => item.serviceId)).size === items.length,
    "Não repita serviços no plano.",
  );

export const planTemplateFieldsSchema = z.object({
  name: z.string().trim().min(3).max(120),
  totalValueInCents: z.number().int().min(0).max(2147483647),
  services: planTemplateServicesSchema,
  planType: planTypeSchema.nullable().optional(),
  kind: planKindSchema.nullable().optional(),
  /** Máximo de parcelas na venda: 1 = não aceita parcelamento; ausente = sem limite próprio. */
  maxInstallments: z.number().int().min(1).max(36).nullable().optional(),
});

export const planTemplateInputSchema = planTemplateFieldsSchema
  .superRefine((value, ctx) => validateTemplatePeriod(value, ctx))
  .refine(
    (value) =>
      value.services.reduce((sum, item) => sum + item.totalValueInCents, 0) ===
      value.totalValueInCents,
    {
      message: "A soma dos serviços deve corresponder ao valor total do plano.",
      path: ["totalValueInCents"],
    },
  );

// Weekly frequencies become a contracted balance; dates remain calendar months.
export function validateTemplatePeriod(
  value: z.infer<typeof planTemplateFieldsSchema>,
  ctx: z.RefinementCtx,
) {
  if (!planPeriodMonths(value.planType)) return;
  value.services.forEach((entry, index) => {
    if (!entry.sessionsPerWeek)
      ctx.addIssue({
        code: "custom",
        path: ["services", index, "sessionsPerWeek"],
        message: "Informe as sessões por semana.",
      });
    else if (
      entry.totalSessions !==
      planSessionsForPeriod(value.planType!, entry.sessionsPerWeek)
    )
      ctx.addIssue({
        code: "custom",
        path: ["services", index, "totalSessions"],
        message: "O saldo deve corresponder à frequência semanal e ao período.",
      });
  });
}

export const planTemplateUpdateSchema = planTemplateFieldsSchema
  .partial()
  .extend({ active: z.boolean().optional() })
  .refine((value) => Object.keys(value).length > 0, "Informe uma alteração.");

/** Aggregate fields are derived; services own the sold terms and balances. */
export function planServiceTotals<T extends { services: PlanServiceInput[] }>(
  value: T,
) {
  return {
    ...value,
    serviceId: value.services[0]!.serviceId,
    totalSessions: value.services.reduce(
      (sum, item) => sum + item.totalSessions,
      0,
    ),
  };
}

/**
 * Valor de um serviço vendido: o plano cadastrado é fixo; só o avulso muda a
 * quantidade de sessões, e o valor segue o preço por sessão da referência.
 */
export function planServiceValueForSessions(
  reference: Pick<PlanServiceInput, "totalSessions" | "totalValueInCents">,
  sessions: number,
): number {
  if (!Number.isInteger(sessions) || sessions < 1) return 0;
  return Math.round(
    (reference.totalValueInCents * sessions) / reference.totalSessions,
  );
}

/** Largest remainders with stable service-order ties, using exact integer arithmetic. */
export function allocatePlanRevenue(
  amountInCents: number,
  services: Pick<PlanServiceInput, "totalValueInCents">[],
): number[] {
  if (!services.length) return [];
  // A zero-price contract can receive an adjusted receivable: distribute it
  // evenly when no sold service has a positive weight.
  const hasValue = services.some((item) => item.totalValueInCents > 0);
  const weights = services.map((item) =>
    BigInt(hasValue ? item.totalValueInCents : 1),
  );
  const total = weights.reduce((sum, item) => sum + item, 0n);
  const amount = BigInt(amountInCents);
  const shares = weights.map((weight) => Number((amount * weight) / total));
  let remainder = amountInCents - shares.reduce((sum, share) => sum + share, 0);
  const order = weights
    .map((weight, index) => ({ index, remainder: (amount * weight) % total }))
    .sort((a, b) =>
      a.remainder === b.remainder
        ? a.index - b.index
        : a.remainder > b.remainder
          ? -1
          : 1,
    );
  for (const item of order) {
    if (remainder-- <= 0) break;
    shares[item.index]! += 1;
  }
  return shares;
}

/**
 * Valor de uma sessão: o do serviço no plano do cliente (valor ÷ sessões contratadas) ou,
 * sem plano, o preço de tabela do serviço.
 */
export function sessionValueInCents(
  planService:
    Pick<PlanServiceInput, "totalSessions" | "totalValueInCents"> | undefined,
  priceInCents: number,
): number {
  return planService && planService.totalSessions > 0
    ? Math.round(planService.totalValueInCents / planService.totalSessions)
    : priceInCents;
}

export const planStatusSchema = z.enum([
  "active",
  "paused",
  "expired",
  "cancelled",
]);

export const planTransitionSchema = z.enum(["active", "paused", "cancelled"]);

/** Dados opcionais ao pausar: motivo e previsão de retorno. */
export const planPauseDetailsSchema = z.object({
  reason: z.string().trim().max(500).optional().or(z.literal("")),
  expectedReturn: z.iso.date().optional().or(z.literal("")),
});

/** Dados opcionais ao cancelar: valor devolvido ao cliente (estorno) e observação. */
export const planCancellationDetailsSchema = z.object({
  refundedInCents: z
    .number()
    .int("Informe o valor estornado em centavos.")
    .min(0, "O valor estornado não pode ser negativo.")
    .optional(),
  refundNote: z.string().trim().max(500).optional().or(z.literal("")),
});

/** Dias inteiros entre duas datas AAAA-MM-DD (fim − início). */
export function daysBetweenIsoDates(from: string, to: string) {
  return Math.round(
    (Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) /
      86_400_000,
  );
}

/** Validade depois da reativação: avança os dias em que o plano ficou pausado. */
export function validityAfterPause(
  validUntil: string | undefined,
  pausedOn: string,
  resumedOn: string,
) {
  if (!validUntil) return validUntil;
  const days = Math.max(0, daysBetweenIsoDates(pausedOn, resumedOn));
  return addDaysToIsoDate(validUntil, days);
}

/** Situação exibida: um plano ativo sem saldo aparece como "Esgotado" (não é gravado). */
export type PlanDisplayStatus = PatientPlan["status"] | "exhausted";

export function planDisplayStatus(
  plan: Pick<PatientPlan, "status" | "remainingSessions">,
): PlanDisplayStatus {
  return plan.status === "active" && plan.remainingSessions <= 0
    ? "exhausted"
    : plan.status;
}

export const planDisplayStatusLabels: Record<PlanDisplayStatus, string> = {
  active: "Ativo",
  paused: "Pausado",
  expired: "Expirado",
  cancelled: "Cancelado",
  exhausted: "Esgotado",
};

/** Crédito de serviço avulso vendido na comanda (não é plano contratado). */
export function isTabCreditPlan(plan: { sourceTabId?: string | null }) {
  return Boolean(plan.sourceTabId);
}

/** Nome exibido do crédito da comanda, sem o código interno da comanda. */
export function tabCreditPlanName(serviceName: string) {
  return `${serviceName} · pago na comanda`;
}

export const tabCreditHistoryLabel = "Serviço avulso na comanda";

/** Selo do crédito da comanda: aguarda o atendimento até ser consumido. */
export const tabCreditAwaitingLabel = "Aguarda atendimento";

/** Plano recorrente gera uma cobrança por ciclo; a próxima nasce na renovação. */
export const recurringSingleChargeIssue =
  "No plano recorrente a cobrança é uma por ciclo: use 1 parcela.";

export function isRecurringChargeValid(plan: {
  kind?: z.infer<typeof planKindSchema> | null | undefined;
  installments: number;
  paymentParts?: readonly { installments: number }[] | undefined;
}) {
  if (plan.kind !== "recurring") return true;
  // Picado: cada forma gera uma cobrança por ciclo.
  if (plan.paymentParts && plan.paymentParts.length > 1)
    return plan.paymentParts.every((part) => part.installments === 1);
  return plan.installments === 1;
}

/** As formas do plano picado precisam somar o valor total. */
export function planPaymentPartsMatch(plan: {
  totalValueInCents: number;
  paymentParts?: readonly { amountInCents: number }[] | undefined;
}) {
  return (
    !plan.paymentParts?.length ||
    paymentPartsTotal(plan.paymentParts) === plan.totalValueInCents
  );
}

export const planPaymentPartsIssue = {
  message: "As formas de pagamento precisam somar o valor total do plano.",
  path: ["paymentParts"],
};

/**
 * Termos do plano com as formas aplicadas: forma única vira `paymentMethod`/`installments`
 * de sempre (sem lista); picado mantém a lista e deriva os dois campos dela.
 */
export function withPlanPaymentParts<
  T extends {
    installments: number;
    kind?: z.infer<typeof planKindSchema> | null | undefined;
    paymentMethod?: z.infer<typeof paymentMethodSchema> | undefined;
    paymentParts?: PlanPaymentPart[] | undefined;
  },
>(plan: T): T {
  const parts = plan.paymentParts;
  if (!parts?.length) return plan;
  const next = { ...plan, paymentMethod: parts[0]!.paymentMethod };
  if (parts.length === 1) {
    delete next.paymentParts;
    return {
      ...next,
      installments: plan.kind === "recurring" ? 1 : parts[0]!.installments,
    };
  }
  return {
    ...next,
    installments:
      plan.kind === "recurring"
        ? 1
        : parts.reduce((sum, part) => sum + part.installments, 0),
  };
}

/**
 * Último vencimento do parcelamento quando ele passa do fim da validade (aviso, não
 * bloqueio); null quando não há validade ou as parcelas cabem nela.
 */
export function installmentsBeyondValidity(plan: {
  installments: number;
  firstDueDate: string;
  validUntil?: string | undefined;
}): string | null {
  if (!plan.validUntil || !z.iso.date().safeParse(plan.firstDueDate).success)
    return null;
  const lastDueDate = addMonthsToIsoDate(
    plan.firstDueDate,
    Math.max(0, plan.installments - 1),
  );
  return lastDueDate > plan.validUntil ? lastDueDate : null;
}

/** Quantidade de aulas dos horários semanais entre duas datas, inclusive. */
export function weeklySlotSessionsBetween(
  slots: readonly { weekday: number }[],
  from: string,
  to: string,
): number {
  if (!slots.length || to < from) return 0;
  const days = daysBetweenIsoDates(from, to) + 1;
  const firstWeekday = new Date(`${from}T12:00:00Z`).getUTCDay();
  return slots.reduce((sum, slot) => {
    const offset = (slot.weekday - firstWeekday + 7) % 7;
    return sum + (offset < days ? Math.floor((days - 1 - offset) / 7) + 1 : 0);
  }, 0);
}

export type PlanFirstChargeProration = {
  /** Aulas da turma do início até o primeiro vencimento, inclusive. */
  sessions: number;
  /** Aulas do primeiro ciclo (início até o fim do 1º mês). */
  cycleSessions: number;
  cycleEnd: string;
  amountInCents: number;
};

/**
 * 1º pagamento do plano recorrente proporcional às aulas da turma até o vencimento:
 * vencer no fim do 1º ciclo (ex.: início 01/10, vence 31/10) cobra o valor cheio;
 * antes sai mais barato, depois sai mais caro. Vencimento no próprio início
 * (pagamento antecipado) ou sem turma mantém o valor cheio (null).
 */
export function planFirstChargeProration(
  plan: {
    kind?: z.infer<typeof planKindSchema> | null | undefined;
    totalValueInCents: number;
    validFrom: string;
    firstDueDate: string;
  },
  slots: readonly { weekday: number }[] | undefined,
): PlanFirstChargeProration | null {
  if (
    plan.kind !== "recurring" ||
    !slots?.length ||
    !z.iso.date().safeParse(plan.validFrom).success ||
    !z.iso.date().safeParse(plan.firstDueDate).success ||
    plan.firstDueDate <= plan.validFrom
  )
    return null;
  const cycleEnd = addDaysToIsoDate(addMonthsToIsoDate(plan.validFrom, 1), -1);
  if (plan.firstDueDate === cycleEnd) return null;
  const cycleSessions = weeklySlotSessionsBetween(
    slots,
    plan.validFrom,
    cycleEnd,
  );
  if (!cycleSessions) return null;
  const sessions = weeklySlotSessionsBetween(
    slots,
    plan.validFrom,
    plan.firstDueDate,
  );
  return {
    sessions,
    cycleSessions,
    cycleEnd,
    amountInCents: Math.min(
      2147483647,
      Math.round((plan.totalValueInCents * sessions) / cycleSessions),
    ),
  };
}

/** Termos do plano com a 1ª parcela proporcional às aulas da turma, quando houver. */
export function withPlanFirstCharge<
  T extends Parameters<typeof planFirstChargeProration>[0],
>(
  plan: T & { firstInstallmentInCents?: number | undefined },
  slots: readonly { weekday: number }[] | undefined,
): T & { firstInstallmentInCents?: number | undefined } {
  const terms: T & { firstInstallmentInCents?: number | undefined } = {
    ...plan,
  };
  delete terms.firstInstallmentInCents;
  const proration = planFirstChargeProration(plan, slots);
  return proration
    ? { ...terms, firstInstallmentInCents: proration.amountInCents }
    : terms;
}

export const planTermsSchema = z.object({
  name: z.string().trim().min(3).max(120),
  services: planServicesSchema,
  validFrom: z.iso.date(),
  validUntil: z.iso.date().optional().or(z.literal("")),
  totalValueInCents: z.number().int().min(0).max(2147483647),
  installments: z.number().int().min(1).max(36),
  firstDueDate: z.iso.date(),
  autoRenew: z.boolean().optional(),
  /** Forma de pagamento combinada na venda (ausente = a combinar). */
  paymentMethod: paymentMethodSchema.optional(),
  /**
   * Plano picado: cada forma com o valor e a quantidade de cobranças dela (ex.: R$ 100 no
   * Pix em 1 + R$ 200 no cartão em 2). A soma é o valor total; com ela, `paymentMethod` é a
   * da 1ª forma e `installments` a soma das cobranças (no recorrente, 1 por forma e ciclo).
   */
  paymentParts: planPaymentPartsSchema.optional(),
  /**
   * Valor da 1ª parcela quando proporcional às aulas até o primeiro vencimento
   * (`planFirstChargeProration`); ausente = divisão normal do valor total.
   */
  firstInstallmentInCents: z.number().int().min(0).max(2147483647).optional(),
  /**
   * Desconto combinado na venda deste plano: vale nas cobranças dele e das renovações,
   * conforme o alcance. Na renovação, ausente = segue o desconto do plano anterior.
   */
  discount: patientDiscountSchema.optional(),
  /**
   * Parte do desconto geral do pedido (cadastro com plano e produto) que cabe a este
   * plano: abate das cobranças geradas na venda, a partir da 1ª. Não segue na renovação.
   */
  orderDiscountInCents: z.number().int().min(0).max(2147483647).optional(),
});

export const validPlanPeriod = (value: PlanTerms) =>
  !value.validUntil || value.validUntil >= value.validFrom;

export const renewablePlanPeriod = (value: PlanTerms) =>
  !value.autoRenew || Boolean(value.validUntil);

export const planPeriodIssue = {
  message: "A validade final deve ser posterior à inicial.",
  path: ["validUntil"],
};

export const autoRenewIssue = {
  message: "A renovação automática exige o fim da validade.",
  path: ["autoRenew"],
};

export const patientPlanInputSchema = planTermsSchema
  .extend({
    planTemplateId: z.uuid(),
    patientId: z.uuid(),
    kind: planKindSchema,
  })
  .refine(validPlanPeriod, planPeriodIssue)
  .refine(isRecurringChargeValid, {
    message: recurringSingleChargeIssue,
    path: ["installments"],
  })
  .refine(renewablePlanPeriod, autoRenewIssue)
  .refine(planPaymentPartsMatch, planPaymentPartsIssue)
  .refine(
    (value) =>
      value.services.reduce((sum, item) => sum + item.totalValueInCents, 0) ===
      value.totalValueInCents,
    {
      message: "A soma dos serviços deve corresponder ao valor total.",
      path: ["totalValueInCents"],
    },
  );

export const planRenewalInputSchema = planTermsSchema
  .refine(validPlanPeriod, planPeriodIssue)
  .refine(renewablePlanPeriod, autoRenewIssue)
  .refine(planPaymentPartsMatch, planPaymentPartsIssue)
  .refine(
    (value) =>
      value.services.reduce((sum, item) => sum + item.totalValueInCents, 0) ===
      value.totalValueInCents,
    {
      message: "A soma dos serviços deve corresponder ao valor total.",
      path: ["totalValueInCents"],
    },
  );

export const planAutoRenewInputSchema = z.object({ autoRenew: z.boolean() });

/** Plano criado no cadastro guiado: termos de `patientPlanInputSchema`, sem `patientId`. */
export const guidedPlanTermsSchema = planTermsSchema.extend({
  planTemplateId: z.uuid(),
});

/**
 * Período seguinte de um plano com fim de validade: começa no dia seguinte ao fim
 * e repete a duração. Períodos de meses inteiros (ex.: 01/03–31/05) seguem por
 * meses; os demais repetem a mesma quantidade de dias. O primeiro vencimento
 * mantém a mesma distância do início do período.
 */
export function nextPlanPeriod(plan: {
  validFrom: string;
  validUntil?: string | undefined;
  firstDueDate: string;
}): { validFrom: string; validUntil: string; firstDueDate: string } | null {
  if (!plan.validUntil) return null;
  const validFrom = addDaysToIsoDate(plan.validUntil, 1);
  for (let months = 1; months <= 120; months += 1) {
    const end = addDaysToIsoDate(
      addMonthsToIsoDate(plan.validFrom, months),
      -1,
    );
    if (end > plan.validUntil) break;
    if (end === plan.validUntil) {
      return {
        validFrom,
        validUntil: addDaysToIsoDate(addMonthsToIsoDate(validFrom, months), -1),
        firstDueDate: addMonthsToIsoDate(plan.firstDueDate, months),
      };
    }
  }
  const days =
    (Date.parse(plan.validUntil) - Date.parse(plan.validFrom)) / 86_400_000 + 1;
  return {
    validFrom,
    validUntil: addDaysToIsoDate(validFrom, days - 1),
    firstDueDate: addDaysToIsoDate(plan.firstDueDate, days),
  };
}

/** Resume as parcelas do plano (canceladas ficam fora); null quando não há cobrança. */
export function planPaymentSummary(
  receivables: readonly {
    status: "open" | "paid" | "cancelled";
    amountInCents: number;
    overdue: boolean;
  }[],
): PlanPaymentSummary | null {
  const active = receivables.filter((item) => item.status !== "cancelled");
  if (!active.length) return null;
  const paid = active.filter((item) => item.status === "paid");
  const open = active.filter((item) => item.status === "open");
  return {
    installmentCount: active.length,
    paidCount: paid.length,
    openCount: open.length,
    overdueCount: open.filter((item) => item.overdue).length,
    paidInCents: paid.reduce((sum, item) => sum + item.amountInCents, 0),
    openInCents: open.reduce((sum, item) => sum + item.amountInCents, 0),
  };
}
