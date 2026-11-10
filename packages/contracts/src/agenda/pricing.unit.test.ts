import { describe, expect, it } from "vitest";
import {
  autoCampaignDiscountInCents,
  autoCampaignPromotionSchema,
} from "../communications/model.js";
import { appointmentSummary, type AppointmentPricing } from "./pricing.js";

const pricing: AppointmentPricing = {
  serviceId: "s",
  plans: [
    {
      planId: "p1",
      planTemplateId: "tpl-package",
      planName: "Pilates 8 sessões",
      remainingSessions: 2,
      sessionValueInCents: 6000,
    },
  ],
  single: {
    planTemplateId: "tpl-single",
    planName: "Pilates (avulso)",
    sessionValueInCents: 9000,
  },
};
const starts = ["2039-06-01T13:00", "2039-06-08T13:00", "2039-06-15T13:00"];

describe("resumo do agendamento", () => {
  it("prices sessions from the plan balance first and then the single plan", () => {
    const summary = appointmentSummary({ starts, pricing });
    expect(
      summary.lines.map((line) => [
        line.source,
        line.valueInCents,
        line.discountInCents,
      ]),
    ).toEqual([
      ["plan", 6000, 0],
      ["plan", 6000, 0],
      ["single", 9000, 0],
    ]);
    expect(summary).toMatchObject({
      subtotalInCents: 21000,
      discountInCents: 0,
      totalInCents: 21000,
      discountNotApplicable: false,
    });
  });

  it("continua usando um plano recorrente mesmo com saldo nominal zerado", () => {
    const summary = appointmentSummary({
      starts,
      pricing: {
        ...pricing,
        plans: [
          { ...pricing.plans[0]!, remainingSessions: 0, unlimited: true },
        ],
      },
    });
    expect(summary.lines.map((line) => line.source)).toEqual([
      "plan",
      "plan",
      "plan",
    ]);
    expect(summary.totalInCents).toBe(18_000);
  });

  it("gives the campaign discount only to the first session when it fits the plan", () => {
    const percent = appointmentSummary({
      starts,
      pricing,
      promotion: {
        discount: { type: "percentage", percent: 12.5 },
        planTemplateIds: [],
      },
    });
    expect(percent.lines.map((line) => line.discountInCents)).toEqual([
      750, 0, 0,
    ]);
    expect(percent.totalInCents).toBe(20250);

    const onlySingle = appointmentSummary({
      starts,
      pricing,
      promotion: {
        discount: { type: "amount", amountInCents: 1000 },
        planTemplateIds: ["tpl-single"],
      },
    });
    expect(onlySingle.discountInCents).toBe(0);
    expect(onlySingle.discountNotApplicable).toBe(true);

    const noPlan = appointmentSummary({
      starts: starts.slice(0, 1),
      pricing: { ...pricing, plans: [] },
      promotion: {
        discount: { type: "amount", amountInCents: 1000 },
        planTemplateIds: ["tpl-single"],
      },
    });
    expect(noPlan.lines[0]).toMatchObject({
      source: "single",
      valueInCents: 9000,
      discountInCents: 1000,
    });
    expect(noPlan.totalInCents).toBe(8000);
  });

  it("never discounts more than the session value and validates the promotion discount", () => {
    expect(
      autoCampaignDiscountInCents(
        { type: "amount", amountInCents: 5000 },
        3000,
      ),
    ).toBe(3000);
    expect(
      appointmentSummary({
        starts: ["2039-06-01T13:00"],
        pricing: { serviceId: "s", plans: [] },
        promotion: { discount: { type: "percentage", percent: 50 } },
      }).lines[0],
    ).toMatchObject({ source: "none", valueInCents: 0, discountInCents: 0 });
    expect(
      autoCampaignPromotionSchema.safeParse({
        validDays: 3,
        discount: { type: "percentage", percent: 10.555 },
      }).success,
    ).toBe(false);
    expect(
      autoCampaignPromotionSchema.safeParse({
        validDays: 3,
        discount: { type: "amount", amountInCents: 0 },
      }).success,
    ).toBe(false);
    expect(
      autoCampaignPromotionSchema.parse({
        validDays: 3,
        discount: { type: "amount", amountInCents: 2500 },
        planTemplateIds: ["4b0c3c43-6f5a-4b66-9a53-7a8d34c1a001"],
      }),
    ).toMatchObject({
      planTemplateIds: ["4b0c3c43-6f5a-4b66-9a53-7a8d34c1a001"],
    });
  });
});
