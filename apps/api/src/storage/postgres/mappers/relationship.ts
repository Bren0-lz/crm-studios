import type { ContactActivity, SatisfactionSurvey } from "@crm/contracts";

export interface ContactActivityRow {
  id: string;
  clinicId: string;
  patientId: string;
  reason: ContactActivity["reason"];
  referenceKey: string;
  outcome: ContactActivity["outcome"];
  notes: string | null;
  snoozeUntil: string | null;
  actorUserId: string;
  createdAt: Date;
}

export const contactActivityColumns = `
  id, clinic_id AS "clinicId", patient_id AS "patientId", reason,
  reference_key AS "referenceKey", outcome, notes,
  to_char(snooze_until, 'YYYY-MM-DD') AS "snoozeUntil",
  actor_user_id AS "actorUserId", created_at AS "createdAt"
`;

export function mapContactActivity(row: ContactActivityRow): ContactActivity {
  return {
    id: row.id,
    clinicId: row.clinicId,
    patientId: row.patientId,
    reason: row.reason,
    referenceKey: row.referenceKey,
    outcome: row.outcome,
    ...(row.notes ? { notes: row.notes } : {}),
    ...(row.snoozeUntil ? { snoozeUntil: row.snoozeUntil } : {}),
    actorUserId: row.actorUserId,
    createdAt: row.createdAt.toISOString(),
  };
}

export interface SatisfactionSurveyRow {
  id: string;
  clinicId: string;
  patientId: string;
  patientName: string;
  appointmentId: string | null;
  score: number;
  comment: string | null;
  actorUserId: string;
  createdAt: Date;
}

export const satisfactionSurveyColumns = `
  s.id, s.clinic_id AS "clinicId", s.patient_id AS "patientId",
  p.full_name AS "patientName", s.appointment_id AS "appointmentId", s.score,
  s.comment, s.actor_user_id AS "actorUserId", s.created_at AS "createdAt"
`;

export function mapSatisfactionSurvey(
  row: SatisfactionSurveyRow,
): SatisfactionSurvey {
  return {
    id: row.id,
    clinicId: row.clinicId,
    patientId: row.patientId,
    patientName: row.patientName,
    ...(row.appointmentId ? { appointmentId: row.appointmentId } : {}),
    score: row.score,
    ...(row.comment ? { comment: row.comment } : {}),
    actorUserId: row.actorUserId,
    createdAt: row.createdAt.toISOString(),
  };
}
