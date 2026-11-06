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
  linkRoles: z
    .array(userRoleSchema)
    .transform((roles) => [...new Set(roles)]),
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

/** Situação do Telegram para o usuário logado. */
export interface TelegramStatus {
  /** `false` sem `TELEGRAM_BOT_TOKEN` no servidor: nada é enviado. */
  enabled: boolean;
  /** O perfil do usuário está entre os que podem vincular. */
  canLink: boolean;
  linkRoles: UserRole[];
  /** Chat vinculado do usuário, se houver. */
  link?: { linkedAt: string };
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
