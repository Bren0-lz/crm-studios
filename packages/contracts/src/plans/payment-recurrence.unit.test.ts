import { describe, expect, it } from "vitest";
import {
  type PlanPaymentPart,
  autoRenewPaymentPartsValid,
  planPaymentRecurrenceChosen,
  renewalPlanPayment,
} from "../index.js";

const pix: PlanPaymentPart = {
  paymentMethod: "pix",
  amountInCents: 10000,
  installments: 1,
};
const card: PlanPaymentPart = {
  paymentMethod: "card",
  amountInCents: 30000,
  installments: 1,
};
const cash: PlanPaymentPart = {
  paymentMethod: "cash",
  amountInCents: 20000,
  installments: 1,
};

describe("formas do plano: só da primeira vez ou recorrente", () => {
  it("exige a marcação só no plano picado", () => {
    expect(planPaymentRecurrenceChosen({ paymentParts: [pix] })).toBe(true);
    expect(planPaymentRecurrenceChosen({ paymentParts: [pix, card] })).toBe(
      false,
    );
    expect(
      planPaymentRecurrenceChosen({
        paymentParts: [
          { ...pix, recurring: false },
          { ...card, recurring: true },
        ],
      }),
    ).toBe(true);
  });

  it("renovação automática pede ao menos uma recorrente", () => {
    const parts = [
      { ...pix, recurring: false },
      { ...card, recurring: false },
    ];
    expect(
      autoRenewPaymentPartsValid({ autoRenew: true, paymentParts: parts }),
    ).toBe(false);
    expect(
      autoRenewPaymentPartsValid({ autoRenew: false, paymentParts: parts }),
    ).toBe(true);
    // Plano antigo (sem a marcação) conta como recorrente.
    expect(
      autoRenewPaymentPartsValid({
        autoRenew: true,
        paymentParts: [pix, card],
      }),
    ).toBe(true);
  });

  it("renova só com as recorrentes, repartindo o valor total", () => {
    expect(
      renewalPlanPayment({
        totalValueInCents: 40000,
        paymentParts: [
          { ...pix, recurring: false },
          { ...card, recurring: true },
        ],
      }),
    ).toEqual({ paymentMethod: "card" });
    expect(
      renewalPlanPayment({
        totalValueInCents: 60000,
        paymentParts: [
          { ...pix, recurring: false },
          { ...card, recurring: true },
          { ...cash, recurring: true },
        ],
      }),
    ).toEqual({
      paymentMethod: "card",
      paymentParts: [
        { ...card, amountInCents: 36000, recurring: true },
        { ...cash, amountInCents: 24000, recurring: true },
      ],
    });
  });
});
