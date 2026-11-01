import type { PaymentPart } from "@crm/contracts";

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
}
