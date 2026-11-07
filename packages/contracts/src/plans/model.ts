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
  scalePaymentParts,
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

/** Plano avulso é um atendimento único: um serviço com uma sessão (AP5). */
export function isSingleSessionPlan(
  services: readonly { totalSessions: number }[],
): boolean {
  return services.length === 1 && services[0]!.totalSessions === 1;
}

export const singlePlanServicesMessage =
  "Plano avulso tem uma única sessão de um serviço.";

export const singlePlanServicesIssue = {
  message: singlePlanServicesMessage,
  path: ["services"],
};

/**
 * Modelo já gravado: período e soma dos serviços. Avulso antigo com várias sessões segue válido
 * enquanto serviços e tipo não mudam (ativar, desativar, renomear).
 */
export const planTemplateStoredSchema = planTemplateFieldsSchema
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

export const planTemplateInputSchema = planTemplateStoredSchema.refine(
  (value) =>
    !isSinglePlanTemplate(value) || isSingleSessionPlan(value.services),
  singlePlanServicesIssue,
);

/** Na edição, a regra do avulso vale quando os serviços, o tipo ou o modelo mudam. */
export function planTemplateUpdateChangesTerms(input: {
  readonly [key: string]: unknown;
  services?: unknown;
  planType?: unknown;
  kind?: unknown;
}): boolean {
  return (
    input.services !== undefined ||
    input.planType !== undefined ||
    input.kind !== undefined
  );
}

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
  .refine((value) => Object.keys(value).length > 0, "Informe uma alteração.")
  .refine(
    (value) =>
      !value.services ||
      !isSinglePlanTemplate(value) ||
      isSingleSessionPlan(value.services),
    singlePlanServicesIssue,
  );

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
 * Valor de um serviço vendido pelo preço por sessão da referência: o avulso sai sempre com
 * uma sessão, inclusive de modelo antigo cadastrado com várias.
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
 * sem plano, o valor de referência (`fallbackInCents`, em geral o do plano avulso do serviço).
 */
export function sessionValueInCents(
  planService:
    Pick<PlanServiceInput, "totalSessions" | "totalValueInCents"> | undefined,
  fallbackInCents: number,
): number {
  return planService && planService.totalSessions > 0
    ? Math.round(planService.totalValueInCents / planService.totalSessions)
    : fallbackInCents;
}

/** Modelo de plano avulso: `planType` "single" ou, sem tipo, `kind` "single". */
export function isSinglePlanTemplate(template: {
  planType?: PlanType | null | undefined;
  kind?: z.infer<typeof planKindSchema> | null | undefined;
}): boolean {
  return template.planType
    ? template.planType === "single"
    : template.kind === "single";
}

/**
 * Serviços vendidos a partir do modelo: plano fixo copia o modelo; avulso sai com uma sessão
 * do serviço, pelo preço por sessão (também do modelo antigo cadastrado com várias).
 */
export function planTemplateSaleServices<
  T extends Pick<
    PlanServiceInput,
    "serviceId" | "totalSessions" | "totalValueInCents"
  >,
>(template: {
  planType?: PlanType | null | undefined;
  kind?: z.infer<typeof planKindSchema> | null | undefined;
  services: readonly T[];
}): T[] {
  const first = template.services[0];
  if (!isSinglePlanTemplate(template) || !first)
    return template.services.map((entry) => ({ ...entry }));
  return [
    {
      ...first,
      totalSessions: 1,
      totalValueInCents: planServiceValueForSessions(first, 1),
    },
  ];
}

/**
 * Sessões por serviço de um plano vendido como pacote fixo: a contratação agenda os horários
 * em dias fixos na semana até acabar o pacote. Avulso (uma sessão), recorrente ou
 * personalizado: `undefined`.
 */
export function planPackageSessions(plan: {
  kind: z.infer<typeof planKindSchema>;
  services: readonly { serviceId: string; totalSessions: number }[];
}): Record<string, number> | undefined {
  if (plan.kind !== "fixed_package") return undefined;
  return Object.fromEntries(
    plan.services.map((item) => [item.serviceId, item.totalSessions]),
  );
}

/**
 * Serviço não tem preço: o valor de uma sessão avulsa vem do plano avulso
 * ativo que inclui o serviço (valor ÷ sessões). Com mais de um, vale o cadastrado primeiro.
 */
