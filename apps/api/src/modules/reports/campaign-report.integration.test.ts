import { withAppointmentPlan } from "../../test-support/appointment-plan.js";
import { nextTestCpf } from "../../test-support/cpf.js";
import type {
  AutoCampaign,
  AutoCampaignQueue,
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
    const automaticPending = report.campaigns.find(
      (item) => item.campaignId === automatic.id,
    )!.pending;
    expect(report.summary).toEqual({
      manualCampaigns: 1,
      automaticCampaigns: 1,
      sent: 2,
      skipped: 1,
      // Manuais sem marcação + fila de hoje das automáticas.
      pending: manual.recipients.length - 1 + automaticPending,
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

  it("conta nas pendentes da automática quem está na fila de hoje sem envio", async () => {
    const { app, headers } = await setup();
    const patientIds: string[] = [];
    // Hoje é 10/06: os dois estão na mensagem de 7 dias antes do aniversário.
    for (const [fullName, birthDate] of [
      ["Lia Pendente", "1990-06-15"],
      ["Rui Pendente", "1991-06-16"],
    ] as const) {
      const response = await app.inject({
        method: "POST",
        url: "/patients",
        headers,
        payload: {
          cpf: nextTestCpf(),
          fullName,
          phone: "11955554444",
          whatsapp: "11955554444",
          emergencyContactName: fullName,
          emergencyContactPhone: "11955554444",
          emergencyContactWhatsapp: "11955554444",
          birthDate,
          tags: [],
        },
      });
      expect(response.statusCode).toBe(201);
      patientIds.push(response.json<{ id: string }>().id);
    }
    const campaign = (
      await app.inject({
        method: "POST",
        url: "/communications/auto-campaigns",
        headers,
        payload: {
          name: "Semana do aniversário",
          trigger: "birthday",
          steps: [{ offset: 7, message: "Olá, {{nome}}" }],
        },
      })
    ).json<AutoCampaign>();
    const row = async (from: string, to: string) => {
      const report = (
        await app.inject({
          method: "GET",
          url: `/reports/campaigns?from=${from}&to=${to}`,
          headers,
        })
      ).json<CampaignReport>();
      return {
        report,
        row: report.campaigns.find((item) => item.campaignId === campaign.id)!,
      };
    };

    const queue = (
      await app.inject({
        method: "GET",
        url: "/communications/auto-campaigns/queue",
        headers,
      })
    ).json<AutoCampaignQueue>();
    const waiting = queue.items.filter(
      (entry) => entry.campaignId === campaign.id && entry.status === "pending",
    );
    expect(waiting.map((entry) => entry.patientId)).toEqual(
      expect.arrayContaining(patientIds),
    );
    const first = await row("2039-06-01", "2039-06-30");
    expect(first.report.queueDate).toBe("2039-06-10");
    expect(first.row).toMatchObject({
      pending: waiting.length,
      sent: 0,
      promotional: false,
    });
    const item = queue.items.find(
      (entry) =>
        entry.campaignId === campaign.id && entry.patientId === patientIds[0],
    )!;
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/communications/auto-campaigns/deliveries",
          headers,
          payload: {
            campaignId: campaign.id,
            stepId: item.stepId,
            patientId: item.patientId,
            occurrenceKey: item.occurrenceKey,
            status: "sent",
          },
        })
      ).statusCode,
    ).toBe(201);
    expect((await row("2039-06-01", "2039-06-30")).row).toMatchObject({
      pending: waiting.length - 1,
      sent: 1,
    });

    // Período sem o dia de hoje: a fila não entra.
    const past = await row("2039-05-01", "2039-05-31");
    expect(past.report.queueDate).toBeUndefined();
    expect(past.row.pending).toBe(0);
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
      // Mesma ordem da aba Campanhas (mais recentes primeiro, depois por nome).
      "Aniversários",
      "Junho",
    ]);
    // Cada campanha tem a própria aba, com filtro em todas as colunas e link na lista.
    const junho = workbook.getWorksheet("Junho")!;
    expect(junho.autoFilter).toBeTruthy();
    expect(junho.getRow(1).values).toEqual([
      undefined,
      "Cliente",
      "WhatsApp",
      "Situação",
      "Marcada em",
      "Marcada por",
      "Texto enviado",
    ]);
    const junhoStatus = junho
      .getSheetValues()
      .slice(2)
      .map((row) => (row as unknown[])[3]);
    expect(junhoStatus).toContain("Enviada");
    expect(junhoStatus).toContain("Pendente");
    expect(workbook.getWorksheet("Campanhas")!.getColumn(13).values).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ text: "Junho", hyperlink: "#'Junho'!A1" }),
      ]),
    );
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

  it("detalha na aba da campanha promocional quem recebeu, quem está previsto e quem usou a promoção", async () => {
    const { app, headers } = await setup();
    const createPatient = async (fullName: string, birthDate: string) => {
      const response = await app.inject({
        method: "POST",
        url: "/patients",
        headers,
        payload: {
          cpf: nextTestCpf(),
          fullName,
          phone: "11955554444",
          whatsapp: "11955554444",
          emergencyContactName: fullName,
          emergencyContactPhone: "11955554444",
          emergencyContactWhatsapp: "11955554444",
          birthDate,
          tags: [],
        },
      });
      expect(response.statusCode).toBe(201);
      return response.json<{ id: string }>();
    };
    // Hoje é 10/06: os dois estão na mensagem de 7 dias antes do aniversário.
    const lara = await createPatient("Lara Promo", "1990-06-15");
    await createPatient("Rita Prevista", "1991-06-16");
    const campaign = (
      await app.inject({
        method: "POST",
        url: "/communications/auto-campaigns",
        headers,
        payload: {
          name: "Promo: junho/julho",
          trigger: "birthday",
          steps: [{ offset: 7, message: "Olá, {{nome}}" }],
          promotion: { validDays: 10 },
        },
      })
    ).json<AutoCampaign>();
    const queue = (
      await app.inject({
        method: "GET",
        url: "/communications/auto-campaigns/queue",
        headers,
      })
    ).json<AutoCampaignQueue>();
    const item = queue.items.find(
      (entry) =>
        entry.campaignId === campaign.id && entry.patientId === lara.id,
    )!;
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/communications/auto-campaigns/deliveries",
          headers,
          payload: {
            campaignId: campaign.id,
            stepId: item.stepId,
            patientId: lara.id,
            occurrenceKey: item.occurrenceKey,
            status: "sent",
          },
        })
      ).statusCode,
    ).toBe(201);
    const [professionals, rooms, services] = await Promise.all(
      ["/professionals", "/rooms", "/services"].map((url) =>
        app.inject({ method: "GET", url, headers }),
      ),
    );
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/appointments",
          headers,
          payload: await withAppointmentPlan(
            app,
            {
              patientId: lara.id,
              professionalId: professionals!.json()[0].id,
              roomId: rooms!.json()[0].id,
              serviceId: services!.json()[0].id,
              startsAt: "2039-06-20T13:00:00.000Z",
              promotion: {
                campaignId: campaign.id,
                occurrenceKey: item.occurrenceKey,
              },
            },
            headers,
          ),
        })
      ).statusCode,
    ).toBe(201);

    const response = await app.inject({
      method: "GET",
      url: "/reports/campaigns.xlsx?from=2039-06-01&to=2039-06-30",
      headers,
    });
    expect(response.statusCode).toBe(200);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(response.rawPayload as unknown as ArrayBuffer);
    // Caracteres proibidos no nome da aba viram espaço.
    const sheet = workbook.getWorksheet("Promo junho julho")!;
    const header = sheet.getRow(1).values as unknown[];
    expect(header).toEqual([
      undefined,
      "Cliente",
      "WhatsApp",
      "Situação",
      "Mensagem da campanha",
      "Data do evento",
      "Motivo ou observação",
      "Marcada em",
      "Marcada por",
      "Promoção válida até",
      "Usou a promoção",
      "Agendou com a promoção em",
      "Situação do agendamento",
      "Texto enviado",
    ]);
    const column = (name: string) => header.indexOf(name);
    const rows = sheet.getSheetValues().slice(2) as unknown[][];
    const laraRow = rows.find((row) => row[1] === "Lara Promo")!;
    expect(laraRow[column("Situação")]).toBe("Enviada");
    expect(laraRow[column("Marcada por")]).toBeTruthy();
    expect(laraRow[column("Usou a promoção")]).toBe("Sim");
    expect(laraRow[column("Situação do agendamento")]).toBe("Agendado");
    expect(laraRow[column("Promoção válida até")]).toEqual(
      new Date("2039-06-25T12:00:00Z"),
    );
    const ritaRow = rows.find((row) => row[1] === "Rita Prevista")!;
    expect(ritaRow[column("Situação")]).toBe("Prevista (fila de hoje)");
    expect(ritaRow[column("Mensagem da campanha")]).toBe("7 dias antes");
    expect(ritaRow[column("Usou a promoção")]).toBe("Não");
    expect(ritaRow[column("Marcada por")]).toBeFalsy();
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
