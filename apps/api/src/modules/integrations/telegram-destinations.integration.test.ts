import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../../app.js";
import { MemoryClinicRepository } from "../../memory-repository.js";
import { nextTestCpf } from "../../test-support/cpf.js";
import { testPatientContact } from "../../test-support/patient-contact.js";

const clinicId = "11111111-1111-4111-8111-111111111111";
const ownerId = "22222222-2222-4222-8222-222222222222";
const secret = "segredo-do-webhook-tg7-teste-1234";
const now = new Date("2026-11-23T12:00:00.000Z");

const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

async function setup() {
  const repository = new MemoryClinicRepository();
  const sent: { chatId: string; text: string }[] = [];
  const app = await buildApp({
    repository,
    logger: false,
    telegram: {
      webhookSecret: secret,
      now: () => now,
      client: {
        async sendMessage(chatId, text) {
          sent.push({ chatId, text });
        },
      },
    },
  });
  apps.push(app);
  const headers = {
    authorization: `Bearer ${app.jwt.sign({ sub: ownerId, clinicId, role: "admin" })}`,
  };
  const webhook = (
    text: string,
    chat: { id: number; type?: string; title?: string },
  ) =>
    app.inject({
      method: "POST",
      url: `/integrations/telegram/webhook/${secret}`,
      headers: { "x-telegram-bot-api-secret-token": secret },
      payload: { update_id: 1, message: { chat, text } },
    });
  const groupCode = async (topics: string[], auth = headers) =>
    app.inject({
      method: "POST",
      url: "/integrations/telegram/groups/link-code",
      headers: auth,
      payload: { topics },
    });
  async function linkGroup(id: number, title: string, topics: string[]) {
    const created = await groupCode(topics);
    expect(created.statusCode, created.body).toBe(201);
    const { code } = created.json<{ code: string }>();
    await webhook(`/vincular@StudiosBot ${code}`, {
      id,
      type: "supergroup",
      title,
    });
  }
  async function linkPrivate(id: number) {
    const created = await app.inject({
      method: "POST",
      url: "/integrations/telegram/link-code",
      headers,
    });
    await webhook(`/vincular ${created.json<{ code: string }>().code}`, {
      id,
      type: "private",
    });
  }
  const createPatient = async (fullName: string) => {
    const response = await app.inject({
      method: "POST",
      url: "/patients",
      headers,
      payload: {
        fullName,
        phone: "11933331111",
        cpf: nextTestCpf(),
        ...testPatientContact,
      },
    });
    expect(response.statusCode, response.body).toBe(201);
  };
  return {
    app,
    repository,
    headers,
    sent,
    webhook,
    groupCode,
    linkGroup,
    linkPrivate,
    createPatient,
  };
}

describe("TG7: vínculo de grupo", () => {
  it("código de grupo só vale dentro de um grupo e grava os assuntos escolhidos", async () => {
    const test = await setup();
    const created = await test.groupCode(["patients", "appointments"]);
    expect(created.statusCode).toBe(201);
    const { code } = created.json<{ code: string }>();

    // No privado, o código não é gasto.
    await test.webhook(`/vincular ${code}`, { id: 555, type: "private" });
    expect(test.sent.at(-1)).toEqual({
      chatId: "555",
      text: "Este código é para vincular um grupo: adicione o bot ao grupo e envie lá /vincular <código>.",
    });

    await test.webhook(`/vincular@StudiosBot ${code}`, {
      id: -100200,
      type: "supergroup",
      title: "CRM · Agenda",
    });
    expect(test.sent.at(-1)).toEqual({
      chatId: "-100200",
      text: "Pronto! Este grupo foi vinculado ao CRM por Aryana Dutra e vai receber os avisos de: Agendamentos e Clientes novos.",
    });
    const groups = await test.app.inject({
      url: "/integrations/telegram/groups",
      headers: test.headers,
    });
    expect(groups.json()).toEqual([
      {
        id: expect.any(String),
        chatId: "-100200",
        title: "CRM · Agenda",
        topics: ["appointments", "patients"],
        linkedAt: now.toISOString(),
        linkedByName: "Aryana Dutra",
      },
    ]);
    // O vínculo de grupo não ocupa o chat pessoal do admin.
    expect(await test.repository.listTelegramLinks(clinicId)).toEqual([]);
  });

  it("código do chat pessoal não vincula um grupo", async () => {
    const test = await setup();
    const created = await test.app.inject({
      method: "POST",
      url: "/integrations/telegram/link-code",
      headers: test.headers,
    });
    const { code } = created.json<{ code: string }>();
    await test.webhook(`/vincular ${code}`, { id: -1, type: "group" });
    expect(test.sent.at(-1)?.text).toBe(
      "Este código vincula o seu chat pessoal: envie no chat privado com o bot. Para um grupo, o admin gera o código em Configurações › Integrações › Vincular grupo.",
    );
    expect(await test.repository.listTelegramLinks(clinicId)).toEqual([]);
    // Continua valendo no privado.
    await test.webhook(`/vincular ${code}`, { id: 555, type: "private" });
    expect(await test.repository.listTelegramLinks(clinicId)).toHaveLength(1);
  });

  it("só o admin gera código de grupo, com pelo menos um assunto", async () => {
    const test = await setup();
    const user = await test.repository.createAdminUser(
      clinicId,
      ownerId,
      {
        fullName: "Recepção TG7",
        email: `${randomUUID()}@test.local`,
        role: "user",
        password: "Password123",
      },
      "unused-hash",
    );
    const userHeaders = {
      authorization: `Bearer ${test.app.jwt.sign({ sub: user.id, clinicId, role: "user" })}`,
    };
    expect((await test.groupCode(["receipts"], userHeaders)).statusCode).toBe(
      403,
    );
    expect(
      (
        await test.app.inject({
          url: "/integrations/telegram/groups",
          headers: userHeaders,
        })
      ).statusCode,
    ).toBe(403);
    expect((await test.groupCode([])).statusCode).toBe(400);
    expect((await test.groupCode(["financeiro"])).statusCode).toBe(400);
  });
});