export function singlePlanSessionPrices(
  templates: readonly {
    id: string;
    active: boolean;
    createdAt: string;
    planType?: PlanType | null | undefined;
    kind?: z.infer<typeof planKindSchema> | null | undefined;
    services: readonly Pick<
      PlanServiceInput,
      "serviceId" | "totalSessions" | "totalValueInCents"
    >[];
  }[],
): Map<string, number> {
  const prices = new Map<string, number>();
  [...templates]
    .filter((template) => template.active && isSinglePlanTemplate(template))
    .sort(
      (a, b) =>
        a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
    )
    .forEach((template) =>
      template.services.forEach((item) => {
        if (item.totalSessions > 0 && !prices.has(item.serviceId))
          prices.set(
            item.serviceId,
            Math.round(item.totalValueInCents / item.totalSessions),
          );
      }),
    );
  return prices;
}

/**
 * Valor pago por uma sessão do plano, base da comissão: o valor do serviço no plano com o
 * desconto do cliente já aplicado nas cobranças (rateado pelo valor do plano), dividido pelas
 * sessões do serviço. Ex.: plano de R$ 400 com 8 sessões e R$ 40 de desconto → R$ 45.
 * Mesma conta de `planSessionPaidValue` no MySQL (`storage/mysql/sql.ts`).
 */
