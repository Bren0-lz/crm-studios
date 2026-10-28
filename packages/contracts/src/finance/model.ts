import { z } from "zod";
import type { AdminUserServiceCommission } from "./types.js";
import { competenceMonthSchema, paymentMethodSchema } from "../common/model.js";
import {
  fillMessageTemplate,
  patientFirstName,
} from "../communications/model.js";

/**
 * Descrição da cobrança gerada ao fechar a comanda: data de abertura (dia local da clínica,
 * `aaaa-mm-dd`) e primeiro nome do cliente, sem o id interno ("Comanda de 19/10 · Marina").
 */
export function tabReceivableDescription(
  patientName: string,
  openedOn: string,
) {
  const [, month, day] = openedOn.split("-");
  return `Comanda de ${day}/${month} · ${patientFirstName(patientName)}`;
}

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

/**
 * Comissão do usuário num serviço específico (`commission_rules.user_id` + `service_id`):
 * prevalece sobre a regra geral do usuário nos atendimentos desse serviço.
 */
export const adminUserServiceCommissionInputSchema =
  commissionTermsSchema.safeExtend({ serviceId: z.uuid() });

/** Lista enviada no cadastro do usuário: um serviço só aparece uma vez por data de início. */
export const adminUserServiceCommissionsSchema = z
  .array(adminUserServiceCommissionInputSchema)
  .max(50)
  .refine(
    (items) =>
      new Set(items.map((item) => `${item.serviceId}|${item.effectiveFrom}`))
        .size === items.length,
    { message: "Serviço repetido com a mesma data de início." },
  );

/**
 * Regras de serviço do usuário que importam hoje: em cada serviço, a vigente (maior início que
 * já começou e não terminou) e as que começam depois dela. Ordem: serviço, depois início.
 */
export function serviceCommissionsInForce(
  rules: readonly AdminUserServiceCommission[],
  today: string,
): AdminUserServiceCommission[] {
  const live = rules.filter(
    (rule) => !rule.effectiveUntil || rule.effectiveUntil >= today,
  );
  const currentStart = new Map<string, string>();
  for (const rule of live)
    if (
      rule.effectiveFrom <= today &&
      rule.effectiveFrom > (currentStart.get(rule.serviceId) ?? "")
    )
      currentStart.set(rule.serviceId, rule.effectiveFrom);
  return live
    .filter(
      (rule) => rule.effectiveFrom >= (currentStart.get(rule.serviceId) ?? ""),
    )
    .sort(
      (a, b) =>
        a.serviceName.localeCompare(b.serviceName, "pt-BR") ||
        a.serviceId.localeCompare(b.serviceId) ||
        a.effectiveFrom.localeCompare(b.effectiveFrom),
    );
}

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

