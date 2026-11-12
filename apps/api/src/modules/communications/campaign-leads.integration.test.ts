import type {
  AutoCampaign,
  AutoCampaignDelivery,
  AutoCampaignPromotionOffer,
  AutoCampaignQueue,
  CampaignFilterOptions,
  CampaignReport,
  Lead,
  MessageTemplate,
  WhatsappCampaignDetail,
  WhatsappCampaignPreview,
} from "@crm/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../../app.js";
import { MemoryClinicRepository } from "../../memory-repository.js";
import { verifyCampaignLeadRepository } from "../../test-support/campaign-leads-suite.js";
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
  async function createLead(
    fullName: string,
    extra: Record<string, unknown> = {},
  ) {
    const response = await app.inject({
      method: "POST",
      url: "/leads",
      headers,
      payload: {
        fullName,
        phone: "11977776666",
        source: "Instagram",
        interest: "Pilates",
        ...extra,
      },
    });
    expect(response.statusCode).toBe(201);
    return response.json<Lead>();
  }
  const template = (
    await app.inject({
      method: "POST",
      url: "/communications/templates",
      headers,
      payload: { title: "Convite", body: "Olá, {{nome}}!", images: [] },
    })
  ).json<MessageTemplate>();
  const preview = (audience: object, requestHeaders = headers) =>
    app.inject({
      method: "POST",
      url: "/communications/campaigns/preview",
      headers: requestHeaders,
      payload: { templateId: template.id, audience },
    });
  const convert = (lead: Lead) =>
    app.inject({
      method: "POST",
      url: `/leads/${lead.id}/convert`,
      headers,
      payload: {
        cpf: nextTestCpf(),
        whatsapp: "11977776666",
        emergencyContactName: "Joana Mãe",
        emergencyContactPhone: "11988887777",
        emergencyContactWhatsapp: "11988887777",
      },
    });
  async function offers(patientId: string) {
    const response = await app.inject({
      url: `/appointments/promotions?patientId=${patientId}`,
      headers,
    });
    expect(response.statusCode).toBe(200);
    return response.json<AutoCampaignPromotionOffer[]>();
  }
  async function queue() {
    const response = await app.inject({
      url: "/communications/auto-campaigns/queue",
      headers,
    });
    expect(response.statusCode).toBe(200);
    return response.json<AutoCampaignQueue>();
  }
  async function restrictedUser(permissions: string[]) {
    const user = await repository.createAdminUser(
      clinicId,
      actorId,
      {
        fullName: "Recepção",
        email: `recepcao.${permissions.length}@example.com`,
        password: "Password123",
        role: "user",
        permissions: permissions as never,
      },
      "unused-hash",
    );
    return {
      authorization: `Bearer ${app.jwt.sign({ sub: user.id, clinicId, role: "user" })}`,
    };
  }
  return {
    app,
    repository,
    headers,
    template,
    createLead,
    preview,
    convert,
    offers,
    queue,
    restrictedUser,
  };
}

