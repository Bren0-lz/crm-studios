import { describe, expect, it, vi } from "vitest";
import {
  createTelegramClient,
  telegramIntegrationFromEnv,
  telegramWebhookSecret,
} from "./telegram-client.js";

const token = "123456:token-secreto-do-bot";

describe("cliente do Telegram (sem rede)", () => {
  it("manda a mensagem pela Bot API com fetch", async () => {
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    await createTelegramClient(token, fetchImpl).sendMessage("42", "Olá");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`https://api.telegram.org/bot${token}/sendMessage`);
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ chat_id: "42", text: "Olá" });
  });

  it("falha sem expor o token", async () => {
    const refused = createTelegramClient(
      token,
      async () =>
        new Response(
          JSON.stringify({ ok: false, description: "Bad Request: chat not found" }),
          { status: 400 },
        ),
    );
    await expect(refused.sendMessage("42", "Olá")).rejects.toThrow(
      "Telegram recusou a mensagem (400: Bad Request: chat not found).",
    );
    const offline = createTelegramClient(token, async () => {
      throw new TypeError(`fetch failed https://api.telegram.org/bot${token}`);
    });
    const error = await offline.sendMessage("42", "Olá").catch((cause) => cause);
    expect(error.message).toBe("Falha de rede ao falar com o Telegram.");
    expect(error.message).not.toContain(token);
  });

  it("descobre o nome do bot com getMe sem expor o token", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ ok: true, result: { id: 1, is_bot: true, username: "StudiosAryanaBot" } }),
          { status: 200 },
        ),
    );
    const client = createTelegramClient(token, fetchImpl);
    await expect(client.getMe?.()).resolves.toEqual({ username: "StudiosAryanaBot" });
    const [url] = fetchImpl.mock.calls[0] as unknown as [string];
    expect(url).toBe(`https://api.telegram.org/bot${token}/getMe`);

    const refused = createTelegramClient(
      token,
      async () =>
        new Response(JSON.stringify({ ok: false, description: "Unauthorized" }), {
          status: 401,
        }),
    );
    const error = await refused.getMe?.().catch((cause) => cause);
    expect(error.message).toBe("Telegram não informou o bot (401: Unauthorized).");
    expect(error.message).not.toContain(token);

    const withoutName = createTelegramClient(
      token,
      async () => new Response(JSON.stringify({ ok: true, result: {} }), { status: 200 }),
    );
    await expect(withoutName.getMe?.()).rejects.toThrow(
      "Telegram não informou o nome do bot.",
    );
  });

  it("fica desligado sem TELEGRAM_BOT_TOKEN e deriva o segredo do webhook", () => {
    expect(telegramIntegrationFromEnv({})).toBeNull();
    expect(telegramIntegrationFromEnv({ TELEGRAM_BOT_TOKEN: "  " })).toBeNull();
    const derived = telegramIntegrationFromEnv({ TELEGRAM_BOT_TOKEN: token });
    expect(derived?.webhookSecret).toMatch(/^[0-9a-f]{48}$/);
    expect(derived?.webhookSecret).not.toContain(token);
    expect(telegramWebhookSecret(token, "segredo_proprio-1234")).toBe(
      "segredo_proprio-1234",
    );
    // Segredo fora do formato aceito pelo Telegram: usa o derivado.
    expect(telegramWebhookSecret(token, "curto")).toBe(derived?.webhookSecret);
  });
});
