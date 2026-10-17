import { z } from "zod";
import { competenceMonthSchema } from "../common/model.js";

/**
 * Regra de comissão do próprio usuário (`commission_rules.user_id`), sem exigir profissional
 * ligado. Vale nos atendimentos do profissional da agenda ligado ao usuário a partir de
 * `effectiveFrom` e prevalece sobre a regra do profissional (Financeiro); nova vigência cria
 * uma regra nova (o histórico é mantido).
 */
export const commissionTermsSchema = z
  .object({
    kind: z.enum(["percentage", "fixed"]).optional(),
    serviceId: z.uuid().optional(),
    fixedAmountInCents: z.number().int().min(0).max(2147483647).optional(),
    effectiveUntil: z.iso.date().optional(),
    percentage: z.number().min(0).max(100),
    effectiveFrom: z.iso.date(),
  })
  .refine(
    (value) => value.kind !== "fixed" || value.fixedAmountInCents !== undefined,
    { message: "Informe o valor fixo.", path: ["fixedAmountInCents"] },
  )
  .refine(
    (value) =>
      !value.effectiveUntil || value.effectiveUntil >= value.effectiveFrom,
    {
      message: "A vigência final deve ser posterior à inicial.",
      path: ["effectiveUntil"],
    },
  );
export const adminUserCommissionInputSchema = commissionTermsSchema;

export const productInputSchema = z.object({
  categoryId: z.uuid().nullable().optional(),
  brandId: z.uuid().nullable().optional(),
  name: z.string().trim().min(2).max(160),
  sku: z.string().trim().min(1).max(60),
  unit: z.string().trim().min(1).max(20).default("un"),
  costInCents: z.number().int().min(0),
  salePriceInCents: z.number().int().min(0),
  initialStock: z.number().int().min(0).max(1_000_000).default(0),
  minimumStock: z.number().int().min(0).max(1_000_000).default(0),
});

export const stockMovementInputSchema = z.object({
  productId: z.uuid(),
  kind: z.enum(["purchase", "adjustment_in", "adjustment_out", "loss"]),
  quantity: z.number().int().min(1).max(1_000_000),
  notes: z.string().trim().min(3).max(500),
});

export const patientTabInputSchema = z.object({
  patientId: z.uuid(),
  notes: z.string().trim().max(500).optional().or(z.literal("")),
});

export const patientTabItemInputSchema = z.object({
  productId: z.uuid(),
  quantity: z.number().int().min(1).max(10_000),
});

export const receivableStatusSchema = z.enum(["open", "paid", "cancelled"]);

export const paymentMethodSchema = z.enum([
  "pix",
  "card",
  "cash",
  "bank_transfer",
  "boleto",
  "other",
]);

export const paymentTimingSchema = z.object({
  paidAt: z.iso.datetime({ offset: true }).optional(),
  availableAt: z.iso.datetime({ offset: true }).optional(),
});
export const financialDatesSchema = paymentTimingSchema.extend({
  postedOn: z.iso.date().optional(),
  dueDate: z.iso.date().optional(),
  reason: z.string().trim().min(3).max(500),
});
export const paymentInputSchema = z.object({
  ...paymentTimingSchema.shape,
  paymentMethod: paymentMethodSchema.default("pix"),
});

export const patientTabCloseInputSchema = z
  .object({
    costCenterId: z.uuid().optional(),
    categoryId: z.uuid().optional(),
    settlement: z.enum(["paid", "receivable"]),
    paymentMethod: paymentMethodSchema.optional(),
    dueDate: z.iso.date(),
  })
  .refine(
    (value) => value.settlement !== "paid" || Boolean(value.paymentMethod),
    { message: "Informe a forma de pagamento.", path: ["paymentMethod"] },
  );

export const productUpdateSchema = productInputSchema
  .omit({ initialStock: true })
  .extend({ active: z.boolean().default(true) });
export const patientTabItemUpdateSchema = z.object({
  quantity: z.number().int().min(1).max(10000),
  unitPriceInCents: z.number().int().min(0).max(2147483647),
});
export const patientTabServiceInputSchema = z.object({
  appointmentId: z.uuid(),
  amountInCents: z.number().int().min(0).max(2147483647).optional(),
});
export const supplierInputSchema = z.object({
  name: z.string().trim().min(2).max(160),
  kind: z.enum(["person", "company"]),
  document: z.string().trim().max(30).default(""),
  phone: z.string().trim().max(30).default(""),
  email: z.email().optional().or(z.literal("")),
  notes: z.string().max(1000).default(""),
  active: z.boolean().default(true),
});
export const manualReceivableInputSchema = z.object({
  postedOn: z.iso.date().optional(),
  patientId: z.uuid(),
  description: z.string().trim().min(3).max(200),
  amountInCents: z.number().int().min(1).max(2147483647),
  dueDate: z.iso.date(),
  competence: competenceMonthSchema.optional(),
  categoryId: z.uuid().optional(),
  costCenterId: z.uuid().optional(),
});
export const financialClassificationSchema = z.object({
  competence: competenceMonthSchema,
  categoryId: z.uuid().nullable().optional(),
  costCenterId: z.uuid().nullable().optional(),
});
export const categoryDreInputSchema = z.object({
  dreGroup: z.enum([
    "unclassified",
    "service_revenue",
    "product_revenue",
    "tax",
    "service_cost",
    "product_cost",
    "variable_cost",
    "fixed_expense",
    "depreciation",
    "financial_result",
  ]),
});
export const dreFilterSchema = z
  .object({
    from: z.iso.date(),
    to: z.iso.date(),
    costCenterId: z.uuid().optional(),
  })
  .refine(
    (input) =>
      input.to >= input.from &&
      Number(input.to.slice(0, 4)) * 12 +
        Number(input.to.slice(5, 7)) -
        Number(input.from.slice(0, 4)) * 12 -
        Number(input.from.slice(5, 7)) <
        12,
    "Escolha um período de até 12 meses.",
  );

