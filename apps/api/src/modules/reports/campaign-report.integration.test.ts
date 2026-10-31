import type {
  CampaignReport,
  MessageTemplate,
  WhatsappCampaignDetail,
} from "@crm/contracts";
import ExcelJS from "exceljs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../../app.js";
import { MemoryClinicRepository } from "../../memory-repository.js";

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
  const [ana, bruno] = await repository.listPatients(clinicId);
  const template = (
    await app.inject({
      method: "POST",
      url: "/communications/templates",
      headers,
      payload: { title: "Volta às aulas", body: "Olá, {{nome}}!", images: [] },
    })
  ).json<MessageTemplate>();
  const manual = (
    await app.inject({
      method: "POST",
      url: "/communications/campaigns",
      headers,
      payload: {
        name: "Junho",
        templateId: template.id,
        audience: { mode: "patients", patientIds: [ana!.id, bruno!.id] },
      },
    })
  ).json<WhatsappCampaignDetail>();
  const recipient = manual.recipients[0]!;
  expect(
    (
      await app.inject({
        method: "POST",
        url: `/communications/campaigns/${manual.id}/recipients/${recipient.id}`,
        headers,
        payload: { status: "sent" },
      })
    ).statusCode,
  ).toBe(200);
  const automatic = await repository.createAutoCampaign(clinicId, actorId, {
    name: "Aniversários",
    trigger: "birthday",
    active: true,
    steps: [{ offset: 0, message: "Parabéns, {{nome}}!" }],
  });
  await repository.createAutoCampaign(clinicId, actorId, {
    name: "Desligada sem envios",
    trigger: "former_client",
    active: false,
    steps: [{ offset: 0, message: "Volte!" }],
  });
  const step = automatic.steps[0]!;
  await repository.saveAutoCampaignDelivery(clinicId, actorId, {
    campaignId: automatic.id,
    stepId: step.id,
    patientId: ana!.id,
    occurrenceKey: `${ana!.id}:2039`,
    status: "sent",
    message: "Parabéns, Ana!",
  });
  await repository.saveAutoCampaignDelivery(clinicId, actorId, {
    campaignId: automatic.id,
    stepId: step.id,
    patientId: bruno!.id,
    occurrenceKey: `${bruno!.id}:2039`,
    status: "skipped",
    skipReason: "wrong_number",
    message: "Parabéns, Bruno!",
  });
  return { app, repository, headers, manual, automatic, ana: ana! };
}

describe("relatório de campanhas", () => {
  it("resume campanhas manuais e automáticas do período", async () => {
    const { app, headers, manual, automatic } = await setup();
    const response = await app.inject({
      method: "GET",
      url: "/reports/campaigns?from=2039-06-01&to=2039-06-30",
      headers,
    });
    expect(response.statusCode).toBe(200);
    const report = response.json<CampaignReport>();
    expect(report.summary).toEqual({
      manualCampaigns: 1,
      automaticCampaigns: 1,
      sent: 2,
      skipped: 1,
      pending: manual.recipients.length - 1,
      redemptions: 0,
    });
    expect(report.campaigns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          campaignId: manual.id,
          kind: "manual",
          origin: "Volta às aulas",
          sent: 1,
          active: manual.recipients.length > 1,
        }),
        expect.objectContaining({
          campaignId: automatic.id,
          kind: "automatic",
          origin: "Aniversário",
          total: 2,
          sent: 1,
          skipped: 1,
          active: true,
        }),
      ]),
    );
    expect(report.campaigns.map((item) => item.name)).not.toContain(
      "Desligada sem envios",
    );

    // Fora do período: só a automática ligada, sem mensagens.
    const before = (
      await app.inject({
        method: "GET",
        url: "/reports/campaigns?from=2039-05-01&to=2039-05-31",
        headers,
      })
    ).json<CampaignReport>();
    expect(before.campaigns).toEqual([
      expect.objectContaining({ campaignId: automatic.id, total: 0 }),
    ]);
  });

  it("exporta a planilha com resumo, campanhas e mensagens e registra no histórico", async () => {
    const { app, repository, headers, ana } = await setup();
    const response = await app.inject({
      method: "GET",
      url: "/reports/campaigns.xlsx?from=2039-06-01&to=2039-06-30",
      headers,
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-disposition"]).toContain(
      "campanhas-2039-06-01-2039-06-30.xlsx",
    );
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(response.rawPayload as unknown as ArrayBuffer);
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      "Resumo",
      "Campanhas",
      "Mensagens",
    ]);
    const messages = workbook.getWorksheet("Mensagens")!;
    const values = messages
      .getSheetValues()
      .slice(2)
      .map((row) => (row as unknown[]).slice(1, 7));
    expect(values).toEqual(
      expect.arrayContaining([
        expect.arrayContaining([
          "Automática",
          "Aniversários",
          ana.fullName,
          "Enviada",
          "No dia",
        ]),
        expect.arrayContaining([
          "Automática",
          "Aniversários",
          "Não enviada",
          "No dia · Número errado ou sem WhatsApp",
        ]),
        expect.arrayContaining(["Manual", "Junho", "Enviada"]),
      ]),
    );
    expect(await repository.listAdminAuditEvents(clinicId)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "reports.campaigns_exported",
          module: "reports",
          metadata: expect.objectContaining({ count: 2 }),
        }),
      ]),
    );
  });

  it("exige a consulta para ver e a permissão de planilha para baixar", async () => {
    const { app, repository } = await setup();
    const user = await repository.createAdminUser(
      clinicId,
      actorId,
      {
        fullName: "Usuária de relatórios",
        email: "relatorios@example.com",
        password: "Password123",
        role: "user",
        permissions: ["reports.view", "reports.campaigns"],
      },
      "unused-hash",
    );
    const headers = {
      authorization: `Bearer ${app.jwt.sign({ sub: user.id, clinicId, role: "user" })}`,
    };
    const status = async (url: string) =>
      (await app.inject({ method: "GET", url, headers })).statusCode;
    const range = "from=2039-06-01&to=2039-06-30";
    expect(await status(`/reports/campaigns?${range}`)).toBe(200);
    expect(await status(`/reports/campaigns.xlsx?${range}`)).toBe(403);
    await repository.updateAdminUser(clinicId, actorId, user.id, {
      fullName: user.fullName,
      role: "user",
      active: true,
      permissions: ["reports.view"],
    });
    expect(await status(`/reports/campaigns?${range}`)).toBe(403);
  });
});
