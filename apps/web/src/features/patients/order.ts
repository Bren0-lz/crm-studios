import {
  allocatePlanRevenue,
  discountedPlanInstallments,
  patientDiscountOff,
  planInstallmentSchedule,
  type PatientDiscount,
  type ProductSize,
} from "@crm/contracts";

/** Produto vendido no cadastro guiado; `key` só identifica o bloco. */
export interface GuidedProductLine {
  key: number;
  productId: string;
  /** Tamanho escolhido ("" = ainda não escolhido ou produto sem tamanhos). */
  size: ProductSize | "";
  quantity: number;
  unitPriceInCents: number;
  discount?: PatientDiscount | undefined;
}

export type OrderPlanItem = {
  key: string;
  name: string;
  detail: string;
  /** Termos já com a 1ª parcela proporcional, quando houver. */
  terms: {
    totalValueInCents: number;
    installments: number;
    firstDueDate: string;
    firstInstallmentInCents?: number | undefined;
  };
  discount?: PatientDiscount | undefined;
};

export type OrderProductItem = {
  key: string;
  name: string;
  detail: string;
  quantity: number;
  unitPriceInCents: number;
  discount?: PatientDiscount | undefined;
};

export interface OrderLine {
  key: string;
  kind: "plan" | "product";
  name: string;
  detail: string;
  /** Valor cheio das cobranças geradas agora (plano) ou da linha (produto). */
  grossInCents: number;
  /** Desconto do próprio plano/produto. */
  itemDiscountInCents: number;
  /** Parte do desconto geral que coube a este item. */
  orderDiscountInCents: number;
  netInCents: number;
  /** Produto: preço unitário já com os descontos (o que vai para a venda). */
  unitNetInCents?: number;
}

export interface GuidedOrder {
  lines: OrderLine[];
  subtotalInCents: number;
  itemDiscountInCents: number;
  orderDiscountInCents: number;
  totalInCents: number;
}

/**
 * Sacola do cadastro: valor de cada plano (cobranças geradas na venda) e produto, com o
 * desconto de cada um e o desconto geral rateado pelo valor que sobra de cada item.
 * No produto o desconto vira preço unitário arredondado para cima (nunca dá mais do que
 * o combinado), então o valor exibido é o que de fato será cobrado.
 */
export function guidedOrder(
  plans: readonly OrderPlanItem[],
  products: readonly OrderProductItem[],
  orderDiscount: PatientDiscount | null | undefined,
): GuidedOrder {
  const planLines = plans.map((plan) => {
    const discounted = discountedPlanInstallments(
      planInstallmentSchedule(plan.terms),
      plan.discount,
    );
    const net = discounted.installments.reduce(
      (sum, item) => sum + item.amountInCents,
      0,
    );
    const off = discounted.installments.reduce(
      (sum, item) => sum + item.customerDiscountInCents,
      0,
    );
    return { plan, gross: net + off, off, net };
  });
  const productLines = products.map((product) => {
    const gross = product.quantity * product.unitPriceInCents;
    const off = patientDiscountOff(gross, product.discount);
    return { product, gross, off, net: gross - off };
  });
  const beforeOrder = [...planLines, ...productLines].reduce(
    (sum, item) => sum + item.net,
    0,
  );
  const orderOff = patientDiscountOff(beforeOrder, orderDiscount);
  const shares = allocatePlanRevenue(
    orderOff,
    [...planLines, ...productLines].map((item) => ({
      totalValueInCents: item.net,
    })),
  );
  const lines: OrderLine[] = [
    ...planLines.map(({ plan, gross, off, net }, index): OrderLine => {
      const share = Math.min(net, shares[index] ?? 0);
      return {
        key: plan.key,
        kind: "plan",
        name: plan.name,
        detail: plan.detail,
        grossInCents: gross,
        itemDiscountInCents: off,
        orderDiscountInCents: share,
        netInCents: net - share,
      };
    }),
    ...productLines.map(({ product, gross, off, net }, index): OrderLine => {
      const target = Math.max(0, net - (shares[planLines.length + index] ?? 0));
      const unitNet = Math.ceil(target / Math.max(1, product.quantity));
      const charged = unitNet * product.quantity;
      const itemOff = Math.min(off, gross - charged);
      return {
        key: product.key,
        kind: "product",
        name: product.name,
        detail: product.detail,
        grossInCents: gross,
        itemDiscountInCents: itemOff,
        orderDiscountInCents: gross - charged - itemOff,
        netInCents: charged,
        unitNetInCents: unitNet,
      };
    }),
  ];
  // O arredondamento do preço unitário dos produtos devolve centavos do desconto geral:
  // eles ficam com os planos, para o total do desconto ser o combinado.
  let leftover =
    orderOff -
    lines.reduce((total, line) => total + line.orderDiscountInCents, 0);
  for (const line of lines) {
    if (leftover <= 0) break;
    if (line.kind !== "plan") continue;
    const extra = Math.min(leftover, line.netInCents);
    line.orderDiscountInCents += extra;
    line.netInCents -= extra;
    leftover -= extra;
  }
  const sum = (pick: (line: OrderLine) => number) =>
    lines.reduce((total, line) => total + pick(line), 0);
  return {
    lines,
    subtotalInCents: sum((line) => line.grossInCents),
    itemDiscountInCents: sum((line) => line.itemDiscountInCents),
    orderDiscountInCents: sum((line) => line.orderDiscountInCents),
    totalInCents: sum((line) => line.netInCents),
  };
}
