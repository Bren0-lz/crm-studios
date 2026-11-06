import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../../app.js";
import type { TelegramIntegration } from "../../infrastructure/telegram-client.js";
import { MemoryClinicRepository } from "../../memory-repository.js";

const clinicId = "11111111-1111-4111-8111-111111111111";
const ownerId = "22222222-2222-4222-8222-222222222222";
const secret = "segredo-do-webhook-de-teste-1234";
const start = new Date("2026-11-06T12:00:00.000Z");
const minute = 60_000;

/** Cliente falso do Telegram: guarda as mensagens e pode falhar; relógio controlado. */
function fakeTelegram() {
  const sent: { chatId: string; text: string }[] = [];
  let failing = false;
  let current = start.getTime();
  const integration: TelegramIntegration = {
    webhookSecret: secret,
    now: () => new Date(current),
    client: {
      async sendMessage(chatId, text) {
        if (failing) throw new Error("Telegram fora do ar");
        sent.push({ chatId, text });
      },
    },
  };
  return {
    integration,
    sent,
    fail(value: boolean) {
      failing = value;
    },
    advance(ms: number) {
      current += ms;
    },
    at: () => new Date(current).toISOString(),
  };
}

let apps: Awaited<ReturnType<typeof buildApp>>[] = [];
afterEach(async () => {
  await Promise.all(apps.map((app) => app.close()));
  apps = [];
});

async function setup(telegram: TelegramIntegration | null) {
  const repository = new MemoryClinicRepository();
  const app = await buildApp({ repository, logger: false, telegram });
  apps.push(app);
  const headers = {
    authorization: `Bearer ${app.jwt.sign({ sub: ownerId, clinicId, role: "admin" })}`,
  };
  async function userHeaders() {
    const user = await repository.createAdminUser(
      clinicId,
      ownerId,
      {
        fullName: "Recepção Telegram",
        email: `${randomUUID()}@test.local`,
        role: "user",
        password: "Password123",
      },
      "unused-hash",
    );
    return {
      id: user.id,
      headers: {
        authorization: `Bearer ${app.jwt.sign({ sub: user.id, clinicId, role: "user" })}`,
      },
    };
  }
  const webhook = (
    text: string,
    chatId: number | string = 555,
    options: { path?: string; header?: string | null } = {},
  ) =>
    app.inject({
      method: "POST",
      url: `/integrations/telegram/webhook/${options.path ?? secret}`,
      headers:
        options.header === null
          ? {}
          : { "x-telegram-bot-api-secret-token": options.header ?? secret },
      payload: { update_id: 1, message: { chat: { id: chatId }, text } },
    });
  const linkCode = async (auth = headers) =>
    app.inject({
      method: "POST",
      url: "/integrations/telegram/link-code",
      headers: auth,
    });
  return { repository, app, headers, userHeaders, webhook, linkCode };
}

describe("Telegram: integração desligada", () => {
  it("sem token, informa desligada, não gera código e o webhook não existe", async () => {
    const { app, headers, linkCode, webhook } = await setup(null);
    const status = await app.inject({
      url: "/integrations/telegram",
      headers,
    });
    expect(status.statusCode).toBe(200);
    expect(status.json()).toEqual({
      enabled: false,
      canLink: true,
      linkRoles: ["admin"],
    });
    const code = await linkCode();
    expect(code.statusCode).toBe(409);
    expect(code.json().code).toBe("TELEGRAM_DISABLED");
    expect((await webhook("/start")).statusCode).toBe(404);
    const drain = await app.inject({
      method: "POST",
      url: "/integrations/telegram/outbox/drain",
      headers,
    });
    expect(drain.statusCode).toBe(409);
  });
});

