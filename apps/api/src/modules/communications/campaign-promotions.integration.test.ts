import { withAppointmentPlan } from "../../test-support/appointment-plan.js";
import type {
  AutoCampaignPromotionOffer,
  CampaignReport,
  MessageTemplate,
  WhatsappCampaignDetail,
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
  const repository = new MemoryClinicRepository();
  const app = await buildApp({ repository, logger: false });
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
        fullName: "Lara Promo",
        phone: "11955554444",
        whatsapp: "11955554444",
        emergencyContactName: "Lara Promo",
        emergencyContactPhone: "11955554444",
        tags: [],
      },
    })
  ).json<{ id: string }>();
  const template = (
    await app.inject({
      method: "POST",
      url: "/communications/templates",
      headers,
      payload: { title: "Promoção", body: "Olá, {{nome}}!", images: [] },
    })
  ).json<MessageTemplate>();
  const createCampaign = (name: string, promotion?: object) =>
    app.inject({
      method: "POST",
      url: "/communications/campaigns",
      headers,
      payload: {
        templateId: template.id,
        name,
        audience: { mode: "patients", patientIds: [patient.id] },
        ...(promotion ? { promotion } : {}),
      },
    });
  const markSent = (campaign: WhatsappCampaignDetail) =>
    app.inject({
      method: "POST",
      url: `/communications/campaigns/${campaign.id}/recipients/${campaign.recipients[0]!.id}`,
      headers,
      payload: { status: "sent" },
    });
  async function offers() {
    const response = await app.inject({
      method: "GET",
      url: `/appointments/promotions?patientId=${patient.id}`,
      headers,
    });
    expect(response.statusCode).toBe(200);
    return response.json<AutoCampaignPromotionOffer[]>();
  }
  const [professionals, rooms, services] = await Promise.all(
    ["/professionals", "/rooms", "/services"].map((url) =>
      app.inject({ method: "GET", url, headers }),
    ),
  );
  const appointment = async (startsAt: string, promotion?: object) =>
    app.inject({
      method: "POST",
      url: "/appointments",
      headers,
      payload: await withAppointmentPlan(
        app,
        {
          patientId: patient.id,
          professionalId: professionals!.json()[0].id,
          roomId: rooms!.json()[0].id,
          serviceId: services!.json()[0].id,
          startsAt,
          ...(promotion ? { promotion } : {}),
        },
        headers,
      ),
    });
  return {
    app,
    headers,
    createCampaign,
    markSent,
    offers,
    appointment,
  };
}

describe("campanhas manuais promocionais", () => {
  it("oferece a promoção depois do envio, usa uma vez ao agendar e devolve se cancelar", async () => {
    const { app, headers, createCampaign, markSent, offers, appointment } =
      await setup();
    const plain = await createCampaign("Só mensagem");
    expect(plain.statusCode).toBe(201);
    expect(plain.json<WhatsappCampaignDetail>().promotion).toBeUndefined();
    await markSent(plain.json<WhatsappCampaignDetail>());

    const created = await createCampaign("Junho promo", { validDays: 5 });
    expect(created.statusCode).toBe(201);
    const campaign = created.json<WhatsappCampaignDetail>();
    expect(campaign.promotion).toEqual({ validDays: 5 });
    // Sem mensagem enviada, não há promoção para usar.
    expect(await offers()).toEqual([]);

    expect((await markSent(campaign)).statusCode).toBe(200);
    const recipientId = campaign.recipients[0]!.id;
    expect(await offers()).toEqual([
      {
        source: "manual",
        campaignId: campaign.id,
        campaignName: "Junho promo",
        occurrenceKey: recipientId,
        validUntil: "2039-06-15",
      },
    ]);

    // Sem `source`, o id da campanha manual não vale como automática.
    const wrongSource = await appointment("2039-06-20T13:00:00.000Z", {
      campaignId: campaign.id,
      occurrenceKey: recipientId,
    });
    expect(wrongSource.statusCode).toBe(409);

    const promotion = {
      source: "manual",
      campaignId: campaign.id,
      occurrenceKey: recipientId,
    };
    // Agendado hoje, para depois do fim da promoção: vale (conta o dia do agendamento).
    const booked = await appointment("2039-06-20T13:00:00.000Z", promotion);
    expect(booked.statusCode).toBe(201);
    expect(await offers()).toEqual([]);
    const repeated = await appointment("2039-06-21T13:00:00.000Z", promotion);
    expect(repeated.statusCode).toBe(409);
    expect(repeated.json()).toMatchObject({
      code: "CAMPAIGN_PROMOTION_UNAVAILABLE",
    });

    const report = await app.inject({
      method: "GET",
      url: "/reports/campaigns?from=2039-06-01&to=2039-06-30",
      headers,
    });
    expect(report.statusCode).toBe(200);
    const rows = report.json<CampaignReport>().campaigns;
    expect(rows.find((row) => row.campaignId === campaign.id)).toMatchObject({
      kind: "manual",
      promotional: true,
      redemptions: 1,
    });
    expect(
      rows.find((row) => row.name === "Só mensagem")?.promotional,
    ).toBeUndefined();

    // Cancelar o atendimento desfaz o uso: a promoção volta.
    const cancelled = await app.inject({
      method: "PATCH",
      url: `/appointments/${booked.json<{ id: string }>().id}/status`,
      headers,
      payload: { status: "cancelled" },
    });
    expect(cancelled.statusCode).toBe(200);
    expect((await offers()).map((offer) => offer.campaignId)).toEqual([
      campaign.id,
    ]);

    // Depois do prazo, não há mais promoção.
    vi.setSystemTime(new Date("2039-06-16T18:00:00Z"));
    expect(await offers()).toEqual([]);
    expect(
      (await appointment("2039-06-22T13:00:00.000Z", promotion)).statusCode,
    ).toBe(409);
  });

  it("com data final, vale até ela para todos e recusa data que já passou", async () => {
    const { createCampaign, markSent, offers, appointment } = await setup();
    const expired = await createCampaign("Antiga", {
      validUntil: "2039-06-09",
    });
    expect(expired.statusCode).toBe(400);
    expect(expired.json()).toMatchObject({
      code: "CAMPAIGN_PROMOTION_EXPIRED",
    });
    const both = await createCampaign("Duas validades", {
      validDays: 3,
      validUntil: "2039-06-30",
    });
    expect(both.statusCode).toBe(400);

    const campaign = (
      await createCampaign("Até o fim do mês", { validUntil: "2039-06-30" })
    ).json<WhatsappCampaignDetail>();
    await markSent(campaign);
    expect((await offers()).map((offer) => offer.validUntil)).toEqual([
      "2039-06-30",
    ]);
    vi.setSystemTime(new Date("2039-06-30T18:00:00Z"));
    const booked = await appointment("2039-07-02T13:00:00.000Z", {
      source: "manual",
      campaignId: campaign.id,
      occurrenceKey: campaign.recipients[0]!.id,
    });
    expect(booked.statusCode).toBe(201);
    vi.setSystemTime(new Date("2039-07-01T18:00:00Z"));
    expect(await offers()).toEqual([]);
  });
});
