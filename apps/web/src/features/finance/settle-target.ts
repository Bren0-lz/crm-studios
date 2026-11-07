import {
  paymentPartsTotal,
  planPaymentSummary,
  scalePaymentParts,
  settlementBreakdown,
  type Receivable,
  type SettlementAdjustments,
} from "@crm/contracts";
import { currency } from "../../shared/lib/formatting";
import type { SettleTarget } from "./types";

/**
 * Baixa de uma conta a receber: a forma combinada na venda do plano vem marcada, as formas
 * previstas na venda vêm ajustadas ao valor atual da parcela e, nas cobranças de plano, o
 * modal mostra o total contratado e quantas parcelas já foram pagas.
 */
export function receivableSettleTarget(
  item: Receivable,
  receivables: readonly Receivable[],
): SettleTarget {
  const method = item.planPaymentMethod ?? item.paymentMethod;
  const summary = item.planId
    ? planPaymentSummary(
        receivables.filter((entry) => entry.planId === item.planId),
      )
    : null;
  return {
    kind: "receivable",
    id: item.id,
    title: item.patientName,
    description: item.description,
    amountInCents: item.amountInCents,
    dueDate: item.dueDate,
    installmentCount: item.installmentCount,
    ...(method ? { paymentMethod: method } : {}),
    ...(item.paymentParts
      ? {
          paymentParts: scalePaymentParts(
            item.paymentParts,
            item.amountInCents,
          ),
        }
      : {}),
    ...(summary && item.planTotalInCents !== undefined
      ? {
          plan: {
            totalInCents: item.planTotalInCents,
            installmentCount: summary.installmentCount,
            paidCount: summary.paidCount,
          },
        }
      : {}),
  };
}

/** Aviso da baixa de uma conta a receber: misto, parcial (saldo em nova parcela) ou inteira. */
export function receivableSettledMessage(
  amountInCents: number,
  adjustments?: SettlementAdjustments,
) {
  const balance = adjustments
    ? settlementBreakdown(amountInCents, {
        ...adjustments,
        // Picado: o recebido é a soma das formas.
        ...(adjustments.payments
          ? { receivedInCents: paymentPartsTotal(adjustments.payments) }
          : {}),
      }).balanceInCents
    : 0;
  const parts = adjustments?.payments?.length ?? 0;
  const rest =
    balance > 0
      ? ` O saldo de ${currency.format(balance / 100)} virou uma nova parcela.`
      : "";
  return parts > 1
    ? `Pagamento misto recebido em ${parts} formas.${rest}`
    : balance > 0
      ? `Pagamento parcial recebido.${rest}`
      : "Pagamento recebido.";
}