export function planSessionPaidValueInCents(
  planService: Pick<PlanServiceInput, "totalSessions" | "totalValueInCents">,
  planTotalValueInCents: number,
  planDiscountInCents: number,
): number {
  if (planService.totalSessions <= 0 || planTotalValueInCents <= 0) return 0;
  const finalValue = Math.max(0, planTotalValueInCents - planDiscountInCents);
  return Math.round(
    (planService.totalValueInCents * finalValue) /
      (planTotalValueInCents * planService.totalSessions),
  );
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

/**
 * Dados opcionais ao cancelar: valor devolvido ao cliente (estorno), forma de pagamento e
 * observação. Com estorno, a forma é obrigatória: o valor sai do caixa como conta paga.
 */
export const planCancellationDetailsSchema = z
  .object({
    refundedInCents: z
      .number()
      .int("Informe o valor estornado em centavos.")
      .min(0, "O valor estornado não pode ser negativo.")
      .optional(),
    refundPaymentMethod: paymentMethodSchema.optional(),
    refundNote: z.string().trim().max(500).optional().or(z.literal("")),
  })
  .refine((value) => !value.refundedInCents || value.refundPaymentMethod, {
    message: "Informe a forma de pagamento do estorno.",
    path: ["refundPaymentMethod"],
  });

/** Categoria de despesa em que o estorno do cancelamento entra no Financeiro. */
export const planRefundCategoryName = "Estornos a clientes";

/** Descrição da conta paga que registra o estorno do cancelamento. */
export function planRefundPayableDescription(
  patientName: string,
  planName: string,
) {
  return `Estorno ao cliente · ${patientName} · ${planName}`.slice(0, 200);
}

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

/**
 * O saldo de sessões limita o uso só fora do recorrente: no plano recorrente o cliente
 * paga a frequência semanal (ex.: 2x por semana), e um ciclo com mais aulas que o saldo
 * nominal (9 segundas e quartas num mês) não bloqueia nem esgota o plano.
 */
export function planHasSessionBalance(plan: {
  kind?: PatientPlan["kind"] | null | undefined;
}) {
  return plan.kind !== "recurring";
}

/** Aulas já feitas no ciclo do plano recorrente (pode passar do saldo nominal). */
export function planUsedSessions(
  plan: Pick<PatientPlan, "totalSessions" | "remainingSessions">,
) {
  return plan.totalSessions - plan.remainingSessions;
}

export function planDisplayStatus(
  plan: Pick<PatientPlan, "status" | "remainingSessions"> & {
    kind?: PatientPlan["kind"] | null | undefined;
  },
): PlanDisplayStatus {
  return plan.status === "active" &&
    planHasSessionBalance(plan) &&
    plan.remainingSessions <= 0
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

/** Plano picado: cada forma marcada como só da primeira vez ou recorrente. */
export function planPaymentRecurrenceChosen(plan: {
  paymentParts?: readonly { recurring?: boolean | undefined }[] | undefined;
}) {
  const parts = plan.paymentParts;
  return (
    !parts ||
    parts.length < 2 ||
    parts.every((part) => typeof part.recurring === "boolean")
  );
}

export const planPaymentRecurrenceIssue = {
  message:
    "Marque se cada forma de pagamento é só da primeira vez ou recorrente.",
  path: ["paymentParts"],
};

/** Formas que seguem na renovação (ausente = recorrente, como nos planos antigos). */
export function recurringPlanPaymentParts<
  T extends { recurring?: boolean | undefined },
>(parts: readonly T[] | undefined): T[] {
  return (parts ?? []).filter((part) => part.recurring !== false);
}

/** Renovação automática com plano picado: ao menos uma forma recorrente. */
export function autoRenewPaymentPartsValid(plan: {
  autoRenew?: boolean | null | undefined;
  paymentParts?: readonly { recurring?: boolean | undefined }[] | undefined;
}) {
  return (
    !plan.autoRenew ||
    !plan.paymentParts ||
    plan.paymentParts.length < 2 ||
    recurringPlanPaymentParts(plan.paymentParts).length > 0
  );
}

export const autoRenewPaymentPartsIssue = {
  message:
    "Na renovação automática, marque ao menos uma forma de pagamento como recorrente.",
  path: ["paymentParts"],
};

/**
 * Formas da renovação: só as recorrentes, com o valor total repartido entre elas na
 * proporção do que tinham. Uma só recorrente vira a forma única do plano (sem lista).
 */
export function renewalPlanPayment(plan: {
  totalValueInCents: number;
  paymentMethod?: z.infer<typeof paymentMethodSchema> | undefined;
  paymentParts?: readonly PlanPaymentPart[] | undefined;
}): {
  paymentMethod?: z.infer<typeof paymentMethodSchema>;
  paymentParts?: PlanPaymentPart[];
} {
  const parts = plan.paymentParts;
  if (!parts || parts.length < 2)
    return plan.paymentMethod ? { paymentMethod: plan.paymentMethod } : {};
  const recurring = recurringPlanPaymentParts(parts);
  const kept = recurring.length ? recurring : [...parts];
  if (kept.length === 1) return { paymentMethod: kept[0]!.paymentMethod };
  return {
    paymentMethod: kept[0]!.paymentMethod,
    paymentParts:
      kept.length === parts.length
        ? kept.map((part) => ({ ...part }))
        : scalePaymentParts(kept, plan.totalValueInCents),
  };
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
  /** Aulas da turma do início do plano até a véspera do primeiro vencimento. */
  sessions: number;
  /** Aulas do ciclo mensal que termina na véspera do primeiro vencimento. */
  cycleSessions: number;
  /** Ciclo de referência: do 1º vencimento menos um mês até a véspera do vencimento. */
  cycleStart: string;
  cycleEnd: string;
  /** A cobrança proporcional vence no início do plano (matrícula). */
  dueDate: string;
  amountInCents: number;
};

/**
 * Plano recorrente pré-pago: a mensalidade do vencimento (ex.: dia 20) paga o mês que começa
 * nele (20 a 19). Quem entra antes do 1º vencimento paga à parte, no início, as aulas da turma
 * até a véspera do vencimento, pelo valor da aula do ciclo de referência (vencimento − 1 mês
 * até a véspera): valor do plano ÷ aulas do ciclo × aulas do período. Ex.: início 10/11,
 * vence 20/11, turma seg/qua: 9 aulas de 20/10 a 19/11 e 3 de 10/11 a 19/11 → 3/9 do valor.
 * Sem turma, fora do recorrente, vencimento no próprio início (ou antes) ou sem aula no
 * período não há cobrança proporcional (null).
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
  const cycleStart = addMonthsToIsoDate(plan.firstDueDate, -1);
  const cycleEnd = addDaysToIsoDate(plan.firstDueDate, -1);
  const cycleSessions = weeklySlotSessionsBetween(slots, cycleStart, cycleEnd);
  const sessions = weeklySlotSessionsBetween(slots, plan.validFrom, cycleEnd);
  if (!cycleSessions || !sessions) return null;
  return {
    sessions,
    cycleSessions,
    cycleStart,
    cycleEnd,
    dueDate: plan.validFrom,
    amountInCents: Math.min(
      2147483647,
      Math.round((plan.totalValueInCents * sessions) / cycleSessions),
    ),
  };
}

/**
 * Plano recorrente que começa antes do 1º vencimento: pode ter a cobrança proporcional
 * (calculada pela turma ou, com o cálculo desligado, informada à mão).
 */
export function planAllowsProratedCharge(plan: {
  kind?: z.infer<typeof planKindSchema> | null | undefined;
  validFrom?: string | undefined;
  firstDueDate?: string | undefined;
}): boolean {
  return (
    plan.kind === "recurring" &&
    z.iso.date().safeParse(plan.validFrom).success &&
    z.iso.date().safeParse(plan.firstDueDate).success &&
    plan.firstDueDate! > plan.validFrom!
  );
}

/** 1º pagamento do plano recorrente com valor informado à mão (sem o cálculo proporcional). */
export function hasManualFirstCharge(plan: {
  kind?: z.infer<typeof planKindSchema> | null | undefined;
  manualFirstCharge?: boolean | undefined;
  proratedChargeInCents?: number | undefined;
}): boolean {
  return (
    plan.kind === "recurring" &&
    plan.manualFirstCharge === true &&
    plan.proratedChargeInCents !== undefined
  );
}

/**
 * Termos do plano com a cobrança proporcional às aulas da turma, quando houver. Com o
 * cálculo desligado (`manualFirstCharge`, só no recorrente), mantém o valor informado.
 */
export function withPlanFirstCharge<
  T extends Parameters<typeof planFirstChargeProration>[0],
>(
  plan: T & {
    proratedChargeInCents?: number | undefined;
    manualFirstCharge?: boolean | undefined;
  },
  slots: readonly { weekday: number }[] | undefined,
): T & {
  proratedChargeInCents?: number | undefined;
  manualFirstCharge?: boolean | undefined;
} {
  const terms: T & {
    proratedChargeInCents?: number | undefined;
    manualFirstCharge?: boolean | undefined;
  } = {
    ...plan,
  };
  // Sem valor, o pedido segue assim mesmo: a API recusa ("Informe o valor do 1º pagamento").
  if (plan.manualFirstCharge && planAllowsProratedCharge(plan))
    return { ...terms, manualFirstCharge: true };
  delete terms.proratedChargeInCents;
  delete terms.manualFirstCharge;
  const proration = planFirstChargeProration(plan, slots);
  return proration
    ? { ...terms, proratedChargeInCents: proration.amountInCents }
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
   * Plano recorrente: cobrança proporcional às aulas do início até a véspera do 1º
   * vencimento (`planFirstChargeProration`), a mais e vencendo no início; ausente = sem ela.
   */
  proratedChargeInCents: z.number().int().min(1).max(2147483647).optional(),
  /**
   * Plano recorrente com o cálculo proporcional desligado: a cobrança antes do 1º vencimento
   * é o `proratedChargeInCents` informado na venda (as mensalidades têm o valor cheio).
   */
  manualFirstCharge: z.boolean().optional(),
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
  .refine(planPaymentRecurrenceChosen, planPaymentRecurrenceIssue)
  .refine(autoRenewPaymentPartsValid, autoRenewPaymentPartsIssue)
  .refine(
    (value) => value.kind !== "single" || isSingleSessionPlan(value.services),
    singlePlanServicesIssue,
  )
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
  .refine(planPaymentRecurrenceChosen, planPaymentRecurrenceIssue)
  .refine(autoRenewPaymentPartsValid, autoRenewPaymentPartsIssue)
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

/** Número exibido da parcela: o saldo de uma baixa parcial mostra o da parcela de origem. */
export function receivableDisplayInstallment(item: {
  installmentNumber: number;
  balanceOfInstallment?: number | null | undefined;
}): number {
  return item.balanceOfInstallment ?? item.installmentNumber;
}

/**
 * Resume as parcelas do plano (canceladas ficam fora); null quando não há cobrança. O saldo
 * de baixa parcial conta junto da parcela de origem: ela só está paga quando o saldo também
 * está (sem número, cada recebível conta como uma parcela).
 */
export function planPaymentSummary(
  receivables: readonly {
    status: "open" | "paid" | "cancelled";
    amountInCents: number;
    overdue: boolean;
    installmentNumber?: number;
    balanceOfInstallment?: number | null | undefined;
  }[],
): PlanPaymentSummary | null {
  const active = receivables.filter((item) => item.status !== "cancelled");
  if (!active.length) return null;
  const paid = active.filter((item) => item.status === "paid");
  const open = active.filter((item) => item.status === "open");
  const key = (item: (typeof active)[number], index: number) =>
    item.installmentNumber === undefined
      ? `#${index}`
      : String(
          receivableDisplayInstallment({
            installmentNumber: item.installmentNumber,
            balanceOfInstallment: item.balanceOfInstallment,
          }),
        );
  const keys = new Set(active.map(key));
  const openKeys = new Set(
    active.map(key).filter((_, index) => active[index]!.status === "open"),
  );
  const overdueKeys = new Set(
    active
      .map(key)
      .filter(
        (_, index) =>
          active[index]!.status === "open" && active[index]!.overdue,
      ),
  );
  return {
    installmentCount: keys.size,
    paidCount: keys.size - openKeys.size,
    openCount: openKeys.size,
    overdueCount: overdueKeys.size,
    paidInCents: paid.reduce((sum, item) => sum + item.amountInCents, 0),
    openInCents: open.reduce((sum, item) => sum + item.amountInCents, 0),
  };
}