describe("leads nas campanhas manuais", () => {
  it("só leads: filtra por etapa, etiqueta e origem; tira convertidos e perdidos", async () => {
    const { app, headers, createLead, preview, convert } = await setup();
    const ana = await createLead("Ana Lead", { tags: ["Quente"] });
    const bia = await createLead("Bia Lead", { source: "Indicação" });
    const caio = await createLead("Caio Perdido");
    await app.inject({
      method: "PATCH",
      url: `/leads/${caio.id}/stage`,
      headers,
      payload: { stage: "lost", lostReason: "Sem interesse" },
    });
    const davi = await createLead("Davi Convertido");
    expect((await convert(davi)).statusCode).toBe(200);

    const onlyLeads = await preview({
      mode: "segment",
      audience: "leads",
      segment: {},
    });
    expect(onlyLeads.statusCode).toBe(200);
    const body = onlyLeads.json<WhatsappCampaignPreview>();
    expect(body.included.map((item) => item.patientName).sort()).toEqual([
      "Ana Lead",
      "Bia Lead",
    ]);
    expect(body.leads).toBe(2);
    expect(body.included.every((item) => item.leadId && !item.patientId)).toBe(
      true,
    );
    expect(body.sample?.message).toMatch(/^Olá, (Ana|Bia)!$/);

    const tagged = (
      await preview({
        mode: "segment",
        audience: "leads",
        leadFilter: { tags: ["quente"] },
        segment: {},
      })
    ).json<WhatsappCampaignPreview>();
    expect(tagged.included.map((item) => item.leadId)).toEqual([ana.id]);

    const bySource = (
      await preview({
        mode: "segment",
        audience: "leads",
        leadFilter: { sources: ["Indicação"] },
        segment: {},
      })
    ).json<WhatsappCampaignPreview>();
    expect(bySource.included.map((item) => item.leadId)).toEqual([bia.id]);

    const lost = (
      await preview({
        mode: "segment",
        audience: "leads",
        leadFilter: { stages: ["lost"] },
        segment: {},
      })
    ).json<WhatsappCampaignPreview>();
    expect(lost.included.map((item) => item.leadId)).toEqual([caio.id]);

    const both = (
      await preview({
        mode: "segment",
        audience: "patients_and_leads",
        segment: {},
      })
    ).json<WhatsappCampaignPreview>();
    expect(both.leads).toBe(2);
    expect(both.recipients).toBeGreaterThan(2);
    expect(both.included.some((item) => item.patientId)).toBe(true);
  });

  it("lead escolhido recebe a promoção e ela segue para o cliente na conversão", async () => {
    const { app, headers, template, createLead, convert, offers } =
      await setup();
    const lead = await createLead("Lia Promo");
    const created = await app.inject({
      method: "POST",
      url: "/communications/campaigns",
      headers,
      payload: {
        templateId: template.id,
        name: "Promo leads",
        audience: { mode: "patients", leadIds: [lead.id] },
        promotion: { validDays: 5 },
      },
    });
    expect(created.statusCode).toBe(201);
    const campaign = created.json<WhatsappCampaignDetail>();
    expect(campaign.recipients).toEqual([
      expect.objectContaining({
        leadId: lead.id,
        patientName: "Lia Promo",
        message: "Olá, Lia!",
      }),
    ]);
    expect(campaign.recipients[0]!.patientId).toBeUndefined();
    const marked = await app.inject({
      method: "POST",
      url: `/communications/campaigns/${campaign.id}/recipients/${campaign.recipients[0]!.id}`,
      headers,
      payload: { status: "sent" },
    });
    expect(marked.statusCode).toBe(200);

    const converted = await convert(lead);
    expect(converted.statusCode).toBe(200);
    const patientId = converted.json<{ patient: { id: string } }>().patient.id;
    expect(await offers(patientId)).toEqual([
      expect.objectContaining({
        source: "manual",
        campaignId: campaign.id,
        occurrenceKey: campaign.recipients[0]!.id,
        validUntil: "2039-06-15",
      }),
    ]);
    const detail = (
      await app.inject({
        url: `/communications/campaigns/${campaign.id}`,
        headers,
      })
    ).json<WhatsappCampaignDetail>();
    expect(detail.recipients[0]).toMatchObject({ leadId: lead.id, patientId });

    const report = (
      await app.inject({
        url: "/reports/campaigns?from=2039-06-01&to=2039-06-30",
        headers,
      })
    ).json<CampaignReport>();
    expect(
      report.campaigns.find((row) => row.campaignId === campaign.id),
    ).toMatchObject({ total: 1, sent: 1 });
  });

  it("exige acesso ao comercial para incluir leads", async () => {
    const { createLead, preview, restrictedUser, app } = await setup();
    const lead = await createLead("Lia Restrita");
    const reception = await restrictedUser([
      "communications.view",
      "communications.campaigns",
    ]);
    const denied = await preview(
      { mode: "patients", leadIds: [lead.id] },
      reception,
    );
    expect(denied.statusCode).toBe(403);
    const options = await app.inject({
      url: "/communications/campaigns/filter-options",
      headers: reception,
    });
    expect(options.json<CampaignFilterOptions>().leads).toBeUndefined();
    const empty = await preview({ mode: "patients" });
    expect(empty.statusCode).toBe(400);
  });

  it("oferece etapas, origens e etiquetas dos leads nos filtros", async () => {
    const { app, headers, createLead } = await setup();
    await createLead("Ana Lead", { tags: ["Quente"], source: "Site" });
    const options = (
      await app.inject({
        url: "/communications/campaigns/filter-options",
        headers,
      })
    ).json<CampaignFilterOptions>();
    expect(options.leads?.stages.map((stage) => stage.stage)).toContain(
      "new_contact",
    );
    expect(options.leads?.sources).toEqual(["Site"]);
    expect(options.leads?.tags).toEqual(["Quente"]);
  });
});

