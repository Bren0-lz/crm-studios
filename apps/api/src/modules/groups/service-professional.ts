import { serviceAvailableFor } from "@crm/contracts";
import { DomainError } from "../../repository.js";

/**
 * Recusa (409 `SERVICE_NOT_AVAILABLE`) profissional que não atende o serviço da turma
 * (Configurações → "Profissionais que atendem"; vazio = todos).
 */
export function assertProfessionalServesGroup(
  service: { name: string; professionalIds?: string[] | undefined } | undefined,
  professionalId: string,
) {
  if (service && !serviceAvailableFor(service, professionalId, ""))
    throw new DomainError(
      "SERVICE_NOT_AVAILABLE",
      `O serviço ${service.name} não é atendido por este profissional.`,
      409,
    );
}
