import {
  TELEGRAM_LINK_CODE_TTL_MINUTES,
  TELEGRAM_LINK_COMMAND,
  type TelegramDrainResult,
  type TelegramLinkCode,
  type TelegramTopic,
} from "@crm/contracts";
import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import type { FastifyBaseLogger } from "fastify";
import type { TelegramIntegration } from "../../infrastructure/telegram-client.js";
import type {
  ClinicRepository,
  TelegramOutgoingMessage,
} from "../../repository.js";
import { MAX_TELEGRAM_MESSAGE_LENGTH } from "./telegram-messages.js";

/** Tentativas por mensagem antes de desistir (a falha fica registrada em `last_error`). */
export const TELEGRAM_MAX_ATTEMPTS = 5;
/** Mensagens por rodada de envio. */
const DRAIN_BATCH = 20;
/**
 * Reserva da mensagem durante o envio: outro dreno simultâneo não a pega. Cobre o pior caso de
 * uma rodada (20 mensagens × 10 s de limite por chamada = 200 s) com folga.
 */
const CLAIM_LEASE_MS = 5 * 60_000;

/** Espera antes da próxima tentativa, crescente: 1, 2, 4 e 8 minutos. */
export function telegramRetryDelayMs(failedAttempts: number) {
  return 60_000 * 2 ** Math.max(0, failedAttempts - 1);
}

// Sem letras e números que se confundem (0/O, 1/I/L).
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 8;

export function generateTelegramLinkCode() {
  return Array.from(
    { length: CODE_LENGTH },
    () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)],
  ).join("");
}

/** Código como digitado no Telegram: sem espaços nem hífens, em maiúsculas. */
export function normalizeTelegramLinkCode(value: string) {
  return value.replace(/[\s-]/g, "").toUpperCase();
}

/** Só o hash do código é guardado. */
export function hashTelegramLinkCode(code: string) {
  return createHash("sha256")
    .update(`telegram-link:${normalizeTelegramLinkCode(code)}`)
    .digest("hex");
}

const truncate = (text: string, max: number) =>
  text.length > max ? `${text.slice(0, max - 1)}…` : text;

export type TelegramService = ReturnType<typeof createTelegramService>;

/**
 * Envio pelo Telegram: fila de saída (`telegram_outbox`) drenada depois de cada commit que
 * enfileira, a cada webhook e sob demanda. Falha no Telegram nunca desfaz a operação de
 * origem: o erro fica na fila e no log.
 *
 * Ponto de enfileiramento dos avisos (TG2 em diante): `notifyLinkedChats(clinicId, assunto,
 * texto)`, chamado por um assinante do evento de domínio (ex.: `receipt.signed`) depois do
 * commit. Só recebem os destinos (chats pessoais e grupos) que escolheram o assunto (TG7).
 */
