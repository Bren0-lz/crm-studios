import type { ClinicalSource } from "@crm/contracts";
import type { ClinicalResource, ClinicalResourceInput } from "@crm/contracts";
import type {
  AssessmentTemplate,
  AssessmentTemplateInput,
  ClinicalAccessEvent,
  ClinicalAddendum,
  ClinicalAddendumInput,
  ClinicalAlert,
  ClinicalAlertInput,
  ClinicalAssessment,
  ClinicalAssessmentInput,
  ClinicalAttachment,
  ClinicalAttachmentContent,
  ClinicalAttachmentInput,
  ClinicalMeasurement,
  ClinicalMeasurementInput,
  ClinicalRecord,
  ClinicalRecordInput,
  ClinicalRecordRevision,
  ClinicalWorkspace,
  TherapeuticGoal,
  TherapeuticGoalInput,
  TherapeuticGoalStatus,
  TreatmentClosure,
  TreatmentClosureInput,
} from "@crm/contracts";
import { request } from "../transport";

export const clinicalApi = {
  saveAssessmentTemplate: (input: AssessmentTemplateInput, id?: string) =>
    request<AssessmentTemplate>(
      id ? `/assessment-templates/${id}` : "/assessment-templates/drafts",
      { method: id ? "PUT" : "POST", body: JSON.stringify(input) },
    ),
  clinicalSources: (patientId = "") =>
    request<ClinicalSource[]>(
      `/clinical-sources${patientId ? "?patientId=" + encodeURIComponent(patientId) : ""}`,
    ),
  clinicalResourceCatalog: () =>
    request<ClinicalResource[]>("/clinical-resources/catalog"),
  clinicalResources: (patientId = "", exporting = false) =>
    request<ClinicalResource[]>(
      `/clinical-resources${exporting ? "/export" : ""}${patientId ? "?patientId=" + encodeURIComponent(patientId) : ""}`,
    ),
  saveClinicalResource: (input: ClinicalResourceInput, id?: string) =>
    request<ClinicalResource>(`/clinical-resources${id ? "/" + id : ""}`, {
      method: id ? "PUT" : "POST",
      body: JSON.stringify(input),
    }),
  finalizeClinicalResource: (id: string) =>
    request<ClinicalResource>(`/clinical-resources/${id}/finalize`, {
      method: "POST",
    }),
  clinicalRecords: (patientId = "") =>
    request<ClinicalRecord[]>(
      `/clinical-records?patientId=${encodeURIComponent(patientId)}`,
    ),
  saveClinicalRecord: (input: ClinicalRecordInput) =>
    request<ClinicalRecord>("/clinical-records", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  finalizeClinicalRecord: (id: string) =>
    request<ClinicalRecord>(`/clinical-records/${id}/finalize`, {
      method: "POST",
    }),
  clinicalRecordRevisions: (id: string) =>
    request<ClinicalRecordRevision[]>(`/clinical-records/${id}/revisions`),
  clinicalWorkspace: (patientId: string) =>
    request<ClinicalWorkspace>(`/clinical-workspace/${patientId}`),
  exportClinicalWorkspace: (patientId: string) =>
    request<ClinicalWorkspace>(`/clinical-workspace/${patientId}/export`),
  clinicalAccessEvents: (patientId: string) =>
    request<ClinicalAccessEvent[]>(
      `/clinical-workspace/${patientId}/access-events`,
    ),
  createClinicalAttachment: (input: ClinicalAttachmentInput) =>
    request<ClinicalAttachment>("/clinical-attachments", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  clinicalAttachmentContent: (id: string) =>
    request<ClinicalAttachmentContent>(`/clinical-attachments/${id}/content`),
  createClinicalAddendum: (input: ClinicalAddendumInput) =>
    request<ClinicalAddendum>("/clinical-addenda", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  createClinicalAlert: (input: ClinicalAlertInput) =>
    request<ClinicalAlert>("/clinical-alerts", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  archiveClinicalAlert: (id: string) =>
    request<void>(`/clinical-alerts/${id}`, { method: "DELETE" }),
  createAssessmentTemplate: (input: AssessmentTemplateInput) =>
    request<AssessmentTemplate>("/assessment-templates", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  createClinicalAssessment: (input: ClinicalAssessmentInput) =>
    request<ClinicalAssessment>("/clinical-assessments", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  createTherapeuticGoal: (input: TherapeuticGoalInput) =>
    request<TherapeuticGoal>("/therapeutic-goals", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateTherapeuticGoalStatus: (id: string, status: TherapeuticGoalStatus) =>
    request<TherapeuticGoal>(`/therapeutic-goals/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),
  createClinicalMeasurement: (input: ClinicalMeasurementInput) =>
    request<ClinicalMeasurement>("/clinical-measurements", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  createTreatmentClosure: (input: TreatmentClosureInput) =>
    request<TreatmentClosure>("/treatment-closures", {
      method: "POST",
      body: JSON.stringify(input),
    }),
};
