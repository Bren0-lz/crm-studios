import {
  TELEGRAM_LINK_CODE_TTL_MINUTES,
  TELEGRAM_LINK_COMMAND,
  telegramSettingsInputSchema,
  type TelegramStatus,
} from "@crm/contracts";
import { z } from "zod";
import type { RouteContext } from "../../infrastructure/route-context.js";
import { DomainError } from "../../repository.js";
import type { TelegramLinkAttempt } from "../../repository.js";
import { hashTelegramLinkCode, type TelegramService } from "./telegram.js";

const SETTINGS_PATH = "Configurações › Integrações";

/** Respostas do bot a `/vincular`, por resultado. */
const linkReplies: Record<Exclude<TelegramLinkAttempt["status"], "linked">, string> = {
  invalid: `Código não encontrado. Gere um novo em ${SETTINGS_PATH} e envie ${TELEGRAM_LINK_COMMAND} <código>.`,
  expired: `Este código venceu (vale ${TELEGRAM_LINK_CODE_TTL_MINUTES} minutos). Gere um novo em ${SETTINGS_PATH}.`,
  used: `Este código já foi usado. Gere um novo em ${SETTINGS_PATH}.`,
  forbidden:
    "Seu perfil não pode receber os avisos do CRM pelo Telegram. Fale com o admin da clínica.",
};
const helpReply = `Olá! Para receber os avisos do CRM, gere um código em ${SETTINGS_PATH} e envie ${TELEGRAM_LINK_COMMAND} <código>.`;

/** Só o que o webhook usa da atualização do Telegram; o resto é ignorado. */
const telegramUpdateSchema = z.object({
  message: z
    .object({
      chat: z.object({ id: z.union([z.number(), z.string()]) }),
      text: z.string().max(4096).optional(),
    })
    .optional(),
});

/** `/comando@NomeDoBot argumentos` → comando e argumentos. */
function parseCommand(text: string) {
  const match = /^\/([A-Za-z0-9_]+)(?:@\S+)?(?:\s+([\s\S]*))?$/.exec(text.trim());
  return match
    ? { command: `/${match[1]!.toLowerCase()}`, args: (match[2] ?? "").trim() }
    : null;
}

type CommandHandler = (input: {
  chatId: string;
  args: string;
  telegram: TelegramService;
  context: RouteContext;
}) => Promise<void>;

/** Comandos do bot. A TG4 acrescenta `/hoje`, `/semana` e `/mes` aqui. */
const commands: Record<string, CommandHandler> = {
  [TELEGRAM_LINK_COMMAND]: async ({ chatId, args, telegram, context }) => {
    if (!args) {
      await telegram.enqueue(null, [
        {
          chatId,
          message: `Envie ${TELEGRAM_LINK_COMMAND} seguido do código gerado em ${SETTINGS_PATH}.`,
        },
      ]);
      return;
    }
    const result = await context.repository.linkTelegramChat({
      codeHash: hashTelegramLinkCode(args),
      chatId,
      now: telegram.now().toISOString(),
    });
    if (result.status === "linked")
      await telegram.enqueue(result.clinicId, [
        {
          chatId,
          message: `Pronto, ${result.userName}! Este chat foi vinculado ao CRM e vai receber os avisos.`,
        },
      ]);
    else
      await telegram.enqueue(null, [
        { chatId, message: linkReplies[result.status] },
      ]);
  },
  "/start": async ({ chatId, telegram }) =>
    telegram.enqueue(null, [{ chatId, message: helpReply }]),
};

const disabledError = () =>
  new DomainError(
    "TELEGRAM_DISABLED",
    "A integração com o Telegram está desligada: falta o token do bot no servidor.",
    409,
  );

/** Telegram (TG1): webhook do bot, vínculo do chat do usuário e fila de saída. */
export function registerTelegramRoutes(context: RouteContext) {
  const { app, repository, telegram } = context;

  async function statusOf(
    clinicId: string,
    userId: string,
    role: TelegramStatus["linkRoles"][number],
  ): Promise<TelegramStatus> {
    const [settings, link] = await Promise.all([
      repository.getTelegramSettings(clinicId),
      repository.getTelegramLink(clinicId, userId),
    ]);
    return {
      enabled: telegram.enabled,
      canLink: settings.linkRoles.includes(role),
      linkRoles: settings.linkRoles,
      ...(link ? { link: { linkedAt: link.linkedAt } } : {}),
    };
  }

  app.get("/integrations/telegram", async (request) =>
    statusOf(request.user.clinicId, request.user.sub, request.user.role),
  );

  app.post("/integrations/telegram/link-code", async (request, reply) => {
    if (!telegram.enabled) throw disabledError();
    const { clinicId, sub, role } = request.user;
    const settings = await repository.getTelegramSettings(clinicId);
    if (!settings.linkRoles.includes(role))
      throw new DomainError(
        "TELEGRAM_LINK_FORBIDDEN",
        "Seu perfil não pode vincular o Telegram. Fale com o admin da clínica.",
        403,
      );
    return reply.status(201).send(await telegram.createLinkCode(clinicId, sub));
  });

  app.delete("/integrations/telegram/link", async (request) => {
    const { clinicId, sub, role } = request.user;
    if (!(await repository.deleteTelegramLink(clinicId, sub)))
      throw new DomainError(
        "TELEGRAM_LINK_NOT_FOUND",
        "Nenhum chat do Telegram vinculado.",
        404,
      );
    return statusOf(clinicId, sub, role);
  });

  app.put("/integrations/telegram/settings", async (request) =>
    repository.saveTelegramSettings(
      request.user.clinicId,
      telegramSettingsInputSchema.parse(request.body),
    ),
  );

  // Envio sob demanda das mensagens pendentes da clínica.
  app.post("/integrations/telegram/outbox/drain", async (request) => {
    if (!telegram.enabled) throw disabledError();
    return telegram.drain({ clinicId: request.user.clinicId });
  });

  // Público: o Telegram chama com o segredo no caminho e no cabeçalho.
  app.post(
    "/integrations/telegram/webhook/:secret",
    { bodyLimit: 1024 * 1024 },
    async (request, reply) => {
      if (!telegram.enabled)
        return reply.status(404).send({
          code: "TELEGRAM_DISABLED",
          message: "Integração com o Telegram desligada.",
        });
      const { secret } = request.params as { secret?: string };
      if (
        !telegram.matchesWebhookSecret(secret) ||
        !telegram.matchesWebhookSecret(
          request.headers["x-telegram-bot-api-secret-token"],
        )
      )
        return reply.status(401).send({
          code: "TELEGRAM_WEBHOOK_UNAUTHORIZED",
          message: "Segredo do webhook inválido.",
        });
      const update = telegramUpdateSchema.safeParse(request.body);
      const message = update.success ? update.data.message : undefined;
      const parsed = message?.text ? parseCommand(message.text) : null;
      if (message && message.text !== undefined) {
        const chatId = String(message.chat.id);
        const handler = parsed ? commands[parsed.command] : undefined;
        if (handler)
          await handler({ chatId, args: parsed!.args, telegram, context });
        else await telegram.enqueue(null, [{ chatId, message: helpReply }]);
      }
      // Cada chamada do webhook também tenta as mensagens pendentes.
      await telegram.drainSafely();
      // O Telegram reenvia a atualização se não receber 200.
      return { ok: true };
    },
  );
}
