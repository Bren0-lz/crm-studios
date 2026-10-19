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
}
