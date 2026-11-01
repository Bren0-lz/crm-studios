import {
  type PaymentPart,
  isSplitPayment,
  paymentPartsIssue,
  resolvePaymentParts,
} from "@crm/contracts";
import { DomainError } from "../../repository.js";

const money = (cents: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    cents / 100,
  );

/** As formas do pagamento precisam somar o valor esperado (e existir ao menos uma). */
export function assertPaymentParts(
  parts: readonly PaymentPart[],
  expectedInCents: number,
) {
  const issue = paymentPartsIssue(parts, expectedInCents, money);
  if (issue) throw new DomainError("INVALID_PAYMENT_PARTS", issue, 400);
}

/** Lista gravada no lançamento: só no pagamento picado (forma única fica nas colunas de sempre). */
export function storedPaymentParts(
  parts: readonly PaymentPart[],
): PaymentPart[] | null {
  return isSplitPayment(parts) ? parts.map((part) => ({ ...part })) : null;
}

/**
 * Eventos da baixa mais recente: os pagamentos depois do último estorno. Um pagamento picado
 * grava um evento por forma; estorno, recibo e correção de datas tratam todos juntos.
 */
export function latestPaymentBatch<
  T extends { kind: "payment" | "reversal" | "payment_reversal" | string },
>(events: readonly T[]): T[] {
  let start = 0;
  events.forEach((event, index) => {
    if (event.kind === "reversal" || event.kind === "payment_reversal")
      start = index + 1;
  });
  return events.slice(start).filter((event) => event.kind === "payment");
}

/**
 * Formas do fechamento de comanda / venda de produto. Pago agora: obrigatórias e somando o
 * total. A receber: opcionais (as previstas), mas se vierem também precisam somar o total.
 */
export function tabPaymentParts(
  input: {
    settlement: "paid" | "receivable";
    paymentMethod?: PaymentPart["paymentMethod"] | undefined;
    paymentInstallments?: number | undefined;
    payments?: readonly PaymentPart[] | undefined;
  },
  totalInCents: number,
): PaymentPart[] {
  const parts = resolvePaymentParts({ ...input, amountInCents: totalInCents });
  if (input.settlement === "paid" || input.payments?.length)
    assertPaymentParts(parts, totalInCents);
  return parts;
}

/** Evento de pagamento/estorno lido para tratar a última baixa (MySQL). */
export interface BatchEvent {
  kind: "payment" | "payment_reversal";
  amountInCents: number;
  paymentMethod: PaymentPart["paymentMethod"] | null;
  discountInCents?: number | null;
  interestInCents?: number | null;
}