describe("Telegram: vínculo", () => {
  it("vincula o chat com o código e responde pela fila", async () => {
    const fake = fakeTelegram();
    const { app, repository, headers, linkCode, webhook } = await setup(
      fake.integration,
    );
    const created = await linkCode();
    expect(created.statusCode).toBe(201);
    const { code, expiresAt, command } = created.json();
    expect(code).toMatch(/^[A-HJKMNP-Z2-9]{8}$/);
    expect(command).toBe(`/vincular ${code}`);
    expect(expiresAt).toBe(new Date(start.getTime() + 10 * minute).toISOString());

    // Aceita o nome do bot no comando e o código em minúsculas.
    const response = await webhook(
      `/vincular@StudiosBot ${code.toLowerCase()}`,
      555,
    );
    expect(response.statusCode).toBe(200);
    expect(fake.sent).toEqual([
      {
        chatId: "555",
        text: "Pronto, Aryana Dutra! Este chat foi vinculado ao CRM e vai receber os avisos.",
      },
    ]);
    expect(await repository.listTelegramLinks(clinicId)).toEqual([
      { clinicId, userId: ownerId, chatId: "555", linkedAt: fake.at() },
    ]);
    const status = await app.inject({ url: "/integrations/telegram", headers });
    expect(status.json()).toEqual({
      enabled: true,
      canLink: true,
      linkRoles: ["admin"],
      link: { linkedAt: fake.at() },
    });
    const [reply] = await repository.listTelegramOutbox(clinicId);
    expect(reply).toMatchObject({ attempts: 1, sentAt: fake.at() });

    // Desvincular.
    const unlinked = await app.inject({
      method: "DELETE",
      url: "/integrations/telegram/link",
      headers,
    });
    expect(unlinked.statusCode).toBe(200);
    expect(unlinked.json().link).toBeUndefined();
    expect(await repository.listTelegramLinks(clinicId)).toEqual([]);
    const again = await app.inject({
      method: "DELETE",
      url: "/integrations/telegram/link",
      headers,
    });
    expect(again.statusCode).toBe(404);
  });

  it("recusa código reutilizado, vencido, substituído ou inexistente", async () => {
    const fake = fakeTelegram();
    const { repository, linkCode, webhook } = await setup(fake.integration);
    const first = (await linkCode()).json().code as string;
    await webhook(`/vincular ${first}`, 555);
    await webhook(`/vincular ${first}`, 777);
    expect(fake.sent.at(-1)).toEqual({
      chatId: "777",
      text: "Este código já foi usado. Gere um novo em Configurações › Integrações.",
    });
    expect(
      (await repository.listTelegramLinks(clinicId)).map((link) => link.chatId),
    ).toEqual(["555"]);

    const expired = (await linkCode()).json().code as string;
    fake.advance(10 * minute);
    await webhook(`/vincular ${expired}`, 777);
    expect(fake.sent.at(-1)?.text).toBe(
      "Este código venceu (vale 10 minutos). Gere um novo em Configurações › Integrações.",
    );

    const replaced = (await linkCode()).json().code as string;
    const current = (await linkCode()).json().code as string;
    await webhook(`/vincular ${replaced}`, 777);
    expect(fake.sent.at(-1)?.text).toMatch(/^Código não encontrado\./);
    await webhook("/vincular", 777);
    expect(fake.sent.at(-1)?.text).toMatch(/^Envie \/vincular seguido/);
    await webhook("oi", 777);
    expect(fake.sent.at(-1)?.text).toMatch(/^Olá! Para receber os avisos/);

    await webhook(`/vincular ${current}`, 777);
    expect(
      (await repository.listTelegramLinks(clinicId)).map((link) => link.chatId),
    ).toEqual(["777"]);
  });

  it("recusa o webhook com segredo errado no caminho ou no cabeçalho", async () => {
    const fake = fakeTelegram();
    const { repository, linkCode, webhook } = await setup(fake.integration);
    const code = (await linkCode()).json().code as string;
    for (const options of [
      { path: "segredo-errado-errado-errado-000" },
      { header: "segredo-errado-errado-errado-000" },
      { header: null },
    ]) {
      const response = await webhook(`/vincular ${code}`, 555, options);
      expect(response.statusCode).toBe(401);
      expect(response.json().code).toBe("TELEGRAM_WEBHOOK_UNAUTHORIZED");
    }
    expect(fake.sent).toEqual([]);
    expect(await repository.listTelegramLinks(clinicId)).toEqual([]);
    // O código continua valendo.
    expect((await webhook(`/vincular ${code}`, 555)).statusCode).toBe(200);
    expect(await repository.listTelegramLinks(clinicId)).toHaveLength(1);
  });

  it("só os perfis da configuração da clínica podem vincular (padrão: admin)", async () => {
    const fake = fakeTelegram();
    const { app, repository, headers, userHeaders, linkCode, webhook } =
      await setup(fake.integration);
    const user = await userHeaders();
    const status = await app.inject({
      url: "/integrations/telegram",
      headers: user.headers,
    });
    expect(status.json()).toMatchObject({ enabled: true, canLink: false });
    const denied = await linkCode(user.headers);
    expect(denied.statusCode).toBe(403);
    expect(denied.json().code).toBe("TELEGRAM_LINK_FORBIDDEN");

    // Só o admin muda a configuração.
    const settings = (headersFor: { authorization: string }, linkRoles: string[]) =>
      app.inject({
        method: "PUT",
        url: "/integrations/telegram/settings",
        headers: headersFor,
        payload: { linkRoles },
      });
    expect((await settings(user.headers, ["admin", "user"])).statusCode).toBe(403);
    const saved = await settings(headers, ["admin", "user"]);
    expect(saved.statusCode).toBe(200);
    expect(saved.json()).toEqual({ linkRoles: ["admin", "user"] });

    const code = (await linkCode(user.headers)).json().code as string;
    // O perfil é conferido de novo no /vincular.
    await settings(headers, ["admin"]);
    await webhook(`/vincular ${code}`, 888);
    expect(fake.sent.at(-1)?.text).toMatch(/^Seu perfil não pode receber/);
    expect(await repository.getTelegramLink(clinicId, user.id)).toBeNull();

    await settings(headers, ["admin", "user"]);
    await webhook(`/vincular ${code}`, 888);
    expect(await repository.getTelegramLink(clinicId, user.id)).toMatchObject({
      chatId: "888",
    });
  });
});

