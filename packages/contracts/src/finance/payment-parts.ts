import { z } from "zod";
import { paymentMethodSchema } from "../common/model.js";
import {
  maxInstallmentsLimit,
  paymentMethodWithInstallments,
} from "./installments.js";

type Method = z.infer<typeof paymentMethodSchema>;

/** Máximo de formas num mesmo pagamento picado. */
export const maxPaymentParts = 6;

/**
 * Uma forma de um pagamento picado (ex.: R$ 30 em dinheiro + R$ 70 no cartão em 2x).
 * `paymentInstallments` é o parcelamento na própria forma; ausente = à vista.
 */
export const paymentPartSchema = z.object({
  paymentMethod: paymentMethodSchema,
  amountInCents: z
    .number("Informe o valor de cada forma de pagamento.")
    .int()
    .min(1, "Cada forma de pagamento precisa ter valor.")
    .max(2147483647),
  paymentInstallments: z
    .number()
    .int()
    .min(1)
    .max(maxInstallmentsLimit)
    .optional(),
});

/** Formas do pagamento: ao menos uma; nunca fica sem forma de pagamento. */
export const paymentPartsSchema = z
  .array(paymentPartSchema)
  .min(1, "Informe ao menos uma forma de pagamento.")
  .max(
    maxPaymentParts,
    `Use no máximo ${maxPaymentParts} formas de pagamento.`,
  );

export type PaymentPart = z.infer<typeof paymentPartSchema>;

/**
 * Forma de um plano picado: cada parte vira cobranças próprias. `installments` é a
 * quantidade de cobranças desta parte (ex.: R$ 200 no cartão em 2 cobranças mensais).
 */
export const planPaymentPartSchema = z.object({
  paymentMethod: paymentMethodSchema,
  amountInCents: z
    .number("Informe o valor de cada forma de pagamento.")
    .int()
    .min(1, "Cada forma de pagamento precisa ter valor.")
    .max(2147483647),
  installments: z.number().int().min(1).max(maxInstallmentsLimit),
});

export const planPaymentPartsSchema = z
  .array(planPaymentPartSchema)
  .min(1, "Informe ao menos uma forma de pagamento.")
  .max(
    maxPaymentParts,
    `Use no máximo ${maxPaymentParts} formas de pagamento.`,
  );

export type PlanPaymentPart = z.infer<typeof planPaymentPartSchema>;

export function paymentPartsTotal(
  parts: readonly { amountInCents: number }[],
): number {
  return parts.reduce((sum, part) => sum + part.amountInCents, 0);
}

/** Mensagem quando as formas não somam o valor esperado; `null` quando batem. */
export function paymentPartsIssue(
  parts: readonly { amountInCents: number }[],
  expectedInCents: number,
  format: (cents: number) => string = defaultMoney,
): string | null {
  if (!parts.length) return "Informe ao menos uma forma de pagamento.";
  const total = paymentPartsTotal(parts);
  if (total === expectedInCents) return null;
  return total < expectedInCents
    ? `As formas de pagamento somam ${format(total)}: faltam ${format(expectedInCents - total)} para ${format(expectedInCents)}.`
    : `As formas de pagamento somam ${format(total)}: passam ${format(total - expectedInCents)} de ${format(expectedInCents)}.`;
}

/** Forma única (pedido antigo) ou as formas informadas, sempre como lista. */
export function resolvePaymentParts(input: {
  payments?: readonly PaymentPart[] | undefined;
  paymentMethod?: Method | undefined;
  paymentInstallments?: number | undefined;
  amountInCents: number;
}): PaymentPart[] {
  if (input.payments?.length) return input.payments.map(cleanPart);
  if (!input.paymentMethod) return [];
  return [
    cleanPart({
      paymentMethod: input.paymentMethod,
      amountInCents: input.amountInCents,
      ...(input.paymentInstallments
        ? { paymentInstallments: input.paymentInstallments }
        : {}),
    }),
  ];
}

/** Parcelamento 1 = à vista: não grava. */
function cleanPart(part: PaymentPart): PaymentPart {
  return {
    paymentMethod: part.paymentMethod,
    amountInCents: part.amountInCents,
    ...(part.paymentInstallments && part.paymentInstallments > 1
      ? { paymentInstallments: part.paymentInstallments }
      : {}),
  };
}

/** Só vale a pena guardar a lista quando há mais de uma forma. */
export function isSplitPayment(
  parts: readonly unknown[] | null | undefined,
): boolean {
  return (parts?.length ?? 0) > 1;
}

/** "Pix R$ 30,00 + Cartão · 2x R$ 70,00" (ou só "Pix" numa forma única). */
export function paymentPartsLabel(
  parts: readonly PaymentPart[],
  format: (cents: number) => string = defaultMoney,
): string {
  if (parts.length === 1)
    return paymentMethodWithInstallments(
      parts[0]!.paymentMethod,
      parts[0]!.paymentInstallments,
    );
  return parts
    .map(
      (part) =>
        `${paymentMethodWithInstallments(part.paymentMethod, part.paymentInstallments)} ${format(part.amountInCents)}`,
    )
    .join(" + ");
}

/**
 * Reparte `totalInCents` entre as formas na proporção de `parts` (o resto dos centavos vai na
 * última). Usado quando o valor muda depois da escolha das formas (desconto, proporcional).
 */
export function scalePaymentParts<T extends { amountInCents: number }>(
  parts: readonly T[],
  totalInCents: number,
): T[] {
  const base = paymentPartsTotal(parts);
  if (!parts.length) return [];
  if (base === totalInCents) return parts.map((part) => ({ ...part }));
  let used = 0;
  return parts.map((part, index) => {
    const amountInCents =
      index === parts.length - 1
        ? totalInCents - used
        : base > 0
          ? Math.floor((part.amountInCents * totalInCents) / base)
          : 0;
    used += amountInCents;
    return { ...part, amountInCents };
  });
}

function defaultMoney(cents: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}