export { paymentMethodSchema };

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
/** Venda de produtos em uma etapa: abre, preenche e fecha a comanda na mesma transação. */
export const productSaleInputSchema = z
  .object({
    patientId: z.uuid(),
    notes: z.string().trim().max(500).optional().or(z.literal("")),
    items: z
      .array(
        z.object({
          productId: z.uuid(),
          quantity: z.number().int().min(1).max(10_000),
          unitPriceInCents: z.number().int().min(0).max(2147483647).optional(),
        }),
      )
      .min(1, "Adicione ao menos um produto.")
      .max(50)
      .refine(
        (items) =>
          new Set(items.map((item) => item.productId)).size === items.length,
        { message: "Cada produto entra uma vez só na venda." },
      ),
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
export const patientTabServiceInputSchema = z.object({
  appointmentId: z.uuid(),
  amountInCents: z.number().int().min(0).max(2147483647).optional(),
});
/** Recorrência do valor contratado com o fornecedor. */
export const supplierBillingCycleSchema = z.enum([
  "one_time",
  "monthly",
  "quarterly",
  "yearly",
]);
export const supplierInputSchema = z.object({
  name: z.string().trim().min(2).max(160),
  kind: z.enum(["person", "company"]),
  document: z.string().trim().max(30).default(""),
  phone: z.string().trim().max(30).default(""),
  whatsapp: z.string().trim().max(30).default(""),
  email: z.email().optional().or(z.literal("")),
  hiredOn: z.iso.date().optional(),
  contractAmountInCents: z.number().int().min(0).max(2147483647).optional(),
  billingCycle: supplierBillingCycleSchema.default("one_time"),
  paymentMethod: paymentMethodSchema.optional(),
  installments: z.number().int().min(1).max(120).default(1),
  paymentTerms: z.string().trim().max(300).default(""),
  orders: z.string().max(2000).default(""),
  contracts: z.string().max(2000).default(""),
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

/** Baixa de parcela (U39): desconto, juros e valor recebido (parcial gera nova parcela). */
export const receivableSettlementSchema = paymentInputSchema.extend({
  discountInCents: z.number().int().min(0).default(0),
  interestInCents: z.number().int().min(0).default(0),
  /** Sem valor = recebe o valor final inteiro. */
  receivedInCents: z.number().int().positive().optional(),
  /** Vencimento da parcela com o saldo; sem data, mantém o vencimento original. */
  balanceDueDate: z.iso.date().optional(),
});

export interface SettlementBreakdown {
  finalInCents: number;
  receivedInCents: number;
  balanceInCents: number;
  error?: string;
}

/** Valor final = parcela − desconto + juros; o que faltar do recebido vira saldo. */
export function settlementBreakdown(
  amountInCents: number,
  input: {
    discountInCents?: number | undefined;
    interestInCents?: number | undefined;
    receivedInCents?: number | undefined;
  },
): SettlementBreakdown {
  const discount = input.discountInCents ?? 0;
  const interest = input.interestInCents ?? 0;
  const finalInCents = amountInCents - discount + interest;
  const receivedInCents = input.receivedInCents ?? finalInCents;
  const result = {
    finalInCents,
    receivedInCents,
    balanceInCents: Math.max(0, finalInCents - receivedInCents),
  };
  if (discount > amountInCents)
    return {
      ...result,
      error: "O desconto não pode ser maior que o valor da parcela.",
    };
  if (finalInCents <= 0)
    return { ...result, error: "O valor final precisa ser maior que zero." };
  if (receivedInCents <= 0)
    return { ...result, error: "Informe o valor recebido." };
  if (receivedInCents > finalInCents)
    return {
      ...result,
      error: "O valor recebido não pode passar do valor final.",
    };
  return result;
}

/**
 * Mensagem pronta para falar com o cliente sobre uma parcela em aberto: em atraso, avisa e
 * pergunta se aconteceu algo; a vencer, só lembra. A equipe pode editar antes de enviar.
 */
export function receivableContactMessage(input: {
  patientName: string;
  description: string;
  amountInCents: number;
  dueDate: string;
  overdue: boolean;
}): string {
  const [year, month, day] = input.dueDate.split("-");
  const amount = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(input.amountInCents / 100);
  const installment = `a parcela "${input.description}" de ${amount}`;
  const due = `${day}/${month}/${year}`;
  const greeting = `Olá, ${patientFirstName(input.patientName)}! Tudo bem?`;
  return input.overdue
    ? `${greeting} Notamos que ${installment}, com vencimento em ${due}, ainda está em aberto. Aconteceu alguma coisa? Se precisar, podemos combinar juntos a melhor forma de pagamento.`
    : `${greeting} Passando para lembrar que ${installment} vence em ${due}. Qualquer dúvida, estamos à disposição.`;
}

/** Variáveis do modelo da mensagem de cobrança Pix (Configurações › Dados da clínica). */
export const pixMessageVariables = [
  { code: "{{nome}}", label: "Nome", example: "Marina" },
  {
    code: "{{nome_completo}}",
    label: "Nome completo",
    example: "Marina Costa",
  },
  { code: "{{plano}}", label: "Plano", example: "Pilates 2x semana" },
  { code: "{{sessoes}}", label: "Sessões", example: "8 sessões" },
  { code: "{{valor_total}}", label: "Valor total", example: "R$ 480,00" },
  { code: "{{valor_sessao}}", label: "Valor por sessão", example: "R$ 60,00" },
  { code: "{{parcelas}}", label: "Parcelas", example: "3" },
  {
    code: "{{valor_parcela}}",
    label: "Valor da 1ª parcela",
    example: "R$ 160,00",
  },
  {
    code: "{{chave_pix}}",
    label: "Chave Pix",
    example: "financeiro@clinica.com.br",
  },
] as const;

/**
 * Mensagem de cobrança por Pix do plano vendido no cadastro: valor proporcional às sessões
 * (preço por sessão), a primeira cobrança (parcela ou ciclo) e a chave da clínica. Com
 * `template` preenchido, usa o modelo da clínica (`pixMessageVariables`); vazio, o texto padrão.
 */
export function planPixChargeMessage(input: {
  patientName: string;
  planName: string;
  totalValueInCents: number;
  installments: number;
  totalSessions: number;
  pixKey: string;
  template?: string | undefined;
}): string {
  const money = (cents: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })
      .format(cents / 100)
      .replace(/\u00a0/g, " ");
  const installments = Math.max(1, input.installments);
  // Mesma divisão de `planInstallmentSchedule`: o resto vai nos primeiros centavos.
  const firstCharge =
    Math.floor(input.totalValueInCents / installments) +
    (input.totalValueInCents % installments ? 1 : 0);
  const sessions = `${input.totalSessions} ${input.totalSessions === 1 ? "sessão" : "sessões"}`;
  const sessionValue =
    input.totalSessions > 0
      ? money(Math.round(input.totalValueInCents / input.totalSessions))
      : "";
  if (input.template?.trim())
    return fillMessageTemplate(input.template, {
      nome: patientFirstName(input.patientName),
      nome_completo: input.patientName.trim(),
      plano: input.planName,
      sessoes: sessions,
      valor_total: money(input.totalValueInCents),
      valor_sessao: sessionValue,
      parcelas: String(installments),
      valor_parcela: money(firstCharge),
      chave_pix: input.pixKey,
    });
  const perSession = sessionValue ? ` (${sessionValue} por sessão)` : "";
  const charge =
    installments > 1
      ? `o plano “${input.planName}” tem ${sessions} por ${money(input.totalValueInCents)}${perSession}, em ${installments} parcelas; a 1ª parcela é de ${money(firstCharge)}`
      : `o valor do plano “${input.planName}” é de ${money(firstCharge)}, referente a ${sessions}${perSession}`;
  return `Olá, ${patientFirstName(input.patientName)}! Tudo bem? Seja bem-vindo(a)! Para confirmar, ${charge}. Chave Pix: ${input.pixKey}. Assim que fizer o pagamento, envie o comprovante por aqui. Obrigado!`;
}
