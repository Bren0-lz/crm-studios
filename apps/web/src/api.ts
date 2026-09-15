import type {
  AdminAuditEvent,
  AdminUser,
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
  CommunicationCenter,
  CommunicationPreference,
  CommunicationPreferenceInput,
  DashboardSummary,
  CostCenter,
  CostCenterInput,
  DocumentStatus,
  DocumentTemplate,
  DocumentTemplateInput,
  FinancialSummary,
  FinancialCategory,
  FinancialCategoryInput,
  FinancialWorkspace,
  GroupAttendance,
  GroupAttendanceInput,
  GroupClass,
  GroupClassInput,
  GroupEnrollment,
  GroupEnrollmentInput,
  GroupSession,
  GroupSessionSeriesInput,
  GroupWorkspace,
  IssuedDocument,
  IssuedDocumentInput,
  InventoryWorkspace,
  Lead,
  LeadActivity,
  LeadContact,
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
  PatientInput,
  PatientPlan,
  PatientPlanInput,
  PatientTab,
  PatientTabCloseInput,
  PatientTabInput,
  PatientTabItemInput,
  Payable,
  PayableInput,
  PaymentMethod,
  PaymentReceipt,
  PlanStatus,
  Professional,
  Product,
  ProductInput,
  RecurringAppointmentInput,
  ReceivableRenegotiation,
  ReceivableRenegotiationInput,
  ReplacementBookingInput,
  ReplacementCredit,
  Room,
  ScheduleBlock,
  ScheduleBlockInput,
  Service,
  SessionMovement,
  StockMovement,
  StockMovementInput,
  TherapeuticGoal,
  TherapeuticGoalInput,
  TherapeuticGoalStatus,
  TreatmentClosure,
  TreatmentClosureInput,
  UserSummary,
  PermissionMatrixItem,
} from "@crm/contracts";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3333";
const TOKEN_KEY = "crm.auth.token";
const USER_KEY = "crm.auth.user";

export class ApiClientError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number,
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
  const body = await response.json();
  if (!response.ok) {
    if (response.status === 401 && path !== "/auth/login") clearSession();
    throw new ApiClientError(
      body.message ?? "Não foi possível concluir a operação.",
      body.code ?? "UNKNOWN_ERROR",
      response.status,
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
    const body = (await response.json()) as { message?: string; code?: string };
    throw new ApiClientError(
      body.message ?? "Não foi possível exportar o relatório.",
      body.code ?? "UNKNOWN_ERROR",
      response.status,
    );
  }
  return response.blob();
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

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function hasSession() {
  return Boolean(localStorage.getItem(TOKEN_KEY));
}

export const api = {
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
  permissionMatrix: () =>
    request<PermissionMatrixItem[]>("/admin/permission-matrix"),
  dashboard: (date: string) =>
    request<DashboardSummary>(`/dashboard?date=${encodeURIComponent(date)}`),
  patients: (search = "") =>
    request<Patient[]>(`/patients?search=${encodeURIComponent(search)}`),
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
  professionals: () => request<Professional[]>("/professionals"),
  rooms: () => request<Room[]>("/rooms"),
  services: () => request<Service[]>("/services"),
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
  groupWorkspace: (from: string, to: string) =>
    request<GroupWorkspace>(
      `/groups/workspace?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    ),
  createGroupClass: (input: GroupClassInput) =>
    request<GroupClass>("/groups", {
      method: "POST",
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
  createGroupSessionSeries: (input: GroupSessionSeriesInput) =>
    request<GroupSession[]>("/group-sessions/series", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  recordGroupAttendance: (
    sessionId: string,
    patientId: string,
    input: GroupAttendanceInput,
  ) =>
    request<GroupAttendance>(
      `/group-sessions/${sessionId}/attendance/${patientId}`,
      { method: "PUT", body: JSON.stringify(input) },
    ),
  completeGroupSession: (id: string) =>
    request<GroupSession>(`/group-sessions/${id}/complete`, { method: "POST" }),
  bookReplacement: (input: ReplacementBookingInput) =>
    request<{ attendance: GroupAttendance; credit: ReplacementCredit }>(
      "/group-replacements/book",
      { method: "POST", body: JSON.stringify(input) },
    ),
  inventoryWorkspace: () => request<InventoryWorkspace>("/inventory/workspace"),
  createProduct: (input: ProductInput) =>
    request<Product>("/inventory/products", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  createStockMovement: (input: StockMovementInput) =>
    request<StockMovement>("/inventory/movements", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  openPatientTab: (input: PatientTabInput) =>
    request<PatientTab>("/patient-tabs", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  addPatientTabItem: (id: string, input: PatientTabItemInput) =>
    request<PatientTab>(`/patient-tabs/${id}/items`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  closePatientTab: (id: string, input: PatientTabCloseInput) =>
    request<PatientTab>(`/patient-tabs/${id}/close`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  cancelPatientTab: (id: string) =>
    request<PatientTab>(`/patient-tabs/${id}/cancel`, { method: "POST" }),
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
  leads: () => request<Lead[]>("/leads"),
  createLead: (input: LeadInput) =>
    request<Lead>("/leads", { method: "POST", body: JSON.stringify(input) }),
  moveLead: (id: string, stage: LeadStage, lostReason?: string) =>
    request<Lead>(`/leads/${id}/stage`, {
      method: "PATCH",
      body: JSON.stringify({ stage, lostReason }),
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
  generateReminders: (referenceDate: string) =>
    request<ReminderGenerationResult>("/communications/reminders/generate", {
      method: "POST",
      body: JSON.stringify({ referenceDate }),
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
  salesReport: (month: string) =>
    request<SalesReport>(`/reports/sales?month=${encodeURIComponent(month)}`),
  salesReportXlsx: (month: string) =>
    requestBlob(`/reports/sales.xlsx?month=${encodeURIComponent(month)}`),
};
