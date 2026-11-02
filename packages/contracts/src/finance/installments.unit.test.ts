import { describe, expect, it } from "vitest";
import { planPaymentSummary } from "../plans/model.js";
import { matchesFinancialEntry } from "./entry-filters.js";
import {
  acceptsPaymentInstallments,
  installmentsIssue,
  installmentsLimit,
  paymentMethodSettingsInputSchema,
  paymentMethodWithInstallments,
  resolvePaymentMethodSettings,
} from "./installments.js";

const settings = resolvePaymentMethodSettings([
  { method: "pix", acceptsInstallments: false, maxInstallments: 12 },
  { method: "card", acceptsInstallments: true, maxInstallments: 6 },
]);

describe("payment method installments", () => {
  it("fills unsaved methods with the default and normalizes refused installments", () => {
    expect(settings.methods.map((item) => item.method)).toEqual([
      "pix",
      "card",
      "cash",
      "bank_transfer",
      "boleto",
      "other",
    ]);
    expect(settings.methods[0]).toEqual({
      method: "pix",
      acceptsInstallments: false,
      maxInstallments: 1,
    });
    expect(settings.methods[2]!.maxInstallments).toBe(36);
  });

  it("rejects repeated methods and accepting installments with a single one", () => {
    expect(
      paymentMethodSettingsInputSchema.safeParse({
        methods: [
          { method: "card", acceptsInstallments: true, maxInstallments: 3 },
          { method: "card", acceptsInstallments: false, maxInstallments: 1 },
        ],
      }).success,
    ).toBe(false);
    expect(
      paymentMethodSettingsInputSchema.safeParse({
        methods: [
          { method: "card", acceptsInstallments: true, maxInstallments: 1 },
        ],
      }).success,
    ).toBe(false);
    expect(
      paymentMethodSettingsInputSchema.safeParse({
        methods: [
          { method: "card", acceptsInstallments: true, maxInstallments: 37 },
        ],
      }).success,
    ).toBe(false);
  });

  it("uses the smallest limit between the method and the plan template", () => {
    expect(installmentsLimit({ settings, paymentMethod: "card" })).toEqual({
      max: 6,
      reason: "method",
    });
    expect(
      installmentsLimit({
        settings,
        paymentMethod: "card",
        template: { maxInstallments: 3 },
      }),
    ).toEqual({ max: 3, reason: "template" });
    // "A combinar": só o plano limita.
    expect(installmentsLimit({ settings })).toEqual({
      max: 36,
      reason: "none",
    });
    expect(
      installmentsLimit({ settings, template: { maxInstallments: null } }),
    ).toEqual({ max: 36, reason: "none" });
  });

  it("explains the limit in pt-BR only when the quantity exceeds it", () => {
    const card = installmentsLimit({ settings, paymentMethod: "card" });
    expect(installmentsIssue(6, card, "card")).toBeNull();
    expect(installmentsIssue(7, card, "card")).toBe(
      "Cartão aceita no máximo 6 parcelas.",
    );
    expect(
      installmentsIssue(
        2,
        installmentsLimit({ settings, paymentMethod: "pix" }),
        "pix",
      ),
    ).toBe("Pix não aceita parcelamento: use 1 parcela.");
    expect(
      installmentsIssue(
        2,
        installmentsLimit({ settings, template: { maxInstallments: 1 } }),
      ),
    ).toBe("Este plano não aceita parcelamento: use 1 parcela.");
    expect(paymentMethodWithInstallments("card", 3)).toBe("Cartão · 3x");
    expect(paymentMethodWithInstallments("pix", 1)).toBe("Pix");
  });

  it("summarizes paid, open and overdue plan installments without cancelled ones", () => {
    expect(planPaymentSummary([])).toBeNull();
    expect(
      planPaymentSummary([
        { status: "paid", amountInCents: 10000, overdue: false },
        { status: "open", amountInCents: 10000, overdue: true },
        { status: "open", amountInCents: 5000, overdue: false },
        { status: "cancelled", amountInCents: 9999, overdue: false },
      ]),
    ).toEqual({
      installmentCount: 3,
      paidCount: 1,
      openCount: 2,
      overdueCount: 1,
      paidInCents: 10000,
      openInCents: 15000,
    });
  });

  it("counts the balance of a partial payment as its original installment", () => {
    const installment = (
      installmentNumber: number,
      status: "open" | "paid",
      balanceOfInstallment?: number,
    ) => ({
      status,
      amountInCents: 40000,
      overdue: false,
      installmentNumber,
      ...(balanceOfInstallment ? { balanceOfInstallment } : {}),
    });
    // 1/3 paga em parte (saldo = parcela 4 de origem 1), 2/3 e 3/3 em aberto.
    const partial = [
      installment(1, "paid"),
      installment(2, "open"),
      installment(3, "open"),
      installment(4, "open", 1),
    ];
    expect(planPaymentSummary(partial)).toMatchObject({
      installmentCount: 3,
      paidCount: 0,
      openCount: 3,
    });
    partial[3]!.status = "paid";
    expect(planPaymentSummary(partial)).toMatchObject({
      installmentCount: 3,
      paidCount: 1,
      openCount: 2,
    });
  });

  it("filters entries that belong to an installment plan or were paid in installments", () => {
    const base = {
      description: "Parcela",
      status: "open",
      createdAt: "2040-01-01T12:00:00.000Z",
      dueDate: "2040-01-10",
      overdue: false,
    };
    const filter = {
      dateField: "dueDate" as const,
      installments: "installments" as const,
    };
    expect(
      matchesFinancialEntry({ ...base, installmentCount: 3 }, filter),
    ).toBe(true);
    expect(
      matchesFinancialEntry(
        { ...base, installmentCount: 1, paymentInstallments: 4 },
        filter,
      ),
    ).toBe(true);
    expect(
      matchesFinancialEntry({ ...base, installmentCount: 1 }, filter),
    ).toBe(false);
    expect(
      matchesFinancialEntry(base, { ...filter, installments: "single" }),
    ).toBe(true);
  });

  it("does not split an installment of a plan again on settlement", () => {
    expect(acceptsPaymentInstallments({ installmentCount: 1 })).toBe(true);
    expect(acceptsPaymentInstallments({})).toBe(true);
    expect(acceptsPaymentInstallments({ installmentCount: 3 })).toBe(false);
  });
});
