import { z } from "zod";
import { paymentMethodSchema } from "../common/model.js";

/** Maior parcelamento aceito em qualquer venda (planos, comandas e baixas). */
export const maxInstallmentsLimit = 36;

type Method = z.infer<typeof paymentMethodSchema>;

export const paymentMethodLabels: Record<Method, string> = {
  pix: "Pix",
  card: "Cartão",
  cash: "Dinheiro",
  bank_transfer: "Transferência",
  boleto: "Boleto",
  other: "Outro",
};

/** Parcelamento de uma forma de pagamento: `maxInstallments` 1 = só à vista. */
export const paymentMethodInstallmentsSchema = z
  .object({
    method: paymentMethodSchema,
    acceptsInstallments: z.boolean(),
    maxInstallments: z.number().int().min(1).max(maxInstallmentsLimit),
  })
  .refine((value) => !value.acceptsInstallments || value.maxInstallments >= 2, {
    message: "Quem aceita parcelamento precisa permitir ao menos 2 parcelas.",
    path: ["maxInstallments"],
  });

export const paymentMethodSettingsInputSchema = z.object({
  methods: z
    .array(paymentMethodInstallmentsSchema)
    .max(paymentMethodSchema.options.length)
    .refine(
      (items) =>
        new Set(items.map((item) => item.method)).size === items.length,
      "Cada forma de pagamento aparece uma vez só.",
    ),
});

export type PaymentMethodInstallments = z.infer<
  typeof paymentMethodInstallmentsSchema
>;
export type PaymentMethodSettingsInput = z.infer<
  typeof paymentMethodSettingsInputSchema
>;

export interface PaymentMethodSettings {
  /** Sempre todas as formas, na ordem de `paymentMethodSchema`. */
  methods: PaymentMethodInstallments[];
  updatedAt?: string;
}

/**
 * Sem configuração, toda forma aceita até o limite geral: o sistema se comporta como antes
 * até a clínica restringir.
 */
export function defaultPaymentMethodInstallments(
  method: Method,
): PaymentMethodInstallments {
  return {
    method,
    acceptsInstallments: true,
    maxInstallments: maxInstallmentsLimit,
  };
}

/** Completa as formas não gravadas com o padrão e normaliza "não aceita" para 1 parcela. */
export function resolvePaymentMethodSettings(
  saved: readonly PaymentMethodInstallments[] | null | undefined,
  updatedAt?: string,
): PaymentMethodSettings {
  return {
    methods: paymentMethodSchema.options.map((method) => {
      const item =
        saved?.find((entry) => entry.method === method) ??
        defaultPaymentMethodInstallments(method);
      return {
        method,
        acceptsInstallments: item.acceptsInstallments,
        maxInstallments: item.acceptsInstallments ? item.maxInstallments : 1,
      };
    }),
    ...(updatedAt ? { updatedAt } : {}),
  };
}

/** Máximo de parcelas da forma (1 = só à vista). Sem forma escolhida, não há limite da forma. */
export function paymentMethodMaxInstallments(
  settings: Pick<PaymentMethodSettings, "methods"> | null | undefined,
  method: Method | undefined,
): number {
  if (!method) return maxInstallmentsLimit;
  const item = settings?.methods.find((entry) => entry.method === method);
  if (!item) return maxInstallmentsLimit;
  return item.acceptsInstallments ? item.maxInstallments : 1;
}

/** Máximo do plano do catálogo: ausente = sem limite próprio; 1 = só à vista. */
export function planTemplateMaxInstallments(
  template: { maxInstallments?: number | null | undefined } | null | undefined,
) {
  return template?.maxInstallments ?? maxInstallmentsLimit;
}

export interface InstallmentsLimit {
  max: number;
  /** Quem impõe o limite, para explicar na tela e no erro. */
  reason: "method" | "template" | "none";
}

/** O menor limite entre a forma de pagamento e o plano do catálogo. */
export function installmentsLimit(input: {
  settings: Pick<PaymentMethodSettings, "methods"> | null | undefined;
  paymentMethod?: Method | undefined;
  template?: { maxInstallments?: number | null | undefined } | null | undefined;
}): InstallmentsLimit {
  const byMethod = paymentMethodMaxInstallments(
    input.settings,
    input.paymentMethod,
  );
  const byTemplate = planTemplateMaxInstallments(input.template);
  if (byMethod >= maxInstallmentsLimit && byTemplate >= maxInstallmentsLimit)
    return { max: maxInstallmentsLimit, reason: "none" };
  return byTemplate < byMethod
    ? { max: byTemplate, reason: "template" }
    : { max: byMethod, reason: "method" };
}

/** "à vista" ou "até 6x". */
export function installmentsLimitLabel(max: number) {
  return max <= 1 ? "só à vista" : `até ${max}x`;
}

/** Mensagem do limite, ou null quando a quantidade cabe nele. */
export function installmentsIssue(
  installments: number,
  limit: InstallmentsLimit,
  paymentMethod?: Method,
): string | null {
  if (installments <= limit.max) return null;
  if (limit.reason === "template")
    return limit.max <= 1
      ? "Este plano não aceita parcelamento: use 1 parcela."
      : `Este plano aceita no máximo ${limit.max} parcelas.`;
  const label = paymentMethod ? paymentMethodLabels[paymentMethod] : "";
  return limit.max <= 1
    ? `${label} não aceita parcelamento: use 1 parcela.`
    : `${label} aceita no máximo ${limit.max} parcelas.`;
}

/** Parcela de um parcelamento (plano em N vezes) não é parcelada de novo na baixa. */
export const installmentPaymentSplitIssue =
  "Esta cobrança já é uma parcela: receba em 1x, sem parcelar na forma de pagamento.";

/** A cobrança aceita parcelar o pagamento na forma (cartão em 3x) na baixa. */
export function acceptsPaymentInstallments(entry: {
  installmentCount?: number | undefined;
}) {
  return (entry.installmentCount ?? 1) <= 1;
}

/** "Cartão · 3x" (ou só "Cartão" à vista). */
export function paymentMethodWithInstallments(
  method: Method,
  installments?: number | null,
) {
  const label = paymentMethodLabels[method];
  return installments && installments > 1
    ? `${label} · ${installments}x`
    : label;
}
