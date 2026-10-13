export type ReceivableFilter = "all" | "open" | "overdue" | "paid";

export interface SettleTarget {
  kind: "receivable" | "payable";
  id: string;
  title: string;
  description: string;
  amountInCents: number;
}
