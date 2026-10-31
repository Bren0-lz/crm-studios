import type { UserSummary } from "@crm/contracts";
import { z } from "zod";
import type { ClinicRepository } from "../repository.js";

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
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: {
      sub: string;
      clinicId: string;
      role: UserSummary["role"];
      sessionVersion?: number;
    };
    user: {
      sub: string;
      clinicId: string;
      role: UserSummary["role"];
      sessionVersion?: number;
    };
  }
}
