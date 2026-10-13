import type {
  AssessmentField,
  AssessmentTemplate,
  ClinicalAccessEvent,
  ClinicalAddendum,
  ClinicalAssessment,
  ClinicalAttachment,
  ClinicalMeasurement,
  ClinicalRecord,
  ClinicalRecordStatus,
  TherapeuticGoal,
  TherapeuticGoalStatus,
  TreatmentClosure,
} from "@crm/contracts";

export interface ClinicalRecordRow {
  id: string;
  clinicId: string;
  appointmentId: string;
  patientId: string;
  professionalId: string;
  status: ClinicalRecordStatus;
  version: number;
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
  painScale: number | null;
  authorName: string;
  patientName: string;
  professionalName: string;
  professionalCrefito: string;
  appointmentStartsAt: Date;
  finalizedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ClinicalRevisionRow {
  id: string;
  clinicalRecordId: string;
  version: number;
  status: ClinicalRecordStatus;
  snapshot: {
    subjective: string;
    objective: string;
    assessment: string;
    plan: string;
    painScale: number | null;
  };
  authorName: string;
  createdAt: Date;
}

export interface AssessmentTemplateRow {
  id: string;
  clinicId: string;
  name: string;
  specialty: string;
  fields: AssessmentField[];
  version: number;
  active: boolean;
  createdAt: Date;
}

export interface ClinicalAssessmentRow {
  id: string;
  clinicId: string;
  patientId: string;
  templateId: string;
  appointmentId: string | null;
  values: ClinicalAssessment["values"];
  notes: string | null;
  templateName: string;
  authorName: string;
  createdAt: Date;
}

export interface TherapeuticGoalRow {
  id: string;
  clinicId: string;
  patientId: string;
  title: string;
  description: string | null;
  baselineValue: string | null;
  targetValue: string | null;
  unit: string | null;
  targetDate: string | null;
  status: TherapeuticGoalStatus;
  achievedAt: Date | null;
  authorName: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ClinicalMeasurementRow {
  id: string;
  clinicId: string;
  patientId: string;
  goalId: string | null;
  name: string;
  value: string;
  unit: string;
  measuredAt: Date;
  notes: string | null;
  authorName: string;
  createdAt: Date;
}

export interface TreatmentClosureRow {
  id: string;
  clinicId: string;
  patientId: string;
  kind: TreatmentClosure["kind"];
  summary: string;
  recommendations: string | null;
  occurredAt: Date;
  authorName: string;
  createdAt: Date;
}

export interface ClinicalAttachmentRow {
  id: string;
  clinicId: string;
  patientId: string;
  fileName: string;
  mimeType: ClinicalAttachment["mimeType"];
  sizeInBytes: number;
  content?: Buffer;
  sha256: string;
  notes: string | null;
  authorName: string;
  createdAt: Date;
}

export interface ClinicalAddendumRow {
  id: string;
  clinicId: string;
  patientId: string;
  clinicalRecordId: string;
  reason: string;
  content: string;
  authorName: string;
  createdAt: Date;
}

export interface ClinicalAccessEventRow {
  id: string;
  clinicId: string;
  patientId: string;
  actorUserId: string;
  action: ClinicalAccessEvent["action"];
  entityType: ClinicalAccessEvent["entityType"];
  entityId: string | null;
  createdAt: Date;
}

export const clinicalRecordColumns = `
  cr.id,
  cr.clinic_id AS "clinicId",
  cr.appointment_id AS "appointmentId",
  cr.patient_id AS "patientId",
  cr.professional_id AS "professionalId",
  cr.status,
  cr.version,
  cr.subjective,
  cr.objective,
  cr.assessment,
  cr.plan,
  cr.pain_scale AS "painScale",
  u.full_name AS "authorName",
  p.full_name AS "patientName",
  pr.full_name AS "professionalName",
  pr.crefito AS "professionalCrefito",
  a.starts_at AS "appointmentStartsAt",
  cr.finalized_at AS "finalizedAt",
  cr.created_at AS "createdAt",
  cr.updated_at AS "updatedAt"
`;

export function mapClinicalRecord(row: ClinicalRecordRow): ClinicalRecord {
  return {
    id: row.id,
    clinicId: row.clinicId,
    appointmentId: row.appointmentId,
    patientId: row.patientId,
    professionalId: row.professionalId,
    status: row.status,
    version: row.version,
    subjective: row.subjective,
    objective: row.objective,
    assessment: row.assessment,
    plan: row.plan,
    ...(row.painScale !== null ? { painScale: row.painScale } : {}),
    authorName: row.authorName,
    patientName: row.patientName,
    professionalName: row.professionalName,
    professionalCrefito: row.professionalCrefito,
    appointmentStartsAt: row.appointmentStartsAt.toISOString(),
    ...(row.finalizedAt ? { finalizedAt: row.finalizedAt.toISOString() } : {}),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function mapAssessmentTemplate(
  row: AssessmentTemplateRow,
): AssessmentTemplate {
  return { ...row, createdAt: row.createdAt.toISOString() };
}

export function mapClinicalAssessment(
  row: ClinicalAssessmentRow,
): ClinicalAssessment {
  return {
    id: row.id,
    clinicId: row.clinicId,
    patientId: row.patientId,
    templateId: row.templateId,
    ...(row.appointmentId ? { appointmentId: row.appointmentId } : {}),
    values: row.values,
    ...(row.notes ? { notes: row.notes } : {}),
    templateName: row.templateName,
    authorName: row.authorName,
    createdAt: row.createdAt.toISOString(),
  };
}

export function mapTherapeuticGoal(row: TherapeuticGoalRow): TherapeuticGoal {
  return {
    id: row.id,
    clinicId: row.clinicId,
    patientId: row.patientId,
    title: row.title,
    ...(row.description ? { description: row.description } : {}),
    ...(row.baselineValue !== null
      ? { baselineValue: Number(row.baselineValue) }
      : {}),
    ...(row.targetValue !== null
      ? { targetValue: Number(row.targetValue) }
      : {}),
    ...(row.unit ? { unit: row.unit } : {}),
    ...(row.targetDate ? { targetDate: row.targetDate } : {}),
    status: row.status,
    ...(row.achievedAt ? { achievedAt: row.achievedAt.toISOString() } : {}),
    authorName: row.authorName,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function mapClinicalMeasurement(
  row: ClinicalMeasurementRow,
): ClinicalMeasurement {
  return {
    id: row.id,
    clinicId: row.clinicId,
    patientId: row.patientId,
    ...(row.goalId ? { goalId: row.goalId } : {}),
    name: row.name,
    value: Number(row.value),
    unit: row.unit,
    measuredAt: row.measuredAt.toISOString(),
    ...(row.notes ? { notes: row.notes } : {}),
    authorName: row.authorName,
    createdAt: row.createdAt.toISOString(),
  };
}

export function mapTreatmentClosure(
  row: TreatmentClosureRow,
): TreatmentClosure {
  return {
    id: row.id,
    clinicId: row.clinicId,
    patientId: row.patientId,
    kind: row.kind,
    summary: row.summary,
    ...(row.recommendations ? { recommendations: row.recommendations } : {}),
    occurredAt: row.occurredAt.toISOString(),
    authorName: row.authorName,
    createdAt: row.createdAt.toISOString(),
  };
}

export function mapClinicalAttachment(
  row: ClinicalAttachmentRow,
): ClinicalAttachment {
  return {
    id: row.id,
    clinicId: row.clinicId,
    patientId: row.patientId,
    fileName: row.fileName,
    mimeType: row.mimeType,
    sizeInBytes: row.sizeInBytes,
    sha256: row.sha256,
    ...(row.notes ? { notes: row.notes } : {}),
    authorName: row.authorName,
    createdAt: row.createdAt.toISOString(),
  };
}

export function mapClinicalAddendum(
  row: ClinicalAddendumRow,
): ClinicalAddendum {
  return {
    id: row.id,
    clinicId: row.clinicId,
    patientId: row.patientId,
    clinicalRecordId: row.clinicalRecordId,
    reason: row.reason,
    content: row.content,
    authorName: row.authorName,
    createdAt: row.createdAt.toISOString(),
  };
}

export function mapClinicalAccessEvent(
  row: ClinicalAccessEventRow,
): ClinicalAccessEvent {
  return {
    id: row.id,
    clinicId: row.clinicId,
    patientId: row.patientId,
    actorUserId: row.actorUserId,
    action: row.action,
    entityType: row.entityType,
    ...(row.entityId ? { entityId: row.entityId } : {}),
    createdAt: row.createdAt.toISOString(),
  };
}
