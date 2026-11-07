import type { UserSummary } from "@crm/contracts";
import { z } from "zod";
import type { ClinicRepository } from "../repository.js";
import type { DomainEventPublisher } from "./domain-events.js";
import type { TelegramIntegration } from "./telegram-client.js";

// A interface manda `patientId=` vazio para listar tudo; o PostgreSQL não aceita "" como uuid.
export const optionalPatientFilterSchema = z.object({
  patientId: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.uuid().optional(),
  ),
});

export interface BuildAppOptions {
  repository: ClinicRepository;
  logger?: boolean;
  /** Saltos de proxy confiáveis para `request.ip` (padrão: `TRUST_PROXY`). */
  trustProxy?: number;
  /** Recebe os eventos de domínio além dos consumidores internos da aplicação. */
  events?: DomainEventPublisher;
  /**
   * Telegram (TG1): cliente e segredo do webhook; `null` = desligada. Padrão: a partir de
   * `TELEGRAM_BOT_TOKEN` (sem a variável, desligada). Os testes injetam um cliente falso.
   */
  telegram?: TelegramIntegration | null;
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: {
      sub: string;
      clinicId: string;
      role: UserSummary["role"];
      sessionVersion?: number;
      /** `dashboard`: token do painel de vendas, só vale na API externa com a chave. */
      kind?: "dashboard";
    };
    user: {
      sub: string;
      clinicId: string;
      role: UserSummary["role"];
      sessionVersion?: number;
      /** `dashboard`: token do painel de vendas, só vale na API externa com a chave. */
      kind?: "dashboard";
    };
  }
}
