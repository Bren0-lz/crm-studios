import type {
  CampaignRecipientUpdate,
  MessageTemplate,
  MessageTemplateImageContent,
  PermissionKey,
  WhatsappCampaign,
  WhatsappCampaignDetail,
  WhatsappCampaignPreview,
} from "@crm/contracts";
import { afterEach, describe, expect, it } from "vitest";
import { nextTestCpf } from "../../test-support/cpf.js";
import { buildApp } from "../../app.js";
import { MemoryClinicRepository } from "../../memory-repository.js";

const clinicId = "11111111-1111-4111-8111-111111111111",
  actorId = "22222222-2222-4222-8222-222222222222";
const png =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

async function setup() {
  const repository = new MemoryClinicRepository();
  const app = await buildApp({ repository, logger: false });
  apps.push(app);
  const headers = {
    authorization: `Bearer ${app.jwt.sign({ sub: actorId, clinicId, role: "admin" })}`,
  };
  return { app, repository, headers };
}

describe("mensagens padrão de WhatsApp", () => {
  it("cria com imagem, troca a ordem, remove e arquiva sem perder a imagem antiga", async () => {
    const { app, headers } = await setup();
    const created = await app.inject({
      method: "POST",
      url: "/communications/templates",
      headers,
      payload: {
        title: "Promoção de Pilates",
        body: "Olá, {{nome}}! Temos novidades.",
        images: [
          { fileName: "arte.png", dataUrl: png },
          { fileName: "foto.png", dataUrl: png },
        ],
      },
    });
    expect(created.statusCode).toBe(201);
    const template = created.json<MessageTemplate>();
    expect(template.images).toHaveLength(2);
    expect(template.images[0]).toMatchObject({
      fileName: "arte.png",
      mimeType: "image/png",
      sizeBytes: 68,
    });
    const [first, second] = template.images;

    const updated = await app.inject({
      method: "PUT",
      url: `/communications/templates/${template.id}`,
      headers,
      payload: {
        title: "Promoção",
        body: "Oi, {{nome}}!",
        images: [{ id: second!.id }],
      },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json<MessageTemplate>().images.map((i) => i.id)).toEqual([
      second!.id,
    ]);
    const removed = await app.inject({
      url: `/communications/template-images/${first!.id}`,
      headers,
    });
    expect(removed.json<MessageTemplateImageContent>().dataUrl).toBe(png);

    const archived = await app.inject({
      method: "POST",
      url: `/communications/templates/${template.id}/archive`,
      headers,
      payload: { archived: true },
    });
    expect(archived.json<MessageTemplate>().archivedAt).toBeTruthy();
    const list = await app.inject({
      url: "/communications/templates",
      headers,
    });
    expect(list.json<MessageTemplate[]>()).toHaveLength(1);
  });

  it("recusa mais de 3 imagens, arquivo que não é imagem e imagem de outro modelo", async () => {
    const { app, headers } = await setup();
    const tooMany = await app.inject({
      method: "POST",
      url: "/communications/templates",
      headers,
      payload: {
        title: "Muitas",
        body: "Oi",
        images: Array.from({ length: 4 }, (_, i) => ({
          fileName: `${i}.png`,
          dataUrl: png,
        })),
      },
    });
    expect(tooMany.statusCode).toBe(400);
    const fake = await app.inject({
      method: "POST",
      url: "/communications/templates",
      headers,
      payload: {
        title: "Falsa",
        body: "Oi",
        images: [
          {
            fileName: "texto.png",
            dataUrl: `data:image/png;base64,${Buffer.from("não sou imagem").toString("base64")}`,
          },
        ],
      },
    });
    expect(fake.statusCode).toBe(400);
    expect(fake.json<{ code: string }>().code).toBe("MESSAGE_IMAGE_INVALID");
    const other = (
      await app.inject({
        method: "POST",
        url: "/communications/templates",
        headers,
        payload: {
          title: "Outro",
          body: "Oi",
          images: [{ fileName: "a.png", dataUrl: png }],
        },
      })
    ).json<MessageTemplate>();
    const target = (
      await app.inject({
        method: "POST",
        url: "/communications/templates",
        headers,
        payload: { title: "Alvo", body: "Oi" },
      })
    ).json<MessageTemplate>();
    const stolen = await app.inject({
      method: "PUT",
      url: `/communications/templates/${target.id}`,
      headers,
      payload: {
        title: "Alvo",
        body: "Oi",
        images: [{ id: other.images[0]!.id }],
      },
    });
    expect(stolen.statusCode).toBe(400);
  });
});

describe("campanhas de WhatsApp", () => {
  it("monta a campanha com o nome do cliente, pula quem bloqueou e conclui ao marcar todos", async () => {
    const { app, repository, headers } = await setup();
    const [ana, bruno] = await repository.listPatients(clinicId);
    await repository.setCommunicationPreference(clinicId, {
      patientId: bruno!.id,
      channel: "whatsapp",
      allowed: false,
    });
    const template = (
      await app.inject({
        method: "POST",
        url: "/communications/templates",
        headers,
        payload: {
          title: "Volta às aulas",
          body: "Olá, {{nome}}! ({{nome_completo}})",
          images: [{ fileName: "arte.png", dataUrl: png }],
        },
      })
    ).json<MessageTemplate>();
    const audience = {
      mode: "patients",
      patientIds: [ana!.id, bruno!.id, ana!.id],
    };

    const preview = await app.inject({
      method: "POST",
      url: "/communications/campaigns/preview",
      headers,
      payload: { templateId: template.id, audience },
    });
    const previewBody = preview.json<WhatsappCampaignPreview>();
    expect(previewBody).toMatchObject({ matched: 2, recipients: 1 });
    expect(previewBody.included).toEqual([
      {
        patientId: ana!.id,
        patientName: ana!.fullName,
        phone: ana!.whatsapp || ana!.phone,
      },
    ]);
    expect(previewBody.skipped).toEqual([
      expect.objectContaining({ patientId: bruno!.id, reason: "opt_out" }),
    ]);
    const firstName = ana!.fullName.split(" ")[0];
    expect(previewBody.sample?.message).toBe(
      `Olá, ${firstName}! (${ana!.fullName})`,
    );

    const created = await app.inject({
      method: "POST",
      url: "/communications/campaigns",
      headers,
      payload: { templateId: template.id, name: "Outubro", audience },
    });
    expect(created.statusCode).toBe(201);
    const campaign = created.json<WhatsappCampaignDetail>();
    expect(campaign).toMatchObject({
      name: "Outubro",
      templateTitle: "Volta às aulas",
      total: 1,
      sent: 0,
    });
    expect(campaign.images).toHaveLength(1);
    expect(campaign.recipients[0]).toMatchObject({
      patientId: ana!.id,
      status: "pending",
    });

    // Editar o modelo depois não muda a campanha já criada.
    await app.inject({
      method: "PUT",
      url: `/communications/templates/${template.id}`,
      headers,
      payload: { title: "Novo", body: "Outro texto", images: [] },
    });

    const marked = await app.inject({
      method: "POST",
      url: `/communications/campaigns/${campaign.id}/recipients/${campaign.recipients[0]!.id}`,
      headers,
      payload: { status: "sent" },
    });
    const update = marked.json<CampaignRecipientUpdate>();
    expect(update.recipient).toMatchObject({
      status: "sent",
      handledByName: "Aryana Dutra",
    });
    expect(update.campaign.sent).toBe(1);
    expect(update.campaign.completedAt).toBeTruthy();

    const reopened = await app.inject({
      method: "POST",
      url: `/communications/campaigns/${campaign.id}/recipients/${campaign.recipients[0]!.id}`,
      headers,
      payload: { status: "pending" },
    });
    expect(
      reopened.json<CampaignRecipientUpdate>().campaign.completedAt,
    ).toBeUndefined();

    const detail = (
      await app.inject({
        url: `/communications/campaigns/${campaign.id}`,
        headers,
      })
    ).json<WhatsappCampaignDetail>();
    expect(detail.body).toBe("Olá, {{nome}}! ({{nome_completo}})");
    expect(detail.images).toHaveLength(1);
    const list = (
      await app.inject({ url: "/communications/campaigns", headers })
    ).json<WhatsappCampaign[]>();
    expect(list.map((item) => item.id)).toEqual([campaign.id]);
  });

  it("lembrete de atendimento: filtra pelo dia e preenche data e hora", async () => {
    const { app, repository, headers } = await setup();
    const patient = await repository.createPatient(clinicId, {
      cpf: nextTestCpf(),
      fullName: "Clara Lembrete",
      phone: "11988887777",
      tags: [],
    });
    const [professional] = await repository.listProfessionals(clinicId),
      [room] = await repository.listRooms(clinicId),
      [service] = await repository.listServices(clinicId);
    // Daqui a 2 dias, 12:30 UTC = 09:30 em São Paulo (fuso padrão da clínica).
    const day = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    await repository.createAppointment(clinicId, {
      patientId: patient.id,
      professionalId: professional!.id,
      roomId: room!.id,
      serviceId: service!.id,
      startsAt: `${day}T12:30:00Z`,
      visitType: "trial",
      notes: "",
    });
    const template = (
      await app.inject({
        method: "POST",
        url: "/communications/templates",
        headers,
        payload: {
          title: "Lembrete",
          body: "Oi, {{nome}}! Seu atendimento é {{data_atendimento}} às {{hora_atendimento}}.",
          images: [],
        },
      })
    ).json<MessageTemplate>();
    const preview = await app.inject({
      method: "POST",
      url: "/communications/campaigns/preview",
      headers,
      payload: {
        templateId: template.id,
        audience: {
          mode: "segment",
          segment: { tags: [], birthdayMonth: false, appointmentDate: day },
        },
      },
    });
    expect(preview.statusCode).toBe(200);
    const body = preview.json<WhatsappCampaignPreview>();
    expect(body.recipients).toBe(1);
    expect(body.sample?.message).toBe(
      `Oi, Clara! Seu atendimento é ${day.slice(8, 10)}/${day.slice(5, 7)} às 09:30.`,
    );
  });

  it("lista as preferências de canal de um cliente", async () => {
    const { app, repository, headers } = await setup();
    const [ana, bruno] = await repository.listPatients(clinicId);
    await repository.setCommunicationPreference(clinicId, {
      patientId: ana!.id,
      channel: "email",
      allowed: false,
    });
    await repository.setCommunicationPreference(clinicId, {
      patientId: bruno!.id,
      channel: "whatsapp",
      allowed: false,
    });
    const response = await app.inject({
      url: `/communications/preferences?patientId=${ana!.id}`,
      headers,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([
      expect.objectContaining({
        patientId: ana!.id,
        channel: "email",
        allowed: false,
      }),
    ]);
  });

  it("aceita segmento por etiqueta e recusa modelo arquivado", async () => {
    const { app, repository, headers } = await setup();
    const patients = await repository.listPatients(clinicId);
    const template = (
      await app.inject({
        method: "POST",
        url: "/communications/templates",
        headers,
        payload: { title: "Todos", body: "Oi, {{nome}}" },
      })
    ).json<MessageTemplate>();
    const preview = await app.inject({
      method: "POST",
      url: "/communications/campaigns/preview",
      headers,
      payload: {
        templateId: template.id,
        audience: { mode: "segment", segment: {} },
      },
    });
    expect(preview.json<WhatsappCampaignPreview>().matched).toBe(
      patients.length,
    );
    await app.inject({
      method: "POST",
      url: `/communications/templates/${template.id}/archive`,
      headers,
      payload: { archived: true },
    });
    const refused = await app.inject({
      method: "POST",
      url: "/communications/campaigns",
      headers,
      payload: {
        templateId: template.id,
        name: "Arquivada",
        audience: { mode: "segment", segment: {} },
      },
    });
    expect(refused.statusCode).toBe(404);
  });

  it("exige as permissões de mensagens padrão e de campanhas", async () => {
    const { app, repository } = await setup();
    const make = async (email: string, permissions: PermissionKey[]) => {
      const user = await repository.createAdminUser(
        clinicId,
        actorId,
        {
          fullName: "Recepção",
          email,
          password: "Password123",
          role: "user",
          permissions,
        },
        "unused-hash",
      );
      return {
        authorization: `Bearer ${app.jwt.sign({ sub: user.id, clinicId, role: "user" })}`,
      };
    };
    const viewer = await make("viewer@example.com", ["communications.view"]);
    expect(
      (await app.inject({ url: "/communications/templates", headers: viewer }))
        .statusCode,
    ).toBe(200);
    const denied = await app.inject({
      method: "POST",
      url: "/communications/templates",
      headers: viewer,
      payload: { title: "X", body: "Y" },
    });
    expect(denied.statusCode).toBe(403);
    const sender = await make("sender@example.com", [
      "communications.view",
      "communications.campaigns",
    ]);
    const preview = await app.inject({
      method: "POST",
      url: "/communications/campaigns/preview",
      headers: sender,
      payload: {
        templateId: "33333333-3333-4333-8333-333333333333",
        audience: { mode: "segment", segment: {} },
      },
    });
    expect(preview.statusCode).toBe(404);
  });

  it("oferece opções de filtro e exclui quem já recebeu campanha recente", async () => {
    const { app, repository, headers } = await setup();
    const options = await app.inject({
      url: "/communications/campaigns/filter-options",
      headers,
    });
    expect(options.statusCode).toBe(200);
    expect(options.json()).toMatchObject({ finance: true });
    const [ana] = await repository.listPatients(clinicId);
    const template = (
      await app.inject({
        method: "POST",
        url: "/communications/templates",
        headers,
        payload: { title: "Recente", body: "Oi, {{nome}}" },
      })
    ).json<MessageTemplate>();
    const campaign = (
      await app.inject({
        method: "POST",
        url: "/communications/campaigns",
        headers,
        payload: {
          templateId: template.id,
          name: "Primeira",
          audience: { mode: "patients", patientIds: [ana!.id] },
        },
      })
    ).json<WhatsappCampaignDetail>();
    await app.inject({
      method: "POST",
      url: `/communications/campaigns/${campaign.id}/recipients/${campaign.recipients[0]!.id}`,
      headers,
      payload: { status: "sent" },
    });
    const preview = (segment: Record<string, unknown>) =>
      app
        .inject({
          method: "POST",
          url: "/communications/campaigns/preview",
          headers,
          payload: {
            templateId: template.id,
            audience: { mode: "segment", segment },
          },
        })
        .then((response) => response.json<WhatsappCampaignPreview>());
    const all = await preview({});
    const fresh = await preview({ excludeContactedDays: 7 });
    expect(fresh.matched).toBe(all.matched - 1);
    expect(fresh.included.some((item) => item.patientId === ana!.id)).toBe(
      false,
    );
  });

  it("recusa filtro de parcela vencida sem acesso ao financeiro", async () => {
    const { app, repository, headers } = await setup();
    const template = (
      await app.inject({
        method: "POST",
        url: "/communications/templates",
        headers,
        payload: { title: "Cobrança", body: "Oi" },
      })
    ).json<MessageTemplate>();
    const user = await repository.createAdminUser(
      clinicId,
      actorId,
      {
        fullName: "Recepção",
        email: "recepcao@example.com",
        password: "Password123",
        role: "user",
        permissions: ["communications.view", "communications.campaigns"],
      },
      "unused-hash",
    );
    const reception = {
      authorization: `Bearer ${app.jwt.sign({ sub: user.id, clinicId, role: "user" })}`,
    };
    const denied = await app.inject({
      method: "POST",
      url: "/communications/campaigns/preview",
      headers: reception,
      payload: {
        templateId: template.id,
        audience: { mode: "segment", segment: { overdue: true } },
      },
    });
    expect(denied.statusCode).toBe(403);
    const options = await app.inject({
      url: "/communications/campaigns/filter-options",
      headers: reception,
    });
    expect(options.json()).toMatchObject({ finance: false });
  });
});
