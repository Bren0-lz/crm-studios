import type {
  AppointmentPricing,
  AutoCampaign,
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
  // 15:00 em São Paulo, 10/06/2039.
  vi.setSystemTime(new Date("2039-06-10T18:00:00Z"));
  const repository = new MemoryClinicRepository(),
    app = await buildApp({ repository, logger: false });
  apps.push(app);
  const headers = {
    authorization: `Bearer ${app.jwt.sign({ sub: actorId, clinicId, role: "admin" })}`,
  };
  const patient = (
    await app.inject({
      method: "POST",
      url: "/patients",
      headers,
      payload: {
        cpf: nextTestCpf(),
        fullName: "Lara Preço",
        phone: "11955554444",
        whatsapp: "11955554444",
        emergencyContactName: "Lara Preço",
        emergencyContactPhone: "11955554444",
        emergencyContactWhatsapp: "11955554444",
        birthDate: "1990-06-15",
        tags: [],
      },
    })
  ).json<{ id: string }>();
  const serviceId = (
    await app.inject({ method: "GET", url: "/services", headers })
  ).json<{ id: string }[]>()[0]!.id;
  async function template(
    name: string,
    planType: string,
    totalSessions: number,
    totalValueInCents: number,
  ) {
    const response = await app.inject({
      method: "POST",
      url: "/plan-templates",
      headers,
      payload: {
        name,
        totalValueInCents,
        planType,
        services: [
          {
            serviceId,
            totalSessions,
            totalValueInCents,
            ...(planType === "monthly" ? { sessionsPerWeek: 1 } : {}),
          },
        ],
      },
    });
    expect(response.statusCode, response.body).toBe(201);
    return response.json<{ id: string }>().id;
  }
  return { app, headers, patient, serviceId, template };
}

describe("resumo do agendamento", () => {
  it("prices each session from the client's plans and the single plan, and offers the campaign discount", async () => {
    const { app, headers, patient, serviceId, template } = await setup();
    const singleId = await template("Pilates (avulso)", "single", 1, 9000);
    const packageId = await template("Pilates 4 sessões", "monthly", 4, 24000);

    const pricing = async () => {
      const response = await app.inject({
        method: "GET",
        url: `/appointments/pricing?patientId=${patient.id}&serviceId=${serviceId}`,
        headers,
      });
      expect(response.statusCode, response.body).toBe(200);
      return response.json<AppointmentPricing>();
    };
    // Sem plano vendido: só o valor do plano avulso.
    expect(await pricing()).toEqual({
      serviceId,
      plans: [],
      single: {
        planTemplateId: singleId,
        planName: "Pilates (avulso)",
        sessionValueInCents: 9000,
      },
    });

    const sale = await app.inject({
      method: "POST",
      url: "/plans",
      headers,
      payload: {
        planTemplateId: packageId,
        patientId: patient.id,
        serviceId,
        name: "Pilates 4 sessões",
        kind: "fixed_package",
        services: [{ serviceId, totalSessions: 4, totalValueInCents: 24000 }],
        totalSessions: 4,
        totalValueInCents: 24000,
        installments: 1,
        validFrom: "2039-06-01",
        firstDueDate: "2039-06-10",
      },
    });
    expect(sale.statusCode, sale.body).toBe(201);
    expect((await pricing()).plans).toEqual([
      {
        planId: sale.json<{ id: string }>().id,
        planTemplateId: packageId,
        planName: "Pilates 4 sessões",
        remainingSessions: 4,
        sessionValueInCents: 6000,
      },
    ]);

    // Campanha com 15% de desconto só no plano avulso.
    const created = await app.inject({
      method: "POST",
      url: "/communications/auto-campaigns",
      headers,
      payload: {
        name: "Aniversariantes",
        trigger: "birthday",
        steps: [{ offset: 7, message: "Olá, {{nome}}" }],
        promotion: {
          validDays: 10,
          discount: { type: "percentage", percent: 15 },
          planTemplateIds: [singleId, singleId],
        },
      },
    });
    expect(created.statusCode, created.body).toBe(201);
    const campaign = created.json<AutoCampaign>();
    expect(campaign.promotion).toEqual({
      validDays: 10,
      discount: { type: "percentage", percent: 15 },
      planTemplateIds: [singleId],
    });
    const item = (
      await app.inject({
        method: "GET",
        url: "/communications/auto-campaigns/queue",
        headers,
      })
    )
      .json<AutoCampaignQueue>()
      .items.find((entry) => entry.patientId === patient.id)!;
    expect(
      (
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
        })
      ).statusCode,
    ).toBe(201);
    const offers = await app.inject({
      method: "GET",
      url: `/appointments/promotions?patientId=${patient.id}`,
      headers,
    });
    expect(offers.json<AutoCampaignPromotionOffer[]>()).toEqual([
      {
        campaignId: campaign.id,
        campaignName: "Aniversariantes",
        occurrenceKey: item.occurrenceKey,
        validUntil: "2039-06-25",
        discount: { type: "percentage", percent: 15 },
        planTemplateIds: [singleId],
      },
    ]);
  });

  it("rejects discount plans from outside the clinic and drops plans without a discount", async () => {
    const { app, headers, template } = await setup();
    const planId = await template("Pilates (avulso)", "single", 1, 9000);
    const save = (promotion: object) =>
      app.inject({
        method: "POST",
        url: "/communications/auto-campaigns",
        headers,
        payload: {
          name: "Promo",
          trigger: "birthday",
          steps: [{ offset: 0, message: "Oi" }],
          promotion,
        },
      });
    const unknown = await save({
      validDays: 5,
      discount: { type: "amount", amountInCents: 1500 },
      planTemplateIds: ["99999999-9999-4999-8999-999999999999"],
    });
    expect(unknown.statusCode).toBe(400);
    expect(unknown.json()).toMatchObject({
      code: "AUTO_CAMPAIGN_PLAN_NOT_FOUND",
    });
    const withoutDiscount = await save({
      validDays: 5,
      planTemplateIds: [planId],
    });
    expect(withoutDiscount.statusCode).toBe(201);
    expect(withoutDiscount.json<AutoCampaign>().promotion).toEqual({
      validDays: 5,
    });
    expect(
      (
        await save({
          validDays: 5,
          discount: { type: "percentage", percent: 120 },
        })
      ).statusCode,
    ).toBe(400);
  });
});
