import { describe, expect, it } from "vitest";
import {
  planPeriodEnd,
  planSessionsForPeriod,
  planTemplateInputSchema,
  planTemplateStoredSchema,
  planTemplateUpdateChangesTerms,
  planTemplateUpdateSchema,
  planTypeLabels,
  singlePlanServicesMessage,
  type PlanType,
} from "../index.js";
const serviceId = "77777777-7777-4777-8777-777777777777";
const otherServiceId = "88888888-8888-4888-8888-888888888888";
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
  it("keeps existing and promotional manual quantities compatible", () => {
    for (const planType of [undefined, "promotional"])
      expect(
        planTemplateInputSchema.safeParse({
          name: "Plano teste",
          planType,
          totalValueInCents: 16000,
          services: [{ serviceId, totalSessions: 3, totalValueInCents: 16000 }],
        }).success,
      ).toBe(true);
  });
  it("accepts a single plan only with one session of one service", () => {
    const single = (services: { totalSessions: number }[]) =>
      planTemplateInputSchema.safeParse({
        name: "Avaliação",
        planType: "single",
        totalValueInCents: 16000 * services.length,
        services: services.map((item, index) => ({
          serviceId: index ? otherServiceId : serviceId,
          totalSessions: item.totalSessions,
          totalValueInCents: 16000,
        })),
      });
    expect(single([{ totalSessions: 1 }]).success).toBe(true);
    for (const services of [
      [{ totalSessions: 3 }],
      [{ totalSessions: 1 }, { totalSessions: 1 }],
    ]) {
      const result = single(services);
      expect(result.success).toBe(false);
      expect(result.error?.issues[0]).toMatchObject({
        path: ["services"],
        message: singlePlanServicesMessage,
      });
    }
  });
  it("keeps an old single plan with several sessions while its terms stay", () => {
    const stored = {
      name: "Avulso antigo",
      planType: "single" as const,
      totalValueInCents: 30000,
      services: [{ serviceId, totalSessions: 3, totalValueInCents: 30000 }],
    };
    expect(planTemplateStoredSchema.safeParse(stored).success).toBe(true);
    expect(planTemplateUpdateChangesTerms({ name: "Novo nome" })).toBe(false);
    expect(planTemplateUpdateChangesTerms({ services: [] })).toBe(true);
    expect(planTemplateUpdateChangesTerms({ planType: "single" })).toBe(true);
    expect(
      planTemplateUpdateSchema.safeParse({
        planType: "single",
        services: stored.services,
      }).success,
    ).toBe(false);
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
