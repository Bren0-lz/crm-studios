import {
  itemsInstallmentPreview,
  paymentMethodLabels,
  type PaymentMethod,
} from "@crm/contracts";

/**
 * Parcelas de uma venda de produtos (tela Vendas e sacola do cadastro): pago agora divide
 * no parcelamento da forma de pagamento; a receber é uma cobrança no vencimento.
 */
export function productSaleInstallments(input: {
  items: readonly { label: string; grossInCents: number }[];
  discountInCents?: number | undefined;
  /** Rótulo da linha de desconto; "Descontos" quando há desconto geral junto. */
  discountLabel?: string | undefined;
  settlement: "paid" | "receivable";
  paymentMethod: PaymentMethod;
  paymentInstallments: number;
  dueDate: string;
}) {
  const paid = input.settlement === "paid";
  return {
    rows: itemsInstallmentPreview({
      items: input.items,
      discountInCents: input.discountInCents,
      discountLabel: input.discountLabel ?? "Descontos dos produtos",
      installments: paid ? input.paymentInstallments : 1,
      firstDueDate: paid ? undefined : input.dueDate,
    }),
    dueLabel: paid
      ? `pago na venda · ${paymentMethodLabels[input.paymentMethod]}`
      : undefined,
  };
}
