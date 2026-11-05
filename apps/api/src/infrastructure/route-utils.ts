import type { UserSummary } from "@crm/contracts";
import { z } from "zod";
import type { ClinicRepository } from "../repository.js";
import type { DomainEventPublisher } from "./domain-events.js";

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
  /** Eventos de domínio (ex.: `receipt.signed`); padrão: publicador em memória do processo. */
  events?: DomainEventPublisher;
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