describe("Telegram: fila de saída", () => {
  it("tenta de novo com espera crescente e desiste depois de 5 tentativas", async () => {
    const fake = fakeTelegram();
    const { app, repository, headers } = await setup(fake.integration);
    const drain = async () =>
      (
        await app.inject({
          method: "POST",
          url: "/integrations/telegram/outbox/drain",
          headers,
        })
      ).json();
    fake.fail(true);
    await repository.enqueueTelegramMessages(
      clinicId,
      [{ chatId: "555", message: "Aviso de teste" }],
      fake.at(),
    );
    const outbox = async () => (await repository.listTelegramOutbox(clinicId))[0]!;

    expect(await drain()).toEqual({ sent: 0, failed: 1, gaveUp: 0 });
    expect(await outbox()).toMatchObject({
      attempts: 1,
      lastError: "Telegram fora do ar",
      nextAttemptAt: new Date(start.getTime() + minute).toISOString(),
    });
    // Antes da espera, nada sai.
    fake.advance(minute / 2);
    expect(await drain()).toEqual({ sent: 0, failed: 0, gaveUp: 0 });
    fake.advance(minute / 2);

    const delays = [2, 4, 8];
    for (const [index, delay] of delays.entries()) {
      expect(await drain()).toEqual({ sent: 0, failed: 1, gaveUp: 0 });
      const item = await outbox();
      expect(item.attempts).toBe(index + 2);
      expect(Date.parse(item.nextAttemptAt) - Date.parse(fake.at())).toBe(
        delay * minute,
      );
      fake.advance(delay * minute);
    }
    expect(await drain()).toEqual({ sent: 0, failed: 1, gaveUp: 1 });
    expect(await outbox()).toMatchObject({
      attempts: 5,
      failedAt: fake.at(),
      lastError: "Telegram fora do ar",
    });
    expect((await outbox()).sentAt).toBeUndefined();
    fake.advance(60 * minute);
    fake.fail(false);
    expect(await drain()).toEqual({ sent: 0, failed: 0, gaveUp: 0 });
    expect(fake.sent).toEqual([]);
  });

  it("falha no Telegram não desfaz o vínculo e a mensagem sai na próxima tentativa", async () => {
    const fake = fakeTelegram();
    const { repository, linkCode, webhook } = await setup(fake.integration);
    const code = (await linkCode()).json().code as string;
    fake.fail(true);
    const response = await webhook(`/vincular ${code}`, 555);
    expect(response.statusCode).toBe(200);
    expect(await repository.listTelegramLinks(clinicId)).toHaveLength(1);
    expect((await repository.listTelegramOutbox(clinicId))[0]).toMatchObject({
      attempts: 1,
      lastError: "Telegram fora do ar",
    });

    // O próximo webhook drena o que ficou pendente.
    fake.fail(false);
    fake.advance(minute);
    await webhook("/start", 999);
    expect(fake.sent.map((item) => item.chatId).sort()).toEqual(["555", "999"]);
    expect((await repository.listTelegramOutbox(clinicId))[0]).toMatchObject({
      attempts: 2,
      sentAt: fake.at(),
    });
  });

  it("ignora atualizações sem texto e responde 200 ao Telegram", async () => {
    const fake = fakeTelegram();
    const { app } = await setup(fake.integration);
    const response = await app.inject({
      method: "POST",
      url: `/integrations/telegram/webhook/${secret}`,
      headers: { "x-telegram-bot-api-secret-token": secret },
      payload: { update_id: 2, edited_message: { chat: { id: 1 } } },
    });
    expect(response.statusCode).toBe(200);
    expect(fake.sent).toEqual([]);
  });
});
