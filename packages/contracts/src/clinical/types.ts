import { z } from "zod";
import type { Patient } from "../patients/types.js";
import {
  assessmentFieldSchema,
  assessmentTemplateInputSchema,
  clinicalAddendumInputSchema,
  clinicalAssessmentInputSchema,
  clinicalAttachmentInputSchema,
  clinicalMeasurementInputSchema,
  clinicalRecordInputSchema,
  clinicalRecordStatusSchema,
  therapeuticGoalInputSchema,
  therapeuticGoalStatusSchema,
  treatmentClosureInputSchema,
} from "./model.js";

export type ClinicalRecordStatus = z.infer<typeof clinicalRecordStatusSchema>;

export type ClinicalRecordInput = z.infer<typeof clinicalRecordInputSchema>;

export type AssessmentField = z.infer<typeof assessmentFieldSchema>;

export type AssessmentTemplateInput = z.infer<
  typeof assessmentTemplateInputSchema
>;

export type ClinicalAssessmentInput = z.infer<
  typeof clinicalAssessmentInputSchema
>;

export type TherapeuticGoalInput = z.infer<typeof therapeuticGoalInputSchema>;

export type TherapeuticGoalStatus = z.infer<typeof therapeuticGoalStatusSchema>;

export type ClinicalMeasurementInput = z.infer<
  typeof clinicalMeasurementInputSchema
>;

export type TreatmentClosureInput = z.infer<typeof treatmentClosureInputSchema>;

export type ClinicalAttachmentInput = z.infer<
  typeof clinicalAttachmentInputSchema
>;

export type ClinicalAddendumInput = z.infer<typeof clinicalAddendumInputSchema>;

export interface ClinicalRecord extends ClinicalRecordInput {
  id: string;
  clinicId: string;
  patientId: string;
  professionalId: string;
  status: ClinicalRecordStatus;
  version: number;
  authorName: string;
  patientName: string;
  professionalName: string;
  professionalCrefito: string;
  appointmentStartsAt: string;
  finalizedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ClinicalRecordRevision {
  id: string;
  clinicalRecordId: string;
  version: number;
  status: ClinicalRecordStatus;
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
  painScale?: number;
  authorName: string;
  createdAt: string;
}

export interface AssessmentTemplate extends AssessmentTemplateInput {
  id: string;
  clinicId: string;
  version: number;
  active: boolean;
  createdAt: string;
}

export interface ClinicalAssessment extends ClinicalAssessmentInput {
  id: string;
  clinicId: string;
  templateName: string;
  authorName: string;
  createdAt: string;
}

export interface TherapeuticGoal extends TherapeuticGoalInput {
  id: string;
  clinicId: string;
  status: TherapeuticGoalStatus;
  achievedAt?: string;
  authorName: string;
  createdAt: string;
  updatedAt: string;
}

export interface ClinicalMeasurement extends ClinicalMeasurementInput {
  id: string;
  clinicId: string;
  authorName: string;
  createdAt: string;
}

export interface TreatmentClosure extends TreatmentClosureInput {
  id: string;
  clinicId: string;
  authorName: string;
  createdAt: string;
}

export interface ClinicalAttachment extends Omit<
  ClinicalAttachmentInput,
  "contentBase64"
> {
  id: string;
  clinicId: string;
  sha256: string;
  authorName: string;
  createdAt: string;
}

export interface ClinicalAttachmentContent extends ClinicalAttachment {
  contentBase64: string;
}

export interface ClinicalAddendum extends ClinicalAddendumInput {
  id: string;
  clinicId: string;
  patientId: string;
  authorName: string;
  createdAt: string;
}

export interface ClinicalAccessEvent {
  id: string;
  clinicId: string;
  patientId: string;
  actorUserId: string;
  action: "read" | "export" | "upload" | "download" | "addendum";
  entityType: "workspace" | "attachment" | "clinical_record";
  entityId?: string;
  createdAt: string;
}

export interface ClinicalWorkspace {
  patient: Patient;
  records: ClinicalRecord[];
  templates: AssessmentTemplate[];
  assessments: ClinicalAssessment[];
  goals: TherapeuticGoal[];
  measurements: ClinicalMeasurement[];
  closures: TreatmentClosure[];
  attachments: ClinicalAttachment[];
  addenda: ClinicalAddendum[];
}
