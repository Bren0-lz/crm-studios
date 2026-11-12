import {
  inferLeadContactChannel,
  leadContactChannelLabels,
  type Lead,
  type LeadContact,
} from "@crm/contracts";

/**
 * Junta os contatos vindos da API com os registrados na sessão (sem duplicar IDs), do mais
 * recente para o mais antigo. Se a lista ainda estiver vazia mas o lead já tiver `lastMessageSentAt`,
 * garante a exibição desse envio com data e hora.
 */
export function mergeLeadContacts(
  lead: Lead,
  fetched?: LeadContact[] | null,
  extra: LeadContact[] = [],
): LeadContact[] {
  const byId = new Map<string, LeadContact>();
  for (const item of [...extra, ...(Array.isArray(fetched) ? fetched : [])]) {
    if (
      item &&
      typeof item.id === "string" &&
      typeof item.occurredAt === "string"
    ) {
      byId.set(item.id, item);
    }
  }
  const merged = [...byId.values()].sort((a, b) =>
    b.occurredAt.localeCompare(a.occurredAt),
  );
  if (merged.length > 0 || !lead.lastMessageSentAt) return merged;
  const method =
    lead.contactMethod?.trim() || leadContactChannelLabels.whatsapp;
  return [
    {
      id: `last-sent-${lead.id}`,
      clinicId: lead.clinicId,
      leadId: lead.id,
      channel: inferLeadContactChannel(method),
      contactMethod: method,
      direction: "outbound",
      notes: "Mensagem enviada.",
      actorName: lead.responsibleName ?? "",
      occurredAt: lead.lastMessageSentAt,
      createdAt: lead.lastMessageSentAt,
    },
  ];
}
