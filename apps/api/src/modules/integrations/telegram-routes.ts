import {
  TELEGRAM_LINK_CODE_TTL_MINUTES,
  TELEGRAM_LINK_COMMAND,
  telegramGroupTopicsInputSchema,
  telegramSettingsInputSchema,
  telegramTopicLabels,
  telegramTopicsInputSchema,
  type TelegramStatus,
  type TelegramTopic,
} from "@crm/contracts";
import { z } from "zod";
import type { RouteContext } from "../../infrastructure/route-context.js";
import { DomainError } from "../../repository.js";
import type {
  TelegramChatKind,
  TelegramLinkAttempt,
} from "../../repository.js";
import { hashTelegramLinkCode, type TelegramService } from "./telegram.js";
import {
  createTelegramCommands,
  telegramAgendaCommands,
  telegramCommandsHelp,
} from "./telegram-commands.js";

const SETTINGS_PATH = "Configurações › Integrações";

/** Respostas do bot a `/vincular`, por resultado. */
const linkReplies: Record<
  Exclude<TelegramLinkAttempt["status"], "linked">,
  string
> = {
  invalid: `Código não encontrado. Gere um novo em ${SETTINGS_PATH} e envie ${TELEGRAM_LINK_COMMAND} <código>.`,
  expired: `Este código venceu (vale ${TELEGRAM_LINK_CODE_TTL_MINUTES} minutos). Gere um novo em ${SETTINGS_PATH}.`,
  used: `Este código já foi usado. Gere um novo em ${SETTINGS_PATH}.`,
  forbidden:
    "Seu perfil não pode receber os avisos do CRM pelo Telegram. Fale com o admin da clínica.",
  needs_group: `Este código é para vincular um grupo: adicione o bot ao grupo e envie lá ${TELEGRAM_LINK_COMMAND} <código>.`,
  needs_private: `Este código vincula o seu chat pessoal: envie no chat privado com o bot. Para um grupo, o admin gera o código em ${SETTINGS_PATH} › Vincular grupo.`,
};
const helpReply = `Olá! Para receber os avisos do CRM, gere um código em ${SETTINGS_PATH} e envie ${TELEGRAM_LINK_COMMAND} <código>.`;
const groupHelpReply = `Para este grupo receber os avisos do CRM, o admin gera um código em ${SETTINGS_PATH} › Vincular grupo e envia aqui ${TELEGRAM_LINK_COMMAND} <código>.`;
const groupAgendaReply =
  "Os comandos de agenda só respondem no chat privado com o bot, para a agenda não ficar exposta no grupo.";

/** "Recibos, Agendamentos e Clientes novos". */
function topicList(topics: readonly TelegramTopic[]) {
  const labels = topics.map((topic) => telegramTopicLabels[topic]);
  return labels.length <= 1
    ? (labels[0] ?? "")
    : `${labels.slice(0, -1).join(", ")} e ${labels.at(-1)}`;
}

/** Só o que o webhook usa da atualização do Telegram; o resto é ignorado. */
const telegramUpdateSchema = z.object({
  message: z
    .object({
      chat: z.object({
        id: z.union([z.number(), z.string()]),
        type: z.string().optional(),
        title: z.string().optional(),
      }),
      text: z.string().max(4096).optional(),
    })
    .optional(),
});

/** Grupo e supergrupo contam como grupo; o resto (privado), como chat pessoal. */
const chatKindOf = (type: string | undefined): TelegramChatKind =>
  type === "group" || type === "supergroup" ? "group" : "private";

/** `/comando@NomeDoBot argumentos` → comando e argumentos. */
function parseCommand(text: string) {
  const match = /^\/([A-Za-z0-9_]+)(?:@\S+)?(?:\s+([\s\S]*))?$/.exec(
    text.trim(),
  );
  return match
    ? { command: `/${match[1]!.toLowerCase()}`, args: (match[2] ?? "").trim() }
    : null;
}

type CommandHandler = (input: {
  chatId: string;
  chatKind: TelegramChatKind;
  chatTitle?: string;
  args: string;
  telegram: TelegramService;
  context: RouteContext;
  agendaCommands: ReturnType<typeof createTelegramCommands>;
}) => Promise<void>;

/**
 * Ajuda: chat vinculado vê os comandos; sem vínculo, como vincular. No grupo: o que ele
 * recebe, ou como vinculá-lo.
 */
const help: CommandHandler = async ({
  chatId,
  chatKind,
  telegram,
  context,
  agendaCommands,
}) => {
  if (chatKind === "group") {
    const group = (
      await context.repository.findTelegramGroupLinksByChat(chatId)
    )[0];
    await telegram.enqueue(group?.clinicId ?? null, [
      {
        chatId,
        message: group
          ? `Este grupo recebe os avisos de: ${topicList(group.topics)}. Os comandos de agenda só respondem no chat privado com o bot.`
          : groupHelpReply,
      },
    ]);
    return;
  }
  const link = (await agendaCommands.linkOf(chatId)) ?? null;
  await telegram.enqueue(link?.clinicId ?? null, [
    { chatId, message: link ? telegramCommandsHelp : helpReply },
  ]);
};

