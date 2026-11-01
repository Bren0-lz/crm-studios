import type { PaymentPart } from "@crm/contracts";
import type { PaymentMethod } from "@crm/contracts";

export type ReceivableFilter =
  "all" | "open" | "overdue" | "paid" | "cancelled";

export interface SettleTarget {
  kind: "receivable" | "payable";
  id: string;
  title: string;
  description: string;
  amountInCents: number;
  /** Vencimento original (parcela): padrão do vencimento do saldo no pagamento parcial. */
  dueDate?: string;
  /** Formas previstas na venda (parcela aberta): sugeridas na baixa. */
  paymentParts?: PaymentPart[];
  /** Forma já combinada (ex.: na venda do plano): vem marcada na baixa. */
  paymentMethod?: PaymentMethod;
  /** Parcelas do parcelamento da cobrança: acima de 1, não se parcela de novo na forma. */
  installmentCount?: number;
  /** Plano de origem: valor total contratado e situação das parcelas. */
  plan?: {
    totalInCents: number;
    installmentCount: number;
    paidCount: number;
  };
}