describe("TG7: cada destino recebe só os seus assuntos", () => {
  it("cliente novo vai para o grupo de clientes, não para o de recibos nem para o chat sem assunto", async () => {
    const test = await setup();
    await test.linkGroup(-100, "CRM · Financeiro", ["receipts"]);
    await test.linkGroup(-200, "CRM · Agenda", ["appointments", "patients"]);
    await test.linkPrivate(555);
    const topics = await test.app.inject({
      method: "PUT",
      url: "/integrations/telegram/link/topics",
      headers: test.headers,
      payload: { topics: [] },
    });
    expect(topics.statusCode).toBe(200);
    expect(topics.json().link.topics).toEqual([]);
    test.sent.length = 0;

    await test.createPatient("Cliente Grupo TG7");
    expect(test.sent).toEqual([
      {
        chatId: "-200",
        text: "Cliente novo: Cliente Grupo TG7 · cadastrado por Aryana Dutra",
      },
    ]);

    // O chat pessoal volta a receber clientes novos.
    await test.app.inject({
      method: "PUT",
      url: "/integrations/telegram/link/topics",
      headers: test.headers,
      payload: { topics: ["patients", "patients"] },
    });
    test.sent.length = 0;
    await test.createPatient("Outro Cliente TG7");
    expect(test.sent.map((item) => item.chatId).sort()).toEqual([
      "-200",
      "555",
    ]);
  });

  it("chat pessoal sem escolha recebe tudo, como antes; grupo, só o que escolheu", async () => {
    const test = await setup();
    await test.linkPrivate(555);
    await test.linkGroup(-300, "CRM · Tudo", ["patients"]);
    test.sent.length = 0;
    await test.createPatient("Cliente Único TG7");
    expect(test.sent.map((item) => item.chatId).sort()).toEqual([
      "-300",
      "555",
    ]);
  });

  it("editar e desvincular grupo", async () => {
    const test = await setup();
    await test.linkGroup(-400, "CRM · Agenda", ["patients"]);
    const [group] = await test.repository.listTelegramGroupLinks(clinicId);
    const updated = await test.app.inject({
      method: "PUT",
      url: `/integrations/telegram/groups/${group!.id}`,
      headers: test.headers,
      payload: { topics: ["receipts"] },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().topics).toEqual(["receipts"]);
    test.sent.length = 0;
    await test.createPatient("Sem Aviso TG7");
    expect(test.sent).toEqual([]);

    const removed = await test.app.inject({
      method: "DELETE",
      url: `/integrations/telegram/groups/${group!.id}`,
      headers: test.headers,
    });
    expect(removed.statusCode).toBe(204);
    expect(await test.repository.listTelegramGroupLinks(clinicId)).toEqual([]);
    const missing = await test.app.inject({
      method: "DELETE",
      url: `/integrations/telegram/groups/${group!.id}`,
      headers: test.headers,
    });
    expect(missing.statusCode).toBe(404);
    expect(missing.json().code).toBe("TELEGRAM_GROUP_NOT_FOUND");
  });

  it("assuntos do chat pessoal sem vínculo: 404", async () => {
    const test = await setup();
    const response = await test.app.inject({
      method: "PUT",
      url: "/integrations/telegram/link/topics",
      headers: test.headers,
      payload: { topics: ["receipts"] },
    });
    expect(response.statusCode).toBe(404);
    expect(response.json().code).toBe("TELEGRAM_LINK_NOT_FOUND");
  });
});

describe("TG7: comandos no grupo", () => {
  it("agenda não responde no grupo; conversa comum é ignorada; ajuda diz o que o grupo recebe", async () => {
    const test = await setup();
    await test.linkGroup(-500, "CRM · Financeiro", ["receipts"]);
    test.sent.length = 0;
    const group = { id: -500, type: "group" };

    await test.webhook("bom dia, equipe", group);
    await test.webhook("/comando@OutroBot", group);
    expect(test.sent).toEqual([]);

    await test.webhook("/hoje@StudiosBot", group);
    expect(test.sent.at(-1)?.text).toBe(
      "Os comandos de agenda só respondem no chat privado com o bot, para a agenda não ficar exposta no grupo.",
    );
    await test.webhook("/start", group);
    expect(test.sent.at(-1)?.text).toBe(
      "Este grupo recebe os avisos de: Recibos. Os comandos de agenda só respondem no chat privado com o bot.",
    );
    await test.webhook("/start", { id: -600, type: "group" });
    expect(test.sent.at(-1)?.text).toBe(
      "Para este grupo receber os avisos do CRM, o admin gera um código em Configurações › Integrações › Vincular grupo e envia aqui /vincular <código>.",
    );
  });
});
