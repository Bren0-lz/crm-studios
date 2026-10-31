import { describe, expect, it } from "vitest";
import { receivableSettlementSchema, settlementSteps } from "./model.js";

describe("pagamento misto", () => {
  it("divide a baixa em etapas: desconto na primeira e saldo só no fim", () => {
    const plan = settlementSteps(10_000, {
      discountInCents: 500,
      balanceDueDate: "2030-01-10",
      payments: [
        { paymentMethod: "pix", amountInCents: 3_000 },
        { paymentMethod: "card", amountInCents: 5_000, paymentInstallments: 3 },
        { paymentMethod: "cash", amountInCents: 1_000 },
      ],
    });
    expect(plan.error).toBeUndefined();
    expect(plan.steps).toEqual([
      {
        paymentMethod: "pix",
        adjustments: {
          discountInCents: 500,
          interestInCents: 0,
          receivedInCents: 3_000,
        },
        balanceLabel: "parte 2",
      },
      {
        paymentMethod: "card",
        adjustments: { receivedInCents: 5_000, paymentInstallments: 3 },
        balanceLabel: "parte 3",
      },
      {
        paymentMethod: "cash",
        adjustments: { receivedInCents: 1_000, balanceDueDate: "2030-01-10" },
        balanceLabel: "saldo",
      },
    ]);
  });

  it("recusa soma acima do valor final e total diferente do recebido", () => {
    expect(
      settlementSteps(10_000, {
        interestInCents: 100,
        payments: [
          { paymentMethod: "pix", amountInCents: 5_000 },
          { paymentMethod: "card", amountInCents: 5_101 },
        ],
      }).error,
    ).toBe("A soma das formas de pagamento não pode passar do valor final.");
    const payments = [
      { paymentMethod: "pix", amountInCents: 5_000 },
      { paymentMethod: "card", amountInCents: 4_000 },
    ];
    expect(
      receivableSettlementSchema.safeParse({ payments, receivedInCents: 8_000 })
        .success,
    ).toBe(false);
    expect(
      receivableSettlementSchema.safeParse({ payments, receivedInCents: 9_000 })
        .success,
    ).toBe(true);
    expect(
      receivableSettlementSchema.safeParse({ payments: payments.slice(0, 1) })
        .success,
    ).toBe(false);
  });
});
