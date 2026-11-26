import { createHash } from "node:crypto";

/**
 * Bot API do Telegram por HTTPS com o `fetch` nativo (sem dependência). Os testes injetam um
 * cliente falso pelo `BuildAppOptions.telegram`: nada sai para a rede.
 */
export interface TelegramClient {
  sendMessage(chatId: string, text: string): Promise<void>;
  /**
   * Nome de usuário do bot (`getMe`), sem o `@`. Opcional: cliente sem ele (ou que falha) só
   * deixa a tela sem o nome do bot.
   */
  getMe?(): Promise<{ username: string }>;
}

/** Integração ligada: cliente, segredo do webhook e relógio (injetável nos testes). */
export interface TelegramIntegration {
  client: TelegramClient;
  /** Vai no caminho do webhook e no cabeçalho `X-Telegram-Bot-Api-Secret-Token`. */
  webhookSecret: string;
  now?: () => Date;
}

/** Erro do Telegram sem o token (a URL da Bot API leva o token: nunca entra na mensagem). */
export class TelegramApiError extends Error {}

const TELEGRAM_API = "https://api.telegram.org";
const REQUEST_TIMEOUT_MS = 10_000;

export function createTelegramClient(
  token: string,
  fetchImpl: typeof fetch = fetch,
): TelegramClient {
  /** Chama a Bot API; o erro nunca leva o token (só o texto de `refused` e o status). */
  async function call(
    method: string,
    payload: Record<string, unknown> | null,
    refused: string,
  ) {
    let response: Response;
    try {
      response = await fetchImpl(`${TELEGRAM_API}/bot${token}/${method}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload ?? {}),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      const name = error instanceof Error ? error.name : "Error";
      throw new TelegramApiError(
        name === "TimeoutError"
          ? "Telegram não respondeu a tempo."
          : "Falha de rede ao falar com o Telegram.",
      );
    }
    const body = (await response.json().catch(() => null)) as {
      ok?: boolean;
      description?: string;
      result?: unknown;
    } | null;
    if (!response.ok || body?.ok !== true)
      throw new TelegramApiError(
        `${refused} (${response.status}${
          body?.description ? `: ${body.description}` : ""
        }).`,
      );
    return body.result;
  }

  return {
    async sendMessage(chatId, text) {
      await call(
        "sendMessage",
        { chat_id: chatId, text },
        "Telegram recusou a mensagem",
      );
    },
    async getMe() {
      const result = (await call(
        "getMe",
        null,
        "Telegram não informou o bot",
      )) as { username?: unknown } | null | undefined;
      const username = result?.username;
      if (typeof username !== "string" || !/^[A-Za-z0-9_]{5,64}$/.test(username))
        throw new TelegramApiError("Telegram não informou o nome do bot.");
      return { username };
    },
  };
}

/** Segredo do webhook: o informado ou um derivado do token (só letras e números). */
export function telegramWebhookSecret(token: string, explicit?: string) {
  const trimmed = explicit?.trim();
  if (trimmed && /^[A-Za-z0-9_-]{16,256}$/.test(trimmed)) return trimmed;
  return createHash("sha256")
    .update(`crm-telegram-webhook:${token}`)
    .digest("hex")
    .slice(0, 48);
}

/**
 * Integração a partir das variáveis de ambiente; `null` sem `TELEGRAM_BOT_TOKEN` (desligada).
 * PENDENTE (TG6): proposta de guardar o token como variável de ambiente no hPanel da
 * Hostinger (nunca no repositório); `TELEGRAM_WEBHOOK_SECRET` é opcional.
 */
export function telegramIntegrationFromEnv(
  env: Record<string, string | undefined> = process.env,
): TelegramIntegration | null {
  const token = env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) return null;
  return {
    client: createTelegramClient(token),
    webhookSecret: telegramWebhookSecret(token, env.TELEGRAM_WEBHOOK_SECRET),
  };
}
