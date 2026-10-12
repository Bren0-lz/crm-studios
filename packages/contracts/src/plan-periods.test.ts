import { describe, expect, it } from "vitest";
import {
  planTemplateInputSchema,
  planPeriodEnd,
  planSessionsForPeriod,
  planTypeLabels,
  type PlanType,
} from "./index.js";
const serviceId = "77777777-7777-4777-8777-777777777777";
describe("fixed plan periods", () => {
  it.each([
    ["monthly", 8],
    ["quarterly", 24],
    ["semiannual", 48],
    ["annual", 96],
  ] as [PlanType, number][])(
    "calculates the %s balance at twice per week",
    (planType, totalSessions) => {
      expect(planSessionsForPeriod(planType, 2)).toBe(totalSessions);
      expect(
        planTemplateInputSchema.parse({
          name: planTypeLabels[planType],
          planType,
          totalValueInCents: 16000,
          services: [
            {
              serviceId,
              sessionsPerWeek: 2,
              totalSessions,
              totalValueInCents: 16000,
            },
          ],
        }).services[0]!.totalSessions,
      ).toBe(totalSessions);
    },
  );
  it("rejects absent, fractional or invalid weekly frequency and inconsistent balances", () => {
    const base = {
      name: "Plano mensal",
      planType: "monthly",
      totalValueInCents: 16000,
    };
    for (const sessionsPerWeek of [undefined, 0, 8, 1.5])
      expect(
        planTemplateInputSchema.safeParse({
          ...base,
          services: [
            {
              serviceId,
              sessionsPerWeek,
              totalSessions: 8,
              totalValueInCents: 16000,
            },
          ],
        }).success,
      ).toBe(false);
    expect(
      planTemplateInputSchema.safeParse({
        ...base,
        services: [
          {
            serviceId,
            sessionsPerWeek: 2,
            totalSessions: 9,
            totalValueInCents: 16000,
          },
        ],
      }).success,
    ).toBe(false);
  });
  it("keeps existing, single and promotional manual quantities compatible", () => {
    for (const planType of [undefined, "single", "promotional"])
      expect(
        planTemplateInputSchema.safeParse({
          name: "Plano teste",
          planType,
          totalValueInCents: 16000,
          services: [{ serviceId, totalSessions: 3, totalValueInCents: 16000 }],
        }).success,
      ).toBe(true);
  });
  it("uses calendar months, including month ends and leap years", () => {
    expect(planPeriodEnd("monthly", "2026-10-10")).toBe("2026-11-09");
    expect(planPeriodEnd("semiannual", "2026-10-10")).toBe("2027-04-09");
    expect(planPeriodEnd("monthly", "2028-01-31")).toBe("2028-02-28");
    expect(planPeriodEnd("annual", "2028-02-29")).toBe("2029-02-27");
    expect(planPeriodEnd("promotional", "2026-10-10")).toBe("");
    expect(planPeriodEnd("monthly", "")).toBe("");
  });
});