export const receivableAdjustmentInputSchema = z.object({
  amountInCents: z.number().int().min(0),
  reason: z.string().trim().min(5).max(500),
});

export const receivableRenegotiationInputSchema = z.object({
  receivableIds: z.array(z.uuid()).min(1).max(36),
  totalAmountInCents: z.number().int().min(0),
  installments: z.number().int().min(1).max(36),
  firstDueDate: z.iso.date(),
  reason: z.string().trim().min(5).max(500),
});

export const commissionRuleInputSchema = commissionTermsSchema.safeExtend({
  professionalId: z.uuid(),
});

export const commissionGenerationInputSchema = z.object({
  competence: z.string().regex(/^\d{4}-\d{2}$/),
});

export const financialCategoryInputSchema = z.object({
  name: z.string().trim().min(2).max(100),
  kind: z.enum(["income", "expense"]),
});

export const costCenterInputSchema = z.object({
  name: z.string().trim().min(2).max(100),
});

export const payableInputSchema = z.object({
  commissionId: z.uuid().optional(),
  postedOn: z.iso.date().optional(),
  dreCompetence: competenceMonthSchema.optional(),
  supplierId: z.uuid().optional(),
  description: z.string().trim().min(3).max(200),
  supplier: z.string().trim().max(160).optional().or(z.literal("")),
  categoryId: z.uuid(),
  costCenterId: z.uuid().optional(),
  dueDate: z.iso.date(),
  amountInCents: z.number().int().min(1),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
});

export const recurringPayableInputSchema = z
  .object({
    description: z.string().trim().min(3).max(200),
    supplier: z.string().trim().max(160).optional().or(z.literal("")),
    categoryId: z.uuid(),
    costCenterId: z.uuid(),
    amountInCents: z.number().int().min(1),
    dayOfMonth: z.number().int().min(1).max(28),
    startMonth: competenceMonthSchema,
    endMonth: competenceMonthSchema.optional(),
    active: z.boolean().default(true),
  })
  .refine((value) => !value.endMonth || value.endMonth >= value.startMonth, {
    message: "O mês final não pode ser anterior ao mês inicial.",
    path: ["endMonth"],
  });

export function nextCompetence(month: string): string {
  const [year, value] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year!, value!, 1));
  return date.toISOString().slice(0, 7);
}

/**
 * Competências (AAAA-MM) que uma despesa fixa deve ter até `currentMonth`,
 * inclusive: do mês inicial — ou do mês da reativação, se foi pausada — até o
 * menor entre o mês final e o mês atual. Pausada, não tem nenhuma.
 */
export function recurringPayableCompetences(
  model: {
    startMonth: string;
    endMonth?: string | undefined;
    resumedFromMonth?: string | undefined;
    active: boolean;
  },
  currentMonth: string,
): string[] {
  if (!model.active) return [];
  const from =
    model.resumedFromMonth && model.resumedFromMonth > model.startMonth
      ? model.resumedFromMonth
      : model.startMonth;
  const until =
    model.endMonth && model.endMonth < currentMonth
      ? model.endMonth
      : currentMonth;
  const months: string[] = [];
  for (
    let month = from;
    month <= until && months.length < 1200;
    month = nextCompetence(month)
  )
    months.push(month);
  return months;
}

/** Vencimento de uma competência: o dia fixo (1 a 28) dentro do mês. */
export function recurringPayableDueDate(
  competence: string,
  dayOfMonth: number,
): string {
  return `${competence}-${String(dayOfMonth).padStart(2, "0")}`;
}

// Caixa do dia (`GET /finance/daily-cash?date=`)

export const dailyCashFilterSchema = z.object({
  date: z.iso.date("Informe uma data válida.").optional(),
});

// Previsão financeira (`GET /finance/forecast?months=`)

export const financeForecastFilterSchema = z.object({
  months: z.coerce
    .number("Informe a quantidade de meses.")
    .int("Informe a quantidade de meses.")
    .min(1, "A previsão vai de 1 a 12 meses.")
    .max(12, "A previsão vai de 1 a 12 meses.")
    .default(6),
});
