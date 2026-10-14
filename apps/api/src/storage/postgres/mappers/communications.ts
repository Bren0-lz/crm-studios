import type {
  CommunicationChannel,
  CommunicationPreference,
  OutboundMessage,
} from "@crm/contracts";

export interface CommunicationPreferenceRow {
  id: string;
  clinicId: string;
  patientId: string;
  channel: CommunicationChannel;
  allowed: boolean;
  updatedAt: Date;
}

export interface OutboundMessageRow {
  satisfactionSurveyId?: string | null;
  manualCompletion?: OutboundMessage["manualCompletion"];
  id: string;
  clinicId: string;
  patientId: string;
  patientName: string;
  channel: CommunicationChannel;
  kind: OutboundMessage["kind"];
  recipient: string;
  body: string;
  status: OutboundMessage["status"];
  scheduledFor: Date;
  sentAt: Date | null;
  attempts: number;
  lastError: string | null;
  createdAt: Date;
}

// WhatsApp em branco cai no telefone de contato.
export function communicationRecipient(
  patient: { email?: string | null; phone: string; whatsapp?: string | null },
  channel: CommunicationChannel,
) {
  if (channel === "email") return patient.email ?? "";
  return (channel === "whatsapp" && patient.whatsapp) || patient.phone;
}

export const outboundMessageColumns = `
  (SELECT id FROM satisfaction_surveys ss WHERE ss.clinic_id=om.clinic_id AND ss.source_message_id=om.id) AS "satisfactionSurveyId",om.id, om.clinic_id AS "clinicId", om.patient_id AS "patientId",
  p.full_name AS "patientName", om.channel, om.kind, om.recipient, om.body,
  om.status, om.scheduled_for AS "scheduledFor", om.sent_at AS "sentAt",
  om.manual_completion AS "manualCompletion", om.attempts, om.last_error AS "lastError", om.created_at AS "createdAt"
`;

export function mapCommunicationPreference(
  row: CommunicationPreferenceRow,
): CommunicationPreference {
  return { ...row, updatedAt: row.updatedAt.toISOString() };
}

export function mapOutboundMessage(row: OutboundMessageRow): OutboundMessage {
  return {
    ...(row.satisfactionSurveyId
      ? { satisfactionSurveyId: row.satisfactionSurveyId }
      : {}),
    ...(row.manualCompletion ? { manualCompletion: row.manualCompletion } : {}),
    id: row.id,
    clinicId: row.clinicId,
    patientId: row.patientId,
    patientName: row.patientName,
    channel: row.channel,
    kind: row.kind,
    recipient: row.recipient,
    body: row.body,
    status: row.status,
    scheduledFor: row.scheduledFor.toISOString(),
    attempts: row.attempts,
    createdAt: row.createdAt.toISOString(),
    ...(row.sentAt ? { sentAt: row.sentAt.toISOString() } : {}),
    ...(row.lastError ? { lastError: row.lastError } : {}),
  };
}
