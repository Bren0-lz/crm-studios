import { z } from "zod";
import { userRoleSchema } from "../administration/model.js";
import type { UserRole } from "../administration/types.js";

/**
 * Telegram (TG1): o bot avisa a equipe. Cada usuário vincula o próprio chat mandando
 * `/vincular <código>` ao bot; o código é gerado em Configurações › Integrações.
 */

/** Validade do código de vínculo, em minutos (uso único). */
export const TELEGRAM_LINK_CODE_TTL_MINUTES = 10;

/** Comando que o usuário manda ao bot para vincular o chat. */
export const TELEGRAM_LINK_COMMAND = "/vincular";

/**
 * Perfis que podem vincular o Telegram quando a clínica não configurou nada.
 * PENDENTE (TG6): padrão provisório "só admin" até o dono dizer quem recebe os avisos.
 */
export const defaultTelegramLinkRoles: readonly UserRole[] = ["admin"];

export const telegramSettingsInputSchema = z.object({
  linkRoles: z.array(userRoleSchema).transform((roles) => [...new Set(roles)]),
});

export type TelegramSettingsInput = z.infer<typeof telegramSettingsInputSchema>;

export interface TelegramSettings {
  /** Perfis que podem vincular o chat (vazio = ninguém). */
  linkRoles: UserRole[];
}

/** Perfis configurados ou o padrão provisório (TG6). */
export function resolveTelegramLinkRoles(stored: unknown): UserRole[] {
  const parsed = z.array(userRoleSchema).safeParse(stored);
  return parsed.success
    ? [...new Set(parsed.data)]
    : [...defaultTelegramLinkRoles];
}

/**
 * Assuntos dos avisos (TG7): cada destino (chat pessoal ou grupo) escolhe o que recebe.
 * Recibos: recibo assinado e lembrete de recibos pendentes. Agendamentos: atendimentos
 * novos. Clientes: cadastro e importação de clientes.
 */
export const telegramTopics = ["receipts", "appointments", "patients"] as const;
export const telegramTopicSchema = z.enum(telegramTopics);
export type TelegramTopic = z.infer<typeof telegramTopicSchema>;

export const telegramTopicLabels: Record<TelegramTopic, string> = {
  receipts: "Recibos",
  appointments: "Agendamentos",
  patients: "Clientes novos",
};

/** Sem repetição e na ordem de `telegramTopics`. */
export function normalizeTelegramTopics(
  topics: readonly TelegramTopic[],
): TelegramTopic[] {
  return telegramTopics.filter((topic) => topics.includes(topic));
}

/** Assuntos gravados; sem escolha (NULL ou inválido) = todos, como antes da TG7. */
export function resolveTelegramTopics(stored: unknown): TelegramTopic[] {
  const parsed = z.array(telegramTopicSchema).safeParse(stored);
  return parsed.success
    ? normalizeTelegramTopics(parsed.data)
    : [...telegramTopics];
}

/** Assuntos do chat pessoal: vazio vale (o chat fica só com os comandos de agenda). */
export const telegramTopicsInputSchema = z.object({
  topics: z.array(telegramTopicSchema).transform(normalizeTelegramTopics),
});
export type TelegramTopicsInput = z.infer<typeof telegramTopicsInputSchema>;

/** Assuntos de um grupo: pelo menos um (grupo sem aviso não tem por que ficar vinculado). */
export const telegramGroupTopicsInputSchema = z.object({
  topics: z
    .array(telegramTopicSchema)
    .transform(normalizeTelegramTopics)
    .refine(
      (topics) => topics.length > 0,
      "Escolha pelo menos um tipo de aviso.",
    ),
});
export type TelegramGroupTopicsInput = z.infer<
  typeof telegramGroupTopicsInputSchema
>;

/** Grupo do Telegram vinculado à clínica (TG7): recebe só os assuntos escolhidos. */
export interface TelegramGroupLink {
  id: string;
  chatId: string;
  /** Nome do grupo no Telegram quando foi vinculado. */
  title: string | null;
  topics: TelegramTopic[];
  linkedAt: string;
  /** Quem vinculou (vazio se o usuário foi excluído). */
  linkedByName: string | null;
}

/** Situação do Telegram para o usuário logado. */
export interface TelegramStatus {
  /** `false` sem `TELEGRAM_BOT_TOKEN` no servidor: nada é enviado. */
  enabled: boolean;
  /** O perfil do usuário está entre os que podem vincular. */
  canLink: boolean;
  linkRoles: UserRole[];
  /** Chat vinculado do usuário, se houver. */
  link?: { linkedAt: string; topics: TelegramTopic[] };
}

/** Código de vínculo recém-gerado (só aparece nesta resposta). */
export interface TelegramLinkCode {
  code: string;
  expiresAt: string;
  /** Texto para mandar ao bot: `/vincular <código>`. */
  command: string;
}

/** Resultado de drenar a fila de saída sob demanda. */
export interface TelegramDrainResult {
  sent: number;
  failed: number;
  /** Mensagens que esgotaram as tentativas nesta rodada. */
  gaveUp: number;
}
