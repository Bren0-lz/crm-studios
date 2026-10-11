import type { PlanCatalogEntry, PlanCatalogInput } from "@crm/contracts";
import type {
  PlanTemplate,
  PlanTemplateInput,
  PlanTemplateUpdate, DashboardViewSummary, ClinicalAppointmentOption } from "@crm/contracts";
import type {
  AdminAuditEvent,
  AdminAuditPage,
  AuditHistoryFilters,
  HistoryActor,
  AdminUser,
  AdminUserCommissionInput,
  AdminUserInput,
  AdminUserUpdate,
  Appointment,
  AppointmentInput,
  AppointmentRescheduleEvent,
  AppointmentRescheduleInput,
  AppointmentStatus,
  AssessmentTemplate,
  AssessmentTemplateInput,
  ClinicalAssessment,
  ClinicalAssessmentInput,
  ClinicalAccessEvent,
  ClinicalAddendum,
  ClinicalAddendumInput,
  ClinicalAttachment,
  ClinicalAttachmentContent,
  ClinicalAttachmentInput,
  ClinicalMeasurement,
  ClinicalMeasurementInput,
  ClinicalRecord,
  ClinicalRecordInput,
  ClinicalRecordRevision,
  ClinicalWorkspace,
  ClinicSettings,
  ClinicSettingsInput,
  CommissionEntry,
  CommissionRule,
  CommissionRuleInput,
  BroadcastInput,
  BroadcastResult,
  CommunicationCenter,
  CommunicationPreference,
  CommunicationPreferenceInput,
  ContactActivity,
  ContactActivityInput,
  ContactSuggestion,
  BirthdayEntry,
  DailyCash,
  FinanceForecast,
  CostCenter,
  CostCenterInput,
  DocumentStatus,
  DocumentTemplate,
  DocumentTemplateInput,
  FinancialSummary,
  FinancialCategory,
  FinancialCategoryInput,
  FinancialWorkspace,
  GroupClass,
  GroupClassInput,
  GroupClassUpdateInput,
  GroupEnrollment,
  GroupEnrollmentInput,
  GroupSession,
  GroupWorkspace,
  Holiday,
  HolidayInput,
  IssuedDocument,
  IssuedDocumentInput,
  Lead,
  LeadActivity,
  LeadContact,
  LeadAppointmentInput,
  LeadContactInput,
  LeadConversion,
  LeadInput,
  LeadStage,
  LeadTask,
  LeadTaskInput,
  LeadTaskStatus,
  ManualMessageInput,
  ManagementReport,
  SalesReport,
  OutboundMessage,
  ReminderGenerationResult,
  Patient,
  PatientExportColumn,
  PatientImportAnalysis,
  PatientImportFileInput,
  PatientOption,
  PatientImportResult,
  PatientTag,
  PatientTagInput,
  PatientTagUpdate,
  PatientTimelineEntry,
  PatientInput,
  PatientPlan,
  PatientPlanInput,
  Payable,
  PayableInput,
  PaymentMethod,
  PaymentReceipt,
  PlanRenewalInput,
  PlanStatus,
  Professional,
  RecurringAppointmentInput,
  RecurringPayable,
  RecurringPayableInput,
  ReceivableRenegotiation,
  ReceivableRenegotiationInput,
  Room,
  ScheduleBlock,
  ScheduleBlockInput,
  Service,
  SessionMovement,
  TherapeuticGoal,
  TherapeuticGoalInput,
  TherapeuticGoalStatus,
  TreatmentClosure,
  TreatmentClosureInput,
  UserSummary,
  RelationshipSettings,
  SatisfactionReport,
  SatisfactionSurvey,
  SatisfactionSurveyInput,
  RetentionReport,
  ClientReport,
} from "@crm/contracts";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3333";
const TOKEN_KEY = "crm.auth.token";
const USER_KEY = "crm.auth.user";

export class ApiClientError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number,
    /** Dados extras do erro de domínio (ex.: `patientCount` ao excluir etiqueta em uso). */
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem(TOKEN_KEY);
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  // 204 não tem corpo (ex.: exclusão de feriado): não há JSON para ler.
  if (response.status === 204) return undefined as T;
  const body = await response.json();
  if (!response.ok) {
    if (response.status === 401 && path !== "/auth/login") { clearSession(); window.dispatchEvent(new Event("crm:session-ended")); }
    if (response.status === 403 && path !== "/me") window.dispatchEvent(new Event("crm:access-denied"));
    throw new ApiClientError(
      body.message ?? "Não foi possível concluir a operação.",
      body.code ?? "UNKNOWN_ERROR",
      response.status,
      body.details,
    );
  }
  return body as T;
}

