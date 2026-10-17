import { z } from "zod";
import { addDaysToIsoDate, addMonthsToIsoDate } from "../common/model.js";
import type {
  PatientPlan,
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

/** Plano recorrente gera uma cobrança por ciclo; a próxima nasce na renovação. */
export const recurringSingleChargeIssue =
  "No plano recorrente a cobrança é uma por ciclo: use 1 parcela.";

export function isRecurringChargeValid(plan: {
  kind?: z.infer<typeof planKindSchema> | null | undefined;
  installments: number;
}) {
  return plan.kind !== "recurring" || plan.installments === 1;
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

export const planTermsSchema = z.object({
  name: z.string().trim().min(3).max(120),
  services: planServicesSchema,
  validFrom: z.iso.date(),
  validUntil: z.iso.date().optional().or(z.literal("")),
  totalValueInCents: z.number().int().min(0).max(2147483647),
  installments: z.number().int().min(1).max(36),
  firstDueDate: z.iso.date(),
  autoRenew: z.boolean().optional(),
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
