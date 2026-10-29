import { z } from "zod";

/**
 * Alcance do desconto de um plano vendido nas cobranças dele (cada parcela ou renovação é
 * uma cobrança): `once` = só a próxima cobrança; `next` = as próximas `charges` cobranças;
 * `permanent` = todas, até a equipe remover.
 */
export const patientDiscountScopeSchema = z.enum(["once", "next", "permanent"]);

const patientDiscountScopeShape = {
  scope: patientDiscountScopeSchema,
  /** Quantas cobranças recebem o desconto (só em `next`). */
  charges: z
    .number()
    .int("Informe quantas cobranças recebem o desconto.")
    .min(
      2,
      "Informe ao menos 2 cobranças (para uma só, use “Só no próximo pagamento”).",
    )
    .max(36, "O desconto pode valer em até 36 cobranças.")
    .optional(),
  /** Cobranças que já usaram o desconto (gravado pelo sistema). */
  usedCharges: z.number().int().min(0).optional(),
};

/** Desconto do plano: porcentagem (até 100%) ou valor em centavos, com o alcance. */
export const patientDiscountSchema = z
  .discriminatedUnion("type", [
    z.object({
      type: z.literal("percentage"),
      percent: z
        .number()
        .gt(0, "Informe uma porcentagem maior que zero.")
        .max(100, "A porcentagem pode ser de até 100%.")
        .refine(
          (value) => Math.abs(Math.round(value * 100) - value * 100) < 1e-6,
          "Use no máximo duas casas decimais.",
        ),
      ...patientDiscountScopeShape,
    }),
    z.object({
      type: z.literal("amount"),
      amountInCents: z
        .number()
        .int()
        .positive("Informe um valor de desconto maior que zero."),
      ...patientDiscountScopeShape,
    }),
  ])
  .superRefine((value, context) => {
    if (value.scope === "next" && value.charges === undefined)
      context.addIssue({
        code: "custom",
        message: "Informe quantas cobranças recebem o desconto.",
        path: ["charges"],
      });
  });

type StoredPatientDiscount = z.infer<typeof patientDiscountSchema>;

/** Cobranças em que o desconto ainda vale (`Infinity` no permanente). */
export function patientDiscountRemaining(
  discount: StoredPatientDiscount | null | undefined,
) {
  if (!discount) return 0;
  if (discount.scope === "permanent") return Infinity;
  const limit = discount.scope === "once" ? 1 : (discount.charges ?? 0);
  return Math.max(0, limit - (discount.usedCharges ?? 0));
}

/** Mesmo desconto (tipo, valor e alcance), sem olhar quantas cobranças já usaram. */
export function samePatientDiscount(
  a: StoredPatientDiscount | null | undefined,
  b: StoredPatientDiscount | null | undefined,
) {
  if (!a || !b) return !a && !b;
  return (
    a.type === b.type &&
    (a.type === "percentage"
      ? a.percent === (b as typeof a).percent
      : a.amountInCents === (b as typeof a).amountInCents) &&
    a.scope === b.scope &&
    (a.scope !== "next" || a.charges === b.charges)
  );
}

/** "10% de desconto · nas próximas 3 cobranças (1 usada)"; vazio sem desconto. */
export function patientDiscountDescription(
  discount: StoredPatientDiscount | null | undefined,
) {
  if (!discount) return "";
  const value =
    discount.type === "percentage"
      ? `${discount.percent.toLocaleString("pt-BR")}%`
      : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })
          .format(discount.amountInCents / 100)
          .replace(/\u00a0/g, " ");
  const used = discount.usedCharges ?? 0;
  const reach =
    discount.scope === "permanent"
      ? "permanente"
      : discount.scope === "once"
        ? used
          ? "já usado no pagamento"
          : "só no próximo pagamento"
        : `nas próximas ${discount.charges} cobranças${used ? ` (${used} ${used === 1 ? "usada" : "usadas"})` : ""}`;
  return `${value} de desconto · ${reach}`;
}

/** Valor do desconto sobre uma cobrança (nunca maior que a cobrança). */
export function patientDiscountOff(
  amountInCents: number,
  discount: StoredPatientDiscount | null | undefined,
) {
  if (!discount) return 0;
  const off =
    discount.type === "percentage"
      ? Math.round((amountInCents * discount.percent) / 100)
      : discount.amountInCents;
  return Math.min(Math.max(0, amountInCents), off);
}

/** Valor com o desconto aplicado (nunca abaixo de zero). */
export function applyPatientDiscount(
  amountInCents: number,
  discount: StoredPatientDiscount | null | undefined,
) {
  return amountInCents - patientDiscountOff(amountInCents, discount);
}

/**
 * Parcelas de um plano com o desconto dele: aplica nas primeiras cobranças enquanto o
 * alcance permitir e devolve quantas cobranças usaram o desconto.
 */
export function discountedInstallments<T extends { amountInCents: number }>(
  installments: readonly T[],
  discount: StoredPatientDiscount | null | undefined,
): {
  installments: Array<T & { customerDiscountInCents: number }>;
  usedCharges: number;
} {
  let remaining = patientDiscountRemaining(discount);
  let usedCharges = 0;
  return {
    installments: installments.map((item) => {
      if (remaining <= 0) return { ...item, customerDiscountInCents: 0 };
      const off = patientDiscountOff(item.amountInCents, discount);
      if (off <= 0) return { ...item, customerDiscountInCents: 0 };
      remaining -= 1;
      usedCharges += 1;
      return {
        ...item,
        amountInCents: item.amountInCents - off,
        customerDiscountInCents: off,
      };
    }),
    usedCharges,
  };
}

/**
 * Parcelas de um plano vendido ou renovado com o desconto do plano. Na renovação, sem
 * desconto informado (ou com o mesmo) segue o do plano anterior, contando o que já foi
 * usado; um desconto diferente começa do zero. `orderDiscountInCents` (parte do desconto
 * geral do pedido) abate depois, da 1ª cobrança em diante. Devolve o desconto a gravar.
 */
export function discountedPlanInstallments<T extends { amountInCents: number }>(
  installments: readonly T[],
  discount: StoredPatientDiscount | null | undefined,
  previous?: StoredPatientDiscount | null,
  orderDiscountInCents = 0,
) {
  const inherited =
    previous &&
    (discount
      ? samePatientDiscount(discount, previous)
      : patientDiscountRemaining(previous) > 0);
  const { usedCharges: alreadyUsed = 0, ...terms } =
    (inherited ? previous : discount) ?? {};
  const base = inherited || discount ? (terms as StoredPatientDiscount) : null;
  const result = discountedInstallments(
    installments,
    base && { ...base, usedCharges: inherited ? alreadyUsed : 0 },
  );
  const usedCharges = (inherited ? alreadyUsed : 0) + result.usedCharges;
  let orderLeft = Math.max(0, orderDiscountInCents);
  return {
    installments: result.installments.map((item) => {
      const off = Math.min(orderLeft, item.amountInCents);
      orderLeft -= off;
      return off
        ? {
            ...item,
            amountInCents: item.amountInCents - off,
            customerDiscountInCents: item.customerDiscountInCents + off,
          }
        : item;
    }),
    discount: base
      ? { ...base, ...(usedCharges ? { usedCharges } : {}) }
      : undefined,
  };
}
