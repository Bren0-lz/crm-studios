import { describe, expect, it } from "vitest";
import { guidedOrder } from "./order";

const plan = {
  key: "plan-1",
  name: "Pilates 2x semana",
  detail: "Plano · 3 parcelas",
  terms: {
    totalValueInCents: 48_000,
    installments: 3,
    firstDueDate: "2026-11-10",
  },
};
const bottle = {
  key: "product-1",
  name: "Garrafa térmica",
  detail: "2 × R$ 50,00",
  quantity: 2,
  unitPriceInCents: 5_000,
};

describe("guidedOrder", () => {
  it("sums plans and products with their own discounts and the general one", () => {
    const order = guidedOrder(
      [
        {
          ...plan,
          discount: { type: "amount", amountInCents: 2_000, scope: "once" },
        },
      ],
      [
        {
          ...bottle,
          discount: { type: "percentage", percent: 10, scope: "once" },
        },
      ],
      { type: "amount", amountInCents: 5_500, scope: "once" },
    );
    // R$ 460 + R$ 90 = R$ 550 depois dos descontos dos itens; o geral é rateado nisso.
    expect(
      order.lines.map((line) => [
        line.grossInCents,
        line.itemDiscountInCents,
        line.orderDiscountInCents,
        line.netInCents,
      ]),
    ).toEqual([
      [48_000, 2_000, 4_600, 41_400],
      [10_000, 1_000, 900, 8_100],
    ]);
    expect(order.lines[1]!.unitNetInCents).toBe(4_050);
    expect(order).toMatchObject({
      subtotalInCents: 58_000,
      itemDiscountInCents: 3_000,
      orderDiscountInCents: 5_500,
      totalInCents: 49_500,
    });
  });

  it("rounds the product unit price up, never giving more than agreed", () => {
    const order = guidedOrder([], [{ ...bottle, quantity: 3 }], {
      type: "amount",
      amountInCents: 1_000,
      scope: "once",
    });
    // R$ 150 − R$ 10 = R$ 140 em 3 unidades: R$ 46,67 cada (R$ 140,01).
    expect(order.lines[0]).toMatchObject({
      unitNetInCents: 4_667,
      netInCents: 14_001,
      orderDiscountInCents: 999,
    });
    expect(order.totalInCents).toBe(14_001);
  });
});
