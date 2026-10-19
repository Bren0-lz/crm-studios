import type {
  CommunicationChannel,
  CommunicationKind,
  OutboundMessage,
} from "@crm/contracts";

export const broadcastChannelLabels: Record<CommunicationChannel, string> = {
  whatsapp: "WhatsApp",
  email: "e-mail",
};

export const queueKindLabels: Record<CommunicationKind, string> = {
  manual: "Individual",
  appointment_reminder: "Atendimento",
  payment_reminder: "Cobrança",
  birthday_reminder: "Aniversário",
  satisfaction_followup: "NPS",
};

export const queueStatusLabels: Record<OutboundMessage["status"], string> = {
  queued: "Na fila",
  sent: "Enviada manualmente",
  cancelled: "Cancelada",
  failed: "Falha",
};

export type QueueFilter = {
  kind: CommunicationKind | "";
  status: OutboundMessage["status"] | "";
};

export function matchesQueueFilter(
  message: OutboundMessage,
  filter: QueueFilter,
) {
  return (
    (!filter.kind || message.kind === filter.kind) &&
    (!filter.status || message.status === filter.status)
  );
}

/** Pode ser marcada como enviada agora: na fila, já no horário e com o canal autorizado. */
export function canMarkSent(
  message: OutboundMessage,
  allowed: boolean,
  now = Date.now(),
) {
  return (
    message.status === "queued" &&
    allowed &&
    new Date(message.scheduledFor).getTime() <= now
  );
}

export function messageLink(message: OutboundMessage) {
  const digits = message.recipient.replace(/\D/g, "");
  return message.channel === "whatsapp"
    ? `https://wa.me/${digits.length > 11 && digits.startsWith("55") ? "" : "55"}${digits}?text=${encodeURIComponent(message.body)}`
    : `mailto:${encodeURIComponent(message.recipient)}?body=${encodeURIComponent(message.body)}`;
}
