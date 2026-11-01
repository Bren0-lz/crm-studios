import {
  type PaymentMethod,
  type PaymentPart,
  type PlanPaymentPart,
  paymentMethodLabels,
  paymentMethodSchema,
  paymentPartsIssue,
} from "@crm/contracts";
import { currency } from "./formatting";

const money = (cents: number) => currency.format(cents / 100);

/**
 * Forma de pagamento em edição. `installments` é o parcelamento na forma (venda/baixa) ou a
 * quantidade de cobranças (plano). `amountInCents` null = ainda sem valor digitado.
 */
export interface PaymentPartDraft {
  paymentMethod: PaymentMethod;
  amountInCents: number | null;
  installments: number;
  /** Completa o total sozinha (a forma que o usuário não digitou por último). */
  auto?: boolean;
}

export function draftTotal(parts: readonly PaymentPartDraft[]) {
  return parts.reduce((sum, part) => sum + (part.amountInCents ?? 0), 0);
}

/** Primeira forma ainda não usada (para a forma nova não repetir a anterior). */
export function nextPaymentMethod(
  parts: readonly PaymentPartDraft[],
): PaymentMethod {
  return (
    paymentMethodSchema.options.find(
      (method) => !parts.some((part) => part.paymentMethod === method),
    ) ?? "pix"
  );
}

/**
 * Valores em vigor: forma única acompanha o total; com várias, a forma automática (a última
 * marcada com `auto`) fica com o que falta para o total.
 */
export function effectiveDrafts(
  parts: readonly PaymentPartDraft[],
  totalInCents: number,
): PaymentPartDraft[] {
  if (parts.length === 1)
    return [{ ...parts[0]!, amountInCents: totalInCents || null }];
  const autoIndex = parts.map((part) => Boolean(part.auto)).lastIndexOf(true);
  if (autoIndex < 0) return [...parts];
  const others = parts.reduce(
    (sum, part, index) =>
      index === autoIndex ? sum : sum + (part.amountInCents ?? 0),
    0,
  );
  const rest = totalInCents - others;
  return parts.map((part, index) =>
    index === autoIndex
      ? { ...part, amountInCents: rest > 0 ? rest : null }
      : part,
  );
}

/** Nova forma: as atuais ficam com o valor que têm e a nova recebe o que falta. */
export function addDraft(
  parts: readonly PaymentPartDraft[],
  totalInCents: number,
  autoBalance: boolean,
): PaymentPartDraft[] {
  const current = effectiveDrafts(parts, totalInCents).map((part) => ({
    ...part,
    auto: false,
  }));
  const rest = totalInCents - draftTotal(current);
  return [
    ...current,
    {
      paymentMethod: nextPaymentMethod(current),
      amountInCents: rest > 0 ? rest : null,
      installments: 1,
      auto: autoBalance,
    },
  ];
}

/**
 * Valor digitado numa forma: ela deixa de ser automática e, com o equilíbrio ligado, a
 * última das outras passa a completar o total.
 */
export function setDraftAmount(
  parts: readonly PaymentPartDraft[],
  totalInCents: number,
  index: number,
  amountInCents: number | null,
  autoBalance: boolean,
): PaymentPartDraft[] {
  const current = effectiveDrafts(parts, totalInCents);
  const absorber = autoBalance
    ? current
        .map((_, position) => position)
        .filter((position) => position !== index)
        .at(-1)
    : undefined;
  return current.map((part, position) => ({
    ...part,
    ...(position === index ? { amountInCents } : {}),
    auto: position === absorber,
  }));
}

/** Remove uma forma (nunca a última que sobrou); a última passa a completar o total. */
export function removeDraft(
  parts: readonly PaymentPartDraft[],
  totalInCents: number,
  index: number,
  autoBalance: boolean,
): PaymentPartDraft[] {
  if (parts.length <= 1) return [...parts];
  const rest = effectiveDrafts(parts, totalInCents).filter(
    (_, position) => position !== index,
  );
  return rest.map((part, position) => ({
    ...part,
    auto: autoBalance && position === rest.length - 1,
  }));
}

export function sameDrafts(
  a: readonly PaymentPartDraft[],
  b: readonly PaymentPartDraft[],
) {
  return (
    a.length === b.length &&
    a.every(
      (part, index) =>
        part.paymentMethod === b[index]!.paymentMethod &&
        part.amountInCents === b[index]!.amountInCents &&
        part.installments === b[index]!.installments,
    )
  );
}

