import { describe, expect, it } from "vitest";
import {
  allocatePlanRevenue,
  nextPlanPeriod,
  planServiceTotals,
  planTemplateUpdateSchema,
} from "./model.js";

describe("plan values and periods", () => {
  it.each([
    [101, [50, 50], [51, 50]],
    [101, [1, 3], [25, 76]],
    [2, [3, 1, 2], [1, 0, 1]],
    [100, [0, 0, 0], [34, 33, 33]],
    [0, [20, 80], [0, 0]],
    [100, [], []],
    [2147483647, [2147483647, 2147483647], [1073741824, 1073741823]],
  ])(
    "allocates %i cents with stable ties and no lost cents",
    (amount, weights, expected) => {
      const actual = allocatePlanRevenue(
        amount,
        weights.map((totalValueInCents) => ({ totalValueInCents })),
      );
      expect(actual).toEqual(expected);
      if (weights.length)
        expect(actual.reduce((sum, value) => sum + value, 0)).toBe(amount);
    },
  );

  it("derives totals from services while preserving the sold terms", () => {
    const input = {
      name: "Pacote combinado",
      services: [
        { serviceId: "first", totalSessions: 4, totalValueInCents: 10000 },
        { serviceId: "second", totalSessions: 2, totalValueInCents: 5000 },
      ],
    };
    expect(planServiceTotals(input)).toEqual({
      ...input,
      serviceId: "first",
      totalSessions: 6,
    });
  });

  it("accepts an active-only template update and rejects an empty update", () => {
    expect(planTemplateUpdateSchema.parse({ active: false })).toEqual({
      active: false,
    });
    expect(planTemplateUpdateSchema.safeParse({}).success).toBe(false);
  });

  it("renews monthly terms across February without shifting the first due date", () => {
    expect(
      nextPlanPeriod({
        validFrom: "2028-01-01",
        validUntil: "2028-01-31",
        firstDueDate: "2028-01-10",
      }),
    ).toEqual({
      validFrom: "2028-02-01",
      validUntil: "2028-02-29",
      firstDueDate: "2028-02-10",
    });
  });

  it("renews an irregular period by its number of days", () => {
    expect(
      nextPlanPeriod({
        validFrom: "2026-01-10",
        validUntil: "2026-01-19",
        firstDueDate: "2026-01-12",
      }),
    ).toEqual({
      validFrom: "2026-01-20",
      validUntil: "2026-01-29",
      firstDueDate: "2026-01-22",
    });
  });

  it("does not derive a renewal for a plan without an end date", () => {
    expect(
      nextPlanPeriod({ validFrom: "2026-01-01", firstDueDate: "2026-01-01" }),
    ).toBeNull();
  });
});
