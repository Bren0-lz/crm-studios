import { patientFirstName, waitlistDesiredGroupNote } from "@crm/contracts";
import { api } from "../../api";
import type { GroupChoices } from "../../shared/workflows/types";

/**
 * Turma cheia na contratação (TW3): sem plano, cobrança nem contrato — o cliente entra na Lista
 * de espera do serviço da turma, com a turma desejada nas observações. Devolve o aviso.
 */
export async function addToServiceWaitlist(
  entry: { patientId: string; serviceId: string; groupId: string },
  groups: GroupChoices | undefined,
) {
  const group = groups?.items?.find((item) => item.id === entry.groupId);
  const created = await api.createWaitlistEntry({
    patientId: entry.patientId,
    kind: "service",
    serviceId: entry.serviceId,
    notes: group ? waitlistDesiredGroupNote(group.name) : "",
  });
  return `Turma cheia: ${patientFirstName(created.patientName)} entrou na Lista de espera de ${created.itemName}, sem plano nem cobrança.`;
}
