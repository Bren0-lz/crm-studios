import { describe, expect, it } from "vitest";
import { discountedPlanInstallments } from "./discount.js";

const charges = (...amounts: number[]) =>
  amounts.map((amountInCents) => ({ amountInCents }));
const nextTwo = {
  type: "percentage",
  percent: 10,
  scope: "next",
  charges: 2,
} as const;

describe("discountedPlanInstallments", () => {
  it("starts a new plan discount from zero, ignoring the informed usage", () => {
    const result = discountedPlanInstallments(charges(10_000, 10_000, 10_000), {
      ...nextTwo,
      usedCharges: 5,
    });
    expect(result.installments.map((item) => item.amountInCents)).toEqual([
      9_000, 9_000, 10_000,
    ]);
    expect(result.discount).toEqual({ ...nextTwo, usedCharges: 2 });
  });

  it("keeps the previous plan discount on renewal until it runs out", () => {
    const previous = { ...nextTwo, usedCharges: 1 };
    const inherited = discountedPlanInstallments(
      charges(10_000, 10_000),
      undefined,
      previous,
    );
    expect(inherited.installments.map((item) => item.amountInCents)).toEqual([
      9_000, 10_000,
    ]);
    expect(inherited.discount).toEqual({ ...nextTwo, usedCharges: 2 });
    // O mesmo desconto reenviado conta o uso; um diferente começa do zero.
    expect(
      discountedPlanInstallments(charges(10_000), nextTwo, previous).discount,
    ).toEqual({ ...nextTwo, usedCharges: 2 });
    expect(
      discountedPlanInstallments(
        charges(10_000),
        { ...nextTwo, percent: 20 },
        previous,
      ).installments[0]!.amountInCents,
    ).toBe(8_000);
    // Esgotado: a renovação não leva mais o desconto.
    const exhausted = discountedPlanInstallments(charges(10_000), undefined, {
      ...nextTwo,
      usedCharges: 2,
    });
    expect(exhausted.discount).toBeUndefined();
    expect(exhausted.installments[0]!.customerDiscountInCents).toBe(0);
  });

  it("takes the order discount share from the first charges", () => {
    const result = discountedPlanInstallments(
      charges(10_000, 10_000, 10_000),
      { type: "amount", amountInCents: 1_000, scope: "once" },
      undefined,
      12_000,
    );
    expect(
      result.installments.map((item) => [
        item.amountInCents,
        item.customerDiscountInCents,
      ]),
    ).toEqual([
      [0, 10_000],
      [7_000, 3_000],
      [10_000, 0],
    ]);
  });
});
