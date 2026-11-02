import { describe, expect, it } from "vitest";
import {
  paymentPartsIssue,
  paymentPartsLabel,
  paymentPartsSchema,
  resolvePaymentParts,
  scalePaymentParts,
} from "./payment-parts.js";
import { planInstallmentSchedule } from "../agenda/model.js";
import {
  isRecurringChargeValid,
  patientPlanInputSchema,
  withPlanPaymentParts,
} from "../plans/model.js";

const money = (cents: number) => `R$ ${(cents / 100).toFixed(2)}`;

describe("pagamento picado", () => {
  it("exige ao menos uma forma, com valor", () => {
    expect(paymentPartsSchema.safeParse([]).error?.issues[0]?.message).toBe(
      "Informe ao menos uma forma de pagamento.",
    );
    expect(
      paymentPartsSchema.safeParse([{ paymentMethod: "pix", amountInCents: 0 }])
        .success,
    ).toBe(false);
  });

  it("explica quando as formas não somam o total", () => {
    const parts = [
      { paymentMethod: "pix" as const, amountInCents: 3_000 },
      { paymentMethod: "card" as const, amountInCents: 5_000 },
    ];
    expect(paymentPartsIssue(parts, 8_000, money)).toBeNull();
    expect(paymentPartsIssue(parts, 10_000, money)).toBe(
      "As formas de pagamento somam R$ 80.00: faltam R$ 20.00 para R$ 100.00.",
    );
    expect(paymentPartsIssue(parts, 7_000, money)).toBe(
      "As formas de pagamento somam R$ 80.00: passam R$ 10.00 de R$ 70.00.",
    );
  });

  it("transforma a forma única antiga em lista e descreve as formas", () => {
    expect(
      resolvePaymentParts({
        paymentMethod: "card",
        paymentInstallments: 1,
        amountInCents: 5_000,
      }),
    ).toEqual([{ paymentMethod: "card", amountInCents: 5_000 }]);
    expect(resolvePaymentParts({ amountInCents: 5_000 })).toEqual([]);
    expect(
      paymentPartsLabel(
        [
          { paymentMethod: "cash", amountInCents: 3_000 },
          {
            paymentMethod: "card",
            amountInCents: 7_000,
            paymentInstallments: 2,
          },
        ],
        money,
      ),
    ).toBe("Dinheiro R$ 30.00 + Cartão · 2x R$ 70.00");
  });

  it("reparte um novo total na proporção das formas", () => {
    expect(
      scalePaymentParts(
        [
          { paymentMethod: "pix", amountInCents: 1_000 },
          { paymentMethod: "card", amountInCents: 2_000 },
        ],
        1_000,
      ).map((part) => part.amountInCents),
    ).toEqual([333, 667]);
  });
});

describe("plano picado", () => {
  it("gera as cobranças de cada forma a partir do 1º vencimento", () => {
    expect(
      planInstallmentSchedule({
        totalValueInCents: 30_000,
        installments: 3,
        firstDueDate: "2026-11-10",
        paymentParts: [
          { paymentMethod: "pix", amountInCents: 10_000, installments: 1 },
          { paymentMethod: "card", amountInCents: 20_000, installments: 2 },
        ],
      }),
    ).toEqual([
      {
        installmentNumber: 1,
        dueDate: "2026-11-10",
        amountInCents: 10_000,
        paymentMethod: "pix",
      },
      {
        installmentNumber: 2,
        dueDate: "2026-11-10",
        amountInCents: 10_000,
        paymentMethod: "card",
      },
      {
        installmentNumber: 3,
        dueDate: "2026-12-10",
        amountInCents: 10_000,
        paymentMethod: "card",
      },
    ]);
  });

  it("reparte a cobrança proporcional entre as formas, antes das cheias", () => {
    const schedule = planInstallmentSchedule({
      totalValueInCents: 20_000,
      installments: 2,
      firstDueDate: "2026-11-10",
      validFrom: "2026-11-01",
      proratedChargeInCents: 10_000,
      paymentParts: [
        { paymentMethod: "pix", amountInCents: 5_000, installments: 1 },
        { paymentMethod: "card", amountInCents: 15_000, installments: 1 },
      ],
    });
    expect(
      schedule.map((item) => [
        item.installmentNumber,
        item.dueDate,
        item.amountInCents,
        item.paymentMethod,
      ]),
    ).toEqual([
      [1, "2026-11-01", 2_500, "pix"],
      [2, "2026-11-01", 7_500, "card"],
      [3, "2026-11-10", 5_000, "pix"],
      [4, "2026-11-10", 15_000, "card"],
    ]);
  });

  it("deriva forma e parcelas e cobra uma por forma no recorrente", () => {
    const parts = [
      { paymentMethod: "pix" as const, amountInCents: 10_000, installments: 1 },
      {
        paymentMethod: "card" as const,
        amountInCents: 20_000,
        installments: 2,
      },
    ];
    expect(
      withPlanPaymentParts({ installments: 1, paymentParts: parts }),
    ).toMatchObject({ installments: 3, paymentMethod: "pix" });
    const single = withPlanPaymentParts({
      installments: 1,
      paymentParts: [parts[1]!],
    });
    expect(single).toEqual({ installments: 2, paymentMethod: "card" });
    expect(
      isRecurringChargeValid({
        kind: "recurring",
        installments: 1,
        paymentParts: [parts[0]!, { ...parts[1]!, installments: 1 }],
      }),
    ).toBe(true);
    expect(
      isRecurringChargeValid({
        kind: "recurring",
        installments: 1,
        paymentParts: parts,
      }),
    ).toBe(false);
  });

  it("recusa formas que não somam o valor do plano", () => {
    const result = patientPlanInputSchema.safeParse({
      planTemplateId: "11111111-1111-4111-8111-111111111111",
      patientId: "11111111-1111-4111-8111-111111111112",
      kind: "fixed_package",
      name: "Plano picado",
      services: [
        {
          serviceId: "11111111-1111-4111-8111-111111111113",
          totalSessions: 4,
          totalValueInCents: 30_000,
        },
      ],
      validFrom: "2026-11-01",
      totalValueInCents: 30_000,
      installments: 2,
      firstDueDate: "2026-11-10",
      paymentParts: [
        { paymentMethod: "pix", amountInCents: 10_000, installments: 1 },
        { paymentMethod: "card", amountInCents: 10_000, installments: 1 },
      ],
    });
    expect(result.error?.issues.map((issue) => issue.message)).toContain(
      "As formas de pagamento precisam somar o valor total do plano.",
    );
  });
});
