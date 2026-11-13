import type { PatientMergeInput, PatientMergePreview } from "@crm/contracts";
import type {
  GuidedPatientInput,
  GuidedPatientResult,
  PatientSegmentSummary,
  Patient,
  PatientImportAnalysis,
  PatientImportFileInput,
  PatientImportResult,
  PatientInput,
  PatientOption,
  PatientTag,
  AutomaticPatientTag,
  AutomaticPatientTagKey,
  AutomaticPatientTagUpdate,
  PatientTagInput,
  PatientTagUpdate,
  PatientTimelineEntry,
} from "@crm/contracts";
import {
  type PatientExportParams,
  patientExportQuery,
} from "../patient-export";
import { request, requestBlob } from "../transport";
import { withChangeReason } from "../change-reason";

export const patientsApi = {
  patientSegments: () => request<PatientSegmentSummary[]>("/patients/segments"),
  emergencyContact: (id: string) =>
    request<{ name: string; phone: string; whatsapp?: string }>(
      `/patients/${id}/emergency-contact`,
    ),
  patient: (id: string) => request<Patient>(`/patients/${id}`),
  setPatientStatus: (id: string, status: Patient["status"]) =>
    request<Patient>(`/patients/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),
  previewPatientMerge: (sourceId: string, targetId: string) =>
    request<PatientMergePreview>("/patients/merge/preview", {
      method: "POST",
      body: JSON.stringify({ sourceId, targetId }),
    }),
  mergePatients: (input: PatientMergeInput) =>
    request<Patient>("/patients/merge", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  /** `withoutGroup`: só assinantes sem turma vinculada (filtro calculado na API). */
  patients: (search = "", options: { withoutGroup?: boolean } = {}) =>
    request<Patient[]>(
      `/patients?search=${encodeURIComponent(search)}${options.withoutGroup ? "&withoutGroup=true" : ""}`,
    ),
  /** Lista mínima (id, nome, etiquetas) para telas que só escolhem o cliente. */
  patientOptions: (search = "") =>
    request<PatientOption[]>(
      search
        ? `/patients/options?search=${encodeURIComponent(search)}`
        : "/patients/options",
    ),
  /** Etiquetas configuradas (Configurações › Etiquetas), por nome, com a contagem de clientes. */
  patientTags: () => request<PatientTag[]>("/patient-tags"),
  createPatientTag: (input: PatientTagInput) =>
    request<PatientTag>("/patient-tags", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updatePatientTag: (id: string, input: PatientTagUpdate) =>
    request<PatientTag>(`/patient-tags/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  deletePatientTag: (id: string) =>
    request<void>(`/patient-tags/${id}`, { method: "DELETE" }),
  /** Etiquetas automáticas com o nome e a cor que a clínica configurou (AT1). */
  automaticPatientTags: () =>
    request<AutomaticPatientTag[]>("/patient-tags/automatic"),
  updateAutomaticPatientTag: (
    key: AutomaticPatientTagKey,
    input: AutomaticPatientTagUpdate,
  ) =>
    request<AutomaticPatientTag>(`/patient-tags/automatic/${key}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  resetAutomaticPatientTag: (key: AutomaticPatientTagKey) =>
    request<AutomaticPatientTag>(`/patient-tags/automatic/${key}`, {
      method: "DELETE",
    }),
  exportPatients: (params: PatientExportParams) =>
    requestBlob(`/patients/export?${patientExportQuery(params)}`),
  createPatient: (input: PatientInput) =>
    request<Patient>("/patients", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  /** Cadastro guiado: cria o cliente já com o próximo passo (tudo ou nada). */
  createGuidedPatient: (input: GuidedPatientInput) =>
    request<GuidedPatientResult>("/patients/guided", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updatePatient: (id: string, input: PatientInput, changeReason?: string) =>
    request<Patient>(`/patients/${id}`, {
      method: "PUT",
      body: JSON.stringify(withChangeReason(input, changeReason)),
    }),
  previewPatientImport: (input: PatientImportFileInput) =>
    request<PatientImportAnalysis>("/patients/import/preview", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  importPatients: (input: PatientImportFileInput) =>
    request<PatientImportResult>("/patients/import", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  patientTimeline: (id: string) =>
    request<PatientTimelineEntry[]>(`/patients/${id}/timeline`),
};