export function createTelegramService({
  repository,
  integration,
  log,
}: {
  repository: ClinicRepository;
  integration: TelegramIntegration | null;
  log: FastifyBaseLogger;
}) {
  const clock = integration?.now ?? (() => new Date());
  /** Nome do bot depois do primeiro `getMe` bem-sucedido (o nome não muda sem trocar o token). */
  let knownBotUsername: string | null = null;
  let pendingBotUsername: Promise<string | null> | null = null;

  /**
   * Nome de usuário do bot (sem `@`) ou `null`. Falha (rede, token) não lança: só não traz o
   * nome, e a próxima chamada tenta de novo.
   */
  async function botUsername(): Promise<string | null> {
    if (knownBotUsername) return knownBotUsername;
    const getMe = integration?.client.getMe?.bind(integration.client);
    if (!getMe) return null;
    pendingBotUsername ??= getMe()
      .then(({ username }) => {
        knownBotUsername = username;
        return username;
      })
      .catch((error: unknown) => {
        // A mensagem do `TelegramApiError` não leva o token.
        log.warn(
          { err: error instanceof Error ? error.message : String(error) },
          "telegram getMe failed",
        );
        return null;
      })
      .finally(() => {
        pendingBotUsername = null;
      });
    return pendingBotUsername;
  }

  async function stillReceivesNotice(
    clinicId: string,
    chatId: string,
    topic: TelegramTopic,
  ) {
    // O Telegram usa IDs negativos para grupos. Um vínculo pessoal antigo não autoriza
    // avisos para um grupo: ele precisa estar na lista administrada pela clínica.
    const links = chatId.startsWith("-")
      ? await repository.findTelegramGroupLinksByChat(chatId)
      : await repository.findTelegramLinksByChat(chatId);
    return links.some(
      (link) => link.clinicId === clinicId && link.topics.includes(topic),
    );
  }

  async function drain({
    clinicId,
  }: { clinicId?: string } = {}): Promise<TelegramDrainResult> {
    const result: TelegramDrainResult = { sent: 0, failed: 0, gaveUp: 0 };
    if (!integration) return result;
    const startedAt = clock();
    const claimed = await repository.claimTelegramOutbox({
      now: startedAt.toISOString(),
      leaseUntil: new Date(startedAt.getTime() + CLAIM_LEASE_MS).toISOString(),
      limit: DRAIN_BATCH,
      ...(clinicId ? { clinicId } : {}),
    });
    for (const item of claimed) {
      try {
        if (
          item.topic &&
          (!item.clinicId ||
            !(await stillReceivesNotice(
              item.clinicId,
              item.chatId,
              item.topic,
            )))
        ) {
          await repository.recordTelegramDelivery(item.id, {
            error: "O destino não recebe mais este assunto.",
            failedAt: clock().toISOString(),
          });
          result.gaveUp++;
          continue;
        }
        await integration.client.sendMessage(item.chatId, item.message);
        await repository.recordTelegramDelivery(item.id, {
          sentAt: clock().toISOString(),
        });
        result.sent++;
      } catch (cause) {
        const error = truncate(
          cause instanceof Error ? cause.message : String(cause),
          1000,
        );
        const attempts = item.attempts + 1;
        const at = clock();
        if (attempts >= TELEGRAM_MAX_ATTEMPTS) {
          await repository.recordTelegramDelivery(item.id, {
            error,
            failedAt: at.toISOString(),
          });
          result.gaveUp++;
        } else
          await repository.recordTelegramDelivery(item.id, {
            error,
            nextAttemptAt: new Date(
              at.getTime() + telegramRetryDelayMs(attempts),
            ).toISOString(),
          });
        result.failed++;
        log.warn(
          { outboxId: item.id, attempts, err: error },
          "telegram delivery failed",
        );
      }
    }
    return result;
  }

  /** Dreno que nunca lança: para depois de um commit, sem afetar a resposta. */
  async function drainSafely(options: { clinicId?: string } = {}) {
    try {
      return await drain(options);
    } catch (error) {
      log.error({ err: error }, "telegram outbox drain");
      return { sent: 0, failed: 0, gaveUp: 0 };
    }
  }

  /** Enfileira e drena em seguida. Desligada (sem token), não enfileira nada. */
  async function enqueue(
    clinicId: string | null,
    messages: TelegramOutgoingMessage[],
  ) {
    if (!integration || messages.length === 0) return;
    try {
      await repository.enqueueTelegramMessages(
        clinicId,
        messages.map((item) => ({
          ...item,
          message: truncate(item.message, MAX_TELEGRAM_MESSAGE_LENGTH),
        })),
        clock().toISOString(),
      );
    } catch (error) {
      log.error({ err: error }, "telegram enqueue");
      return;
    }
    await drainSafely(clinicId ? { clinicId } : {});
  }

  return {
    enabled: integration !== null,
    now: clock,
    /** Confere o segredo do webhook em tempo constante. */
    matchesWebhookSecret(value: unknown) {
      if (!integration || typeof value !== "string") return false;
      const expected = Buffer.from(integration.webhookSecret);
      const received = Buffer.from(value);
      return (
        expected.length === received.length &&
        timingSafeEqual(expected, received)
      );
    },
    enqueue,
    botUsername,
    /** Aviso para os chats e grupos da clínica que recebem o assunto (um por chat). */
    async notifyLinkedChats(
      clinicId: string,
      topic: TelegramTopic,
      messages: readonly string[],
    ) {
      if (!integration) return;
      const [links, groups] = await Promise.all([
        repository.listTelegramLinks(clinicId),
        repository.listTelegramGroupLinks(clinicId),
      ]);
      const chats = [
        ...new Set(
          [...links.filter((link) => !link.chatId.startsWith("-")), ...groups]
            .filter((destination) => destination.topics.includes(topic))
            .map((destination) => destination.chatId),
        ),
      ];
      await enqueue(
        clinicId,
        messages.flatMap((message) =>
          chats.map((chatId) => ({ chatId, message, topic })),
        ),
      );
    },
    drain,
    drainSafely,
    /**
     * Gera o código de uso único do usuário (10 min); só o hash vai para o banco. Com
     * `groupTopics` (TG7), o código vincula um grupo com esses assuntos.
     */
    async createLinkCode(
      clinicId: string,
      userId: string,
      groupTopics?: TelegramTopic[],
    ): Promise<TelegramLinkCode> {
      const code = generateTelegramLinkCode();
      const expiresAt = new Date(
        clock().getTime() + TELEGRAM_LINK_CODE_TTL_MINUTES * 60_000,
      ).toISOString();
      await repository.createTelegramLinkCode(clinicId, userId, {
        codeHash: hashTelegramLinkCode(code),
        expiresAt,
        ...(groupTopics ? { groupTopics } : {}),
      });
      return { code, expiresAt, command: `${TELEGRAM_LINK_COMMAND} ${code}` };
    },
  };
}