/** Formas do pagamento (venda, comanda, baixa, conta a pagar) para a API. */
export function toPaymentParts(
  parts: readonly PaymentPartDraft[],
): PaymentPart[] {
  return parts.map((part) => ({
    paymentMethod: part.paymentMethod,
    amountInCents: part.amountInCents ?? 0,
    ...(part.installments > 1
      ? { paymentInstallments: part.installments }
      : {}),
  }));
}

export function fromPaymentParts(
  parts: readonly PaymentPart[] | undefined,
  totalInCents: number,
  fallback: PaymentMethod = "pix",
): PaymentPartDraft[] {
  if (!parts?.length)
    return [
      {
        paymentMethod: fallback,
        amountInCents: totalInCents || null,
        installments: 1,
      },
    ];
  return parts.map((part) => ({
    paymentMethod: part.paymentMethod,
    amountInCents: part.amountInCents,
    installments: part.paymentInstallments ?? 1,
  }));
}

/** Formas do plano: cada uma com a quantidade de cobranças. */
export function toPlanParts(
  parts: readonly PaymentPartDraft[],
): PlanPaymentPart[] {
  return parts.map((part) => ({
    paymentMethod: part.paymentMethod,
    amountInCents: part.amountInCents ?? 0,
    installments: Math.max(1, part.installments),
  }));
}

/** Formas do plano em edição: a lista do picado ou a forma única dos campos de sempre. */
export function planDrafts(plan: {
  paymentMethod?: PaymentMethod | undefined;
  paymentParts?: readonly PlanPaymentPart[] | undefined;
  installments: number;
  totalValueInCents: number;
}): PaymentPartDraft[] {
  if (plan.paymentParts && plan.paymentParts.length > 1)
    return plan.paymentParts.map((part) => ({
      paymentMethod: part.paymentMethod,
      amountInCents: part.amountInCents || null,
      installments: part.installments,
    }));
  return [
    {
      paymentMethod: plan.paymentMethod ?? "pix",
      amountInCents: plan.totalValueInCents || null,
      installments: plan.installments,
    },
  ];
}

/**
 * Campos do plano a partir das formas: forma única volta para `paymentMethod`/`installments`
 * (sem lista); picado guarda a lista e deriva os dois.
 */
export function planPaymentFields(
  parts: readonly PaymentPartDraft[],
  recurring: boolean,
): {
  paymentMethod: PaymentMethod;
  installments: number;
  paymentParts: PlanPaymentPart[] | undefined;
} {
  if (parts.length === 1)
    return {
      paymentMethod: parts[0]!.paymentMethod,
      installments: recurring ? 1 : Math.max(1, parts[0]!.installments),
      paymentParts: undefined,
    };
  const planParts = toPlanParts(parts).map((part) =>
    recurring ? { ...part, installments: 1 } : part,
  );
  return {
    paymentMethod: planParts[0]!.paymentMethod,
    installments: recurring
      ? 1
      : planParts.reduce((sum, part) => sum + part.installments, 0),
    paymentParts: planParts,
  };
}

/**
 * Mensagem do que falta nas formas (valor vazio ou soma diferente do total); `null` quando
 * dá para salvar. `allowPartial`: soma menor que o total é pagamento parcial (baixa).
 */
export function paymentDraftsIssue(
  parts: readonly PaymentPartDraft[],
  totalInCents: number,
  allowPartial = false,
): string | null {
  const effective = effectiveDrafts(parts, totalInCents);
  if (!effective.length) return "Informe ao menos uma forma de pagamento.";
  if (effective.some((part) => !part.amountInCents))
    return "Informe o valor de cada forma de pagamento.";
  if (allowPartial && draftTotal(effective) <= totalInCents) return null;
  return paymentPartsIssue(
    effective.map((part) => ({ amountInCents: part.amountInCents ?? 0 })),
    totalInCents,
    money,
  );
}

/** "Pix", "Cartão · 3x" ou "Pix R$ 30,00 + Cartão R$ 70,00". */
export function paymentDraftsLabel(parts: readonly PaymentPartDraft[]) {
  return parts
    .map(
      (part) =>
        `${paymentMethodLabels[part.paymentMethod]}${part.installments > 1 ? ` · ${part.installments}x` : ""}${parts.length > 1 ? ` ${money(part.amountInCents ?? 0)}` : ""}`,
    )
    .join(" + ");
}
