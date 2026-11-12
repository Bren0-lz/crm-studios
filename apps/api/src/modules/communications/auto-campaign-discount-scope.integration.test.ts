import type {
  AutoCampaign,
  AutoCampaignProductOption,
  AutoCampaignPromotionOffer,
  AutoCampaignQueue,
} from "@crm/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../../app.js";
import { MemoryClinicRepository } from "../../memory-repository.js";
import { nextTestCpf } from "../../test-support/cpf.js";

const clinicId = "11111111-1111-4111-8111-111111111111",
  actorId = "22222222-2222-4222-8222-222222222222";
const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  vi.useRealTimers();
});

async function setup() {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2039-06-10T18:00:00Z"));
  const repository = new MemoryClinicRepository(),
    app = await buildApp({ repository, logger: false });
  apps.push(app);
  const headers = {
    authorization: `Bearer ${app.jwt.sign({ sub: actorId, clinicId, role: "admin" })}`,
  };
  async function product(name: string, sku: string) {
    const response = await app.inject({
      method: "POST",
      url: "/inventory/products",
      headers,
      payload: {
        name,
        sku,
        unit: "un",
        costInCents: 2_000,
        salePriceInCents: 5_000,
      },
    });
    expect(response.statusCode, response.body).toBe(201);
    return response.json<{ id: string }>().id;
  }
  const save = (promotion: object) =>
    app.inject({
      method: "POST",
      url: "/communications/auto-campaigns",
      headers,
      payload: {
        name: "Aniversariantes",
        trigger: "birthday",
        steps: [{ offset: 7, message: "Olá, {{nome}}" }],
        promotion,
      },
    });
  return { app, headers, product, save };
}

const discount = { type: "percentage", percent: 10 } as const;

describe("onde o desconto da campanha promocional vale", () => {
  it("lists the products to choose from, by name", async () => {
    const { app, headers, product } = await setup();
    const towel = await product("Toalha", "TOA-01");
    const shirt = await product("Camiseta", "CAM-01");
    const response = await app.inject({
      method: "GET",
      url: "/communications/auto-campaigns/products",
      headers,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json<AutoCampaignProductOption[]>()).toEqual([
      { id: shirt, name: "Camiseta", active: true },
      { id: towel, name: "Toalha", active: true },
    ]);
  });

  it("saves the discount on all or specific products, with or without plans", async () => {
    const { product, save } = await setup();
    const shirt = await product("Camiseta", "CAM-01");

    const onlyProducts = await save({
      validDays: 10,
      discount,
      appliesToPlans: false,
      planTemplateIds: [],
      appliesToProducts: true,
      productIds: [shirt, shirt],
    });
    expect(onlyProducts.statusCode, onlyProducts.body).toBe(201);
    expect(onlyProducts.json<AutoCampaign>().promotion).toEqual({
      validDays: 10,
      discount,
      appliesToPlans: false,
      appliesToProducts: true,
      productIds: [shirt],
    });

    const everything = await save({
      validDays: 10,
      discount,
      planTemplateIds: [],
      appliesToProducts: true,
      productIds: [],
    });
    expect(everything.json<AutoCampaign>().promotion).toEqual({
      validDays: 10,
      discount,
      planTemplateIds: [],
      appliesToProducts: true,
      productIds: [],
    });

    // Sem produtos ligados, a lista de produtos é descartada (como antes: só planos).
    const plansOnly = await save({
      validDays: 10,
      discount,
      planTemplateIds: [],
      appliesToProducts: false,
      productIds: [shirt],
    });
    expect(plansOnly.json<AutoCampaign>().promotion).toEqual({
      validDays: 10,
      discount,
      planTemplateIds: [],
    });
  });

  it("rejects unknown products, a discount valid nowhere, and drops the scope without a discount", async () => {
    const { product, save } = await setup();
    const shirt = await product("Camiseta", "CAM-01");
    const unknown = await save({
      validDays: 5,
      discount,
      appliesToProducts: true,
      productIds: ["99999999-9999-4999-8999-999999999999"],
    });
    expect(unknown.statusCode).toBe(400);
    expect(unknown.json()).toMatchObject({
      code: "AUTO_CAMPAIGN_PRODUCT_NOT_FOUND",
    });
    const nowhere = await save({
      validDays: 5,
      discount,
      appliesToPlans: false,
    });
    expect(nowhere.statusCode).toBe(400);
    const withoutDiscount = await save({
      validDays: 5,
      appliesToPlans: false,
      appliesToProducts: true,
      productIds: [shirt],
    });
    expect(withoutDiscount.statusCode).toBe(201);
    expect(withoutDiscount.json<AutoCampaign>().promotion).toEqual({
      validDays: 5,
    });
  });

  it("passes where the discount applies on to the client's promotion offer", async () => {
    const { app, headers, product, save } = await setup();
    const shirt = await product("Camiseta", "CAM-01");
    const patient = (
      await app.inject({
        method: "POST",
        url: "/patients",
        headers,
        payload: {
          cpf: nextTestCpf(),
          fullName: "Lara Produto",
          phone: "11955554444",
          whatsapp: "11955554444",
          emergencyContactName: "Lara Produto",
          emergencyContactPhone: "11955554444",
          emergencyContactWhatsapp: "11955554444",
          birthDate: "1990-06-15",
          tags: [],
        },
      })
    ).json<{ id: string }>();
    const campaign = (
      await save({
        validDays: 10,
        discount,
        appliesToPlans: false,
        appliesToProducts: true,
        productIds: [shirt],
      })
    ).json<AutoCampaign>();
    const item = (
      await app.inject({
        method: "GET",
        url: "/communications/auto-campaigns/queue",
        headers,
      })
    )
      .json<AutoCampaignQueue>()
      .items.find((entry) => entry.patientId === patient.id)!;
    await app.inject({
      method: "POST",
      url: "/communications/auto-campaigns/deliveries",
      headers,
      payload: {
        campaignId: campaign.id,
        stepId: item.stepId,
        patientId: patient.id,
        occurrenceKey: item.occurrenceKey,
        status: "sent",
      },
    });
    const offers = await app.inject({
      method: "GET",
      url: `/appointments/promotions?patientId=${patient.id}`,
      headers,
    });
    expect(offers.json<AutoCampaignPromotionOffer[]>()).toEqual([
      expect.objectContaining({
        campaignId: campaign.id,
        discount,
        planTemplateIds: [],
        appliesToPlans: false,
        appliesToProducts: true,
        productIds: [shirt],
      }),
    ]);
  });
});
