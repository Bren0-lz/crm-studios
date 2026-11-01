import { describe, expect, it } from "vitest";
import { autoCampaignInputSchema } from "../communications/model.js";
import {
  appointmentSummary,
  promotionAppliesToPlan,
  promotionAppliesToProduct,
  type AppointmentPricing,
} from "./pricing.js";

const pricing: AppointmentPricing = {
  serviceId: "s",
  plans: [],
  single: {
    planTemplateId: "tpl-single",
    planName: "Pilates (avulso)",
    sessionValueInCents: 9000,
  },
};
const discount = { type: "percentage", percent: 10 } as const;

describe("onde o desconto da promoção vale", () => {
  it("applies to plans unless they are turned off, to every plan when none is chosen", () => {
    expect(promotionAppliesToPlan({}, "tpl-a")).toBe(true);
    expect(promotionAppliesToPlan({ planTemplateIds: [] }, undefined)).toBe(
      true,
    );
    expect(
      promotionAppliesToPlan({ planTemplateIds: ["tpl-a"] }, "tpl-b"),
    ).toBe(false);
    expect(
      promotionAppliesToPlan(
        { appliesToPlans: false, planTemplateIds: [] },
        "tpl-a",
      ),
    ).toBe(false);
  });

  it("applies to products only when turned on, to every product when none is chosen", () => {
    expect(promotionAppliesToProduct({}, "prod-a")).toBe(false);
    expect(
      promotionAppliesToProduct({ productIds: ["prod-a"] }, "prod-a"),
    ).toBe(false);
    expect(
      promotionAppliesToProduct(
        { appliesToProducts: true, productIds: [] },
        "prod-a",
      ),
    ).toBe(true);
    expect(
      promotionAppliesToProduct(
        { appliesToProducts: true, productIds: ["prod-a"] },
        "prod-b",
      ),
    ).toBe(false);
  });

  it("gives no appointment discount when the promotion is only for products", () => {
    const summary = appointmentSummary({
      starts: ["2039-06-01T13:00"],
      pricing,
      promotion: { discount, appliesToPlans: false },
    });
    expect(summary.discountInCents).toBe(0);
    expect(summary.discountNotApplicable).toBe(true);
  });

  it("requires the discount to be valid in plans, products or both", () => {
    const campaign = {
      name: "Promo",
      trigger: "birthday",
      steps: [{ offset: 0, message: "Oi" }],
    };
    expect(
      autoCampaignInputSchema.safeParse({
        ...campaign,
        promotion: { validDays: 5, discount, appliesToPlans: false },
      }).success,
    ).toBe(false);
    expect(
      autoCampaignInputSchema.safeParse({
        ...campaign,
        promotion: {
          validDays: 5,
          discount,
          appliesToPlans: false,
          appliesToProducts: true,
          productIds: [],
        },
      }).success,
    ).toBe(true);
    // Sem desconto, não há onde valer: a campanha só de validade continua aceita.
    expect(
      autoCampaignInputSchema.safeParse({
        ...campaign,
        promotion: { validDays: 5, appliesToPlans: false },
      }).success,
    ).toBe(true);
  });
});
