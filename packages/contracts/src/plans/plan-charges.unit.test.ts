import { describe, expect, it } from "vitest";
import {
  installmentsBeyondValidity,
  patientPlanInputSchema,
  planDisplayStatus,
} from "./model.js";

const plan = {
  planTemplateId: "11111111-1111-4111-8111-111111111111",
  patientId: "22222222-2222-4222-8222-222222222222",
  name: "Dançaterapia 2x",
  services: [
    {
      serviceId: "33333333-3333-4333-8333-333333333333",
      totalSessions: 8,
      totalValueInCents: 16_000,
    },
  ],
  validFrom: "2026-10-01",
  validUntil: "2026-10-31",
  totalValueInCents: 16_000,
  firstDueDate: "2026-10-05",
};

describe("plan charges", () => {
  it("accepts a recurring plan only with one charge per cycle", () => {
    expect(
      patientPlanInputSchema.safeParse({
        ...plan,
        kind: "recurring",
        installments: 1,
      }).success,
    ).toBe(true);
    const result = patientPlanInputSchema.safeParse({
      ...plan,
      kind: "recurring",
      installments: 3,
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(
      "No plano recorrente a cobrança é uma por ciclo: use 1 parcela.",
    );
  });

  it("allows a fixed package with installments after the validity, reporting the last due date", () => {
    expect(
      patientPlanInputSchema.safeParse({
        ...plan,
        kind: "fixed_package",
        installments: 3,
      }).success,
    ).toBe(true);
    expect(installmentsBeyondValidity({ ...plan, installments: 3 })).toBe(
      "2026-12-05",
    );
    expect(installmentsBeyondValidity({ ...plan, installments: 1 })).toBeNull();
    expect(
      installmentsBeyondValidity({ ...plan, validUntil: "", installments: 6 }),
    ).toBeNull();
  });

  it("shows an active plan without balance as exhausted", () => {
    expect(planDisplayStatus({ status: "active", remainingSessions: 0 })).toBe(
      "exhausted",
    );
    expect(planDisplayStatus({ status: "active", remainingSessions: 2 })).toBe(
      "active",
    );
    expect(planDisplayStatus({ status: "paused", remainingSessions: 0 })).toBe(
      "paused",
    );
  });
});