async function requestBlob(path: string) {
  const token = localStorage.getItem(TOKEN_KEY);
  const response = await fetch(`${API_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) {
    if (response.status === 401) { clearSession(); window.dispatchEvent(new Event("crm:session-ended")); }
    if (response.status === 403) window.dispatchEvent(new Event("crm:access-denied"));
    const body = (await response.json()) as { message?: string; code?: string };
    throw new ApiClientError(
      body.message ?? "Não foi possível exportar o relatório.",
      body.code ?? "UNKNOWN_ERROR",
      response.status,
    );
  }
  return response.blob();
}

/** Filtros e opções da exportação de clientes (`GET /patients/export`). */
export interface PatientExportParams {
  format: "csv" | "xlsx";
  columns: PatientExportColumn[];
  search?: string;
  status?: "active" | "inactive";
  tags?: string[];
  birthdayMonth?: boolean;
}

function patientExportQuery(params: PatientExportParams) {
  const query = new URLSearchParams({ format: params.format, columns: params.columns.join(",") });
  if (params.search?.trim()) query.set("search", params.search.trim());
  if (params.status) query.set("status", params.status);
  if (params.tags?.length) query.set("tags", params.tags.join(","));
  if (params.birthdayMonth) query.set("birthdayMonth", "true");
  return query.toString();
}

export interface Session {
  token: string;
  user: UserSummary;
}

export async function login(email: string, password: string) {
  const session = await request<Session>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  localStorage.setItem(TOKEN_KEY, session.token);
  localStorage.setItem(USER_KEY, JSON.stringify(session.user));
  return session;
}

export function getStoredUser(): UserSummary | null {
  const value = localStorage.getItem(USER_KEY);
  if (!value) return null;
  try {
    return JSON.parse(value) as UserSummary;
  } catch {
    clearSession();
    return null;
  }
}

/** Grava o usuário logado (ex.: depois de buscar `/me` para completar uma sessão antiga). */
export function storeUser(user: UserSummary) {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function hasSession() {
  return Boolean(localStorage.getItem(TOKEN_KEY));
}

export const api = {
  me: () => request<UserSummary>("/me"),
  adminUsers: () => request<AdminUser[]>("/admin/users"),
  createAdminUser: (input: AdminUserInput) =>
    request<AdminUser>("/admin/users", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateAdminUser: (id: string, input: AdminUserUpdate) =>
    request<AdminUser>(`/admin/users/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  setUserProfessional: (id: string, professionalId: string | null) =>
    request<AdminUser>(`/admin/users/${id}/professional`, {
      method: "PUT",
      body: JSON.stringify({ professionalId }),
    }),
  setUserCommission: (id: string, input: AdminUserCommissionInput) =>
    request<AdminUser>(`/admin/users/${id}/commission`, {
      method: "PUT",
      body: JSON.stringify(input),
    }),
  resetAdminPassword: (id: string, password: string) =>
    request<{ updated: boolean }>(`/admin/users/${id}/reset-password`, {
      method: "POST",
      body: JSON.stringify({ password }),
    }),
  clinicSettings: () => request<ClinicSettings>("/admin/clinic-settings"),
  updateClinicSettings: (input: ClinicSettingsInput) =>
    request<ClinicSettings>("/admin/clinic-settings", {
      method: "PUT",
      body: JSON.stringify(input),
    }),
  adminAuditEvents: () => request<AdminAuditEvent[]>("/admin/audit-events"),
  auditHistory: (cursor?: string, filters: AuditHistoryFilters = {}) => {
    const query = new URLSearchParams();
    if (cursor) query.set("cursor", cursor);
    for (const [key, value] of Object.entries(filters)) if (value) query.set(key, value);
    return request<AdminAuditPage>(`/history/audit-events${query.size ? `?${query}` : ""}`);
  },
  historyActors: () => request<HistoryActor[]>("/history/actors"),
  dashboard: (date: string) =>
    request<DashboardViewSummary>(`/dashboard?date=${encodeURIComponent(date)}`),
  patients: (search = "") =>
    request<Patient[]>(`/patients?search=${encodeURIComponent(search)}`),
  /** Lista mínima (id, nome, etiquetas) para telas que só escolhem o cliente. */
  patientOptions: (search = "") => request<PatientOption[]>(search
    ? `/patients/options?search=${encodeURIComponent(search)}`
    : "/patients/options"),
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
  exportPatients: (params: PatientExportParams) =>
    requestBlob(`/patients/export?${patientExportQuery(params)}`),
  createPatient: (input: PatientInput) =>
    request<Patient>("/patients", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updatePatient: (id: string, input: PatientInput) =>
    request<Patient>(`/patients/${id}`, {
      method: "PUT",
      body: JSON.stringify(input),
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
  professionals: () => request<Professional[]>("/professionals"),
  rooms: () => request<Room[]>("/rooms"),
  services: () => request<Service[]>("/services"),
  clinicalAppointmentOptions: (from: string, to: string) =>
    request<ClinicalAppointmentOption[]>(`/appointments/options?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
  appointments: (from: string, to: string) =>
    request<Appointment[]>(
      `/appointments?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    ),
  createAppointment: (input: AppointmentInput) =>
    request<Appointment>("/appointments", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  rescheduleAppointment: (id: string, input: AppointmentRescheduleInput) =>
    request<Appointment>(`/appointments/${id}/schedule`, {
      method: "PUT",
      body: JSON.stringify(input),
    }),
  appointmentReschedules: (id: string) =>
    request<AppointmentRescheduleEvent[]>(`/appointments/${id}/reschedules`),
  createRecurringAppointments: (input: RecurringAppointmentInput) =>
    request<Appointment[]>("/appointments/recurring", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  groupSessions: (from: string, to: string) =>
    request<GroupSession[]>(
      `/group-sessions?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    ),
  scheduleBlocks: (from: string, to: string) =>
    request<ScheduleBlock[]>(
      `/schedule-blocks?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    ),
  createScheduleBlock: (input: ScheduleBlockInput) =>
    request<ScheduleBlock>("/schedule-blocks", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  cancelScheduleBlock: (id: string) =>
    request<ScheduleBlock>(`/schedule-blocks/${id}/cancel`, {
      method: "POST",
    }),
  holidays: (from = "", to = "") => {
    const query = [
      from && `from=${encodeURIComponent(from)}`,
      to && `to=${encodeURIComponent(to)}`,
    ]
      .filter(Boolean)
      .join("&");
    return request<Holiday[]>(`/holidays${query ? `?${query}` : ""}`);
  },
  createHoliday: (input: HolidayInput) =>
    request<Holiday>("/holidays", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  deleteHoliday: (id: string) =>
    request<void>(`/holidays/${id}`, { method: "DELETE" }),
  groupWorkspace: (from: string, to: string) =>
    request<GroupWorkspace>(
      `/groups/workspace?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    ),
  createGroupClass: (input: GroupClassInput) =>
    request<GroupClass>("/groups", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateGroupClass: (id: string, input: GroupClassUpdateInput) =>
    request<GroupClass>(`/groups/${id}`, {
      method: "PUT",
      body: JSON.stringify(input),
    }),
  createGroupEnrollment: (input: GroupEnrollmentInput) =>
    request<GroupEnrollment>("/group-enrollments", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  cancelGroupEnrollment: (id: string) =>
    request<GroupEnrollment>(`/group-enrollments/${id}/cancel`, {
      method: "POST",
    }),
  updateAppointmentStatus: (id: string, status: AppointmentStatus) =>
    request<Appointment>(`/appointments/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
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
  planCatalog: () => request<PlanCatalogEntry[]>("/plan-catalog"),
  createPlanCatalogEntry: (input: PlanCatalogInput) =>
    request<PlanCatalogEntry>("/plan-catalog", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updatePlanCatalogEntry: (id: string, input: PlanCatalogInput) =>
    request<PlanCatalogEntry>(`/plan-catalog/${id}`, {
      method: "PUT",
      body: JSON.stringify(input),
    }),
  deletePlanCatalogEntry: (id: string) =>
    request<void>(`/plan-catalog/${id}`, { method: "DELETE" }),

  planTemplates: () => request<PlanTemplate[]>("/plan-templates"),
  createPlanTemplate: (input: PlanTemplateInput) => request<PlanTemplate>("/plan-templates", { method: "POST", body: JSON.stringify(input) }),
  updatePlanTemplate: (id: string, input: PlanTemplateUpdate) => request<PlanTemplate>(`/plan-templates/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
  plans: (patientId = "") =>
    request<PatientPlan[]>(`/plans?patientId=${encodeURIComponent(patientId)}`),
  createPlan: (input: PatientPlanInput) =>
    request<PatientPlan>("/plans", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updatePlanStatus: (id: string, status: PlanStatus) =>
    request<PatientPlan>(`/plans/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),
  renewPlan: (id: string, input: PlanRenewalInput) =>
    request<PatientPlan>(`/plans/${id}/renew`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  setPlanAutoRenew: (id: string, autoRenew: boolean) =>
    request<PatientPlan>(`/plans/${id}/auto-renew`, {
      method: "PATCH",
      body: JSON.stringify({ autoRenew }),
    }),
  sessionMovements: (id: string) =>
    request<SessionMovement[]>(`/plans/${id}/movements`),
  financialSummary: () => request<FinancialSummary>("/finance/summary"),
  settleReceivable: (id: string, paymentMethod: PaymentMethod = "pix") =>
    request<FinancialSummary["receivables"][number]>(
      `/finance/receivables/${id}/pay`,
      { method: "POST", body: JSON.stringify({ paymentMethod }) },
    ),
  reverseReceivable: (id: string) =>
    request<FinancialSummary["receivables"][number]>(
      `/finance/receivables/${id}/reverse`,
      { method: "POST" },
    ),
  adjustReceivable: (id: string, amountInCents: number, reason: string) =>
    request<FinancialSummary["receivables"][number]>(
      `/finance/receivables/${id}/adjust`,
      {
        method: "PATCH",
        body: JSON.stringify({ amountInCents, reason }),
      },
    ),
  paymentReceipt: (id: string) =>
    request<PaymentReceipt>(`/finance/receivables/${id}/receipt`),
  financialWorkspace: () => request<FinancialWorkspace>("/finance/workspace"),
  renegotiateReceivables: (input: ReceivableRenegotiationInput) =>
    request<ReceivableRenegotiation>("/finance/renegotiations", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  createCommissionRule: (input: CommissionRuleInput) =>
    request<CommissionRule>("/finance/commission-rules", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  generateCommissions: (competence: string) =>
    request<CommissionEntry[]>("/finance/commissions/generate", {
      method: "POST",
      body: JSON.stringify({ competence }),
    }),
  settleCommission: (id: string) =>
    request<CommissionEntry>(`/finance/commissions/${id}/pay`, {
      method: "POST",
    }),
  reverseCommission: (id: string) =>
    request<CommissionEntry>(`/finance/commissions/${id}/reverse`, {
      method: "POST",
    }),
  createFinancialCategory: (input: FinancialCategoryInput) =>
    request<FinancialCategory>("/finance/categories", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  createCostCenter: (input: CostCenterInput) =>
    request<CostCenter>("/finance/cost-centers", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  createPayable: (input: PayableInput) =>
    request<Payable>("/finance/payables", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  settlePayable: (id: string, paymentMethod: PaymentMethod = "pix") =>
    request<Payable>(`/finance/payables/${id}/pay`, {
      method: "POST",
      body: JSON.stringify({ paymentMethod }),
    }),
  reversePayable: (id: string) =>
    request<Payable>(`/finance/payables/${id}/reverse`, { method: "POST" }),
  dailyCash: (date: string) =>
    request<DailyCash>(
      `/finance/daily-cash?date=${encodeURIComponent(date)}`,
    ),
  financeForecast: (months: number) =>
    request<FinanceForecast>(`/finance/forecast?months=${months}`),
  recurringPayables: () =>
    request<RecurringPayable[]>("/finance/recurring-payables"),
  createRecurringPayable: (input: RecurringPayableInput) =>
    request<RecurringPayable>("/finance/recurring-payables", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateRecurringPayable: (id: string, input: RecurringPayableInput) =>
    request<RecurringPayable>(`/finance/recurring-payables/${id}`, {
      method: "PUT",
      body: JSON.stringify(input),
    }),
  leads: () => request<Lead[]>("/leads"),
  createLead: (input: LeadInput) =>
    request<Lead>("/leads", { method: "POST", body: JSON.stringify(input) }),
  moveLead: (id: string, stage: LeadStage, lostReason?: string) =>
    request<Lead>(`/leads/${id}/stage`, {
      method: "PATCH",
      body: JSON.stringify({ stage, lostReason }),
    }),
  createLeadAppointment: (id: string, input: LeadAppointmentInput) =>
    request<Appointment>(`/leads/${id}/appointments`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  convertLead: (id: string) =>
    request<LeadConversion>(`/leads/${id}/convert`, { method: "POST" }),
  leadActivity: (id: string) => request<LeadActivity>(`/leads/${id}/activity`),
  createLeadContact: (id: string, input: LeadContactInput) =>
    request<LeadContact>(`/leads/${id}/contacts`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  createLeadTask: (id: string, input: LeadTaskInput) =>
    request<LeadTask>(`/leads/${id}/tasks`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateLeadTaskStatus: (id: string, status: LeadTaskStatus) =>
    request<LeadTask>(`/lead-tasks/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),
  communications: () => request<CommunicationCenter>("/communications"),
  setCommunicationPreference: (input: CommunicationPreferenceInput) =>
    request<CommunicationPreference>("/communications/preferences", {
      method: "PUT",
      body: JSON.stringify(input),
    }),
  queueMessage: (input: ManualMessageInput) =>
    request<OutboundMessage>("/communications/messages", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  broadcastPreview: (input: BroadcastInput) =>
    request<BroadcastResult>("/communications/broadcast/preview", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  sendBroadcast: (input: BroadcastInput) =>
    request<BroadcastResult>("/communications/broadcast", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  generateReminders: (referenceDate: string) =>
    request<ReminderGenerationResult>("/communications/reminders/generate", {
      method: "POST",
      body: JSON.stringify({ referenceDate }),
    }),
  relationshipSettings: () =>
    request<RelationshipSettings>("/relationship/settings"),
  updateRelationshipSettings: (input: RelationshipSettings) =>
    request<RelationshipSettings>("/relationship/settings", {
      method: "PUT",
      body: JSON.stringify(input),
    }),
  contactSuggestions: () =>
    request<ContactSuggestion[]>("/relationship/suggestions"),
  birthdays: (month: string) =>
    request<BirthdayEntry[]>(
      `/relationship/birthdays?month=${encodeURIComponent(month)}`,
    ),
  createContactActivity: (input: ContactActivityInput) =>
    request<ContactActivity>("/relationship/activities", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  documentTemplates: () => request<DocumentTemplate[]>("/document-templates"),
  createDocumentTemplate: (input: DocumentTemplateInput) =>
    request<DocumentTemplate>("/document-templates", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  createDocumentTemplateVersion: (id: string, body: string) =>
    request<DocumentTemplate>(`/document-templates/${id}/versions`, {
      method: "POST",
      body: JSON.stringify({ body }),
    }),
  documents: () => request<IssuedDocument[]>("/documents"),
  createDocument: (input: IssuedDocumentInput) =>
    request<IssuedDocument>("/documents", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateDocumentStatus: (
    id: string,
    status: Exclude<DocumentStatus, "draft">,
  ) =>
    request<IssuedDocument>(`/documents/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),
  managementReport: (from: string, to: string) =>
    request<ManagementReport>(
      `/reports/management?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    ),
  managementReportCsv: (from: string, to: string) =>
    requestBlob(
      `/reports/management.csv?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    ),
  retentionReport: (from: string, to: string) =>
    request<RetentionReport>(
      `/reports/retention?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    ),
  clientReport: (from: string, to: string) =>
    request<ClientReport>(
      `/reports/clients?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    ),
  salesReport: (month: string) =>
    request<SalesReport>(`/reports/sales?month=${encodeURIComponent(month)}`),
  salesReportXlsx: (month: string) =>
    requestBlob(`/reports/sales.xlsx?month=${encodeURIComponent(month)}`),
  satisfaction: (from: string, to: string) =>
    request<SatisfactionReport>(
      `/satisfaction?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    ),
  createSatisfactionSurvey: (input: SatisfactionSurveyInput) =>
    request<SatisfactionSurvey>("/satisfaction", {
      method: "POST",
      body: JSON.stringify(input),
    }),
};