describe("leads nas campanhas automáticas", () => {
  it("lead novo entra na fila, registra o envio e sai ao virar cliente", async () => {
    const { app, headers, createLead, queue, convert } = await setup();
    const lead = await createLead("Nina Nova");
    const created = await app.inject({
      method: "POST",
      url: "/communications/auto-campaigns",
      headers,
      payload: {
        name: "Boas-vindas",
        trigger: "lead_new",
        steps: [{ offset: 0, message: "Oi, {{nome}}! Viu {{interesse}}?" }],
      },
    });
    expect(created.statusCode).toBe(201);
    const campaign = created.json<AutoCampaign>();
    const [item] = (await queue()).items;
    expect(item).toMatchObject({
      campaignId: campaign.id,
      leadId: lead.id,
      patientName: "Nina Nova",
      message: "Oi, Nina! Viu Pilates?",
      status: "pending",
    });
    expect(item!.patientId).toBeUndefined();

    const recorded = await app.inject({
      method: "POST",
      url: "/communications/auto-campaigns/deliveries",
      headers,
      payload: {
        campaignId: campaign.id,
        stepId: item!.stepId,
        leadId: lead.id,
        occurrenceKey: item!.occurrenceKey,
        status: "sent",
      },
    });
    expect(recorded.statusCode).toBe(201);
    expect(recorded.json<AutoCampaignDelivery>()).toMatchObject({
      leadId: lead.id,
      status: "sent",
    });
    expect((await queue()).items[0]).toMatchObject({ status: "sent" });

    expect((await convert(lead)).statusCode).toBe(200);
    expect((await queue()).items).toEqual([]);
  });

  it("aniversário com leads: inclui leads com data de nascimento só quando marcado", async () => {
    const { app, headers, createLead, queue } = await setup();
    const lead = await createLead("Bela Aniversário", {
      birthDate: "1990-06-12",
    });
    const payload = {
      name: "Aniversariantes",
      trigger: "birthday",
      steps: [{ offset: 2, message: "Parabéns, {{nome}}!" }],
    };
    const created = await app.inject({
      method: "POST",
      url: "/communications/auto-campaigns",
      headers,
      payload,
    });
    const campaign = created.json<AutoCampaign>();
    expect(
      (await queue()).items.some((entry) => entry.leadId === lead.id),
    ).toBe(false);

    const updated = await app.inject({
      method: "PUT",
      url: `/communications/auto-campaigns/${campaign.id}`,
      headers,
      payload: { ...payload, includeLeads: true },
    });
    expect(updated.json<AutoCampaign>().includeLeads).toBe(true);
    expect(
      (await queue()).items.find((entry) => entry.leadId === lead.id),
    ).toMatchObject({
      occurrenceKey: `lead:${lead.id}:2039`,
      eventDate: "2039-06-12",
    });

    const invalid = await app.inject({
      method: "POST",
      url: "/communications/auto-campaigns",
      headers,
      payload: {
        ...payload,
        trigger: "plan_expiring",
        includeLeads: true,
      },
    });
    expect(invalid.statusCode).toBe(400);
  });
});

describe("leads nas campanhas: repositório em memória", () => {
  it("grava destinatário e envio de lead e passa ao cliente na conversão", async () => {
    await verifyCampaignLeadRepository(new MemoryClinicRepository());
  });
});