/** Comandos do bot: vínculo (TG1) e agenda do dia, da semana e do mês (TG4). */
const commands: Record<string, CommandHandler> = {
  [TELEGRAM_LINK_COMMAND]: async ({
    chatId,
    chatKind,
    chatTitle,
    args,
    telegram,
    context,
  }) => {
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
      chatKind,
      ...(chatTitle ? { chatTitle } : {}),
      now: telegram.now().toISOString(),
    });
    if (result.status === "linked")
      await telegram.enqueue(result.clinicId, [
        {
          chatId,
          message:
            result.kind === "group"
              ? `Pronto! Este grupo foi vinculado ao CRM por ${result.userName} e vai receber os avisos de: ${topicList(result.topics)}.`
              : `Pronto, ${result.userName}! Este chat foi vinculado ao CRM e vai receber os avisos.`,
        },
      ]);
    else
      await telegram.enqueue(null, [
        { chatId, message: linkReplies[result.status] },
      ]);
  },
  "/start": help,
  ...Object.fromEntries(
    telegramAgendaCommands.map((command): [string, CommandHandler] => [
      command,
      async ({ chatId, chatKind, telegram, agendaCommands }) => {
        if (chatKind === "group") {
          const group = (await agendaCommands.groupOf(chatId)) ?? null;
          await telegram.enqueue(group?.clinicId ?? null, [
            { chatId, message: groupAgendaReply },
          ]);
          return;
        }
        await agendaCommands.agenda(command, chatId);
      },
    ]),
  ),
};

const disabledError = () =>
  new DomainError(
    "TELEGRAM_DISABLED",
    "A integração com o Telegram está desligada: falta o token do bot no servidor.",
    409,
  );

const groupNotFound = () =>
  new DomainError(
    "TELEGRAM_GROUP_NOT_FOUND",
    "Grupo do Telegram não encontrado.",
    404,
  );

/** Telegram (TG1): webhook do bot, vínculo do chat do usuário e fila de saída. */
export function registerTelegramRoutes(context: RouteContext) {
  const { app, repository, telegram } = context;
  const agendaCommands = createTelegramCommands({
    repository,
    telegram,
    accessibleBranches: context.accessibleBranches,
    log: app.log,
    settingsPath: SETTINGS_PATH,
    linkCommand: TELEGRAM_LINK_COMMAND,
  });

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
      ...(link
        ? { link: { linkedAt: link.linkedAt, topics: link.topics } }
        : {}),
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

  // TG7: o que o chat pessoal recebe (vazio = só os comandos de agenda).
  app.put("/integrations/telegram/link/topics", async (request) => {
    const { clinicId, sub, role } = request.user;
    const { topics } = telegramTopicsInputSchema.parse(request.body);
    if (!(await repository.setTelegramLinkTopics(clinicId, sub, topics)))
      throw new DomainError(
        "TELEGRAM_LINK_NOT_FOUND",
        "Nenhum chat do Telegram vinculado.",
        404,
      );
    return statusOf(clinicId, sub, role);
  });

  // TG7: grupos da clínica, cada um com os assuntos que recebe.
  app.get("/integrations/telegram/groups", async (request) =>
    repository.listTelegramGroupLinks(request.user.clinicId),
  );

  app.post(
    "/integrations/telegram/groups/link-code",
    async (request, reply) => {
      if (!telegram.enabled) throw disabledError();
      const { topics } = telegramGroupTopicsInputSchema.parse(request.body);
      return reply
        .status(201)
        .send(
          await telegram.createLinkCode(
            request.user.clinicId,
            request.user.sub,
            topics,
          ),
        );
    },
  );

  app.put("/integrations/telegram/groups/:id", async (request) => {
    const { id } = request.params as { id: string };
    const { topics } = telegramGroupTopicsInputSchema.parse(request.body);
    const group = await repository.updateTelegramGroupLink(
      request.user.clinicId,
      id,
      topics,
    );
    if (!group) throw groupNotFound();
    return group;
  });

  app.delete("/integrations/telegram/groups/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    if (!(await repository.deleteTelegramGroupLink(request.user.clinicId, id)))
      throw groupNotFound();
    return reply.status(204).send();
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
      const chatKind = chatKindOf(message?.chat.type);
      // No grupo, só os comandos do bot têm resposta: conversa comum e comandos de outros
      // bots não viram ajuda a cada mensagem.
      if (
        message &&
        message.text !== undefined &&
        (chatKind === "private" ||
          (parsed &&
            (parsed.command in commands || parsed.command === "/ajuda")))
      ) {
        const chatId = String(message.chat.id);
        const handler = (parsed && commands[parsed.command]) || help;
        await handler({
          chatId,
          chatKind,
          ...(message.chat.title ? { chatTitle: message.chat.title } : {}),
          args: parsed?.args ?? "",
          telegram,
          context,
          agendaCommands,
        });
        // Aviso periódico de recibos: sem agendador, vale o primeiro webhook depois do horário.
        await agendaCommands.receiptReminderSafely(chatId);
      }
      // Cada chamada do webhook também tenta as mensagens pendentes.
      await telegram.drainSafely();
      // O Telegram reenvia a atualização se não receber 200.
      return { ok: true };
    },
  );
}
