import { randomUUID } from "node:crypto";
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
  AssessmentField,
  AssessmentTemplate,
  AssessmentTemplateInput,
  ClinicalAccessEvent,
  ClinicalAddendum,
  ClinicalAddendumInput,
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
  ClinicalRecordStatus,
  ClinicalWorkspace,
  ClinicSettingsInput,
  CommissionEntry,
  CommissionRule,
  CommissionRuleInput,
  CommunicationChannel,
  CommunicationPreference,
  CommunicationPreferenceInput,
  CostCenterInput,
  DashboardSummary,
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
  GroupClassUpdateInput,
  GroupEnrollment,
  GroupEnrollmentInput,
  GroupSession,
  GroupWorkspace,
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
  IssuedDocument,
  IssuedDocumentInput,
  InventoryWorkspace,
  ManualMessageInput,
  ManagementReport,
  SalesReport,
  SaleMovement,
  ReceivedPayment,
  OutboundMessage,
  Patient,
  PatientInput,
  PatientPlan,
  PatientPlanInput,
  PatientTab,
  PatientTabCloseInput,
  PatientTabInput,
  PatientTabItem,
  PatientTabItemInput,
  Payable,
  PayableInput,
  PaymentMethod,
  PaymentReceipt,
  PlanStatus,
  ProfessionalInput,
  Product,
  ProductInput,
  RecurringAppointmentInput,
  RoomInput,
  ScheduleBlock,
  ScheduleBlockInput,
  ServiceInput,
  SessionMovement,
  StockMovement,
  StockMovementInput,
  TherapeuticGoal,
  TherapeuticGoalInput,
  TherapeuticGoalStatus,
  TreatmentClosure,
  TreatmentClosureInput,
  Receivable,
  ReceivableStatus,
  ReceivableRenegotiation,
  ReceivableRenegotiationInput,
  ReplacementBookingInput,
  ReplacementCredit,
} from "@crm/contracts";
import { groupClassName } from "@crm/contracts";
import {
  clampGroupSessionUntil,
  findWeeklyScheduleConflicts,
  groupScheduleConflictMessage,
  groupSessionHorizon,
  weeklyOccurrences,
} from "./group-schedule.js";
import type { Pool, PoolClient } from "pg";
import { inspectClinicalAttachment } from "./clinical-integrity.js";
import { buildSalesReport, salesReportBounds } from "./sales-report.js";
import {
  DomainError,
  type AuthenticatedUser,
  type ClinicRepository,
} from "./repository.js";

interface UserRow {
  id: string;
  clinicId: string;
  fullName: string;
  email: string;
  role: AuthenticatedUser["role"];
  passwordHash: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface PatientRow {
  id: string;
  clinicId: string;
  recordNumber: string;
  fullName: string;
  cpf: string | null;
  email: string | null;
  phone: string;
  whatsapp: string | null;
  birthDate: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  notes: string | null;
  tags: string[];
  status: Patient["status"];
  createdAt: Date;
  updatedAt: Date;
}

interface ProfessionalRow {
  id: string;
  clinicId: string;
  fullName: string;
  crefito: string;
  specialty: string;
  color: string;
  active: boolean;
}

interface RoomRow {
  id: string;
  clinicId: string;
  name: string;
  capacity: number;
  active: boolean;
}

interface ServiceRow {
  id: string;
  clinicId: string;
  name: string;
  durationMinutes: number;
  priceInCents: number;
  color: string;
  active: boolean;
}

interface AppointmentRow {
  id: string;
  clinicId: string;
  patientId: string;
  professionalId: string;
  roomId: string;
  serviceId: string;
  startsAt: Date;
  endsAt: Date;
  status: AppointmentStatus;
  notes: string | null;
  patientName: string;
  professionalName: string;
  professionalColor: string;
  roomName: string;
  serviceName: string;
  createdAt: Date;
  updatedAt: Date;
  seriesId: string | null;
}

interface ScheduleBlockRow {
  id: string;
  clinicId: string;
  professionalId: string | null;
  roomId: string | null;
  professionalName: string | null;
  roomName: string | null;
  startsAt: Date;
  endsAt: Date;
  reason: string;
  status: ScheduleBlock["status"];
  createdAt: Date;
  updatedAt: Date;
}

// Permite buscar "(11) 99000" em telefones gravados só com dígitos.
function phoneSearchDigits(term: string) {
  return /^[\d\s()+-]+$/.test(term) ? term.replace(/\D/g, "") : "";
}

interface GroupClassRow {
  id: string;
  clinicId: string;
  name: string;
  sequence: number;
  serviceId: string;
  professionalId: string;
  roomId: string;
  capacity: number;
  weeklySlots: GroupClassInput["weeklySlots"];
  serviceName: string;
  professionalName: string;
  roomName: string;
  activeEnrollments: string | number;
  waitlistCount: string | number;
  active: boolean;
  createdAt: Date;
}

interface GroupEnrollmentRow {
  id: string;
  clinicId: string;
  groupId: string;
  patientId: string;
  patientName: string;
  status: GroupEnrollment["status"];
  queuePosition: number | null;
  enrolledAt: Date;
  updatedAt: Date;
}

interface GroupSessionRow {
  id: string;
  clinicId: string;
  groupId: string;
  groupName: string;
  professionalId: string;
  professionalName: string;
  roomId: string;
  roomName: string;
  startsAt: Date;
  endsAt: Date;
  status: GroupSession["status"];
  attendanceCount: string | number;
  createdAt: Date;
}

interface GroupAttendanceRow {
  id: string;
  clinicId: string;
  sessionId: string;
  patientId: string;
  patientName: string;
  status: GroupAttendance["status"];
  notes: string | null;
  recordedAt: Date;
}

interface ReplacementCreditRow {
  id: string;
  clinicId: string;
  patientId: string;
  patientName: string;
  sourceSessionId: string;
  status: ReplacementCredit["status"];
  usedSessionId: string | null;
  createdAt: Date;
  usedAt: Date | null;
}

interface ProductRow {
  id: string;
  clinicId: string;
  name: string;
  sku: string;
  unit: string;
  costInCents: number;
  salePriceInCents: number;
  currentStock: number;
  minimumStock: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface StockMovementRow {
  id: string;
  clinicId: string;
  productId: string;
  productName: string;
  kind: StockMovement["kind"];
  quantity: number;
  balanceAfter: number;
  notes: string;
  patientTabId: string | null;
  createdAt: Date;
}

interface PatientTabRow {
  id: string;
  clinicId: string;
  patientId: string;
  patientName: string;
  notes: string | null;
  status: PatientTab["status"];
  paymentStatus: PatientTab["paymentStatus"];
  totalInCents: number;
  receivableId: string | null;
  openedAt: Date;
  closedAt: Date | null;
  cancelledAt: Date | null;
}

interface PatientTabItemRow {
  id: string;
  tabId: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPriceInCents: number;
  unitCostInCents: number;
}

interface ClinicalRecordRow {
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
  appointmentStartsAt: Date;
  finalizedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface ClinicalRevisionRow {
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

interface AssessmentTemplateRow {
  id: string;
  clinicId: string;
  name: string;
  specialty: string;
  fields: AssessmentField[];
  version: number;
  active: boolean;
  createdAt: Date;
}

interface ClinicalAssessmentRow {
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

interface TherapeuticGoalRow {
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

interface ClinicalMeasurementRow {
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

interface TreatmentClosureRow {
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

interface ClinicalAttachmentRow {
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

interface ClinicalAddendumRow {
  id: string;
  clinicId: string;
  patientId: string;
  clinicalRecordId: string;
  reason: string;
  content: string;
  authorName: string;
  createdAt: Date;
}

interface ClinicalAccessEventRow {
  id: string;
  clinicId: string;
  patientId: string;
  actorUserId: string;
  action: ClinicalAccessEvent["action"];
  entityType: ClinicalAccessEvent["entityType"];
  entityId: string | null;
  createdAt: Date;
}

interface PatientPlanRow {
  id: string;
  clinicId: string;
  patientId: string;
  serviceId: string;
  name: string;
  kind: PatientPlan["kind"];
  totalSessions: number;
  remainingSessions: number;
  validFrom: string;
  validUntil: string | null;
  totalValueInCents: number;
  installments: number;
  firstDueDate: string;
  patientName: string;
  serviceName: string;
  status: PlanStatus;
  createdAt: Date;
  updatedAt: Date;
}

interface SessionMovementRow {
  id: string;
  planId: string;
  appointmentId: string | null;
  kind: SessionMovement["kind"];
  quantity: number;
  reason: string;
  createdAt: Date;
}

interface ReceivableRow {
  id: string;
  clinicId: string;
  patientId: string;
  planId: string | null;
  patientName: string;
  description: string;
  installmentNumber: number;
  installmentCount: number;
  dueDate: string;
  amountInCents: number;
  status: ReceivableStatus;
  paidAt: Date | null;
  overdue: boolean;
  createdAt: Date;
  updatedAt: Date;
  paymentMethod: PaymentMethod | null;
}

interface FinancialCategoryRow {
  id: string;
  clinicId: string;
  name: string;
  kind: FinancialCategory["kind"];
  active: boolean;
}

interface CostCenterRow {
  id: string;
  clinicId: string;
  name: string;
  active: boolean;
}

interface PayableRow {
  id: string;
  clinicId: string;
  description: string;
  supplier: string | null;
  categoryId: string;
  costCenterId: string;
  categoryName: string;
  costCenterName: string;
  dueDate: string;
  amountInCents: number;
  notes: string | null;
  status: Payable["status"];
  paymentMethod: PaymentMethod | null;
  paidAt: Date | null;
  overdue: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface CommissionRuleRow {
  id: string;
  clinicId: string;
  professionalId: string;
  professionalName: string;
  percentage: string;
  effectiveFrom: string;
  active: boolean;
  createdAt: Date;
}

interface CommissionEntryRow {
  id: string;
  clinicId: string;
  professionalId: string;
  professionalName: string;
  appointmentId: string;
  competence: string;
  baseAmountInCents: number;
  percentage: string;
  amountInCents: number;
  status: CommissionEntry["status"];
  paidAt: Date | null;
  createdAt: Date;
}

interface LeadRow {
  id: string;
  clinicId: string;
  fullName: string;
  phone: string;
  email: string | null;
  source: string;
  interest: string;
  notes: string | null;
  stage: LeadStage;
  lostReason: string | null;
  convertedPatientId: string | null;
  responsibleUserId: string | null;
  responsibleName: string | null;
  tags: string[];
  openTasks: number;
  overdueTasks: number;
  lastContactAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface LeadContactRow {
  id: string;
  clinicId: string;
  leadId: string;
  channel: LeadContact["channel"];
  direction: LeadContact["direction"];
  notes: string;
  actorName: string;
  occurredAt: Date;
  createdAt: Date;
}

interface LeadTaskRow {
  id: string;
  clinicId: string;
  leadId: string;
  title: string;
  notes: string | null;
  dueAt: Date;
  assignedUserId: string | null;
  assignedUserName: string | null;
  status: LeadTaskStatus;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface CommunicationPreferenceRow {
  id: string;
  clinicId: string;
  patientId: string;
  channel: CommunicationChannel;
  allowed: boolean;
  updatedAt: Date;
}

interface OutboundMessageRow {
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

interface DocumentTemplateRow {
  id: string;
  clinicId: string;
  name: string;
  kind: DocumentTemplate["kind"];
  version: number;
  body: string;
  active: boolean;
  previousVersionId: string | null;
  createdAt: Date;
}

interface IssuedDocumentRow {
  id: string;
  clinicId: string;
  templateId: string;
  patientId: string;
  planId: string | null;
  title: string;
  templateName: string;
  templateVersion: number;
  patientName: string;
  planName: string | null;
  snapshotBody: string;
  status: DocumentStatus;
  issuedAt: Date | null;
  cancelledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

// WhatsApp em branco cai no telefone de contato.
function communicationRecipient(
  patient: { email?: string | null; phone: string; whatsapp?: string | null },
  channel: CommunicationChannel,
) {
  if (channel === "email") return patient.email ?? "";
  return (channel === "whatsapp" && patient.whatsapp) || patient.phone;
}

const patientColumns = `
  id,
  clinic_id AS "clinicId",
  record_number AS "recordNumber",
  full_name AS "fullName",
  cpf,
  email,
  phone,
  whatsapp,
  birth_date::text AS "birthDate",
  emergency_contact_name AS "emergencyContactName",
  emergency_contact_phone AS "emergencyContactPhone",
  notes,
  tags,
  status,
  created_at AS "createdAt",
  updated_at AS "updatedAt"
`;

const appointmentColumns = `
  a.id,
  a.clinic_id AS "clinicId",
  a.patient_id AS "patientId",
  a.professional_id AS "professionalId",
  a.room_id AS "roomId",
  a.service_id AS "serviceId",
  a.starts_at AS "startsAt",
  a.ends_at AS "endsAt",
  a.status,
  a.notes,
  p.full_name AS "patientName",
  pr.full_name AS "professionalName",
  pr.color AS "professionalColor",
  r.name AS "roomName",
  s.name AS "serviceName",
  a.created_at AS "createdAt",
  a.updated_at AS "updatedAt",
  a.series_id AS "seriesId"
`;

const appointmentJoins = `
  JOIN patients p ON p.id = a.patient_id
  JOIN professionals pr ON pr.id = a.professional_id
  JOIN rooms r ON r.id = a.room_id
  JOIN services s ON s.id = a.service_id
`;

const clinicalRecordColumns = `
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
  a.starts_at AS "appointmentStartsAt",
  cr.finalized_at AS "finalizedAt",
  cr.created_at AS "createdAt",
  cr.updated_at AS "updatedAt"
`;

const patientPlanColumns = `
  pp.id, pp.clinic_id AS "clinicId", pp.patient_id AS "patientId",
  pp.service_id AS "serviceId", pp.name, pp.kind,
  pp.total_sessions AS "totalSessions", pp.remaining_sessions AS "remainingSessions",
  pp.valid_from::text AS "validFrom", pp.valid_until::text AS "validUntil",
  pp.total_value_in_cents AS "totalValueInCents", pp.installments,
  pp.first_due_date::text AS "firstDueDate", pp.status,
  p.full_name AS "patientName", s.name AS "serviceName",
  pp.created_at AS "createdAt", pp.updated_at AS "updatedAt"
`;

const receivableColumns = `
  r.id, r.clinic_id AS "clinicId", r.patient_id AS "patientId",
  r.plan_id AS "planId", p.full_name AS "patientName", r.description,
  r.installment_number AS "installmentNumber",
  r.installment_count AS "installmentCount", r.due_date::text AS "dueDate",
  r.amount_in_cents AS "amountInCents", r.status, r.paid_at AS "paidAt",
  (r.status = 'open' AND r.due_date < CURRENT_DATE) AS overdue,
  r.created_at AS "createdAt", r.updated_at AS "updatedAt"
  , r.payment_method AS "paymentMethod"
`;

const payableColumns = `
  py.id, py.clinic_id AS "clinicId", py.description, py.supplier,
  py.category_id AS "categoryId", py.cost_center_id AS "costCenterId",
  fc.name AS "categoryName", cc.name AS "costCenterName",
  py.due_date::text AS "dueDate", py.amount_in_cents AS "amountInCents",
  py.notes, py.status, py.payment_method AS "paymentMethod",
  py.paid_at AS "paidAt",
  (py.status = 'open' AND py.due_date < CURRENT_DATE) AS overdue,
  py.created_at AS "createdAt", py.updated_at AS "updatedAt"
`;

const leadColumns = `
  id, clinic_id AS "clinicId", full_name AS "fullName", phone, email,
  source, interest, notes, stage, lost_reason AS "lostReason",
  converted_patient_id AS "convertedPatientId",
  responsible_user_id AS "responsibleUserId", tags,
  (SELECT u.full_name FROM users u WHERE u.id = leads.responsible_user_id) AS "responsibleName",
  (SELECT COUNT(*)::int FROM lead_tasks lt WHERE lt.lead_id = leads.id AND lt.status = 'open') AS "openTasks",
  (SELECT COUNT(*)::int FROM lead_tasks lt WHERE lt.lead_id = leads.id AND lt.status = 'open' AND lt.due_at < now()) AS "overdueTasks",
  (SELECT MAX(lc.occurred_at) FROM lead_contacts lc WHERE lc.lead_id = leads.id) AS "lastContactAt",
  created_at AS "createdAt", updated_at AS "updatedAt"
`;

const outboundMessageColumns = `
  om.id, om.clinic_id AS "clinicId", om.patient_id AS "patientId",
  p.full_name AS "patientName", om.channel, om.kind, om.recipient, om.body,
  om.status, om.scheduled_for AS "scheduledFor", om.sent_at AS "sentAt",
  om.attempts, om.last_error AS "lastError", om.created_at AS "createdAt"
`;

const documentTemplateColumns = `
  id, clinic_id AS "clinicId", name, kind, version, body, active,
  previous_version_id AS "previousVersionId", created_at AS "createdAt"
`;

const issuedDocumentColumns = `
  d.id, d.clinic_id AS "clinicId", d.template_id AS "templateId",
  d.patient_id AS "patientId", d.plan_id AS "planId", d.title,
  d.template_name AS "templateName", d.template_version AS "templateVersion",
  p.full_name AS "patientName", pp.name AS "planName",
  d.snapshot_body AS "snapshotBody", d.status,
  d.issued_at AS "issuedAt", d.cancelled_at AS "cancelledAt",
  d.created_at AS "createdAt", d.updated_at AS "updatedAt"
`;

function present(value: string | null) {
  return value ?? undefined;
}

function mapAdminUser(row: UserRow): AdminUser {
  return {
    id: row.id,
    clinicId: row.clinicId,
    fullName: row.fullName,
    email: row.email,
    role: row.role,
    active: row.active,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapAuthenticatedUser(row: UserRow): AuthenticatedUser {
  return { ...mapAdminUser(row), passwordHash: row.passwordHash };
}

function mapPatient(row: PatientRow): Patient {
  return {
    id: row.id,
    clinicId: row.clinicId,
    recordNumber: row.recordNumber,
    fullName: row.fullName,
    phone: row.phone,
    tags: row.tags,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    cpf: present(row.cpf),
    email: present(row.email),
    whatsapp: present(row.whatsapp),
    birthDate: present(row.birthDate),
    emergencyContactName: present(row.emergencyContactName),
    emergencyContactPhone: present(row.emergencyContactPhone),
    notes: present(row.notes),
  };
}

function mapAppointment(row: AppointmentRow): Appointment {
  return {
    id: row.id,
    clinicId: row.clinicId,
    patientId: row.patientId,
    professionalId: row.professionalId,
    roomId: row.roomId,
    serviceId: row.serviceId,
    status: row.status,
    patientName: row.patientName,
    professionalName: row.professionalName,
    professionalColor: row.professionalColor,
    roomName: row.roomName,
    serviceName: row.serviceName,
    notes: present(row.notes),
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    ...(row.seriesId ? { seriesId: row.seriesId } : {}),
  };
}

function mapScheduleBlock(row: ScheduleBlockRow): ScheduleBlock {
  return {
    id: row.id,
    clinicId: row.clinicId,
    ...(row.professionalId ? { professionalId: row.professionalId } : {}),
    ...(row.roomId ? { roomId: row.roomId } : {}),
    ...(row.professionalName ? { professionalName: row.professionalName } : {}),
    ...(row.roomName ? { roomName: row.roomName } : {}),
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    reason: row.reason,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapGroupClass(row: GroupClassRow): GroupClass {
  return {
    id: row.id,
    clinicId: row.clinicId,
    name: row.name,
    sequence: row.sequence,
    serviceId: row.serviceId,
    professionalId: row.professionalId,
    roomId: row.roomId,
    capacity: row.capacity,
    weeklySlots: row.weeklySlots,
    serviceName: row.serviceName,
    professionalName: row.professionalName,
    roomName: row.roomName,
    activeEnrollments: Number(row.activeEnrollments),
    waitlistCount: Number(row.waitlistCount),
    active: row.active,
    createdAt: row.createdAt.toISOString(),
  };
}

function mapGroupEnrollment(row: GroupEnrollmentRow): GroupEnrollment {
  return {
    id: row.id,
    clinicId: row.clinicId,
    groupId: row.groupId,
    patientId: row.patientId,
    patientName: row.patientName,
    status: row.status,
    ...(row.queuePosition !== null ? { queuePosition: row.queuePosition } : {}),
    enrolledAt: row.enrolledAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapGroupSession(row: GroupSessionRow): GroupSession {
  return {
    id: row.id,
    clinicId: row.clinicId,
    groupId: row.groupId,
    groupName: row.groupName,
    professionalId: row.professionalId,
    professionalName: row.professionalName,
    roomId: row.roomId,
    roomName: row.roomName,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    status: row.status,
    attendanceCount: Number(row.attendanceCount),
    createdAt: row.createdAt.toISOString(),
  };
}

function mapGroupAttendance(row: GroupAttendanceRow): GroupAttendance {
  return {
    id: row.id,
    clinicId: row.clinicId,
    sessionId: row.sessionId,
    patientId: row.patientId,
    patientName: row.patientName,
    status: row.status,
    ...(row.notes ? { notes: row.notes } : {}),
    recordedAt: row.recordedAt.toISOString(),
  };
}

function mapReplacementCredit(row: ReplacementCreditRow): ReplacementCredit {
  return {
    id: row.id,
    clinicId: row.clinicId,
    patientId: row.patientId,
    patientName: row.patientName,
    sourceSessionId: row.sourceSessionId,
    status: row.status,
    ...(row.usedSessionId ? { usedSessionId: row.usedSessionId } : {}),
    createdAt: row.createdAt.toISOString(),
    ...(row.usedAt ? { usedAt: row.usedAt.toISOString() } : {}),
  };
}

function mapProduct(row: ProductRow): Product {
  return {
    id: row.id,
    clinicId: row.clinicId,
    name: row.name,
    sku: row.sku,
    unit: row.unit,
    costInCents: row.costInCents,
    salePriceInCents: row.salePriceInCents,
    currentStock: row.currentStock,
    minimumStock: row.minimumStock,
    lowStock: row.currentStock <= row.minimumStock,
    active: row.active,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapStockMovement(row: StockMovementRow): StockMovement {
  return {
    id: row.id,
    clinicId: row.clinicId,
    productId: row.productId,
    productName: row.productName,
    kind: row.kind,
    quantity: row.quantity,
    balanceAfter: row.balanceAfter,
    notes: row.notes,
    ...(row.patientTabId ? { patientTabId: row.patientTabId } : {}),
    createdAt: row.createdAt.toISOString(),
  };
}

function mapPatientTabItem(row: PatientTabItemRow): PatientTabItem {
  return {
    id: row.id,
    productId: row.productId,
    productName: row.productName,
    quantity: row.quantity,
    unitPriceInCents: row.unitPriceInCents,
    unitCostInCents: row.unitCostInCents,
    totalInCents: row.quantity * row.unitPriceInCents,
  };
}

function mapPatientTab(
  row: PatientTabRow,
  items: PatientTabItem[],
): PatientTab {
  return {
    id: row.id,
    clinicId: row.clinicId,
    patientId: row.patientId,
    patientName: row.patientName,
    ...(row.notes ? { notes: row.notes } : {}),
    status: row.status,
    paymentStatus: row.paymentStatus,
    totalInCents: row.totalInCents,
    items,
    ...(row.receivableId ? { receivableId: row.receivableId } : {}),
    openedAt: row.openedAt.toISOString(),
    ...(row.closedAt ? { closedAt: row.closedAt.toISOString() } : {}),
    ...(row.cancelledAt ? { cancelledAt: row.cancelledAt.toISOString() } : {}),
  };
}

function mapClinicalRecord(row: ClinicalRecordRow): ClinicalRecord {
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
    appointmentStartsAt: row.appointmentStartsAt.toISOString(),
    ...(row.finalizedAt ? { finalizedAt: row.finalizedAt.toISOString() } : {}),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapAssessmentTemplate(row: AssessmentTemplateRow): AssessmentTemplate {
  return { ...row, createdAt: row.createdAt.toISOString() };
}

function mapClinicalAssessment(row: ClinicalAssessmentRow): ClinicalAssessment {
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

function mapTherapeuticGoal(row: TherapeuticGoalRow): TherapeuticGoal {
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

function mapClinicalMeasurement(
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

function mapTreatmentClosure(row: TreatmentClosureRow): TreatmentClosure {
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

function mapClinicalAttachment(row: ClinicalAttachmentRow): ClinicalAttachment {
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

function mapClinicalAddendum(row: ClinicalAddendumRow): ClinicalAddendum {
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

function mapClinicalAccessEvent(
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

function mapPatientPlan(row: PatientPlanRow): PatientPlan {
  return {
    id: row.id,
    clinicId: row.clinicId,
    patientId: row.patientId,
    serviceId: row.serviceId,
    name: row.name,
    kind: row.kind,
    totalSessions: row.totalSessions,
    remainingSessions: row.remainingSessions,
    validFrom: row.validFrom,
    ...(row.validUntil ? { validUntil: row.validUntil } : {}),
    totalValueInCents: row.totalValueInCents,
    installments: row.installments,
    firstDueDate: row.firstDueDate,
    patientName: row.patientName,
    serviceName: row.serviceName,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapReceivable(row: ReceivableRow): Receivable {
  return {
    id: row.id,
    clinicId: row.clinicId,
    patientId: row.patientId,
    ...(row.planId ? { planId: row.planId } : {}),
    patientName: row.patientName,
    description: row.description,
    installmentNumber: row.installmentNumber,
    installmentCount: row.installmentCount,
    dueDate: row.dueDate,
    amountInCents: row.amountInCents,
    status: row.status,
    ...(row.paidAt ? { paidAt: row.paidAt.toISOString() } : {}),
    overdue: row.overdue,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    ...(row.paymentMethod ? { paymentMethod: row.paymentMethod } : {}),
  };
}

function mapPayable(row: PayableRow): Payable {
  return {
    id: row.id,
    clinicId: row.clinicId,
    description: row.description,
    ...(row.supplier ? { supplier: row.supplier } : {}),
    categoryId: row.categoryId,
    costCenterId: row.costCenterId,
    categoryName: row.categoryName,
    costCenterName: row.costCenterName,
    dueDate: row.dueDate,
    amountInCents: row.amountInCents,
    ...(row.notes ? { notes: row.notes } : {}),
    status: row.status,
    ...(row.paymentMethod ? { paymentMethod: row.paymentMethod } : {}),
    ...(row.paidAt ? { paidAt: row.paidAt.toISOString() } : {}),
    overdue: row.overdue,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapCommissionRule(row: CommissionRuleRow): CommissionRule {
  return {
    ...row,
    percentage: Number(row.percentage),
    createdAt: row.createdAt.toISOString(),
  };
}

function mapCommissionEntry(row: CommissionEntryRow): CommissionEntry {
  return {
    id: row.id,
    clinicId: row.clinicId,
    professionalId: row.professionalId,
    professionalName: row.professionalName,
    appointmentId: row.appointmentId,
    competence: row.competence,
    baseAmountInCents: row.baseAmountInCents,
    percentage: Number(row.percentage),
    amountInCents: row.amountInCents,
    status: row.status,
    ...(row.paidAt ? { paidAt: row.paidAt.toISOString() } : {}),
    createdAt: row.createdAt.toISOString(),
  };
}

function mapLead(row: LeadRow): Lead {
  return {
    id: row.id,
    clinicId: row.clinicId,
    fullName: row.fullName,
    phone: row.phone,
    ...(row.email ? { email: row.email } : {}),
    source: row.source,
    interest: row.interest,
    ...(row.notes ? { notes: row.notes } : {}),
    ...(row.responsibleUserId
      ? { responsibleUserId: row.responsibleUserId }
      : {}),
    ...(row.responsibleName ? { responsibleName: row.responsibleName } : {}),
    tags: row.tags ?? [],
    stage: row.stage,
    ...(row.lostReason ? { lostReason: row.lostReason } : {}),
    ...(row.convertedPatientId
      ? { convertedPatientId: row.convertedPatientId }
      : {}),
    openTasks: row.openTasks ?? 0,
    overdueTasks: row.overdueTasks ?? 0,
    ...(row.lastContactAt
      ? { lastContactAt: row.lastContactAt.toISOString() }
      : {}),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapLeadContact(row: LeadContactRow): LeadContact {
  return {
    id: row.id,
    clinicId: row.clinicId,
    leadId: row.leadId,
    channel: row.channel,
    direction: row.direction,
    notes: row.notes,
    actorName: row.actorName,
    occurredAt: row.occurredAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

function mapLeadTask(row: LeadTaskRow): LeadTask {
  return {
    id: row.id,
    clinicId: row.clinicId,
    leadId: row.leadId,
    title: row.title,
    ...(row.notes ? { notes: row.notes } : {}),
    dueAt: row.dueAt.toISOString(),
    ...(row.assignedUserId ? { assignedUserId: row.assignedUserId } : {}),
    ...(row.assignedUserName ? { assignedUserName: row.assignedUserName } : {}),
    status: row.status,
    ...(row.completedAt ? { completedAt: row.completedAt.toISOString() } : {}),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapCommunicationPreference(
  row: CommunicationPreferenceRow,
): CommunicationPreference {
  return { ...row, updatedAt: row.updatedAt.toISOString() };
}

function mapOutboundMessage(row: OutboundMessageRow): OutboundMessage {
  return {
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

function mapDocumentTemplate(row: DocumentTemplateRow): DocumentTemplate {
  return {
    id: row.id,
    clinicId: row.clinicId,
    name: row.name,
    kind: row.kind,
    version: row.version,
    body: row.body,
    active: row.active,
    ...(row.previousVersionId
      ? { previousVersionId: row.previousVersionId }
      : {}),
    createdAt: row.createdAt.toISOString(),
  };
}

function mapIssuedDocument(row: IssuedDocumentRow): IssuedDocument {
  return {
    id: row.id,
    clinicId: row.clinicId,
    templateId: row.templateId,
    patientId: row.patientId,
    ...(row.planId ? { planId: row.planId } : {}),
    title: row.title,
    templateName: row.templateName,
    templateVersion: row.templateVersion,
    patientName: row.patientName,
    ...(row.planName ? { planName: row.planName } : {}),
    snapshotBody: row.snapshotBody,
    status: row.status,
    ...(row.issuedAt ? { issuedAt: row.issuedAt.toISOString() } : {}),
    ...(row.cancelledAt ? { cancelledAt: row.cancelledAt.toISOString() } : {}),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function addMonths(dateValue: string, months: number) {
  const [year, month, day] = dateValue.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1 + months, 1));
  const lastDay = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
  ).getUTCDate();
  date.setUTCDate(Math.min(day!, lastDay));
  return date.toISOString().slice(0, 10);
}

function hasDatabaseCode(error: unknown, code: string) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === code
  );
}

// Encontros já reservados ocupam a agenda. Com `includeWeeklySlots`, os horários fixos das
// turmas ativas também contam depois do período já reservado, para que um atendimento marcado
// meses à frente não ocupe o horário de uma turma antes de o encontro ser gerado.
async function hasGroupSessionConflict(
  client: Pool | PoolClient,
  clinicId: string,
  professionalId: string | undefined,
  roomId: string | undefined,
  startsAt: Date,
  endsAt: Date,
  includeWeeklySlots = true,
) {
  const result = await client.query(
    `SELECT 1 FROM group_sessions gs
     JOIN group_classes g ON g.id = gs.group_id
     WHERE gs.clinic_id = $1 AND gs.status <> 'cancelled'
       AND (($2::uuid IS NOT NULL AND g.professional_id = $2)
         OR ($3::uuid IS NOT NULL AND g.room_id = $3))
       AND gs.starts_at < $5 AND gs.ends_at > $4
     UNION ALL
     SELECT 1 FROM group_classes g
     JOIN clinics c ON c.id = g.clinic_id
     CROSS JOIN LATERAL jsonb_array_elements(g.weekly_slots) AS s(slot)
     WHERE $6 AND g.clinic_id = $1 AND g.active
       AND (($2::uuid IS NOT NULL AND g.professional_id = $2)
         OR ($3::uuid IS NOT NULL AND g.room_id = $3))
       AND EXTRACT(DOW FROM ($4::timestamptz AT TIME ZONE c.timezone)) = (s.slot->>'weekday')::int
       AND (s.slot->>'endTime')::time > ($4::timestamptz AT TIME ZONE c.timezone)::time
       AND (s.slot->>'startTime')::time < CASE
         WHEN ($5::timestamptz AT TIME ZONE c.timezone)::date > ($4::timestamptz AT TIME ZONE c.timezone)::date
           THEN time '23:59:59.999'
         ELSE ($5::timestamptz AT TIME ZONE c.timezone)::time END
       AND ((($4::timestamptz AT TIME ZONE c.timezone)::date + (s.slot->>'startTime')::time) AT TIME ZONE c.timezone)
         > coalesce(g.sessions_generated_until, now())
     LIMIT 1`,
    [clinicId, professionalId ?? null, roomId ?? null, startsAt, endsAt, includeWeeklySlots],
  );
  return Boolean(result.rowCount);
}

const groupSessionColumns = `gs.id,gs.clinic_id AS "clinicId",gs.group_id AS "groupId",g.name AS "groupName",g.professional_id AS "professionalId",p.full_name AS "professionalName",g.room_id AS "roomId",r.name AS "roomName",gs.starts_at AS "startsAt",gs.ends_at AS "endsAt",gs.status,gs.created_at AS "createdAt"`;

export class PostgresClinicRepository implements ClinicRepository {
  constructor(private readonly pool: Pool) {}

  async findUserByEmail(email: string) {
    const result = await this.pool.query<UserRow>(
      `
        SELECT id, clinic_id AS "clinicId", full_name AS "fullName", email, role,
               password_hash AS "passwordHash", active,
               created_at AS "createdAt", updated_at AS "updatedAt"
        FROM users
        WHERE lower(email) = lower($1) AND active = true
        ORDER BY created_at
        LIMIT 1
      `,
      [email],
    );
    return result.rows[0] ? mapAuthenticatedUser(result.rows[0]) : null;
  }

  async findUserById(clinicId: string, userId: string) {
    const result = await this.pool.query<UserRow>(
      `
        SELECT id, clinic_id AS "clinicId", full_name AS "fullName", email, role,
               password_hash AS "passwordHash", active,
               created_at AS "createdAt", updated_at AS "updatedAt"
        FROM users
        WHERE clinic_id = $1 AND id = $2 AND active = true
      `,
      [clinicId, userId],
    );
    return result.rows[0] ? mapAuthenticatedUser(result.rows[0]) : null;
  }

  async listAdminUsers(clinicId: string) {
    const result = await this.pool.query<UserRow>(
      `SELECT id, clinic_id AS "clinicId", full_name AS "fullName", email, role,
              password_hash AS "passwordHash", active,
              created_at AS "createdAt", updated_at AS "updatedAt"
       FROM users WHERE clinic_id = $1 ORDER BY full_name`,
      [clinicId],
    );
    return result.rows.map(mapAdminUser);
  }

  async createAdminUser(
    clinicId: string,
    actorUserId: string,
    input: AdminUserInput,
    passwordHash: string,
  ) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query<UserRow>(
        `INSERT INTO users (clinic_id, full_name, email, role, password_hash)
         VALUES ($1,$2,$3,$4,$5)
         RETURNING id, clinic_id AS "clinicId", full_name AS "fullName", email,
                   role, password_hash AS "passwordHash", active,
                   created_at AS "createdAt", updated_at AS "updatedAt"`,
        [clinicId, input.fullName, input.email, input.role, passwordHash],
      );
      await this.addAdminAudit(
        client,
        clinicId,
        actorUserId,
        "user.created",
        "user",
        result.rows[0]!.id,
        { email: input.email, role: input.role },
      );
      await client.query("COMMIT");
      return mapAdminUser(result.rows[0]!);
    } catch (error) {
      await client.query("ROLLBACK");
      if (hasDatabaseCode(error, "23505"))
        throw new DomainError(
          "USER_EMAIL_DUPLICATE",
          "Este e-mail já está em uso.",
          409,
        );
      throw error;
    } finally {
      client.release();
    }
  }

  async updateAdminUser(
    clinicId: string,
    actorUserId: string,
    userId: string,
    input: AdminUserUpdate,
  ) {
    if (userId === actorUserId && !input.active)
      throw new DomainError(
        "CANNOT_DEACTIVATE_SELF",
        "Você não pode desativar o próprio acesso.",
        409,
      );
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query<UserRow>(
        `UPDATE users SET full_name = $3, role = $4, active = $5, updated_at = now()
         WHERE clinic_id = $1 AND id = $2
         RETURNING id, clinic_id AS "clinicId", full_name AS "fullName", email,
                   role, password_hash AS "passwordHash", active,
                   created_at AS "createdAt", updated_at AS "updatedAt"`,
        [clinicId, userId, input.fullName, input.role, input.active],
      );
      if (!result.rows[0]) {
        await client.query("COMMIT");
        return null;
      }
      await this.addAdminAudit(
        client,
        clinicId,
        actorUserId,
        "user.updated",
        "user",
        userId,
        { role: input.role, active: input.active },
      );
      await client.query("COMMIT");
      return mapAdminUser(result.rows[0]);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async resetAdminUserPassword(
    clinicId: string,
    actorUserId: string,
    userId: string,
    passwordHash: string,
  ) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query(
        `UPDATE users SET password_hash = $3, updated_at = now()
         WHERE clinic_id = $1 AND id = $2`,
        [clinicId, userId, passwordHash],
      );
      if (!result.rowCount) {
        await client.query("COMMIT");
        return false;
      }
      await this.addAdminAudit(
        client,
        clinicId,
        actorUserId,
        "user.password_reset",
        "user",
        userId,
      );
      await client.query("COMMIT");
      return true;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async getClinicSettings(clinicId: string) {
    const result = await this.pool.query<{
      id: string;
      name: string;
      legalName: string | null;
      taxId: string | null;
      phone: string | null;
      email: string | null;
      address: string | null;
      timezone: string;
      updatedAt: Date;
    }>(
      `SELECT id, name, legal_name AS "legalName", tax_id AS "taxId", phone,
              email, address, timezone, updated_at AS "updatedAt"
       FROM clinics WHERE id = $1`,
      [clinicId],
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      legalName: row.legalName ?? "",
      taxId: row.taxId ?? "",
      phone: row.phone ?? "",
      email: row.email ?? "",
      address: row.address ?? "",
      timezone: row.timezone,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async updateClinicSettings(
    clinicId: string,
    actorUserId: string,
    input: ClinicSettingsInput,
  ) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query(
        `UPDATE clinics SET name = $2, legal_name = $3, tax_id = $4,
            phone = $5, email = $6, address = $7, timezone = $8, updated_at = now()
         WHERE id = $1`,
        [
          clinicId,
          input.name,
          input.legalName || null,
          input.taxId || null,
          input.phone || null,
          input.email || null,
          input.address || null,
          input.timezone,
        ],
      );
      if (!result.rowCount)
        throw new DomainError(
          "CLINIC_NOT_FOUND",
          "Clínica não encontrada.",
          404,
        );
      await this.addAdminAudit(
        client,
        clinicId,
        actorUserId,
        "clinic.updated",
        "clinic",
        clinicId,
      );
      await client.query("COMMIT");
      return (await this.getClinicSettings(clinicId))!;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async listAdminAuditEvents(clinicId: string) {
    const result = await this.pool.query<{
      id: string;
      action: string;
      entityType: string;
      entityId: string | null;
      actorName: string | null;
      metadata: Record<string, unknown>;
      createdAt: Date;
    }>(
      `SELECT ae.id, ae.action, ae.entity_type AS "entityType",
              ae.entity_id AS "entityId", u.full_name AS "actorName",
              ae.metadata, ae.created_at AS "createdAt"
       FROM audit_events ae LEFT JOIN users u ON u.id = ae.actor_user_id
       WHERE ae.clinic_id = $1 ORDER BY ae.created_at DESC LIMIT 200`,
      [clinicId],
    );
    return result.rows.map((row): AdminAuditEvent => ({
      id: row.id,
      action: row.action,
      entityType: row.entityType,
      ...(row.entityId ? { entityId: row.entityId } : {}),
      ...(row.actorName ? { actorName: row.actorName } : {}),
      metadata: row.metadata,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async getDashboard(
    clinicId: string,
    date: string,
  ): Promise<DashboardSummary> {
    const [totals, patients, nextAppointments] = await Promise.all([
      this.pool.query<{
        appointmentsToday: number;
        completedToday: number;
        noShowsThisMonth: number;
      }>(
        `
          SELECT
            count(*) FILTER (
              WHERE a.starts_at >= ($2::date::timestamp AT TIME ZONE c.timezone)
                AND a.starts_at < (($2::date + 1)::timestamp AT TIME ZONE c.timezone)
            )::int AS "appointmentsToday",
            count(*) FILTER (
              WHERE a.starts_at >= ($2::date::timestamp AT TIME ZONE c.timezone)
                AND a.starts_at < (($2::date + 1)::timestamp AT TIME ZONE c.timezone)
                AND a.status = 'completed'
            )::int AS "completedToday",
            count(*) FILTER (
              WHERE a.starts_at >= (date_trunc('month', $2::date)::timestamp AT TIME ZONE c.timezone)
                AND a.starts_at < ((date_trunc('month', $2::date) + interval '1 month')::timestamp AT TIME ZONE c.timezone)
                AND a.status = 'no_show'
            )::int AS "noShowsThisMonth"
          FROM clinics c
          LEFT JOIN appointments a ON a.clinic_id = c.id
          WHERE c.id = $1
          GROUP BY c.id
        `,
        [clinicId, date],
      ),
      this.pool.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM patients WHERE clinic_id = $1 AND status = 'active'",
        [clinicId],
      ),
      this.pool.query<AppointmentRow>(
        `
          SELECT ${appointmentColumns}
          FROM appointments a
          ${appointmentJoins}
          JOIN clinics c ON c.id = a.clinic_id
          WHERE a.clinic_id = $1
            AND a.starts_at >= ($2::date::timestamp AT TIME ZONE c.timezone)
            AND a.starts_at < (($2::date + 1)::timestamp AT TIME ZONE c.timezone)
            AND a.ends_at >= now()
          ORDER BY a.starts_at
          LIMIT 5
        `,
        [clinicId, date],
      ),
    ]);

    const summary = totals.rows[0] ?? {
      appointmentsToday: 0,
      completedToday: 0,
      noShowsThisMonth: 0,
    };
    return {
      date,
      ...summary,
      patientsActive: patients.rows[0]?.count ?? 0,
      nextAppointments: nextAppointments.rows.map(mapAppointment),
    };
  }

  async listPatients(clinicId: string, search = "") {
    const term = search.trim();
    const result = await this.pool.query<PatientRow>(
      `
        SELECT ${patientColumns}
        FROM patients
        WHERE clinic_id = $1
          AND (
            $2 = '' OR full_name ILIKE '%' || $2 || '%' OR coalesce(cpf, '') ILIKE '%' || $2 || '%'
            OR coalesce(email, '') ILIKE '%' || $2 || '%' OR phone ILIKE '%' || $2 || '%'
            OR ($3 <> '' AND (phone LIKE '%' || $3 || '%' OR coalesce(whatsapp, '') LIKE '%' || $3 || '%'))
            OR record_number ILIKE '%' || $2 || '%'
          )
        ORDER BY full_name
      `,
      [clinicId, term, phoneSearchDigits(term)],
    );
    return result.rows.map(mapPatient);
  }

  async createPatient(clinicId: string, input: PatientInput) {
    const id = randomUUID();
    try {
      const result = await this.pool.query<PatientRow>(
        `
          INSERT INTO patients (
            id, clinic_id, record_number, full_name, cpf, email, phone, whatsapp, birth_date,
            emergency_contact_name, emergency_contact_phone, notes, tags
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
          RETURNING ${patientColumns}
        `,
        [
          id,
          clinicId,
          `PAC-${id.slice(0, 8).toUpperCase()}`,
          input.fullName,
          input.cpf || null,
          input.email || null,
          input.phone,
          input.whatsapp || null,
          input.birthDate || null,
          input.emergencyContactName || null,
          input.emergencyContactPhone || null,
          input.notes || null,
          input.tags,
        ],
      );
      return mapPatient(result.rows[0]!);
    } catch (error) {
      if (hasDatabaseCode(error, "23505")) {
        throw new DomainError(
          "PATIENT_DUPLICATE",
          "Já existe um cliente com este CPF.",
          409,
        );
      }
      throw error;
    }
  }

  async updatePatient(clinicId: string, patientId: string, input: PatientInput) {
    try {
      const result = await this.pool.query<PatientRow>(
        `UPDATE patients SET full_name = $3, cpf = $4, email = $5,
                phone = $6, whatsapp = $7, birth_date = $8, emergency_contact_name = $9,
                emergency_contact_phone = $10, notes = $11, tags = $12,
                updated_at = now()
         WHERE clinic_id = $1 AND id = $2
         RETURNING ${patientColumns}`,
        [
          clinicId,
          patientId,
          input.fullName,
          input.cpf || null,
          input.email || null,
          input.phone,
          input.whatsapp || null,
          input.birthDate || null,
          input.emergencyContactName || null,
          input.emergencyContactPhone || null,
          input.notes || null,
          input.tags,
        ],
      );
      return result.rows[0] ? mapPatient(result.rows[0]) : null;
    } catch (error) {
      if (hasDatabaseCode(error, "23505"))
        throw new DomainError(
          "PATIENT_DUPLICATE",
          "Já existe um cliente com este CPF.",
          409,
        );
      throw error;
    }
  }

  async listProfessionals(clinicId: string) {
    const result = await this.pool.query<ProfessionalRow>(
      `
        SELECT id, clinic_id AS "clinicId", full_name AS "fullName", crefito,
               specialty, color, active
        FROM professionals WHERE clinic_id = $1 AND active = true ORDER BY full_name
      `,
      [clinicId],
    );
    return result.rows;
  }

  async createProfessional(clinicId: string, input: ProfessionalInput) {
    try {
      const result = await this.pool.query<ProfessionalRow>(
        `
          INSERT INTO professionals (clinic_id, full_name, crefito, specialty, color)
          VALUES ($1, $2, $3, $4, $5)
          RETURNING id, clinic_id AS "clinicId", full_name AS "fullName", crefito,
                    specialty, color, active
        `,
        [clinicId, input.fullName, input.crefito, input.specialty, input.color],
      );
      return result.rows[0]!;
    } catch (error) {
      if (hasDatabaseCode(error, "23505")) {
        throw new DomainError(
          "PROFESSIONAL_DUPLICATE",
          "Já existe um profissional com este CREFITO.",
          409,
        );
      }
      throw error;
    }
  }

  async listRooms(clinicId: string) {
    const result = await this.pool.query<RoomRow>(
      `SELECT id, clinic_id AS "clinicId", name, capacity, active
       FROM rooms WHERE clinic_id = $1 AND active = true ORDER BY name`,
      [clinicId],
    );
    return result.rows;
  }

  async createRoom(clinicId: string, input: RoomInput) {
    try {
      const result = await this.pool.query<RoomRow>(
        `INSERT INTO rooms (clinic_id, name, capacity) VALUES ($1, $2, $3)
         RETURNING id, clinic_id AS "clinicId", name, capacity, active`,
        [clinicId, input.name, input.capacity],
      );
      return result.rows[0]!;
    } catch (error) {
      if (hasDatabaseCode(error, "23505")) {
        throw new DomainError(
          "ROOM_DUPLICATE",
          "Já existe uma sala com este nome.",
          409,
        );
      }
      throw error;
    }
  }

  async listServices(clinicId: string) {
    const result = await this.pool.query<ServiceRow>(
      `
        SELECT id, clinic_id AS "clinicId", name, duration_minutes AS "durationMinutes",
               price_in_cents AS "priceInCents", color, active
        FROM services WHERE clinic_id = $1 AND active = true ORDER BY name
      `,
      [clinicId],
    );
    return result.rows;
  }

  async createService(clinicId: string, input: ServiceInput) {
    const result = await this.pool.query<ServiceRow>(
      `
        INSERT INTO services (clinic_id, name, duration_minutes, price_in_cents, color)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, clinic_id AS "clinicId", name, duration_minutes AS "durationMinutes",
                  price_in_cents AS "priceInCents", color, active
      `,
      [
        clinicId,
        input.name,
        input.durationMinutes,
        input.priceInCents,
        input.color,
      ],
    );
    return result.rows[0]!;
  }

  async listAppointments(clinicId: string, from: string, to: string) {
    const result = await this.pool.query<AppointmentRow>(
      `
        SELECT ${appointmentColumns}
        FROM appointments a
        ${appointmentJoins}
        WHERE a.clinic_id = $1 AND a.starts_at < $3 AND a.ends_at > $2
        ORDER BY a.starts_at
      `,
      [clinicId, from, to],
    );
    return result.rows.map(mapAppointment);
  }

  async createAppointment(clinicId: string, input: AppointmentInput) {
    const related = await this.pool.query<{ durationMinutes: number }>(
      `
        SELECT s.duration_minutes AS "durationMinutes"
        FROM patients p, professionals pr, rooms r, services s
        WHERE p.id = $2 AND p.clinic_id = $1 AND p.status = 'active'
          AND pr.id = $3 AND pr.clinic_id = $1 AND pr.active = true
          AND r.id = $4 AND r.clinic_id = $1 AND r.active = true
          AND s.id = $5 AND s.clinic_id = $1 AND s.active = true
      `,
      [
        clinicId,
        input.patientId,
        input.professionalId,
        input.roomId,
        input.serviceId,
      ],
    );
    if (!related.rows[0]) {
      throw new DomainError(
        "RELATED_RECORD_NOT_FOUND",
        "Cliente, profissional, sala ou serviço não encontrado.",
        404,
      );
    }

    const startsAt = new Date(input.startsAt);
    const endsAt = new Date(
      startsAt.getTime() + related.rows[0].durationMinutes * 60_000,
    );
    if (
      await hasGroupSessionConflict(
        this.pool,
        clinicId,
        input.professionalId,
        input.roomId,
        startsAt,
        endsAt,
      )
    )
      throw new DomainError(
        "APPOINTMENT_CONFLICT",
        "O profissional ou a sala está ocupado por uma turma nesse horário.",
        409,
      );
    try {
      const inserted = await this.pool.query<{ id: string }>(
        `
          INSERT INTO appointments (
            clinic_id, patient_id, professional_id, room_id, service_id,
            starts_at, ends_at, notes
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          RETURNING id
        `,
        [
          clinicId,
          input.patientId,
          input.professionalId,
          input.roomId,
          input.serviceId,
          startsAt,
          endsAt,
          input.notes || null,
        ],
      );
      return (await this.findAppointment(clinicId, inserted.rows[0]!.id))!;
    } catch (error) {
      if (hasDatabaseCode(error, "23P01") || hasDatabaseCode(error, "40P01")) {
        throw new DomainError(
          "APPOINTMENT_CONFLICT",
          "O profissional ou a sala está ocupado ou bloqueado nesse horário.",
          409,
        );
      }
      throw error;
    }
  }

  async rescheduleAppointment(
    clinicId: string,
    actorUserId: string,
    appointmentId: string,
    input: AppointmentRescheduleInput,
  ) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const current = await client.query<{
        status: AppointmentStatus;
        startsAt: Date;
        endsAt: Date;
        professionalId: string;
        roomId: string;
        serviceId: string;
      }>(
        `SELECT status, starts_at AS "startsAt", ends_at AS "endsAt",
                professional_id AS "professionalId", room_id AS "roomId",
                service_id AS "serviceId"
         FROM appointments WHERE clinic_id = $1 AND id = $2 FOR UPDATE`,
        [clinicId, appointmentId],
      );
      const previous = current.rows[0];
      if (!previous) {
        await client.query("COMMIT");
        return null;
      }
      if (!["scheduled", "confirmed"].includes(previous.status))
        throw new DomainError(
          "APPOINTMENT_RESCHEDULE_FORBIDDEN",
          "Somente atendimentos agendados ou confirmados podem ser reagendados.",
          409,
        );
      const related = await client.query<{ durationMinutes: number }>(
        `SELECT s.duration_minutes AS "durationMinutes"
         FROM services s, professionals p, rooms r
         WHERE s.clinic_id = $1 AND s.id = $2
           AND p.clinic_id = $1 AND p.id = $3 AND p.active
           AND r.clinic_id = $1 AND r.id = $4 AND r.active`,
        [
          clinicId,
          previous.serviceId,
          input.professionalId,
          input.roomId,
        ],
      );
      if (!related.rows[0])
        throw new DomainError(
          "RELATED_RECORD_NOT_FOUND",
          "Profissional, sala ou serviço não encontrado.",
          404,
        );
      const startsAt = new Date(input.startsAt);
      const endsAt = new Date(
        startsAt.getTime() + related.rows[0].durationMinutes * 60_000,
      );
      if (
        startsAt.getTime() === previous.startsAt.getTime() &&
        input.professionalId === previous.professionalId &&
        input.roomId === previous.roomId
      ) {
        const unchanged = await this.findAppointment(
          clinicId,
          appointmentId,
          client,
        );
        await client.query("COMMIT");
        return unchanged;
      }
      if (
        await hasGroupSessionConflict(
          client,
          clinicId,
          input.professionalId,
          input.roomId,
          startsAt,
          endsAt,
        )
      )
        throw new DomainError(
          "APPOINTMENT_CONFLICT",
          "O profissional ou a sala está ocupado por uma turma nesse horário.",
          409,
        );
      await client.query(
        `UPDATE appointments
         SET professional_id = $3, room_id = $4, starts_at = $5,
             ends_at = $6, updated_at = now()
         WHERE clinic_id = $1 AND id = $2`,
        [
          clinicId,
          appointmentId,
          input.professionalId,
          input.roomId,
          startsAt,
          endsAt,
        ],
      );
      await client.query(
        `INSERT INTO appointment_reschedules (
           clinic_id, appointment_id, actor_user_id,
           previous_starts_at, previous_ends_at,
           previous_professional_id, previous_room_id,
           starts_at, ends_at, professional_id, room_id
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          clinicId,
          appointmentId,
          actorUserId,
          previous.startsAt,
          previous.endsAt,
          previous.professionalId,
          previous.roomId,
          startsAt,
          endsAt,
          input.professionalId,
          input.roomId,
        ],
      );
      const appointment = await this.findAppointment(
        clinicId,
        appointmentId,
        client,
      );
      await client.query("COMMIT");
      return appointment;
    } catch (error) {
      await client.query("ROLLBACK");
      if (hasDatabaseCode(error, "23P01") || hasDatabaseCode(error, "40P01"))
        throw new DomainError(
          "APPOINTMENT_CONFLICT",
          "O profissional ou a sala está ocupado ou bloqueado nesse horário.",
          409,
        );
      throw error;
    } finally {
      client.release();
    }
  }

  async listAppointmentReschedules(clinicId: string, appointmentId: string) {
    const appointment = await this.pool.query(
      "SELECT 1 FROM appointments WHERE clinic_id = $1 AND id = $2",
      [clinicId, appointmentId],
    );
    if (!appointment.rowCount) return null;
    const result = await this.pool.query<{
      id: string;
      appointmentId: string;
      previousStartsAt: Date;
      previousEndsAt: Date;
      previousProfessionalId: string;
      previousProfessionalName: string;
      previousRoomId: string;
      previousRoomName: string;
      startsAt: Date;
      endsAt: Date;
      professionalId: string;
      professionalName: string;
      roomId: string;
      roomName: string;
      actorName: string;
      createdAt: Date;
    }>(
      `SELECT ar.id, ar.appointment_id AS "appointmentId",
              ar.previous_starts_at AS "previousStartsAt",
              ar.previous_ends_at AS "previousEndsAt",
              ar.previous_professional_id AS "previousProfessionalId",
              previous_pr.full_name AS "previousProfessionalName",
              ar.previous_room_id AS "previousRoomId",
              previous_r.name AS "previousRoomName",
              ar.starts_at AS "startsAt", ar.ends_at AS "endsAt",
              ar.professional_id AS "professionalId",
              current_pr.full_name AS "professionalName",
              ar.room_id AS "roomId", current_r.name AS "roomName",
              u.full_name AS "actorName", ar.created_at AS "createdAt"
       FROM appointment_reschedules ar JOIN users u ON u.id = ar.actor_user_id
       JOIN professionals previous_pr ON previous_pr.id = ar.previous_professional_id
       JOIN rooms previous_r ON previous_r.id = ar.previous_room_id
       JOIN professionals current_pr ON current_pr.id = ar.professional_id
       JOIN rooms current_r ON current_r.id = ar.room_id
       WHERE ar.clinic_id = $1 AND ar.appointment_id = $2
       ORDER BY ar.created_at DESC, ar.id DESC`,
      [clinicId, appointmentId],
    );
    return result.rows.map(
      (row): AppointmentRescheduleEvent => ({
        ...row,
        previousStartsAt: row.previousStartsAt.toISOString(),
        previousEndsAt: row.previousEndsAt.toISOString(),
        startsAt: row.startsAt.toISOString(),
        endsAt: row.endsAt.toISOString(),
        createdAt: row.createdAt.toISOString(),
      }),
    );
  }

  async createRecurringAppointments(
    clinicId: string,
    input: RecurringAppointmentInput,
  ) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const related = await client.query<{ durationMinutes: number }>(
        `SELECT s.duration_minutes AS "durationMinutes"
         FROM patients p, professionals pr, rooms r, services s
         WHERE p.id = $2 AND p.clinic_id = $1 AND p.status = 'active'
           AND pr.id = $3 AND pr.clinic_id = $1 AND pr.active = true
           AND r.id = $4 AND r.clinic_id = $1 AND r.active = true
           AND s.id = $5 AND s.clinic_id = $1 AND s.active = true`,
        [
          clinicId,
          input.patientId,
          input.professionalId,
          input.roomId,
          input.serviceId,
        ],
      );
      if (!related.rows[0])
        throw new DomainError(
          "RELATED_RECORD_NOT_FOUND",
          "Cliente, profissional, sala ou serviço não encontrado.",
          404,
        );
      const seriesId = randomUUID();
      const ids: string[] = [];
      for (let index = 0; index < input.occurrences; index += 1) {
        const startsAt = new Date(input.startsAt);
        startsAt.setUTCDate(
          startsAt.getUTCDate() + index * input.intervalWeeks * 7,
        );
        const endsAt = new Date(
          startsAt.getTime() + related.rows[0].durationMinutes * 60_000,
        );
        if (
          await hasGroupSessionConflict(
            client,
            clinicId,
            input.professionalId,
            input.roomId,
            startsAt,
            endsAt,
          )
        )
          throw new DomainError(
            "APPOINTMENT_CONFLICT",
            `A ocorrência ${index + 1} conflita com uma turma.`,
            409,
          );
        const inserted = await client.query<{ id: string }>(
          `INSERT INTO appointments
             (clinic_id, patient_id, professional_id, room_id, service_id,
              starts_at, ends_at, notes, series_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
          [
            clinicId,
            input.patientId,
            input.professionalId,
            input.roomId,
            input.serviceId,
            startsAt,
            endsAt,
            input.notes || null,
            seriesId,
          ],
        );
        ids.push(inserted.rows[0]!.id);
      }
      const appointments = await Promise.all(
        ids.map((id) => this.findAppointment(clinicId, id, client)),
      );
      await client.query("COMMIT");
      return appointments.filter((item): item is Appointment => item !== null);
    } catch (error) {
      await client.query("ROLLBACK");
      if (hasDatabaseCode(error, "23P01"))
        throw new DomainError(
          "APPOINTMENT_CONFLICT",
          "Uma das ocorrências conflita com a agenda. Nenhum atendimento foi criado.",
          409,
        );
      throw error;
    } finally {
      client.release();
    }
  }

  async listScheduleBlocks(clinicId: string, from: string, to: string) {
    const result = await this.pool.query<ScheduleBlockRow>(
      `SELECT b.id, b.clinic_id AS "clinicId",
              b.professional_id AS "professionalId", b.room_id AS "roomId",
              pr.full_name AS "professionalName", r.name AS "roomName",
              b.starts_at AS "startsAt", b.ends_at AS "endsAt", b.reason,
              b.status, b.created_at AS "createdAt", b.updated_at AS "updatedAt"
       FROM schedule_blocks b
       LEFT JOIN professionals pr ON pr.id = b.professional_id
       LEFT JOIN rooms r ON r.id = b.room_id
       WHERE b.clinic_id = $1 AND b.status = 'active'
         AND b.starts_at < $3 AND b.ends_at > $2
       ORDER BY b.starts_at`,
      [clinicId, from, to],
    );
    return result.rows.map(mapScheduleBlock);
  }

  async createScheduleBlock(clinicId: string, input: ScheduleBlockInput) {
    const related = await this.pool.query<{
      professionalName: string | null;
      roomName: string | null;
    }>(
      `SELECT pr.full_name AS "professionalName", r.name AS "roomName"
       FROM clinics c
       LEFT JOIN professionals pr
         ON pr.clinic_id = c.id AND pr.id = $2 AND pr.active
       LEFT JOIN rooms r ON r.clinic_id = c.id AND r.id = $3 AND r.active
       WHERE c.id = $1`,
      [clinicId, input.professionalId || null, input.roomId || null],
    );
    if (
      !related.rows[0] ||
      (input.professionalId && !related.rows[0].professionalName) ||
      (input.roomId && !related.rows[0].roomName)
    )
      throw new DomainError(
        "RELATED_RECORD_NOT_FOUND",
        "Profissional ou sala não encontrado.",
        404,
      );
    if (
      await hasGroupSessionConflict(
        this.pool,
        clinicId,
        input.professionalId,
        input.roomId,
        new Date(input.startsAt),
        new Date(input.endsAt),
        false,
      )
    )
      throw new DomainError(
        "SCHEDULE_BLOCK_CONFLICT",
        "O bloqueio conflita com uma turma existente.",
        409,
      );
    try {
      const inserted = await this.pool.query<{ id: string }>(
        `INSERT INTO schedule_blocks
           (clinic_id, professional_id, room_id, starts_at, ends_at, reason)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [
          clinicId,
          input.professionalId || null,
          input.roomId || null,
          input.startsAt,
          input.endsAt,
          input.reason,
        ],
      );
      return (await this.findScheduleBlock(clinicId, inserted.rows[0]!.id))!;
    } catch (error) {
      if (hasDatabaseCode(error, "23P01"))
        throw new DomainError(
          "SCHEDULE_BLOCK_CONFLICT",
          "O bloqueio conflita com um atendimento ou bloqueio existente.",
          409,
        );
      throw error;
    }
  }

  async cancelScheduleBlock(clinicId: string, blockId: string) {
    const result = await this.pool.query(
      `UPDATE schedule_blocks SET status = 'cancelled', updated_at = now()
       WHERE clinic_id = $1 AND id = $2 RETURNING id`,
      [clinicId, blockId],
    );
    return result.rows[0] ? this.findScheduleBlock(clinicId, blockId) : null;
  }

  async getGroupWorkspace(
    clinicId: string,
    from: string,
    to: string,
  ): Promise<GroupWorkspace> {
    await this.ensureGroupSessionsUntil(clinicId, groupSessionHorizon());
    const [groups, enrollments, sessions, attendance, credits] =
      await Promise.all([
        this.pool.query<GroupClassRow>(
          `SELECT g.id,g.clinic_id AS "clinicId",g.name,g.sequence,g.service_id AS "serviceId",g.professional_id AS "professionalId",g.room_id AS "roomId",g.capacity,g.weekly_slots AS "weeklySlots",s.name AS "serviceName",p.full_name AS "professionalName",r.name AS "roomName",g.active,g.created_at AS "createdAt",count(e.id) FILTER (WHERE e.status='active') AS "activeEnrollments",count(e.id) FILTER (WHERE e.status='waitlisted') AS "waitlistCount" FROM group_classes g JOIN services s ON s.id=g.service_id JOIN professionals p ON p.id=g.professional_id JOIN rooms r ON r.id=g.room_id LEFT JOIN group_enrollments e ON e.group_id=g.id WHERE g.clinic_id=$1 GROUP BY g.id,s.name,p.full_name,r.name ORDER BY g.name`,
          [clinicId],
        ),
        this.pool.query<GroupEnrollmentRow>(
          `SELECT e.id,e.clinic_id AS "clinicId",e.group_id AS "groupId",e.patient_id AS "patientId",p.full_name AS "patientName",e.status,e.queue_position AS "queuePosition",e.enrolled_at AS "enrolledAt",e.updated_at AS "updatedAt" FROM group_enrollments e JOIN patients p ON p.id=e.patient_id WHERE e.clinic_id=$1 ORDER BY e.enrolled_at`,
          [clinicId],
        ),
        this.pool.query<GroupSessionRow>(
          `SELECT ${groupSessionColumns},count(ga.id) AS "attendanceCount" FROM group_sessions gs JOIN group_classes g ON g.id=gs.group_id JOIN professionals p ON p.id=g.professional_id JOIN rooms r ON r.id=g.room_id LEFT JOIN group_attendance ga ON ga.session_id=gs.id WHERE gs.clinic_id=$1 AND gs.starts_at<$3 AND gs.ends_at>$2 GROUP BY gs.id,g.id,p.full_name,r.name ORDER BY gs.starts_at`,
          [clinicId, from, to],
        ),
        this.pool.query<GroupAttendanceRow>(
          `SELECT ga.id,ga.clinic_id AS "clinicId",ga.session_id AS "sessionId",ga.patient_id AS "patientId",p.full_name AS "patientName",ga.status,ga.notes,ga.recorded_at AS "recordedAt" FROM group_attendance ga JOIN patients p ON p.id=ga.patient_id JOIN group_sessions gs ON gs.id=ga.session_id WHERE ga.clinic_id=$1 AND gs.starts_at<$3 AND gs.ends_at>$2 ORDER BY ga.recorded_at`,
          [clinicId, from, to],
        ),
        this.pool.query<ReplacementCreditRow>(
          `SELECT rc.id,rc.clinic_id AS "clinicId",rc.patient_id AS "patientId",p.full_name AS "patientName",rc.source_session_id AS "sourceSessionId",rc.status,rc.used_session_id AS "usedSessionId",rc.created_at AS "createdAt",rc.used_at AS "usedAt" FROM replacement_credits rc JOIN patients p ON p.id=rc.patient_id WHERE rc.clinic_id=$1 ORDER BY rc.created_at DESC`,
          [clinicId],
        ),
      ]);
    return {
      groups: groups.rows.map(mapGroupClass),
      enrollments: enrollments.rows.map(mapGroupEnrollment),
      sessions: sessions.rows.map(mapGroupSession),
      attendance: attendance.rows.map(mapGroupAttendance),
      replacementCredits: credits.rows.map(mapReplacementCredit),
    };
  }

  async createGroupClass(clinicId: string, input: GroupClassInput) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const related = await client.query<{
        serviceName: string;
        professionalName: string;
        roomName: string;
        roomCapacity: number;
      }>(
        `SELECT s.name AS "serviceName",p.full_name AS "professionalName",r.name AS "roomName",r.capacity AS "roomCapacity" FROM services s,professionals p,rooms r WHERE s.id=$2 AND s.clinic_id=$1 AND s.active AND p.id=$3 AND p.clinic_id=$1 AND p.active AND r.id=$4 AND r.clinic_id=$1 AND r.active FOR UPDATE OF s`,
        [clinicId, input.serviceId, input.professionalId, input.roomId],
      );
      const names = related.rows[0];
      if (!names)
        throw new DomainError(
          "GROUP_RELATED_RECORD_NOT_FOUND",
          "Serviço, profissional ou sala não encontrado.",
          404,
        );
      if (input.capacity > names.roomCapacity)
        throw new DomainError(
          "GROUP_EXCEEDS_ROOM_CAPACITY",
          "A capacidade da turma excede a capacidade da sala.",
          409,
        );
      await this.assertGroupScheduleAvailable(client, clinicId, input);
      // O lock no serviço serializa a escolha da próxima letra entre criações simultâneas.
      const next = await client.query<{ sequence: number }>(
        `SELECT coalesce(max(sequence),0)+1 AS sequence FROM group_classes WHERE clinic_id=$1 AND service_id=$2`,
        [clinicId, input.serviceId],
      );
      const sequence = next.rows[0]!.sequence;
      const name = groupClassName(names.serviceName, sequence);
      const result = await client.query<{ id: string; createdAt: Date }>(
        `INSERT INTO group_classes(clinic_id,name,sequence,service_id,professional_id,room_id,capacity,weekly_slots) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb) RETURNING id,created_at AS "createdAt"`,
        [
          clinicId,
          name,
          sequence,
          input.serviceId,
          input.professionalId,
          input.roomId,
          input.capacity,
          JSON.stringify(input.weeklySlots),
        ],
      );
      await this.ensureGroupSessions(client, clinicId, groupSessionHorizon(), {
        groupId: result.rows[0]!.id,
      });
      await client.query("COMMIT");
      return {
        ...input,
        id: result.rows[0]!.id,
        clinicId,
        name,
        sequence,
        serviceName: names.serviceName,
        professionalName: names.professionalName,
        roomName: names.roomName,
        activeEnrollments: 0,
        waitlistCount: 0,
        active: true,
        createdAt: result.rows[0]!.createdAt.toISOString(),
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async updateGroupClass(clinicId: string, groupId: string, input: GroupClassUpdateInput) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query<{ roomCapacity: number; activeEnrollments: string; professionalId: string; roomId: string }>(
        `SELECT r.capacity AS "roomCapacity",(SELECT count(*) FROM group_enrollments e WHERE e.group_id=g.id AND e.status='active') AS "activeEnrollments",g.professional_id AS "professionalId",g.room_id AS "roomId" FROM group_classes g JOIN rooms r ON r.id=g.room_id WHERE g.clinic_id=$1 AND g.id=$2 FOR UPDATE OF g`,
        [clinicId, groupId],
      );
      const current = result.rows[0];
      if (!current) { await client.query("ROLLBACK"); return null; }
      if (input.capacity > current.roomCapacity)
        throw new DomainError("GROUP_EXCEEDS_ROOM_CAPACITY", "A capacidade da turma excede a capacidade da sala.", 409);
      const activeCount = Number(current.activeEnrollments);
      if (input.capacity < activeCount)
        throw new DomainError("GROUP_BELOW_ENROLLMENTS", "A capacidade não pode ser menor que o número de matrículas ativas.", 409);
      await this.assertGroupScheduleAvailable(client, clinicId, {
        id: groupId,
        professionalId: current.professionalId,
        roomId: current.roomId,
        weeklySlots: input.weeklySlots,
      });
      await client.query(
        `UPDATE group_classes SET capacity=$3,weekly_slots=$4::jsonb,sessions_generated_until=NULL,updated_at=now() WHERE clinic_id=$1 AND id=$2`,
        [clinicId, groupId, input.capacity, JSON.stringify(input.weeklySlots)],
      );
      // Refaz a agenda futura: encontros sem presença nem reposição saem e são gerados de novo
      // com os horários atuais; os que já têm registros ficam como estão.
      await client.query(
        `DELETE FROM group_sessions gs WHERE gs.clinic_id=$1 AND gs.group_id=$2 AND gs.starts_at>now() AND gs.status='scheduled' AND NOT EXISTS (SELECT 1 FROM group_attendance ga WHERE ga.session_id=gs.id) AND NOT EXISTS (SELECT 1 FROM replacement_credits rc WHERE rc.source_session_id=gs.id OR rc.used_session_id=gs.id)`,
        [clinicId, groupId],
      );
      await this.ensureGroupSessions(client, clinicId, groupSessionHorizon(), { groupId });
      if (input.capacity > activeCount) {
        await client.query(
          `WITH waiting AS (SELECT id FROM group_enrollments WHERE clinic_id=$1 AND group_id=$2 AND status='waitlisted' ORDER BY queue_position,enrolled_at LIMIT $3) UPDATE group_enrollments e SET status='active',queue_position=NULL,updated_at=now() FROM waiting WHERE e.id=waiting.id`,
          [clinicId, groupId, input.capacity - activeCount],
        );
      }
      await client.query(
        `WITH ordered AS (SELECT id,row_number() OVER (ORDER BY queue_position,enrolled_at) AS position FROM group_enrollments WHERE clinic_id=$1 AND group_id=$2 AND status='waitlisted') UPDATE group_enrollments e SET queue_position=ordered.position FROM ordered WHERE e.id=ordered.id`,
        [clinicId, groupId],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    const updated = await this.pool.query<GroupClassRow>(
      `SELECT g.id,g.clinic_id AS "clinicId",g.name,g.sequence,g.service_id AS "serviceId",g.professional_id AS "professionalId",g.room_id AS "roomId",g.capacity,g.weekly_slots AS "weeklySlots",s.name AS "serviceName",p.full_name AS "professionalName",r.name AS "roomName",g.active,g.created_at AS "createdAt",count(e.id) FILTER (WHERE e.status='active') AS "activeEnrollments",count(e.id) FILTER (WHERE e.status='waitlisted') AS "waitlistCount" FROM group_classes g JOIN services s ON s.id=g.service_id JOIN professionals p ON p.id=g.professional_id JOIN rooms r ON r.id=g.room_id LEFT JOIN group_enrollments e ON e.group_id=g.id WHERE g.clinic_id=$1 AND g.id=$2 GROUP BY g.id,s.name,p.full_name,r.name`,
      [clinicId, groupId],
    );
    return updated.rows[0] ? mapGroupClass(updated.rows[0]) : null;
  }

  async createGroupEnrollment(clinicId: string, input: GroupEnrollmentInput) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const group = await client.query<{ capacity: number }>(
        `SELECT capacity FROM group_classes WHERE id=$2 AND clinic_id=$1 AND active FOR UPDATE`,
        [clinicId, input.groupId],
      );
      const patient = await client.query<{ fullName: string }>(
        `SELECT full_name AS "fullName" FROM patients WHERE id=$2 AND clinic_id=$1 AND status='active'`,
        [clinicId, input.patientId],
      );
      if (!group.rows[0] || !patient.rows[0])
        throw new DomainError(
          "GROUP_OR_PATIENT_NOT_FOUND",
          "Turma ou cliente ativo não encontrado.",
          404,
        );
      const counts = await client.query<{
        activeCount: string;
        maxQueue: number | null;
      }>(
        `SELECT count(*) FILTER(WHERE status='active') AS "activeCount",max(queue_position) FILTER(WHERE status='waitlisted') AS "maxQueue" FROM group_enrollments WHERE group_id=$1`,
        [input.groupId],
      );
      const status: GroupEnrollment["status"] =
        Number(counts.rows[0]!.activeCount) < group.rows[0].capacity
          ? "active"
          : "waitlisted";
      const result = await client.query<GroupEnrollmentRow>(
        `INSERT INTO group_enrollments(clinic_id,group_id,patient_id,status,queue_position) VALUES($1,$2,$3,$4,$5) RETURNING id,clinic_id AS "clinicId",group_id AS "groupId",patient_id AS "patientId",$6::text AS "patientName",status,queue_position AS "queuePosition",enrolled_at AS "enrolledAt",updated_at AS "updatedAt"`,
        [
          clinicId,
          input.groupId,
          input.patientId,
          status,
          status === "waitlisted" ? (counts.rows[0]!.maxQueue ?? 0) + 1 : null,
          patient.rows[0].fullName,
        ],
      );
      await client.query("COMMIT");
      return mapGroupEnrollment(result.rows[0]!);
    } catch (error) {
      await client.query("ROLLBACK");
      if (hasDatabaseCode(error, "23505"))
        throw new DomainError(
          "GROUP_ENROLLMENT_EXISTS",
          "O cliente já está matriculado ou na lista de espera.",
          409,
        );
      throw error;
    } finally {
      client.release();
    }
  }

  async cancelGroupEnrollment(clinicId: string, enrollmentId: string) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const current = await client.query<GroupEnrollmentRow>(
        `SELECT e.id,e.clinic_id AS "clinicId",e.group_id AS "groupId",e.patient_id AS "patientId",p.full_name AS "patientName",e.status,e.queue_position AS "queuePosition",e.enrolled_at AS "enrolledAt",e.updated_at AS "updatedAt" FROM group_enrollments e JOIN patients p ON p.id=e.patient_id WHERE e.id=$2 AND e.clinic_id=$1 FOR UPDATE OF e`,
        [clinicId, enrollmentId],
      );
      const row = current.rows[0];
      if (!row) {
        await client.query("ROLLBACK");
        return null;
      }
      await client.query(
        `UPDATE group_enrollments SET status='cancelled',queue_position=NULL,updated_at=now() WHERE id=$1`,
        [enrollmentId],
      );
      if (row.status === "active")
        await client.query(
          `UPDATE group_enrollments SET status='active',queue_position=NULL,updated_at=now() WHERE id=(SELECT id FROM group_enrollments WHERE group_id=$1 AND status='waitlisted' ORDER BY queue_position,enrolled_at FOR UPDATE SKIP LOCKED LIMIT 1)`,
          [row.groupId],
        );
      await client.query(
        `WITH ranked AS(SELECT id,row_number() OVER(ORDER BY queue_position,enrolled_at) AS position FROM group_enrollments WHERE group_id=$1 AND status='waitlisted') UPDATE group_enrollments e SET queue_position=ranked.position FROM ranked WHERE e.id=ranked.id`,
        [row.groupId],
      );
      const updated = await client.query<GroupEnrollmentRow>(
        `SELECT e.id,e.clinic_id AS "clinicId",e.group_id AS "groupId",e.patient_id AS "patientId",p.full_name AS "patientName",e.status,e.queue_position AS "queuePosition",e.enrolled_at AS "enrolledAt",e.updated_at AS "updatedAt" FROM group_enrollments e JOIN patients p ON p.id=e.patient_id WHERE e.id=$1`,
        [enrollmentId],
      );
      await client.query("COMMIT");
      return mapGroupEnrollment(updated.rows[0]!);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async listGroupSessions(clinicId: string, from: string, to: string) {
    await this.ensureGroupSessionsUntil(clinicId, clampGroupSessionUntil(new Date(to)));
    const result = await this.pool.query<GroupSessionRow>(
      `SELECT ${groupSessionColumns},(SELECT count(*) FROM group_attendance ga WHERE ga.session_id=gs.id) AS "attendanceCount" FROM group_sessions gs JOIN group_classes g ON g.id=gs.group_id JOIN professionals p ON p.id=g.professional_id JOIN rooms r ON r.id=g.room_id WHERE gs.clinic_id=$1 AND gs.status<>'cancelled' AND gs.starts_at<$3 AND gs.ends_at>$2 ORDER BY gs.starts_at`,
      [clinicId, from, to],
    );
    return result.rows.map(mapGroupSession);
  }

  private async ensureGroupSessionsUntil(clinicId: string, until: Date) {
    // Só renova quando falta menos de uma semana para o fim do período reservado.
    const renewBefore = new Date(until.getTime() - 7 * 86_400_000);
    const pending = await this.pool.query(
      `SELECT 1 FROM group_classes WHERE clinic_id=$1 AND active AND (sessions_generated_until IS NULL OR sessions_generated_until<$2) LIMIT 1`,
      [clinicId, renewBefore],
    );
    if (!pending.rowCount) return;
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await this.ensureGroupSessions(client, clinicId, until, { renewBefore });
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  // Reserva na agenda os encontros das turmas ativas até `until`. Datas que já estiverem
  // ocupadas por atendimento, bloqueio ou outra turma ficam de fora.
  private async ensureGroupSessions(
    client: PoolClient,
    clinicId: string,
    until: Date,
    options: { groupId?: string; renewBefore?: Date } = {},
  ) {
    const groups = await client.query<{
      id: string;
      professionalId: string;
      roomId: string;
      weeklySlots: GroupClassInput["weeklySlots"];
      generatedUntil: Date | null;
      timezone: string;
    }>(
      `SELECT g.id,g.professional_id AS "professionalId",g.room_id AS "roomId",g.weekly_slots AS "weeklySlots",g.sessions_generated_until AS "generatedUntil",c.timezone FROM group_classes g JOIN clinics c ON c.id=g.clinic_id WHERE g.clinic_id=$1 AND g.active AND ($2::uuid IS NULL OR g.id=$2) AND (g.sessions_generated_until IS NULL OR g.sessions_generated_until<$3) ORDER BY g.created_at FOR UPDATE OF g`,
      [clinicId, options.groupId ?? null, options.renewBefore ?? until],
    );
    const now = new Date();
    for (const group of groups.rows) {
      const after = group.generatedUntil && group.generatedUntil > now ? group.generatedUntil : now;
      const occurrences = weeklyOccurrences(group.weeklySlots, group.timezone, after, until);
      if (occurrences.length)
        await client.query(
          `INSERT INTO group_sessions(clinic_id,group_id,starts_at,ends_at) SELECT $1,$2,o.starts_at,o.ends_at FROM jsonb_to_recordset($5::jsonb) AS o(starts_at timestamptz,ends_at timestamptz) WHERE NOT EXISTS (SELECT 1 FROM appointments a WHERE a.clinic_id=$1 AND a.status<>'cancelled' AND (a.professional_id=$3 OR a.room_id=$4) AND a.starts_at<o.ends_at AND a.ends_at>o.starts_at) AND NOT EXISTS (SELECT 1 FROM schedule_blocks b WHERE b.clinic_id=$1 AND b.status='active' AND (b.professional_id=$3 OR b.room_id=$4) AND b.starts_at<o.ends_at AND b.ends_at>o.starts_at) AND NOT EXISTS (SELECT 1 FROM group_sessions gs JOIN group_classes og ON og.id=gs.group_id WHERE gs.clinic_id=$1 AND gs.status<>'cancelled' AND (og.professional_id=$3 OR og.room_id=$4) AND gs.starts_at<o.ends_at AND gs.ends_at>o.starts_at) ON CONFLICT (group_id,starts_at) DO NOTHING`,
          [
            clinicId,
            group.id,
            group.professionalId,
            group.roomId,
            JSON.stringify(occurrences.map((item) => ({ starts_at: item.startsAt.toISOString(), ends_at: item.endsAt.toISOString() }))),
          ],
        );
      await client.query(`UPDATE group_classes SET sessions_generated_until=$2 WHERE id=$1`, [group.id, until]);
    }
  }

  // Impede salvar uma turma cujos horários fixos batem com atendimentos futuros ou com outra
  // turma do mesmo profissional ou sala.
  private async assertGroupScheduleAvailable(
    client: PoolClient,
    clinicId: string,
    group: { id?: string; professionalId: string; roomId: string; weeklySlots: GroupClassInput["weeklySlots"] },
  ) {
    const clinic = await client.query<{ timezone: string }>(`SELECT timezone FROM clinics WHERE id=$1`, [clinicId]);
    const busy = await client.query<{ startsAt: Date; endsAt: Date; label: string }>(
      `SELECT a.starts_at AS "startsAt",a.ends_at AS "endsAt",'Atendimento de ' || pt.full_name AS label FROM appointments a JOIN patients pt ON pt.id=a.patient_id WHERE a.clinic_id=$1 AND a.status<>'cancelled' AND a.ends_at>now() AND (a.professional_id=$2 OR a.room_id=$3)
       UNION ALL
       SELECT gs.starts_at,gs.ends_at,g.name FROM group_sessions gs JOIN group_classes g ON g.id=gs.group_id WHERE gs.clinic_id=$1 AND gs.status<>'cancelled' AND gs.ends_at>now() AND ($4::uuid IS NULL OR gs.group_id<>$4) AND (g.professional_id=$2 OR g.room_id=$3)`,
      [clinicId, group.professionalId, group.roomId, group.id ?? null],
    );
    const patterns = await client.query<{ label: string; slots: GroupClassInput["weeklySlots"] }>(
      `SELECT name AS label,weekly_slots AS slots FROM group_classes WHERE clinic_id=$1 AND active AND ($4::uuid IS NULL OR id<>$4) AND (professional_id=$2 OR room_id=$3)`,
      [clinicId, group.professionalId, group.roomId, group.id ?? null],
    );
    const conflicts = findWeeklyScheduleConflicts(
      group.weeklySlots,
      clinic.rows[0]?.timezone ?? "America/Sao_Paulo",
      busy.rows,
      patterns.rows,
    );
    if (conflicts.length)
      throw new DomainError("GROUP_SCHEDULE_CONFLICT", groupScheduleConflictMessage(conflicts), 409);
  }

  async recordGroupAttendance(
    clinicId: string,
    actorUserId: string,
    sessionId: string,
    patientId: string,
    input: GroupAttendanceInput,
  ) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const allowed = await client.query<{ patientName: string }>(
        `SELECT p.full_name AS "patientName" FROM group_sessions gs JOIN group_enrollments e ON e.group_id=gs.group_id AND e.patient_id=$3 JOIN patients p ON p.id=e.patient_id WHERE gs.id=$2 AND gs.clinic_id=$1 AND gs.status<>'cancelled' AND e.status='active' FOR UPDATE OF gs`,
        [clinicId, sessionId, patientId],
      );
      if (!allowed.rows[0])
        throw new DomainError(
          "GROUP_ATTENDANCE_NOT_ALLOWED",
          "Sessão ou matrícula ativa não encontrada.",
          404,
        );
      const creditResult = await client.query<ReplacementCreditRow>(
        `SELECT rc.id,rc.clinic_id AS "clinicId",rc.patient_id AS "patientId",p.full_name AS "patientName",rc.source_session_id AS "sourceSessionId",rc.status,rc.used_session_id AS "usedSessionId",rc.created_at AS "createdAt",rc.used_at AS "usedAt" FROM replacement_credits rc JOIN patients p ON p.id=rc.patient_id WHERE rc.source_session_id=$1 AND rc.patient_id=$2 FOR UPDATE OF rc`,
        [sessionId, patientId],
      );
      const credit = creditResult.rows[0];
      if (credit?.status === "used" && input.status !== "excused_absence")
        throw new DomainError(
          "REPLACEMENT_ALREADY_USED",
          "A reposição desta falta já foi utilizada.",
          409,
        );
      const attendance = await client.query<GroupAttendanceRow>(
        `INSERT INTO group_attendance(clinic_id,session_id,patient_id,status,notes,recorded_by_user_id) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(session_id,patient_id) DO UPDATE SET status=EXCLUDED.status,notes=EXCLUDED.notes,recorded_by_user_id=EXCLUDED.recorded_by_user_id,recorded_at=now() RETURNING id,clinic_id AS "clinicId",session_id AS "sessionId",patient_id AS "patientId",$7::text AS "patientName",status,notes,recorded_at AS "recordedAt"`,
        [
          clinicId,
          sessionId,
          patientId,
          input.status,
          input.notes || null,
          actorUserId,
          allowed.rows[0].patientName,
        ],
      );
      if (input.status === "excused_absence" && !credit)
        await client.query(
          `INSERT INTO replacement_credits(clinic_id,patient_id,source_session_id) VALUES($1,$2,$3)`,
          [clinicId, patientId, sessionId],
        );
      else if (
        input.status !== "excused_absence" &&
        credit?.status === "available"
      )
        await client.query(
          `UPDATE replacement_credits SET status='cancelled' WHERE id=$1`,
          [credit.id],
        );
      await client.query("COMMIT");
      return mapGroupAttendance(attendance.rows[0]!);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async completeGroupSession(clinicId: string, sessionId: string) {
    const result = await this.pool.query<GroupSessionRow>(
      `UPDATE group_sessions gs SET status='completed',updated_at=now() FROM group_classes g,professionals p,rooms r WHERE gs.id=$2 AND gs.clinic_id=$1 AND gs.status<>'cancelled' AND g.id=gs.group_id AND p.id=g.professional_id AND r.id=g.room_id RETURNING ${groupSessionColumns},(SELECT count(*) FROM group_attendance ga WHERE ga.session_id=gs.id) AS "attendanceCount"`,
      [clinicId, sessionId],
    );
    return result.rows[0] ? mapGroupSession(result.rows[0]) : null;
  }

  async bookReplacement(
    clinicId: string,
    actorUserId: string,
    input: ReplacementBookingInput,
  ) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const creditResult = await client.query<ReplacementCreditRow>(
        `SELECT rc.id,rc.clinic_id AS "clinicId",rc.patient_id AS "patientId",p.full_name AS "patientName",rc.source_session_id AS "sourceSessionId",rc.status,rc.used_session_id AS "usedSessionId",rc.created_at AS "createdAt",rc.used_at AS "usedAt" FROM replacement_credits rc JOIN patients p ON p.id=rc.patient_id WHERE rc.id=$2 AND rc.clinic_id=$1 FOR UPDATE OF rc`,
        [clinicId, input.creditId],
      );
      const sessionResult = await client.query<{
        groupId: string;
        capacity: number;
        status: GroupSession["status"];
      }>(
        `SELECT gs.group_id AS "groupId",g.capacity,gs.status FROM group_sessions gs JOIN group_classes g ON g.id=gs.group_id WHERE gs.id=$2 AND gs.clinic_id=$1 FOR UPDATE OF gs`,
        [clinicId, input.sessionId],
      );
      const credit = creditResult.rows[0],
        session = sessionResult.rows[0];
      if (
        !credit ||
        credit.status !== "available" ||
        !session ||
        session.status !== "scheduled"
      )
        throw new DomainError(
          "REPLACEMENT_NOT_AVAILABLE",
          "Crédito ou sessão de reposição indisponível.",
          409,
        );
      const seats = await client.query<{
        regular: string;
        replacements: string;
        patientIsRegular: boolean;
      }>(
        `SELECT(SELECT count(*) FROM group_enrollments WHERE group_id=$1 AND status='active') AS regular,(SELECT count(*) FROM group_attendance WHERE session_id=$2 AND status='replacement') AS replacements,EXISTS(SELECT 1 FROM group_enrollments WHERE group_id=$1 AND patient_id=$3 AND status='active') AS "patientIsRegular"`,
        [session.groupId, input.sessionId, credit.patientId],
      );
      const occupancy = seats.rows[0]!;
      if (
        !occupancy.patientIsRegular &&
        Number(occupancy.regular) + Number(occupancy.replacements) >=
          session.capacity
      )
        throw new DomainError(
          "GROUP_SESSION_FULL",
          "A sessão está lotada.",
          409,
        );
      let attendance: GroupAttendanceRow;
      try {
        attendance = (
          await client.query<GroupAttendanceRow>(
            `INSERT INTO group_attendance(clinic_id,session_id,patient_id,status,recorded_by_user_id) VALUES($1,$2,$3,'replacement',$4) RETURNING id,clinic_id AS "clinicId",session_id AS "sessionId",patient_id AS "patientId",$5::text AS "patientName",status,notes,recorded_at AS "recordedAt"`,
            [
              clinicId,
              input.sessionId,
              credit.patientId,
              actorUserId,
              credit.patientName,
            ],
          )
        ).rows[0]!;
      } catch (error) {
        if (hasDatabaseCode(error, "23505"))
          throw new DomainError(
            "REPLACEMENT_DUPLICATE_ATTENDANCE",
            "O cliente já possui presença registrada nesta sessão.",
            409,
          );
        throw error;
      }
      const updated = await client.query<ReplacementCreditRow>(
        `UPDATE replacement_credits SET status='used',used_session_id=$2,used_at=now() WHERE id=$1 RETURNING id,clinic_id AS "clinicId",patient_id AS "patientId",$3::text AS "patientName",source_session_id AS "sourceSessionId",status,used_session_id AS "usedSessionId",created_at AS "createdAt",used_at AS "usedAt"`,
        [credit.id, input.sessionId, credit.patientName],
      );
      await client.query("COMMIT");
      return {
        attendance: mapGroupAttendance(attendance),
        credit: mapReplacementCredit(updated.rows[0]!),
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async getInventoryWorkspace(clinicId: string): Promise<InventoryWorkspace> {
    const [productsResult, movementsResult, tabsResult, itemsResult] =
      await Promise.all([
        this.pool.query<ProductRow>(
          `SELECT id,clinic_id AS "clinicId",name,sku,unit,cost_in_cents AS "costInCents",sale_price_in_cents AS "salePriceInCents",current_stock AS "currentStock",minimum_stock AS "minimumStock",active,created_at AS "createdAt",updated_at AS "updatedAt" FROM products WHERE clinic_id=$1 ORDER BY name`,
          [clinicId],
        ),
        this.pool.query<StockMovementRow>(
          `SELECT sm.id,sm.clinic_id AS "clinicId",sm.product_id AS "productId",p.name AS "productName",sm.kind,sm.quantity,sm.balance_after AS "balanceAfter",sm.notes,sm.patient_tab_id AS "patientTabId",sm.created_at AS "createdAt" FROM stock_movements sm JOIN products p ON p.id=sm.product_id WHERE sm.clinic_id=$1 ORDER BY sm.created_at DESC LIMIT 500`,
          [clinicId],
        ),
        this.pool.query<PatientTabRow>(
          `SELECT t.id,t.clinic_id AS "clinicId",t.patient_id AS "patientId",p.full_name AS "patientName",t.notes,t.status,t.payment_status AS "paymentStatus",t.total_in_cents AS "totalInCents",t.receivable_id AS "receivableId",t.opened_at AS "openedAt",t.closed_at AS "closedAt",t.cancelled_at AS "cancelledAt" FROM patient_tabs t JOIN patients p ON p.id=t.patient_id WHERE t.clinic_id=$1 ORDER BY t.opened_at DESC`,
          [clinicId],
        ),
        this.pool.query<PatientTabItemRow>(
          `SELECT i.id,i.tab_id AS "tabId",i.product_id AS "productId",p.name AS "productName",i.quantity,i.unit_price_in_cents AS "unitPriceInCents",i.unit_cost_in_cents AS "unitCostInCents" FROM patient_tab_items i JOIN products p ON p.id=i.product_id WHERE i.clinic_id=$1 ORDER BY i.created_at`,
          [clinicId],
        ),
      ]);
    const products = productsResult.rows.map(mapProduct);
    const tabs = tabsResult.rows.map((row) =>
      mapPatientTab(
        row,
        itemsResult.rows
          .filter((item) => item.tabId === row.id)
          .map(mapPatientTabItem),
      ),
    );
    return {
      products,
      movements: movementsResult.rows.map(mapStockMovement),
      tabs,
      lowStockCount: products.filter((item) => item.lowStock).length,
      inventoryCostInCents: products.reduce(
        (sum, item) => sum + item.currentStock * item.costInCents,
        0,
      ),
      openTabsInCents: tabs
        .filter((item) => item.status === "open")
        .reduce((sum, item) => sum + item.totalInCents, 0),
    };
  }

  async createProduct(
    clinicId: string,
    actorUserId: string,
    input: ProductInput,
  ) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query<ProductRow>(
        `INSERT INTO products(clinic_id,name,sku,unit,cost_in_cents,sale_price_in_cents,current_stock,minimum_stock) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,clinic_id AS "clinicId",name,sku,unit,cost_in_cents AS "costInCents",sale_price_in_cents AS "salePriceInCents",current_stock AS "currentStock",minimum_stock AS "minimumStock",active,created_at AS "createdAt",updated_at AS "updatedAt"`,
        [
          clinicId,
          input.name,
          input.sku,
          input.unit,
          input.costInCents,
          input.salePriceInCents,
          input.initialStock,
          input.minimumStock,
        ],
      );
      const product = result.rows[0]!;
      if (input.initialStock > 0)
        await client.query(
          `INSERT INTO stock_movements(clinic_id,product_id,kind,quantity,balance_after,notes,actor_user_id) VALUES($1,$2,'initial_stock',$3,$3,'Estoque inicial',$4)`,
          [clinicId, product.id, input.initialStock, actorUserId],
        );
      await client.query("COMMIT");
      return mapProduct(product);
    } catch (error) {
      await client.query("ROLLBACK");
      if (hasDatabaseCode(error, "23505"))
        throw new DomainError(
          "PRODUCT_SKU_EXISTS",
          "Já existe um produto com este SKU.",
          409,
        );
      throw error;
    } finally {
      client.release();
    }
  }

  async createStockMovement(
    clinicId: string,
    actorUserId: string,
    input: StockMovementInput,
  ) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const product = await client.query<ProductRow>(
        `SELECT id,clinic_id AS "clinicId",name,sku,unit,cost_in_cents AS "costInCents",sale_price_in_cents AS "salePriceInCents",current_stock AS "currentStock",minimum_stock AS "minimumStock",active,created_at AS "createdAt",updated_at AS "updatedAt" FROM products WHERE id=$2 AND clinic_id=$1 FOR UPDATE`,
        [clinicId, input.productId],
      );
      const row = product.rows[0];
      if (!row)
        throw new DomainError(
          "PRODUCT_NOT_FOUND",
          "Produto não encontrado.",
          404,
        );
      const quantity = ["adjustment_out", "loss"].includes(input.kind)
        ? -input.quantity
        : input.quantity;
      const balance = row.currentStock + quantity;
      if (balance < 0)
        throw new DomainError(
          "INSUFFICIENT_STOCK",
          "O estoque disponível é insuficiente.",
          409,
        );
      await client.query(
        `UPDATE products SET current_stock=$2,updated_at=now() WHERE id=$1`,
        [row.id, balance],
      );
      const movement = await client.query<StockMovementRow>(
        `INSERT INTO stock_movements(clinic_id,product_id,kind,quantity,balance_after,notes,actor_user_id) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id,clinic_id AS "clinicId",product_id AS "productId",$8::text AS "productName",kind,quantity,balance_after AS "balanceAfter",notes,patient_tab_id AS "patientTabId",created_at AS "createdAt"`,
        [
          clinicId,
          row.id,
          input.kind,
          quantity,
          balance,
          input.notes,
          actorUserId,
          row.name,
        ],
      );
      await client.query("COMMIT");
      return mapStockMovement(movement.rows[0]!);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async openPatientTab(
    clinicId: string,
    actorUserId: string,
    input: PatientTabInput,
  ) {
    const result = await this.pool.query<{ id: string }>(
      `INSERT INTO patient_tabs(clinic_id,patient_id,notes,opened_by_user_id) SELECT $1,p.id,$3,$4 FROM patients p WHERE p.id=$2 AND p.clinic_id=$1 AND p.status='active' RETURNING id`,
      [clinicId, input.patientId, input.notes || null, actorUserId],
    );
    if (!result.rows[0])
      throw new DomainError(
        "PATIENT_NOT_FOUND",
        "Cliente não encontrado.",
        404,
      );
    return (await this.findPatientTab(clinicId, result.rows[0].id))!;
  }

  async addPatientTabItem(
    clinicId: string,
    actorUserId: string,
    tabId: string,
    input: PatientTabItemInput,
  ) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const tab = await client.query<{ patientName: string; status: string }>(
        `SELECT p.full_name AS "patientName",t.status FROM patient_tabs t JOIN patients p ON p.id=t.patient_id WHERE t.id=$2 AND t.clinic_id=$1 FOR UPDATE OF t`,
        [clinicId, tabId],
      );
      if (!tab.rows[0]) {
        await client.query("ROLLBACK");
        return null;
      }
      if (tab.rows[0].status !== "open")
        throw new DomainError(
          "PATIENT_TAB_NOT_OPEN",
          "Somente comandas abertas podem receber itens.",
          409,
        );
      const product = await client.query<{
        id: string;
        name: string;
        currentStock: number;
        salePriceInCents: number;
        costInCents: number;
      }>(
        `SELECT id,name,current_stock AS "currentStock",sale_price_in_cents AS "salePriceInCents",cost_in_cents AS "costInCents" FROM products WHERE id=$2 AND clinic_id=$1 AND active FOR UPDATE`,
        [clinicId, input.productId],
      );
      const productRow = product.rows[0];
      if (!productRow)
        throw new DomainError(
          "PRODUCT_NOT_FOUND",
          "Produto não encontrado.",
          404,
        );
      if (productRow.currentStock < input.quantity)
        throw new DomainError(
          "INSUFFICIENT_STOCK",
          "O estoque disponível é insuficiente.",
          409,
        );
      await client.query(
        `INSERT INTO patient_tab_items(clinic_id,tab_id,product_id,quantity,unit_price_in_cents,unit_cost_in_cents) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(tab_id,product_id) DO UPDATE SET quantity=patient_tab_items.quantity+EXCLUDED.quantity`,
        [
          clinicId,
          tabId,
          productRow.id,
          input.quantity,
          productRow.salePriceInCents,
          productRow.costInCents,
        ],
      );
      const balance = productRow.currentStock - input.quantity;
      await client.query(
        `UPDATE products SET current_stock=$2,updated_at=now() WHERE id=$1`,
        [productRow.id, balance],
      );
      await client.query(
        `INSERT INTO stock_movements(clinic_id,product_id,patient_tab_id,kind,quantity,balance_after,notes,actor_user_id) VALUES($1,$2,$3,'sale',$4,$5,$6,$7)`,
        [
          clinicId,
          productRow.id,
          tabId,
          -input.quantity,
          balance,
          `Reserva na comanda de ${tab.rows[0].patientName}`,
          actorUserId,
        ],
      );
      await client.query(
        `UPDATE patient_tabs SET total_in_cents=(SELECT coalesce(sum(quantity*unit_price_in_cents),0) FROM patient_tab_items WHERE tab_id=$1) WHERE id=$1`,
        [tabId],
      );
      const updated = await this.findPatientTab(clinicId, tabId, client);
      await client.query("COMMIT");
      return updated;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async closePatientTab(
    clinicId: string,
    actorUserId: string,
    tabId: string,
    input: PatientTabCloseInput,
  ) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const tab = await client.query<{
        patientId: string;
        status: string;
        totalInCents: number;
      }>(
        `SELECT patient_id AS "patientId",status,total_in_cents AS "totalInCents" FROM patient_tabs WHERE id=$2 AND clinic_id=$1 FOR UPDATE`,
        [clinicId, tabId],
      );
      const row = tab.rows[0];
      if (!row) {
        await client.query("ROLLBACK");
        return null;
      }
      if (row.status !== "open" || row.totalInCents === 0)
        throw new DomainError(
          "PATIENT_TAB_CANNOT_CLOSE",
          "A comanda precisa estar aberta e conter ao menos um item.",
          409,
        );
      const paid = input.settlement === "paid";
      const receivable = await client.query<{ id: string }>(
        `INSERT INTO receivables(clinic_id,patient_id,description,installment_number,installment_count,due_date,amount_in_cents,status,paid_at,payment_method) VALUES($1,$2,$3,1,1,$4,$5,$6,$7,$8) RETURNING id`,
        [
          clinicId,
          row.patientId,
          `Comanda ${tabId.slice(0, 8).toUpperCase()}`,
          input.dueDate,
          row.totalInCents,
          paid ? "paid" : "open",
          paid ? new Date() : null,
          paid ? input.paymentMethod : null,
        ],
      );
      const receivableId = receivable.rows[0]!.id;
      await client.query(
        `INSERT INTO financial_events(clinic_id,receivable_id,actor_user_id,kind,amount_in_cents,metadata) VALUES($1,$2,$3,'created',$4,$5)`,
        [
          clinicId,
          receivableId,
          actorUserId,
          row.totalInCents,
          JSON.stringify({ source: "patient_tab", tabId }),
        ],
      );
      if (paid)
        await client.query(
          `INSERT INTO financial_events(clinic_id,receivable_id,actor_user_id,kind,amount_in_cents,metadata) VALUES($1,$2,$3,'payment',$4,$5)`,
          [
            clinicId,
            receivableId,
            actorUserId,
            row.totalInCents,
            JSON.stringify({
              paymentMethod: input.paymentMethod,
              source: "patient_tab",
            }),
          ],
        );
      await client.query(
        `UPDATE patient_tabs SET status='closed',payment_status=$2,receivable_id=$3,closed_at=now() WHERE id=$1`,
        [tabId, input.settlement, receivableId],
      );
      const updated = await this.findPatientTab(clinicId, tabId, client);
      await client.query("COMMIT");
      return updated;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async cancelPatientTab(clinicId: string, actorUserId: string, tabId: string) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const tab = await client.query<{
        status: PatientTab["status"];
        patientName: string;
        receivableId: string | null;
        totalInCents: number;
      }>(
        `SELECT t.status,p.full_name AS "patientName",t.receivable_id AS "receivableId",t.total_in_cents AS "totalInCents" FROM patient_tabs t JOIN patients p ON p.id=t.patient_id WHERE t.id=$2 AND t.clinic_id=$1 FOR UPDATE OF t`,
        [clinicId, tabId],
      );
      const row = tab.rows[0];
      if (!row) {
        await client.query("ROLLBACK");
        return null;
      }
      if (row.status === "cancelled")
        throw new DomainError(
          "PATIENT_TAB_ALREADY_CANCELLED",
          "A comanda já foi cancelada.",
          409,
        );
      const items = await client.query<{
        productId: string;
        quantity: number;
      }>(
        `SELECT product_id AS "productId",quantity FROM patient_tab_items WHERE tab_id=$1 ORDER BY product_id FOR UPDATE`,
        [tabId],
      );
      for (const item of items.rows) {
        const product = await client.query<{
          name: string;
          currentStock: number;
        }>(
          `SELECT name,current_stock AS "currentStock" FROM products WHERE id=$1 FOR UPDATE`,
          [item.productId],
        );
        const balance = product.rows[0]!.currentStock + item.quantity;
        await client.query(
          `UPDATE products SET current_stock=$2,updated_at=now() WHERE id=$1`,
          [item.productId, balance],
        );
        await client.query(
          `INSERT INTO stock_movements(clinic_id,product_id,patient_tab_id,kind,quantity,balance_after,notes,actor_user_id) VALUES($1,$2,$3,'sale_reversal',$4,$5,$6,$7)`,
          [
            clinicId,
            item.productId,
            tabId,
            item.quantity,
            balance,
            `Estorno da comanda de ${row.patientName}`,
            actorUserId,
          ],
        );
      }
      if (row.receivableId) {
        await client.query(
          `UPDATE receivables SET status='cancelled',paid_at=NULL,payment_method=NULL,updated_at=now() WHERE id=$1`,
          [row.receivableId],
        );
        await client.query(
          `INSERT INTO financial_events(clinic_id,receivable_id,actor_user_id,kind,amount_in_cents,metadata) VALUES($1,$2,$3,'cancellation',$4,$5)`,
          [
            clinicId,
            row.receivableId,
            actorUserId,
            row.totalInCents,
            JSON.stringify({ source: "patient_tab", tabId }),
          ],
        );
      }
      await client.query(
        `UPDATE patient_tabs SET status='cancelled',payment_status='cancelled',cancelled_at=now() WHERE id=$1`,
        [tabId],
      );
      const updated = await this.findPatientTab(clinicId, tabId, client);
      await client.query("COMMIT");
      return updated;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async updateAppointmentStatus(
    clinicId: string,
    appointmentId: string,
    status: AppointmentStatus,
  ) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const current = await client.query<{
        status: AppointmentStatus;
        patientId: string;
        serviceId: string;
        professionalId: string;
        roomId: string;
        startsAt: Date;
        endsAt: Date;
      }>(
        `SELECT status, patient_id AS "patientId", service_id AS "serviceId",
                professional_id AS "professionalId", room_id AS "roomId",
                starts_at AS "startsAt", ends_at AS "endsAt"
         FROM appointments
         WHERE id = $2 AND clinic_id = $1
         FOR UPDATE`,
        [clinicId, appointmentId],
      );
      if (!current.rows[0]) {
        await client.query("COMMIT");
        return null;
      }
      if (
        current.rows[0].status === "cancelled" &&
        status !== "cancelled" &&
        (await hasGroupSessionConflict(
          client,
          clinicId,
          current.rows[0].professionalId,
          current.rows[0].roomId,
          current.rows[0].startsAt,
          current.rows[0].endsAt,
        ))
      )
        throw new DomainError(
          "APPOINTMENT_CONFLICT",
          "Este atendimento conflita com uma turma no mesmo horário.",
          409,
        );
      if (current.rows[0].status !== "completed" && status === "completed") {
        await this.consumeSessionInDatabase(
          client,
          clinicId,
          appointmentId,
          current.rows[0].patientId,
          current.rows[0].serviceId,
          current.rows[0].startsAt,
        );
      } else if (
        current.rows[0].status === "completed" &&
        status !== "completed"
      ) {
        await this.restoreSessionInDatabase(client, clinicId, appointmentId);
      }
      await client.query(
        `UPDATE appointments SET status = $3, updated_at = now()
         WHERE id = $2 AND clinic_id = $1`,
        [clinicId, appointmentId, status],
      );
      const appointment = await this.findAppointment(
        clinicId,
        appointmentId,
        client,
      );
      await client.query("COMMIT");
      return appointment;
    } catch (error) {
      await client.query("ROLLBACK");
      if (hasDatabaseCode(error, "23P01")) {
        throw new DomainError(
          "APPOINTMENT_CONFLICT",
          "Este atendimento não pode ser reativado porque o horário já está ocupado.",
          409,
        );
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async listClinicalRecords(clinicId: string, patientId?: string) {
    const result = await this.pool.query<ClinicalRecordRow>(
      `
        SELECT ${clinicalRecordColumns}
        FROM clinical_records cr
        JOIN appointments a ON a.id = cr.appointment_id
        JOIN patients p ON p.id = cr.patient_id
        JOIN professionals pr ON pr.id = cr.professional_id
        JOIN users u ON u.id = cr.author_user_id
        WHERE cr.clinic_id = $1 AND ($2::uuid IS NULL OR cr.patient_id = $2)
        ORDER BY a.starts_at DESC
      `,
      [clinicId, patientId ?? null],
    );
    return result.rows.map(mapClinicalRecord);
  }

  async saveClinicalRecord(
    clinicId: string,
    authorUserId: string,
    input: ClinicalRecordInput,
  ) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const saved = await client.query<{ id: string }>(
        `
          INSERT INTO clinical_records (
            clinic_id, appointment_id, patient_id, professional_id, author_user_id,
            subjective, objective, assessment, plan, pain_scale
          )
          SELECT $1, a.id, a.patient_id, a.professional_id, $2, $4, $5, $6, $7, $8
          FROM appointments a
          WHERE a.clinic_id = $1 AND a.id = $3 AND a.status <> 'cancelled'
          ON CONFLICT (clinic_id, appointment_id) DO UPDATE SET
            author_user_id = EXCLUDED.author_user_id,
            subjective = EXCLUDED.subjective,
            objective = EXCLUDED.objective,
            assessment = EXCLUDED.assessment,
            plan = EXCLUDED.plan,
            pain_scale = EXCLUDED.pain_scale,
            version = clinical_records.version + 1,
            updated_at = now()
          WHERE clinical_records.status = 'draft'
          RETURNING id
        `,
        [
          clinicId,
          authorUserId,
          input.appointmentId,
          input.subjective,
          input.objective,
          input.assessment,
          input.plan,
          input.painScale ?? null,
        ],
      );
      if (!saved.rows[0]) {
        const existing = await this.findClinicalRecordByAppointment(
          client,
          clinicId,
          input.appointmentId,
        );
        if (existing?.status === "finalized") {
          throw new DomainError(
            "CLINICAL_RECORD_FINALIZED",
            "Este prontuário já foi finalizado e não pode ser alterado.",
            409,
          );
        }
        throw new DomainError(
          "CLINICAL_CONTEXT_NOT_FOUND",
          "Atendimento não encontrado ou cancelado.",
          404,
        );
      }
      await this.captureClinicalRevision(client, clinicId, saved.rows[0].id);
      const record = await this.findClinicalRecord(
        client,
        clinicId,
        saved.rows[0].id,
      );
      await client.query("COMMIT");
      return record!;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async finalizeClinicalRecord(
    clinicId: string,
    authorUserId: string,
    recordId: string,
  ) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const finalized = await client.query<{ id: string }>(
        `
          UPDATE clinical_records SET
            status = 'finalized', author_user_id = $2, version = version + 1,
            finalized_at = now(), updated_at = now()
          WHERE clinic_id = $1 AND id = $3 AND status = 'draft'
            AND length(trim(subjective)) > 0 AND length(trim(objective)) > 0
            AND length(trim(assessment)) > 0 AND length(trim(plan)) > 0
          RETURNING id
        `,
        [clinicId, authorUserId, recordId],
      );
      if (!finalized.rows[0]) {
        const existing = await this.findClinicalRecord(
          client,
          clinicId,
          recordId,
        );
        if (!existing) {
          await client.query("COMMIT");
          return null;
        }
        if (existing.status === "finalized") {
          await client.query("COMMIT");
          return existing;
        }
        throw new DomainError(
          "INCOMPLETE_CLINICAL_RECORD",
          "Preencha todas as etapas SOAP antes de finalizar.",
        );
      }
      await this.captureClinicalRevision(
        client,
        clinicId,
        finalized.rows[0].id,
      );
      const record = await this.findClinicalRecord(
        client,
        clinicId,
        finalized.rows[0].id,
      );
      await client.query("COMMIT");
      return record;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async listClinicalRecordRevisions(clinicId: string, recordId: string) {
    const result = await this.pool.query<ClinicalRevisionRow>(
      `
        SELECT rr.id, rr.clinical_record_id AS "clinicalRecordId", rr.version,
               (rr.snapshot->>'status')::clinical_record_status AS status,
               rr.snapshot, u.full_name AS "authorName", rr.created_at AS "createdAt"
        FROM clinical_record_revisions rr
        JOIN users u ON u.id = rr.author_user_id
        JOIN clinical_records cr ON cr.id = rr.clinical_record_id
        WHERE rr.clinic_id = $1 AND rr.clinical_record_id = $2
          AND cr.clinic_id = $1
        ORDER BY rr.version DESC
      `,
      [clinicId, recordId],
    );
    return result.rows.map((row): ClinicalRecordRevision => ({
      id: row.id,
      clinicalRecordId: row.clinicalRecordId,
      version: row.version,
      status: row.status,
      subjective: row.snapshot.subjective,
      objective: row.snapshot.objective,
      assessment: row.snapshot.assessment,
      plan: row.snapshot.plan,
      ...(row.snapshot.painScale !== null
        ? { painScale: row.snapshot.painScale }
        : {}),
      authorName: row.authorName,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async getClinicalWorkspace(
    clinicId: string,
    patientId: string,
    actorUserId: string,
    accessAction: "read" | "export" = "read",
  ): Promise<ClinicalWorkspace | null> {
    const [
      patient,
      records,
      templates,
      assessments,
      goals,
      measurements,
      closures,
      attachments,
      addenda,
    ] = await Promise.all([
      this.pool.query<PatientRow>(
        `SELECT ${patientColumns} FROM patients WHERE clinic_id = $1 AND id = $2`,
        [clinicId, patientId],
      ),
      this.listClinicalRecords(clinicId, patientId),
      this.pool.query<AssessmentTemplateRow>(
        `SELECT id, clinic_id AS "clinicId", name, specialty, fields, version,
                  active, created_at AS "createdAt"
           FROM assessment_templates
           WHERE clinic_id = $1 AND active ORDER BY name, version DESC`,
        [clinicId],
      ),
      this.pool.query<ClinicalAssessmentRow>(
        `SELECT ca.id, ca.clinic_id AS "clinicId", ca.patient_id AS "patientId",
                  ca.template_id AS "templateId", ca.appointment_id AS "appointmentId",
                  ca.values, ca.notes, at.name AS "templateName",
                  u.full_name AS "authorName", ca.created_at AS "createdAt"
           FROM clinical_assessments ca
           JOIN assessment_templates at ON at.id = ca.template_id
           JOIN users u ON u.id = ca.author_user_id
           WHERE ca.clinic_id = $1 AND ca.patient_id = $2
           ORDER BY ca.created_at DESC`,
        [clinicId, patientId],
      ),
      this.pool.query<TherapeuticGoalRow>(
        `SELECT tg.id, tg.clinic_id AS "clinicId", tg.patient_id AS "patientId",
                  tg.title, tg.description, tg.baseline_value AS "baselineValue",
                  tg.target_value AS "targetValue", tg.unit,
                  tg.target_date::text AS "targetDate", tg.status,
                  tg.achieved_at AS "achievedAt", u.full_name AS "authorName",
                  tg.created_at AS "createdAt", tg.updated_at AS "updatedAt"
           FROM therapeutic_goals tg JOIN users u ON u.id = tg.author_user_id
           WHERE tg.clinic_id = $1 AND tg.patient_id = $2
           ORDER BY tg.created_at DESC`,
        [clinicId, patientId],
      ),
      this.pool.query<ClinicalMeasurementRow>(
        `SELECT cm.id, cm.clinic_id AS "clinicId", cm.patient_id AS "patientId",
                  cm.goal_id AS "goalId", cm.name, cm.value, cm.unit,
                  cm.measured_at AS "measuredAt", cm.notes,
                  u.full_name AS "authorName", cm.created_at AS "createdAt"
           FROM clinical_measurements cm JOIN users u ON u.id = cm.author_user_id
           WHERE cm.clinic_id = $1 AND cm.patient_id = $2
           ORDER BY cm.measured_at DESC`,
        [clinicId, patientId],
      ),
      this.pool.query<TreatmentClosureRow>(
        `SELECT tc.id, tc.clinic_id AS "clinicId", tc.patient_id AS "patientId",
                  tc.kind, tc.summary, tc.recommendations,
                  tc.occurred_at AS "occurredAt", u.full_name AS "authorName",
                  tc.created_at AS "createdAt"
           FROM treatment_closures tc JOIN users u ON u.id = tc.author_user_id
           WHERE tc.clinic_id = $1 AND tc.patient_id = $2
           ORDER BY tc.occurred_at DESC`,
        [clinicId, patientId],
      ),
      this.pool.query<ClinicalAttachmentRow>(
        `SELECT ca.id, ca.clinic_id AS "clinicId", ca.patient_id AS "patientId",
                ca.file_name AS "fileName", ca.mime_type AS "mimeType",
                ca.size_in_bytes AS "sizeInBytes", ca.sha256, ca.notes,
                u.full_name AS "authorName", ca.created_at AS "createdAt"
         FROM clinical_attachments ca JOIN users u ON u.id = ca.author_user_id
         WHERE ca.clinic_id = $1 AND ca.patient_id = $2
         ORDER BY ca.created_at DESC`,
        [clinicId, patientId],
      ),
      this.pool.query<ClinicalAddendumRow>(
        `SELECT ca.id, ca.clinic_id AS "clinicId", ca.patient_id AS "patientId",
                ca.clinical_record_id AS "clinicalRecordId", ca.reason,
                ca.content, u.full_name AS "authorName", ca.created_at AS "createdAt"
         FROM clinical_addenda ca JOIN users u ON u.id = ca.author_user_id
         WHERE ca.clinic_id = $1 AND ca.patient_id = $2
         ORDER BY ca.created_at DESC`,
        [clinicId, patientId],
      ),
    ]);
    if (!patient.rows[0]) return null;
    await this.addClinicalAccessEvent(
      clinicId,
      patientId,
      actorUserId,
      accessAction,
      "workspace",
    );
    return {
      patient: mapPatient(patient.rows[0]),
      records,
      templates: templates.rows.map(mapAssessmentTemplate),
      assessments: assessments.rows.map(mapClinicalAssessment),
      goals: goals.rows.map(mapTherapeuticGoal),
      measurements: measurements.rows.map(mapClinicalMeasurement),
      closures: closures.rows.map(mapTreatmentClosure),
      attachments: attachments.rows.map(mapClinicalAttachment),
      addenda: addenda.rows.map(mapClinicalAddendum),
    };
  }

  async createAssessmentTemplate(
    clinicId: string,
    input: AssessmentTemplateInput,
  ) {
    const duplicateKeys = input.fields.some(
      (field, index) =>
        input.fields.findIndex((item) => item.key === field.key) !== index,
    );
    if (duplicateKeys)
      throw new DomainError(
        "ASSESSMENT_FIELD_DUPLICATE",
        "As chaves dos campos da avaliação devem ser únicas.",
      );
    const result = await this.pool.query<AssessmentTemplateRow>(
      `INSERT INTO assessment_templates
         (clinic_id, name, specialty, fields, version)
       VALUES ($1,$2,$3,$4,
         coalesce((SELECT max(version) + 1 FROM assessment_templates
                   WHERE clinic_id = $1 AND name = $2), 1))
       RETURNING id, clinic_id AS "clinicId", name, specialty, fields, version,
                 active, created_at AS "createdAt"`,
      [clinicId, input.name, input.specialty, JSON.stringify(input.fields)],
    );
    return mapAssessmentTemplate(result.rows[0]!);
  }

  async createClinicalAssessment(
    clinicId: string,
    authorUserId: string,
    input: ClinicalAssessmentInput,
  ) {
    const context = await this.pool.query<{
      fields: AssessmentField[];
      templateName: string;
    }>(
      `SELECT at.fields, at.name AS "templateName"
       FROM assessment_templates at
       WHERE at.clinic_id = $1 AND at.id = $2 AND at.active
         AND EXISTS (SELECT 1 FROM patients p WHERE p.clinic_id = $1 AND p.id = $3)
         AND EXISTS (SELECT 1 FROM users u WHERE u.clinic_id = $1 AND u.id = $4)
         AND ($5::uuid IS NULL OR EXISTS (
           SELECT 1 FROM appointments a
           WHERE a.clinic_id = $1 AND a.id = $5 AND a.patient_id = $3
         ))`,
      [
        clinicId,
        input.templateId,
        input.patientId,
        authorUserId,
        input.appointmentId || null,
      ],
    );
    if (!context.rows[0])
      throw new DomainError(
        "CLINICAL_CONTEXT_NOT_FOUND",
        "Cliente, modelo, atendimento ou autor não encontrado.",
        404,
      );
    for (const field of context.rows[0].fields) {
      const value = input.values[field.key];
      if (field.required && (value === undefined || value === ""))
        throw new DomainError(
          "ASSESSMENT_REQUIRED_FIELD",
          `Preencha o campo ${field.label}.`,
        );
      if (value === undefined || value === "") continue;
      const expectedType =
        field.type === "scale"
          ? "number"
          : field.type === "text"
            ? "string"
            : field.type;
      if (typeof value !== expectedType)
        throw new DomainError(
          "ASSESSMENT_INVALID_VALUE",
          `O valor de ${field.label} é inválido.`,
        );
      if (
        typeof value === "number" &&
        ((field.min !== undefined && value < field.min) ||
          (field.max !== undefined && value > field.max))
      )
        throw new DomainError(
          "ASSESSMENT_VALUE_OUT_OF_RANGE",
          `O valor de ${field.label} está fora do intervalo permitido.`,
        );
    }
    const result = await this.pool.query<ClinicalAssessmentRow>(
      `WITH inserted AS (
         INSERT INTO clinical_assessments
           (clinic_id, patient_id, template_id, appointment_id, author_user_id, values, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *
       )
       SELECT i.id, i.clinic_id AS "clinicId", i.patient_id AS "patientId",
              i.template_id AS "templateId", i.appointment_id AS "appointmentId",
              i.values, i.notes, at.name AS "templateName",
              u.full_name AS "authorName", i.created_at AS "createdAt"
       FROM inserted i JOIN assessment_templates at ON at.id = i.template_id
       JOIN users u ON u.id = i.author_user_id`,
      [
        clinicId,
        input.patientId,
        input.templateId,
        input.appointmentId || null,
        authorUserId,
        JSON.stringify(input.values),
        input.notes || null,
      ],
    );
    return mapClinicalAssessment(result.rows[0]!);
  }

  async createTherapeuticGoal(
    clinicId: string,
    authorUserId: string,
    input: TherapeuticGoalInput,
  ) {
    const result = await this.pool.query<TherapeuticGoalRow>(
      `WITH inserted AS (
         INSERT INTO therapeutic_goals
           (clinic_id, patient_id, author_user_id, title, description,
            baseline_value, target_value, unit, target_date)
         SELECT $1,p.id,u.id,$4,$5,$6,$7,$8,$9
         FROM patients p, users u
         WHERE p.clinic_id = $1 AND p.id = $2 AND u.clinic_id = $1 AND u.id = $3
         RETURNING *
       )
       SELECT i.id, i.clinic_id AS "clinicId", i.patient_id AS "patientId",
              i.title, i.description, i.baseline_value AS "baselineValue",
              i.target_value AS "targetValue", i.unit,
              i.target_date::text AS "targetDate", i.status,
              i.achieved_at AS "achievedAt", u.full_name AS "authorName",
              i.created_at AS "createdAt", i.updated_at AS "updatedAt"
       FROM inserted i JOIN users u ON u.id = i.author_user_id`,
      [
        clinicId,
        input.patientId,
        authorUserId,
        input.title,
        input.description || null,
        input.baselineValue ?? null,
        input.targetValue ?? null,
        input.unit || null,
        input.targetDate || null,
      ],
    );
    if (!result.rows[0])
      throw new DomainError(
        "CLINICAL_CONTEXT_NOT_FOUND",
        "Cliente ou autor não encontrado.",
        404,
      );
    return mapTherapeuticGoal(result.rows[0]);
  }

  async updateTherapeuticGoalStatus(
    clinicId: string,
    goalId: string,
    status: TherapeuticGoalStatus,
  ) {
    const result = await this.pool.query<TherapeuticGoalRow>(
      `WITH updated AS (
         UPDATE therapeutic_goals SET status = $3,
           achieved_at = CASE WHEN $3 = 'achieved' THEN now() ELSE achieved_at END,
           updated_at = now()
         WHERE clinic_id = $1 AND id = $2 AND (status = 'active' OR status = $3)
         RETURNING *
       )
       SELECT i.id, i.clinic_id AS "clinicId", i.patient_id AS "patientId",
              i.title, i.description, i.baseline_value AS "baselineValue",
              i.target_value AS "targetValue", i.unit,
              i.target_date::text AS "targetDate", i.status,
              i.achieved_at AS "achievedAt", u.full_name AS "authorName",
              i.created_at AS "createdAt", i.updated_at AS "updatedAt"
       FROM updated i JOIN users u ON u.id = i.author_user_id`,
      [clinicId, goalId, status],
    );
    if (result.rows[0]) return mapTherapeuticGoal(result.rows[0]);
    const existing = await this.pool.query<{ status: TherapeuticGoalStatus }>(
      `SELECT status FROM therapeutic_goals WHERE clinic_id = $1 AND id = $2`,
      [clinicId, goalId],
    );
    if (!existing.rows[0]) return null;
    throw new DomainError(
      "THERAPEUTIC_GOAL_CLOSED",
      "Um objetivo encerrado não pode mudar de situação.",
      409,
    );
  }

  async createClinicalMeasurement(
    clinicId: string,
    authorUserId: string,
    input: ClinicalMeasurementInput,
  ) {
    const result = await this.pool.query<ClinicalMeasurementRow>(
      `WITH inserted AS (
         INSERT INTO clinical_measurements
           (clinic_id, patient_id, goal_id, author_user_id, name, value, unit, measured_at, notes)
         SELECT $1,p.id,$3,u.id,$5,$6,$7,$8,$9
         FROM patients p, users u
         WHERE p.clinic_id = $1 AND p.id = $2 AND u.clinic_id = $1 AND u.id = $4
           AND ($3::uuid IS NULL OR EXISTS (
             SELECT 1 FROM therapeutic_goals tg
             WHERE tg.clinic_id = $1 AND tg.id = $3 AND tg.patient_id = $2
           ))
         RETURNING *
       )
       SELECT i.id, i.clinic_id AS "clinicId", i.patient_id AS "patientId",
              i.goal_id AS "goalId", i.name, i.value, i.unit,
              i.measured_at AS "measuredAt", i.notes,
              u.full_name AS "authorName", i.created_at AS "createdAt"
       FROM inserted i JOIN users u ON u.id = i.author_user_id`,
      [
        clinicId,
        input.patientId,
        input.goalId || null,
        authorUserId,
        input.name,
        input.value,
        input.unit,
        input.measuredAt,
        input.notes || null,
      ],
    );
    if (!result.rows[0])
      throw new DomainError(
        "CLINICAL_CONTEXT_NOT_FOUND",
        "Cliente, objetivo ou autor não encontrado.",
        404,
      );
    return mapClinicalMeasurement(result.rows[0]);
  }

  async createTreatmentClosure(
    clinicId: string,
    authorUserId: string,
    input: TreatmentClosureInput,
  ) {
    const result = await this.pool.query<TreatmentClosureRow>(
      `WITH inserted AS (
         INSERT INTO treatment_closures
           (clinic_id, patient_id, author_user_id, kind, summary, recommendations, occurred_at)
         SELECT $1,p.id,u.id,$4,$5,$6,$7 FROM patients p, users u
         WHERE p.clinic_id = $1 AND p.id = $2 AND u.clinic_id = $1 AND u.id = $3
         RETURNING *
       )
       SELECT i.id, i.clinic_id AS "clinicId", i.patient_id AS "patientId",
              i.kind, i.summary, i.recommendations, i.occurred_at AS "occurredAt",
              u.full_name AS "authorName", i.created_at AS "createdAt"
       FROM inserted i JOIN users u ON u.id = i.author_user_id`,
      [
        clinicId,
        input.patientId,
        authorUserId,
        input.kind,
        input.summary,
        input.recommendations || null,
        input.occurredAt,
      ],
    );
    if (!result.rows[0])
      throw new DomainError(
        "CLINICAL_CONTEXT_NOT_FOUND",
        "Cliente ou autor não encontrado.",
        404,
      );
    return mapTreatmentClosure(result.rows[0]);
  }

  async createClinicalAttachment(
    clinicId: string,
    authorUserId: string,
    input: ClinicalAttachmentInput,
  ): Promise<ClinicalAttachment> {
    const inspected = inspectClinicalAttachment(input);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query<ClinicalAttachmentRow>(
        `WITH inserted AS (
           INSERT INTO clinical_attachments
             (clinic_id, patient_id, author_user_id, file_name, mime_type,
              size_in_bytes, content, sha256, notes)
           SELECT $1,p.id,u.id,$4,$5,$6,$7,$8,$9 FROM patients p, users u
           WHERE p.clinic_id = $1 AND p.id = $2 AND u.clinic_id = $1 AND u.id = $3
           RETURNING *
         )
         SELECT i.id, i.clinic_id AS "clinicId", i.patient_id AS "patientId",
                i.file_name AS "fileName", i.mime_type AS "mimeType",
                i.size_in_bytes AS "sizeInBytes", i.sha256, i.notes,
                u.full_name AS "authorName", i.created_at AS "createdAt"
         FROM inserted i JOIN users u ON u.id = i.author_user_id`,
        [
          clinicId,
          input.patientId,
          authorUserId,
          input.fileName,
          input.mimeType,
          input.sizeInBytes,
          inspected.content,
          inspected.sha256,
          input.notes || null,
        ],
      );
      if (!result.rows[0])
        throw new DomainError(
          "CLINICAL_CONTEXT_NOT_FOUND",
          "Cliente ou autor não encontrado.",
          404,
        );
      await this.addClinicalAccessEvent(
        clinicId,
        input.patientId,
        authorUserId,
        "upload",
        "attachment",
        result.rows[0].id,
        client,
      );
      await client.query("COMMIT");
      return mapClinicalAttachment(result.rows[0]);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async getClinicalAttachmentContent(
    clinicId: string,
    actorUserId: string,
    attachmentId: string,
  ): Promise<ClinicalAttachmentContent | null> {
    const result = await this.pool.query<ClinicalAttachmentRow>(
      `SELECT ca.id, ca.clinic_id AS "clinicId", ca.patient_id AS "patientId",
              ca.file_name AS "fileName", ca.mime_type AS "mimeType",
              ca.size_in_bytes AS "sizeInBytes", ca.content, ca.sha256, ca.notes,
              u.full_name AS "authorName", ca.created_at AS "createdAt"
       FROM clinical_attachments ca JOIN users u ON u.id = ca.author_user_id
       WHERE ca.clinic_id = $1 AND ca.id = $2`,
      [clinicId, attachmentId],
    );
    if (!result.rows[0]?.content) return null;
    const metadata = mapClinicalAttachment(result.rows[0]);
    await this.addClinicalAccessEvent(
      clinicId,
      metadata.patientId,
      actorUserId,
      "download",
      "attachment",
      metadata.id,
    );
    return {
      ...metadata,
      contentBase64: result.rows[0].content.toString("base64"),
    };
  }

  async createClinicalAddendum(
    clinicId: string,
    authorUserId: string,
    input: ClinicalAddendumInput,
  ) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query<ClinicalAddendumRow>(
        `WITH inserted AS (
           INSERT INTO clinical_addenda
             (clinic_id, patient_id, clinical_record_id, author_user_id, reason, content)
           SELECT $1,cr.patient_id,cr.id,u.id,$4,$5
           FROM clinical_records cr, users u
           WHERE cr.clinic_id = $1 AND cr.id = $2 AND cr.status = 'finalized'
             AND u.clinic_id = $1 AND u.id = $3
           RETURNING *
         )
         SELECT i.id, i.clinic_id AS "clinicId", i.patient_id AS "patientId",
                i.clinical_record_id AS "clinicalRecordId", i.reason, i.content,
                u.full_name AS "authorName", i.created_at AS "createdAt"
         FROM inserted i JOIN users u ON u.id = i.author_user_id`,
        [
          clinicId,
          input.clinicalRecordId,
          authorUserId,
          input.reason,
          input.content,
        ],
      );
      if (!result.rows[0]) {
        const record = await client.query<{ status: ClinicalRecordStatus }>(
          `SELECT status FROM clinical_records WHERE clinic_id = $1 AND id = $2`,
          [clinicId, input.clinicalRecordId],
        );
        if (record.rows[0]?.status !== "finalized")
          throw new DomainError(
            "CLINICAL_RECORD_NOT_FINALIZED",
            "Adendos só podem ser incluídos em evoluções finalizadas.",
            409,
          );
        throw new DomainError(
          "CLINICAL_CONTEXT_NOT_FOUND",
          "Prontuário ou autor não encontrado.",
          404,
        );
      }
      await this.addClinicalAccessEvent(
        clinicId,
        result.rows[0].patientId,
        authorUserId,
        "addendum",
        "clinical_record",
        input.clinicalRecordId,
        client,
      );
      await client.query("COMMIT");
      return mapClinicalAddendum(result.rows[0]);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async listClinicalAccessEvents(clinicId: string, patientId: string) {
    const result = await this.pool.query<ClinicalAccessEventRow>(
      `SELECT id, clinic_id AS "clinicId", patient_id AS "patientId",
              actor_user_id AS "actorUserId", action,
              entity_type AS "entityType", entity_id AS "entityId",
              created_at AS "createdAt"
       FROM clinical_access_events
       WHERE clinic_id = $1 AND patient_id = $2 ORDER BY created_at DESC`,
      [clinicId, patientId],
    );
    return result.rows.map(mapClinicalAccessEvent);
  }

  async listPatientPlans(clinicId: string, patientId?: string) {
    await this.pool.query(
      `UPDATE patient_plans SET status = 'expired', updated_at = now()
       WHERE clinic_id = $1 AND status = 'active' AND valid_until < CURRENT_DATE`,
      [clinicId],
    );
    const result = await this.pool.query<PatientPlanRow>(
      `SELECT ${patientPlanColumns}
       FROM patient_plans pp
       JOIN patients p ON p.id = pp.patient_id
       JOIN services s ON s.id = pp.service_id
       WHERE pp.clinic_id = $1 AND ($2::uuid IS NULL OR pp.patient_id = $2)
       ORDER BY pp.created_at DESC`,
      [clinicId, patientId ?? null],
    );
    return result.rows.map(mapPatientPlan);
  }

  async createPatientPlan(
    clinicId: string,
    actorUserId: string,
    input: PatientPlanInput,
  ) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const context = await client.query(
        `SELECT 1 FROM patients p, services s
         WHERE p.id = $2 AND p.clinic_id = $1 AND p.status = 'active'
           AND s.id = $3 AND s.clinic_id = $1 AND s.active = true`,
        [clinicId, input.patientId, input.serviceId],
      );
      if (!context.rowCount) {
        throw new DomainError(
          "PLAN_CONTEXT_NOT_FOUND",
          "Cliente ou serviço não encontrado.",
          404,
        );
      }
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO patient_plans (
           clinic_id, patient_id, service_id, name, kind, total_sessions,
           remaining_sessions, valid_from, valid_until, total_value_in_cents,
           installments, first_due_date
         ) VALUES ($1,$2,$3,$4,$5,$6,$6,$7,$8,$9,$10,$11) RETURNING id`,
        [
          clinicId,
          input.patientId,
          input.serviceId,
          input.name,
          input.kind,
          input.totalSessions,
          input.validFrom,
          input.validUntil || null,
          input.totalValueInCents,
          input.installments,
          input.firstDueDate,
        ],
      );
      const planId = inserted.rows[0]!.id;
      await client.query(
        `INSERT INTO session_movements
           (clinic_id, plan_id, kind, quantity, reason, actor_user_id)
         VALUES ($1, $2, 'credit', $3, 'Crédito inicial do plano', $4)`,
        [clinicId, planId, input.totalSessions, actorUserId],
      );
      const baseAmount = Math.floor(
        input.totalValueInCents / input.installments,
      );
      const remainder = input.totalValueInCents % input.installments;
      for (let index = 0; index < input.installments; index += 1) {
        const amount = baseAmount + (index < remainder ? 1 : 0);
        const receivable = await client.query<{ id: string }>(
          `INSERT INTO receivables (
             clinic_id, patient_id, plan_id, description, installment_number,
             installment_count, due_date, amount_in_cents
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
          [
            clinicId,
            input.patientId,
            planId,
            `${input.name} · ${index + 1}/${input.installments}`,
            index + 1,
            input.installments,
            addMonths(input.firstDueDate, index),
            amount,
          ],
        );
        await client.query(
          `INSERT INTO financial_events
             (clinic_id, receivable_id, actor_user_id, kind, amount_in_cents)
           VALUES ($1, $2, $3, 'created', $4)`,
          [clinicId, receivable.rows[0]!.id, actorUserId, amount],
        );
      }
      const plan = await this.findPatientPlan(client, clinicId, planId);
      await client.query("COMMIT");
      return plan!;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async updatePatientPlanStatus(
    clinicId: string,
    actorUserId: string,
    planId: string,
    status: PlanStatus,
  ) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const current = await client.query<{ status: PlanStatus }>(
        "SELECT status FROM patient_plans WHERE clinic_id = $1 AND id = $2 FOR UPDATE",
        [clinicId, planId],
      );
      if (!current.rows[0]) {
        await client.query("COMMIT");
        return null;
      }
      if (current.rows[0].status === "cancelled" && status !== "cancelled") {
        throw new DomainError(
          "PLAN_CANCELLED",
          "Um plano cancelado não pode ser reativado.",
          409,
        );
      }
      if (current.rows[0].status === status) {
        const unchanged = await this.findPatientPlan(client, clinicId, planId);
        await client.query("COMMIT");
        return unchanged;
      }
      const cancellationValue =
        status === "cancelled"
          ? (
              await client.query<{ amountInCents: number }>(
                `SELECT COALESCE(SUM(amount_in_cents),0)::int AS "amountInCents"
                 FROM receivables
                 WHERE clinic_id=$1 AND plan_id=$2 AND status='open'`,
                [clinicId, planId],
              )
            ).rows[0]!.amountInCents
          : 0;
      await client.query(
        `UPDATE patient_plans
         SET status = $3, updated_at = now(),
             cancelled_at = CASE WHEN $3::plan_status = 'cancelled' THEN now() ELSE cancelled_at END,
             cancelled_value_in_cents = CASE WHEN $3::plan_status = 'cancelled' THEN $4::int ELSE cancelled_value_in_cents END
         WHERE clinic_id = $1 AND id = $2`,
        [clinicId, planId, status, cancellationValue],
      );
      if (status === "cancelled") {
        const cancelled = await client.query<{
          id: string;
          amountInCents: number;
        }>(
          `UPDATE receivables SET status = 'cancelled', updated_at = now()
           WHERE clinic_id = $1 AND plan_id = $2 AND status = 'open'
           RETURNING id, amount_in_cents AS "amountInCents"`,
          [clinicId, planId],
        );
        for (const receivable of cancelled.rows) {
          await client.query(
            `INSERT INTO financial_events
               (clinic_id, receivable_id, actor_user_id, kind, amount_in_cents)
             VALUES ($1, $2, $3, 'cancellation', $4)`,
            [clinicId, receivable.id, actorUserId, -receivable.amountInCents],
          );
        }
      }
      const plan = await this.findPatientPlan(client, clinicId, planId);
      await client.query("COMMIT");
      return plan;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async listSessionMovements(clinicId: string, planId: string) {
    const result = await this.pool.query<SessionMovementRow>(
      `SELECT sm.id, sm.plan_id AS "planId", sm.appointment_id AS "appointmentId",
              sm.kind, sm.quantity, sm.reason, sm.created_at AS "createdAt"
       FROM session_movements sm
       JOIN patient_plans pp ON pp.id = sm.plan_id
       WHERE sm.clinic_id = $1 AND sm.plan_id = $2 AND pp.clinic_id = $1
       ORDER BY sm.created_at DESC`,
      [clinicId, planId],
    );
    return result.rows.map((row): SessionMovement => ({
      id: row.id,
      planId: row.planId,
      ...(row.appointmentId ? { appointmentId: row.appointmentId } : {}),
      kind: row.kind,
      quantity: row.quantity,
      reason: row.reason,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async getFinancialSummary(clinicId: string): Promise<FinancialSummary> {
    const result = await this.pool.query<ReceivableRow>(
      `SELECT ${receivableColumns}
       FROM receivables r JOIN patients p ON p.id = r.patient_id
       WHERE r.clinic_id = $1 ORDER BY r.due_date, r.created_at`,
      [clinicId],
    );
    const receivables = result.rows.map(mapReceivable);
    const currentMonth = new Date().toISOString().slice(0, 7);
    return {
      openInCents: receivables
        .filter((item) => item.status === "open")
        .reduce((sum, item) => sum + item.amountInCents, 0),
      overdueInCents: receivables
        .filter((item) => item.overdue)
        .reduce((sum, item) => sum + item.amountInCents, 0),
      paidThisMonthInCents: receivables
        .filter(
          (item) =>
            item.status === "paid" && item.paidAt?.startsWith(currentMonth),
        )
        .reduce((sum, item) => sum + item.amountInCents, 0),
      receivables,
    };
  }

  async settleReceivable(
    clinicId: string,
    actorUserId: string,
    receivableId: string,
    paymentMethod: PaymentMethod,
  ) {
    return this.changeReceivablePayment(
      clinicId,
      actorUserId,
      receivableId,
      "payment",
      paymentMethod,
    );
  }

  async reverseReceivablePayment(
    clinicId: string,
    actorUserId: string,
    receivableId: string,
  ) {
    return this.changeReceivablePayment(
      clinicId,
      actorUserId,
      receivableId,
      "payment_reversal",
    );
  }

  async adjustReceivable(
    clinicId: string,
    actorUserId: string,
    receivableId: string,
    amountInCents: number,
    reason: string,
  ) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const current = await client.query<{
        status: ReceivableStatus;
        amountInCents: number;
      }>(
        `SELECT status, amount_in_cents AS "amountInCents"
         FROM receivables WHERE clinic_id = $1 AND id = $2 FOR UPDATE`,
        [clinicId, receivableId],
      );
      if (!current.rows[0]) {
        await client.query("COMMIT");
        return null;
      }
      if (current.rows[0].status !== "open")
        throw new DomainError(
          "RECEIVABLE_NOT_OPEN",
          "Somente contas abertas podem ser ajustadas.",
          409,
        );
      const difference = amountInCents - current.rows[0].amountInCents;
      await client.query(
        `UPDATE receivables SET amount_in_cents = $3, updated_at = now()
         WHERE clinic_id = $1 AND id = $2`,
        [clinicId, receivableId, amountInCents],
      );
      await client.query(
        `INSERT INTO financial_events
           (clinic_id, receivable_id, actor_user_id, kind, amount_in_cents, metadata)
         VALUES ($1,$2,$3,'adjustment',$4,$5)`,
        [clinicId, receivableId, actorUserId, difference, { reason }],
      );
      const receivable = await this.findReceivable(
        client,
        clinicId,
        receivableId,
      );
      await client.query("COMMIT");
      return receivable;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async getPaymentReceipt(
    clinicId: string,
    receivableId: string,
  ): Promise<PaymentReceipt | null> {
    const receivable = await this.findReceivable(
      this.pool,
      clinicId,
      receivableId,
    );
    if (!receivable) return null;
    if (
      receivable.status !== "paid" ||
      !receivable.paidAt ||
      !receivable.paymentMethod
    )
      throw new DomainError(
        "RECEIPT_NOT_AVAILABLE",
        "O recibo fica disponível após a baixa.",
        409,
      );
    return {
      receiptNumber: `REC-${receivable.id.slice(0, 8).toUpperCase()}`,
      patientName: receivable.patientName,
      description: receivable.description,
      amountInCents: receivable.amountInCents,
      paymentMethod: receivable.paymentMethod,
      paidAt: receivable.paidAt,
    };
  }

  async getFinancialWorkspace(clinicId: string): Promise<FinancialWorkspace> {
    const [summary, categories, costCenters, payables, rules, commissions] =
      await Promise.all([
        this.getFinancialSummary(clinicId),
        this.pool.query<FinancialCategoryRow>(
          `SELECT id, clinic_id AS "clinicId", name, kind, active
         FROM financial_categories WHERE clinic_id = $1 AND active ORDER BY name`,
          [clinicId],
        ),
        this.pool.query<CostCenterRow>(
          `SELECT id, clinic_id AS "clinicId", name, active
         FROM cost_centers WHERE clinic_id = $1 AND active ORDER BY name`,
          [clinicId],
        ),
        this.pool.query<PayableRow>(
          `SELECT ${payableColumns} FROM payables py
         JOIN financial_categories fc ON fc.id = py.category_id
         JOIN cost_centers cc ON cc.id = py.cost_center_id
         WHERE py.clinic_id = $1 ORDER BY py.due_date, py.created_at`,
          [clinicId],
        ),
        this.pool.query<CommissionRuleRow>(
          `SELECT cr.id, cr.clinic_id AS "clinicId", cr.professional_id AS "professionalId",
                p.full_name AS "professionalName", cr.percentage,
                cr.effective_from::text AS "effectiveFrom", cr.active,
                cr.created_at AS "createdAt"
         FROM commission_rules cr JOIN professionals p ON p.id = cr.professional_id
         WHERE cr.clinic_id = $1 AND cr.active ORDER BY p.full_name`,
          [clinicId],
        ),
        this.pool.query<CommissionEntryRow>(
          `SELECT ce.id, ce.clinic_id AS "clinicId", ce.professional_id AS "professionalId",
                p.full_name AS "professionalName", ce.appointment_id AS "appointmentId",
                ce.competence, ce.base_amount_in_cents AS "baseAmountInCents",
                ce.percentage, ce.amount_in_cents AS "amountInCents", ce.status,
                ce.paid_at AS "paidAt", ce.created_at AS "createdAt"
         FROM commission_entries ce JOIN professionals p ON p.id = ce.professional_id
         WHERE ce.clinic_id = $1 ORDER BY ce.competence DESC, p.full_name`,
          [clinicId],
        ),
      ]);
    const mapped = payables.rows.map(mapPayable);
    const month = new Date().toISOString().slice(0, 7);
    const paidExpensesThisMonthInCents = mapped
      .filter(
        (item) => item.status === "paid" && item.paidAt?.startsWith(month),
      )
      .reduce((sum, item) => sum + item.amountInCents, 0);
    const mappedCommissions = commissions.rows.map(mapCommissionEntry);
    const paidCommissionsThisMonthInCents = mappedCommissions
      .filter(
        (item) => item.status === "paid" && item.paidAt?.startsWith(month),
      )
      .reduce((sum, item) => sum + item.amountInCents, 0);
    return {
      summary,
      categories: categories.rows,
      costCenters: costCenters.rows,
      payables: mapped,
      payableOpenInCents: mapped
        .filter((item) => item.status === "open")
        .reduce((sum, item) => sum + item.amountInCents, 0),
      payableOverdueInCents: mapped
        .filter((item) => item.overdue)
        .reduce((sum, item) => sum + item.amountInCents, 0),
      paidExpensesThisMonthInCents,
      cashBalanceThisMonthInCents:
        summary.paidThisMonthInCents -
        paidExpensesThisMonthInCents -
        paidCommissionsThisMonthInCents,
      commissionRules: rules.rows.map(mapCommissionRule),
      commissions: mappedCommissions,
      commissionOpenInCents: commissions.rows
        .filter((item) => item.status === "open")
        .reduce((sum, item) => sum + item.amountInCents, 0),
      paidCommissionsThisMonthInCents,
    };
  }

  async createFinancialCategory(
    clinicId: string,
    input: FinancialCategoryInput,
  ) {
    try {
      const result = await this.pool.query<FinancialCategoryRow>(
        `INSERT INTO financial_categories (clinic_id, name, kind)
         VALUES ($1,$2,$3)
         RETURNING id, clinic_id AS "clinicId", name, kind, active`,
        [clinicId, input.name, input.kind],
      );
      return result.rows[0]!;
    } catch (error) {
      if (hasDatabaseCode(error, "23505"))
        throw new DomainError(
          "FINANCIAL_CATEGORY_DUPLICATE",
          "Esta categoria já existe.",
          409,
        );
      throw error;
    }
  }

  async createCostCenter(clinicId: string, input: CostCenterInput) {
    try {
      const result = await this.pool.query<CostCenterRow>(
        `INSERT INTO cost_centers (clinic_id, name) VALUES ($1,$2)
         RETURNING id, clinic_id AS "clinicId", name, active`,
        [clinicId, input.name],
      );
      return result.rows[0]!;
    } catch (error) {
      if (hasDatabaseCode(error, "23505"))
        throw new DomainError(
          "COST_CENTER_DUPLICATE",
          "Este centro de custo já existe.",
          409,
        );
      throw error;
    }
  }

  async createPayable(
    clinicId: string,
    actorUserId: string,
    input: PayableInput,
  ) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO payables
           (clinic_id, description, supplier, category_id, cost_center_id,
            due_date, amount_in_cents, notes, created_by_user_id)
         SELECT $1,$2,$3,fc.id,cc.id,$6,$7,$8,$9
         FROM financial_categories fc, cost_centers cc
         WHERE fc.clinic_id = $1 AND fc.id = $4 AND fc.kind = 'expense' AND fc.active
           AND cc.clinic_id = $1 AND cc.id = $5 AND cc.active
         RETURNING id`,
        [
          clinicId,
          input.description,
          input.supplier || null,
          input.categoryId,
          input.costCenterId,
          input.dueDate,
          input.amountInCents,
          input.notes || null,
          actorUserId,
        ],
      );
      if (!inserted.rows[0])
        throw new DomainError(
          "FINANCIAL_CLASSIFICATION_NOT_FOUND",
          "Categoria de despesa ou centro de custo não encontrado.",
          404,
        );
      await client.query(
        `INSERT INTO payable_events
           (clinic_id, payable_id, actor_user_id, kind, amount_in_cents)
         VALUES ($1,$2,$3,'created',$4)`,
        [clinicId, inserted.rows[0].id, actorUserId, input.amountInCents],
      );
      const payable = await this.findPayable(
        client,
        clinicId,
        inserted.rows[0].id,
      );
      await client.query("COMMIT");
      return payable!;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async settlePayable(
    clinicId: string,
    actorUserId: string,
    payableId: string,
    paymentMethod: PaymentMethod,
  ) {
    return this.changePayablePayment(
      clinicId,
      actorUserId,
      payableId,
      "payment",
      paymentMethod,
    );
  }

  async reversePayablePayment(
    clinicId: string,
    actorUserId: string,
    payableId: string,
  ) {
    return this.changePayablePayment(
      clinicId,
      actorUserId,
      payableId,
      "payment_reversal",
    );
  }

  async renegotiateReceivables(
    clinicId: string,
    actorUserId: string,
    input: ReceivableRenegotiationInput,
  ) {
    const ids = [...new Set(input.receivableIds)];
    if (ids.length !== input.receivableIds.length)
      throw new DomainError(
        "RENEGOTIATION_DUPLICATE_ITEM",
        "Há parcelas repetidas.",
      );
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const current = await client.query<{
        id: string;
        patientId: string;
        amountInCents: number;
        status: ReceivableStatus;
      }>(
        `SELECT id, patient_id AS "patientId", amount_in_cents AS "amountInCents", status
         FROM receivables WHERE clinic_id = $1 AND id = ANY($2::uuid[]) FOR UPDATE`,
        [clinicId, ids],
      );
      if (
        current.rows.length !== ids.length ||
        current.rows.some((item) => item.status !== "open")
      )
        throw new DomainError(
          "RENEGOTIATION_INVALID_ITEMS",
          "Selecione somente parcelas abertas.",
          409,
        );
      const patientId = current.rows[0]!.patientId;
      if (current.rows.some((item) => item.patientId !== patientId))
        throw new DomainError(
          "RENEGOTIATION_PATIENT_MISMATCH",
          "As parcelas devem pertencer ao mesmo cliente.",
        );
      const originalAmount = current.rows.reduce(
        (sum, item) => sum + item.amountInCents,
        0,
      );
      const renegotiation = await client.query<{ id: string; createdAt: Date }>(
        `INSERT INTO receivable_renegotiations
          (clinic_id, patient_id, actor_user_id, original_amount_in_cents,
           renegotiated_amount_in_cents, reason, original_receivable_ids)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, created_at AS "createdAt"`,
        [
          clinicId,
          patientId,
          actorUserId,
          originalAmount,
          input.totalAmountInCents,
          input.reason,
          ids,
        ],
      );
      await client.query(
        `UPDATE receivables SET status = 'cancelled', updated_at = now()
        WHERE clinic_id = $1 AND id = ANY($2::uuid[])`,
        [clinicId, ids],
      );
      await client.query(
        `INSERT INTO financial_events
        (clinic_id, receivable_id, actor_user_id, kind, amount_in_cents, metadata)
        SELECT $1, r.id, $3, 'cancellation', -r.amount_in_cents,
               jsonb_build_object('reason', $4, 'renegotiationId', $5::text)
        FROM receivables r WHERE r.clinic_id = $1 AND r.id = ANY($2::uuid[])`,
        [clinicId, ids, actorUserId, input.reason, renegotiation.rows[0]!.id],
      );
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO receivables
          (clinic_id, patient_id, renegotiation_id, description, installment_number,
           installment_count, due_date, amount_in_cents)
         SELECT $1,$2,$3,'Renegociação · ' || $4,n,$5,
                ($6::date + ((n - 1) || ' months')::interval)::date,
                ($7 / $5) + CASE WHEN n <= ($7 % $5) THEN 1 ELSE 0 END
         FROM generate_series(1, $5) n RETURNING id`,
        [
          clinicId,
          patientId,
          renegotiation.rows[0]!.id,
          input.reason,
          input.installments,
          input.firstDueDate,
          input.totalAmountInCents,
        ],
      );
      const newReceivables = (
        await Promise.all(
          inserted.rows.map((item) =>
            this.findReceivable(client, clinicId, item.id),
          ),
        )
      ).filter((item): item is Receivable => Boolean(item));
      await client.query("COMMIT");
      return {
        id: renegotiation.rows[0]!.id,
        clinicId,
        patientId,
        originalAmountInCents: originalAmount,
        renegotiatedAmountInCents: input.totalAmountInCents,
        reason: input.reason,
        originalReceivableIds: ids,
        newReceivables,
        createdAt: renegotiation.rows[0]!.createdAt.toISOString(),
      } satisfies ReceivableRenegotiation;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async createCommissionRule(clinicId: string, input: CommissionRuleInput) {
    try {
      const result = await this.pool.query<CommissionRuleRow>(
        `WITH inserted AS (INSERT INTO commission_rules (clinic_id, professional_id, percentage, effective_from)
          SELECT $1,id,$3,$4 FROM professionals WHERE clinic_id = $1 AND id = $2 RETURNING *)
         SELECT i.id, i.clinic_id AS "clinicId", i.professional_id AS "professionalId",
          p.full_name AS "professionalName", i.percentage, i.effective_from::text AS "effectiveFrom",
          i.active, i.created_at AS "createdAt" FROM inserted i JOIN professionals p ON p.id = i.professional_id`,
        [clinicId, input.professionalId, input.percentage, input.effectiveFrom],
      );
      if (!result.rows[0])
        throw new DomainError(
          "PROFESSIONAL_NOT_FOUND",
          "Profissional não encontrado.",
          404,
        );
      return mapCommissionRule(result.rows[0]);
    } catch (error) {
      if (hasDatabaseCode(error, "23505"))
        throw new DomainError(
          "COMMISSION_RULE_DUPLICATE",
          "Já existe uma regra nesta vigência.",
          409,
        );
      throw error;
    }
  }

  async generateCommissions(clinicId: string, competence: string) {
    await this.pool.query(
      `INSERT INTO commission_entries
        (clinic_id, professional_id, appointment_id, rule_id, competence,
         base_amount_in_cents, percentage, amount_in_cents)
       SELECT a.clinic_id, a.professional_id, a.id, rule.id, $2,
              s.price_in_cents, rule.percentage,
              round(s.price_in_cents * rule.percentage / 100.0)::int
       FROM appointments a JOIN services s ON s.id = a.service_id
       JOIN LATERAL (SELECT cr.* FROM commission_rules cr
         WHERE cr.clinic_id = a.clinic_id AND cr.professional_id = a.professional_id
           AND cr.active AND cr.effective_from <= a.starts_at::date
         ORDER BY cr.effective_from DESC LIMIT 1) rule ON true
       WHERE a.clinic_id = $1 AND a.status = 'completed'
         AND to_char(a.starts_at AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM') = $2
       ON CONFLICT (clinic_id, appointment_id) DO NOTHING`,
      [clinicId, competence],
    );
    return this.listCommissions(clinicId, competence);
  }

  async settleCommission(
    clinicId: string,
    actorUserId: string,
    commissionId: string,
  ) {
    const result = await this.pool.query(
      `UPDATE commission_entries SET status = 'paid', paid_at = now(), paid_by_user_id = $3
      WHERE clinic_id = $1 AND id = $2 AND status = 'open' RETURNING id`,
      [clinicId, commissionId, actorUserId],
    );
    if (!result.rows[0]) return null;
    return (
      (await this.listCommissions(clinicId)).find(
        (item) => item.id === commissionId,
      ) ?? null
    );
  }

  async reverseCommission(clinicId: string, commissionId: string) {
    const result = await this.pool.query(
      `UPDATE commission_entries SET status = 'open', paid_at = NULL, paid_by_user_id = NULL
      WHERE clinic_id = $1 AND id = $2 AND status = 'paid' RETURNING id`,
      [clinicId, commissionId],
    );
    if (!result.rows[0]) return null;
    return (
      (await this.listCommissions(clinicId)).find(
        (item) => item.id === commissionId,
      ) ?? null
    );
  }

  private async listCommissions(clinicId: string, competence?: string) {
    const result = await this.pool.query<CommissionEntryRow>(
      `SELECT ce.id, ce.clinic_id AS "clinicId",
      ce.professional_id AS "professionalId", p.full_name AS "professionalName",
      ce.appointment_id AS "appointmentId", ce.competence, ce.base_amount_in_cents AS "baseAmountInCents",
      ce.percentage, ce.amount_in_cents AS "amountInCents", ce.status, ce.paid_at AS "paidAt",
      ce.created_at AS "createdAt" FROM commission_entries ce JOIN professionals p ON p.id = ce.professional_id
      WHERE ce.clinic_id = $1 AND ($2::text IS NULL OR ce.competence = $2) ORDER BY ce.competence DESC`,
      [clinicId, competence ?? null],
    );
    return result.rows.map(mapCommissionEntry);
  }

  async listLeads(clinicId: string) {
    const result = await this.pool.query<LeadRow>(
      `SELECT ${leadColumns} FROM leads WHERE clinic_id = $1 ORDER BY updated_at DESC`,
      [clinicId],
    );
    return result.rows.map(mapLead);
  }

  async createLead(clinicId: string, input: LeadInput) {
    if (input.responsibleUserId) {
      const responsible = await this.pool.query(
        `SELECT 1 FROM users WHERE clinic_id = $1 AND id = $2 AND active`,
        [clinicId, input.responsibleUserId],
      );
      if (!responsible.rows[0])
        throw new DomainError(
          "RESPONSIBLE_USER_NOT_FOUND",
          "Responsável não encontrado.",
          404,
        );
    }
    const result = await this.pool.query<{ id: string }>(
      `INSERT INTO leads
         (clinic_id, full_name, phone, email, source, interest, notes,
          responsible_user_id, tags)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING id`,
      [
        clinicId,
        input.fullName,
        input.phone,
        input.email || null,
        input.source,
        input.interest,
        input.notes || null,
        input.responsibleUserId || null,
        input.tags,
      ],
    );
    return (await this.findLead(this.pool, clinicId, result.rows[0]!.id))!;
  }

  async moveLead(
    clinicId: string,
    actorUserId: string,
    leadId: string,
    stage: LeadStage,
    lostReason?: string,
  ) {
    if (stage === "won") {
      throw new DomainError(
        "LEAD_CONVERSION_REQUIRED",
        "Use a conversão para marcar o lead como ganho.",
      );
    }
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const current = await client.query<{
        stage: LeadStage;
        convertedPatientId: string | null;
      }>(
        `SELECT stage, converted_patient_id AS "convertedPatientId"
         FROM leads WHERE clinic_id = $1 AND id = $2 FOR UPDATE`,
        [clinicId, leadId],
      );
      if (!current.rows[0]) {
        await client.query("COMMIT");
        return null;
      }
      if (current.rows[0].convertedPatientId) {
        throw new DomainError(
          "LEAD_ALREADY_CONVERTED",
          "Este lead já foi convertido em cliente.",
          409,
        );
      }
      await client.query(
        `UPDATE leads SET stage = $3, lost_reason = $4, updated_at = now()
         WHERE clinic_id = $1 AND id = $2`,
        [clinicId, leadId, stage, stage === "lost" ? lostReason : null],
      );
      await client.query(
        `INSERT INTO lead_stage_history
           (clinic_id, lead_id, actor_user_id, from_stage, to_stage, reason)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [
          clinicId,
          leadId,
          actorUserId,
          current.rows[0].stage,
          stage,
          lostReason || null,
        ],
      );
      const lead = await this.findLead(client, clinicId, leadId);
      await client.query("COMMIT");
      return lead;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async convertLead(
    clinicId: string,
    actorUserId: string,
    leadId: string,
  ): Promise<LeadConversion | null> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const leadResult = await client.query<LeadRow>(
        `SELECT ${leadColumns} FROM leads
         WHERE clinic_id = $1 AND id = $2 FOR UPDATE`,
        [clinicId, leadId],
      );
      if (!leadResult.rows[0]) {
        await client.query("COMMIT");
        return null;
      }
      const original = mapLead(leadResult.rows[0]);
      let patientResult = original.convertedPatientId
        ? await client.query<PatientRow>(
            `SELECT ${patientColumns} FROM patients
             WHERE clinic_id = $1 AND id = $2`,
            [clinicId, original.convertedPatientId],
          )
        : await client.query<PatientRow>(
            `SELECT ${patientColumns} FROM patients
             WHERE clinic_id = $1 AND (phone = $2 OR ($3::text IS NOT NULL AND lower(email) = lower($3)))
             ORDER BY created_at LIMIT 1`,
            [clinicId, original.phone, original.email || null],
          );
      if (original.convertedPatientId && !patientResult.rows[0]) {
        throw new DomainError(
          "LEAD_PATIENT_NOT_FOUND",
          "O cliente vinculado a este lead não foi encontrado.",
          409,
        );
      }
      const reusedExisting = Boolean(patientResult.rows[0]);
      if (!patientResult.rows[0]) {
        const patientId = randomUUID();
        patientResult = await client.query<PatientRow>(
          `INSERT INTO patients
             (id, clinic_id, record_number, full_name, phone, email, notes, tags)
           VALUES ($1,$2,$3,$4,$5,$6,$7,ARRAY['Convertido do CRM'])
           RETURNING ${patientColumns}`,
          [
            patientId,
            clinicId,
            `PAC-${patientId.slice(0, 8).toUpperCase()}`,
            original.fullName,
            original.phone,
            original.email || null,
            original.notes || null,
          ],
        );
      }
      const patient = mapPatient(patientResult.rows[0]!);
      if (!original.convertedPatientId) {
        await client.query(
          `UPDATE leads SET stage = 'won', converted_patient_id = $3,
                  lost_reason = NULL, updated_at = now()
           WHERE clinic_id = $1 AND id = $2`,
          [clinicId, leadId, patient.id],
        );
        await client.query(
          `INSERT INTO lead_stage_history
             (clinic_id, lead_id, actor_user_id, from_stage, to_stage, reason)
           VALUES ($1,$2,$3,$4,'won','Conversão em cliente')`,
          [clinicId, leadId, actorUserId, original.stage],
        );
      }
      const lead = await this.findLead(client, clinicId, leadId);
      await client.query("COMMIT");
      return { lead: lead!, patient, reusedExisting };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async getLeadActivity(
    clinicId: string,
    leadId: string,
  ): Promise<LeadActivity | null> {
    const lead = await this.pool.query(
      `SELECT 1 FROM leads WHERE clinic_id = $1 AND id = $2`,
      [clinicId, leadId],
    );
    if (!lead.rows[0]) return null;
    const [contacts, tasks] = await Promise.all([
      this.pool.query<LeadContactRow>(
        `SELECT lc.id, lc.clinic_id AS "clinicId", lc.lead_id AS "leadId",
                lc.channel, lc.direction, lc.notes, u.full_name AS "actorName",
                lc.occurred_at AS "occurredAt", lc.created_at AS "createdAt"
         FROM lead_contacts lc JOIN users u ON u.id = lc.actor_user_id
         WHERE lc.clinic_id = $1 AND lc.lead_id = $2
         ORDER BY lc.occurred_at DESC`,
        [clinicId, leadId],
      ),
      this.pool.query<LeadTaskRow>(
        `SELECT lt.id, lt.clinic_id AS "clinicId", lt.lead_id AS "leadId",
                lt.title, lt.notes, lt.due_at AS "dueAt",
                lt.assigned_user_id AS "assignedUserId",
                u.full_name AS "assignedUserName", lt.status,
                lt.completed_at AS "completedAt", lt.created_at AS "createdAt",
                lt.updated_at AS "updatedAt"
         FROM lead_tasks lt LEFT JOIN users u ON u.id = lt.assigned_user_id
         WHERE lt.clinic_id = $1 AND lt.lead_id = $2
         ORDER BY CASE WHEN lt.status = 'open' THEN 0 ELSE 1 END, lt.due_at`,
        [clinicId, leadId],
      ),
    ]);
    return {
      contacts: contacts.rows.map(mapLeadContact),
      tasks: tasks.rows.map(mapLeadTask),
    };
  }

  async createLeadContact(
    clinicId: string,
    actorUserId: string,
    leadId: string,
    input: LeadContactInput,
  ) {
    const inserted = await this.pool.query<{ id: string }>(
      `INSERT INTO lead_contacts
         (clinic_id, lead_id, actor_user_id, channel, direction, notes, occurred_at)
       SELECT $1, l.id, u.id, $4, $5, $6, $7
       FROM leads l JOIN users u ON u.clinic_id = l.clinic_id AND u.id = $3
       WHERE l.clinic_id = $1 AND l.id = $2
       RETURNING id`,
      [
        clinicId,
        leadId,
        actorUserId,
        input.channel,
        input.direction,
        input.notes,
        input.occurredAt ?? new Date().toISOString(),
      ],
    );
    if (!inserted.rows[0]) return null;
    await this.pool.query(
      `UPDATE leads SET updated_at = now() WHERE clinic_id = $1 AND id = $2`,
      [clinicId, leadId],
    );
    return this.findLeadContact(clinicId, inserted.rows[0].id);
  }

  async createLeadTask(
    clinicId: string,
    actorUserId: string,
    leadId: string,
    input: LeadTaskInput,
  ) {
    const assignedUserId = input.assignedUserId || actorUserId;
    const inserted = await this.pool.query<{ id: string }>(
      `INSERT INTO lead_tasks
         (clinic_id, lead_id, title, notes, due_at, assigned_user_id,
          created_by_user_id)
       SELECT $1, l.id, $4, $5, $6, assigned.id, creator.id
       FROM leads l
       JOIN users creator
         ON creator.clinic_id = l.clinic_id AND creator.id = $3
       JOIN users assigned
         ON assigned.clinic_id = l.clinic_id AND assigned.id = $7 AND assigned.active
       WHERE l.clinic_id = $1 AND l.id = $2
       RETURNING id`,
      [
        clinicId,
        leadId,
        actorUserId,
        input.title,
        input.notes || null,
        input.dueAt,
        assignedUserId,
      ],
    );
    if (!inserted.rows[0]) {
      const lead = await this.pool.query(
        `SELECT 1 FROM leads WHERE clinic_id = $1 AND id = $2`,
        [clinicId, leadId],
      );
      if (!lead.rows[0]) return null;
      throw new DomainError(
        "ASSIGNED_USER_NOT_FOUND",
        "Usuário responsável pela tarefa não encontrado.",
        404,
      );
    }
    await this.pool.query(
      `UPDATE leads SET updated_at = now() WHERE clinic_id = $1 AND id = $2`,
      [clinicId, leadId],
    );
    return this.findLeadTask(clinicId, inserted.rows[0].id);
  }

  async updateLeadTaskStatus(
    clinicId: string,
    taskId: string,
    status: LeadTaskStatus,
  ) {
    const result = await this.pool.query(
      `UPDATE lead_tasks SET status = $3,
              completed_at = CASE WHEN $3 = 'completed' THEN now() ELSE NULL END,
              updated_at = now()
       WHERE clinic_id = $1 AND id = $2 RETURNING id`,
      [clinicId, taskId, status],
    );
    return result.rows[0] ? this.findLeadTask(clinicId, taskId) : null;
  }

  async getCommunicationCenter(clinicId: string) {
    const [preferences, messages] = await Promise.all([
      this.pool.query<CommunicationPreferenceRow>(
        `SELECT id, clinic_id AS "clinicId", patient_id AS "patientId",
                channel, allowed, updated_at AS "updatedAt"
         FROM communication_preferences WHERE clinic_id = $1
         ORDER BY updated_at DESC`,
        [clinicId],
      ),
      this.pool.query<OutboundMessageRow>(
        `SELECT ${outboundMessageColumns}
         FROM outbound_messages om
         JOIN patients p ON p.id = om.patient_id
         WHERE om.clinic_id = $1 ORDER BY om.created_at DESC LIMIT 250`,
        [clinicId],
      ),
    ]);
    return {
      deliveryMode: "outbox_only" as const,
      preferences: preferences.rows.map(mapCommunicationPreference),
      messages: messages.rows.map(mapOutboundMessage),
    };
  }

  async setCommunicationPreference(
    clinicId: string,
    input: CommunicationPreferenceInput,
  ) {
    const patient = await this.pool.query(
      `SELECT 1 FROM patients WHERE clinic_id = $1 AND id = $2`,
      [clinicId, input.patientId],
    );
    if (!patient.rows[0])
      throw new DomainError(
        "PATIENT_NOT_FOUND",
        "Cliente não encontrado.",
        404,
      );
    const result = await this.pool.query<CommunicationPreferenceRow>(
      `INSERT INTO communication_preferences
         (clinic_id, patient_id, channel, allowed)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (clinic_id, patient_id, channel)
       DO UPDATE SET allowed = EXCLUDED.allowed, updated_at = now()
       RETURNING id, clinic_id AS "clinicId", patient_id AS "patientId",
                 channel, allowed, updated_at AS "updatedAt"`,
      [clinicId, input.patientId, input.channel, input.allowed],
    );
    return mapCommunicationPreference(result.rows[0]!);
  }

  async queueManualMessage(clinicId: string, input: ManualMessageInput) {
    const patient = await this.pool.query<{
      id: string;
      phone: string;
      whatsapp: string | null;
      email: string | null;
    }>(
      `SELECT id, phone, whatsapp, email FROM patients
       WHERE clinic_id = $1 AND id = $2`,
      [clinicId, input.patientId],
    );
    if (!patient.rows[0])
      throw new DomainError(
        "PATIENT_NOT_FOUND",
        "Cliente não encontrado.",
        404,
      );
    await this.assertCommunicationAllowed(
      clinicId,
      input.patientId,
      input.channel,
    );
    const recipient = communicationRecipient(patient.rows[0], input.channel);
    if (!recipient)
      throw new DomainError(
        "COMMUNICATION_RECIPIENT_MISSING",
        "O cliente não possui contato para o canal selecionado.",
      );
    const result = await this.pool.query<OutboundMessageRow>(
      `WITH inserted AS (
         INSERT INTO outbound_messages
           (clinic_id, patient_id, channel, kind, recipient, body,
            scheduled_for, idempotency_key)
         VALUES ($1,$2,$3,'manual',$4,$5,$6,$7)
         RETURNING *
       )
       SELECT ${outboundMessageColumns}
       FROM inserted om JOIN patients p ON p.id = om.patient_id`,
      [
        clinicId,
        input.patientId,
        input.channel,
        recipient,
        input.body,
        input.scheduledFor ?? new Date().toISOString(),
        `manual:${randomUUID()}`,
      ],
    );
    return mapOutboundMessage(result.rows[0]!);
  }

  async generateReminders(clinicId: string, referenceDate: string) {
    const candidates = await this.pool.query<{
      patientId: string;
      patientName: string;
      phone: string;
      kind: OutboundMessage["kind"];
      sourceId: string;
      body: string;
      preferenceAllowed: boolean;
    }>(
      `SELECT a.patient_id AS "patientId", p.full_name AS "patientName", coalesce(p.whatsapp, p.phone) AS phone,
              'appointment_reminder' AS kind, a.id AS "sourceId",
              'Olá, ' || p.full_name || '. Lembramos do seu atendimento em ' ||
              to_char(a.starts_at AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY às HH24:MI') || '.' AS body,
              COALESCE(cp.allowed, true) AS "preferenceAllowed"
       FROM appointments a
       JOIN patients p ON p.id = a.patient_id
       LEFT JOIN communication_preferences cp
         ON cp.clinic_id = a.clinic_id AND cp.patient_id = a.patient_id
        AND cp.channel = 'whatsapp'
       WHERE a.clinic_id = $1
         AND (a.starts_at AT TIME ZONE 'America/Sao_Paulo')::date = $2::date
         AND a.status IN ('scheduled', 'confirmed')
       UNION ALL
       SELECT r.patient_id, p.full_name, coalesce(p.whatsapp, p.phone), 'payment_reminder', r.id,
              'Olá, ' || p.full_name || '. Identificamos uma parcela com vencimento em ' ||
              to_char(r.due_date, 'DD/MM/YYYY') || '. Fale com a clínica se precisar de ajuda.',
              COALESCE(cp.allowed, true)
       FROM receivables r
       JOIN patients p ON p.id = r.patient_id
       LEFT JOIN communication_preferences cp
         ON cp.clinic_id = r.clinic_id AND cp.patient_id = r.patient_id
        AND cp.channel = 'whatsapp'
       WHERE r.clinic_id = $1 AND r.status = 'open' AND r.due_date <= $2::date`,
      [clinicId, referenceDate],
    );
    let queued = 0;
    let skippedByPreference = 0;
    let alreadyQueued = 0;
    for (const candidate of candidates.rows) {
      if (!candidate.preferenceAllowed) {
        skippedByPreference += 1;
        continue;
      }
      const key = `${candidate.kind}:${candidate.sourceId}:whatsapp`;
      const inserted = await this.pool.query(
        `INSERT INTO outbound_messages
           (clinic_id, patient_id, appointment_id, receivable_id, channel,
            kind, recipient, body, scheduled_for, idempotency_key)
         VALUES ($1,$2,$3,$4,'whatsapp',$5,$6,$7,now(),$8)
         ON CONFLICT (clinic_id, idempotency_key) DO NOTHING
         RETURNING id`,
        [
          clinicId,
          candidate.patientId,
          candidate.kind === "appointment_reminder" ? candidate.sourceId : null,
          candidate.kind === "payment_reminder" ? candidate.sourceId : null,
          candidate.kind,
          candidate.phone,
          candidate.body,
          key,
        ],
      );
      if (inserted.rowCount) queued += 1;
      else alreadyQueued += 1;
    }
    return { queued, skippedByPreference, alreadyQueued };
  }

  async listDocumentTemplates(clinicId: string) {
    const result = await this.pool.query<DocumentTemplateRow>(
      `SELECT ${documentTemplateColumns} FROM document_templates
       WHERE clinic_id = $1 ORDER BY name, version DESC`,
      [clinicId],
    );
    return result.rows.map(mapDocumentTemplate);
  }

  async createDocumentTemplate(clinicId: string, input: DocumentTemplateInput) {
    try {
      const result = await this.pool.query<DocumentTemplateRow>(
        `INSERT INTO document_templates
           (clinic_id, name, kind, version, body)
         VALUES ($1,$2,$3,1,$4)
         RETURNING ${documentTemplateColumns}`,
        [clinicId, input.name, input.kind, input.body],
      );
      return mapDocumentTemplate(result.rows[0]!);
    } catch (error) {
      if (hasDatabaseCode(error, "23505"))
        throw new DomainError(
          "DOCUMENT_TEMPLATE_DUPLICATE",
          "Já existe um modelo ativo com este nome.",
          409,
        );
      throw error;
    }
  }

  async createDocumentTemplateVersion(
    clinicId: string,
    templateId: string,
    body: string,
  ) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const current = await client.query<DocumentTemplateRow>(
        `SELECT ${documentTemplateColumns} FROM document_templates
         WHERE clinic_id = $1 AND id = $2 FOR UPDATE`,
        [clinicId, templateId],
      );
      if (!current.rows[0]) {
        await client.query("COMMIT");
        return null;
      }
      const template = current.rows[0];
      const versionResult = await client.query<{ nextVersion: number }>(
        `SELECT COALESCE(MAX(version), 0) + 1 AS "nextVersion"
         FROM document_templates WHERE clinic_id = $1 AND name = $2`,
        [clinicId, template.name],
      );
      await client.query(
        `UPDATE document_templates SET active = false
         WHERE clinic_id = $1 AND name = $2 AND active`,
        [clinicId, template.name],
      );
      const result = await client.query<DocumentTemplateRow>(
        `INSERT INTO document_templates
           (clinic_id, name, kind, version, body, previous_version_id)
         VALUES ($1,$2,$3,$4,$5,$6)
         RETURNING ${documentTemplateColumns}`,
        [
          clinicId,
          template.name,
          template.kind,
          versionResult.rows[0]!.nextVersion,
          body,
          template.id,
        ],
      );
      await client.query("COMMIT");
      return mapDocumentTemplate(result.rows[0]!);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async listIssuedDocuments(clinicId: string) {
    const result = await this.pool.query<IssuedDocumentRow>(
      `SELECT ${issuedDocumentColumns}
       FROM issued_documents d
       JOIN patients p ON p.id = d.patient_id
       LEFT JOIN patient_plans pp ON pp.id = d.plan_id
       WHERE d.clinic_id = $1 ORDER BY d.created_at DESC`,
      [clinicId],
    );
    return result.rows.map(mapIssuedDocument);
  }

  async createIssuedDocument(
    clinicId: string,
    actorUserId: string,
    input: IssuedDocumentInput,
  ) {
    const context = await this.pool.query<{
      templateName: string;
      templateVersion: number;
      templateBody: string;
      patientName: string;
      planName: string | null;
      clinicName: string;
    }>(
      `SELECT dt.name AS "templateName", dt.version AS "templateVersion",
              dt.body AS "templateBody", p.full_name AS "patientName",
              pp.name AS "planName", c.name AS "clinicName"
       FROM document_templates dt
       JOIN clinics c ON c.id = dt.clinic_id
       JOIN patients p ON p.clinic_id = dt.clinic_id AND p.id = $3
       LEFT JOIN patient_plans pp
         ON pp.clinic_id = dt.clinic_id AND pp.id = $4 AND pp.patient_id = p.id
       WHERE dt.clinic_id = $1 AND dt.id = $2 AND dt.active
         AND ($4::uuid IS NULL OR pp.id IS NOT NULL)`,
      [clinicId, input.templateId, input.patientId, input.planId || null],
    );
    if (!context.rows[0]) {
      const template = await this.pool.query(
        `SELECT 1 FROM document_templates
         WHERE clinic_id = $1 AND id = $2 AND active`,
        [clinicId, input.templateId],
      );
      if (!template.rows[0])
        throw new DomainError(
          "DOCUMENT_TEMPLATE_NOT_FOUND",
          "Modelo ativo não encontrado.",
          404,
        );
      const patient = await this.pool.query(
        `SELECT 1 FROM patients WHERE clinic_id = $1 AND id = $2`,
        [clinicId, input.patientId],
      );
      if (!patient.rows[0])
        throw new DomainError(
          "PATIENT_NOT_FOUND",
          "Cliente não encontrado.",
          404,
        );
      throw new DomainError(
        "DOCUMENT_PLAN_MISMATCH",
        "O plano informado não pertence ao cliente.",
      );
    }
    const item = context.rows[0];
    const emissionDate = new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
    }).format(new Date());
    const snapshot = item.templateBody
      .replaceAll("{{paciente_nome}}", item.patientName)
      .replaceAll("{{plano_nome}}", item.planName ?? "Não vinculado")
      .replaceAll("{{data_emissao}}", emissionDate)
      .replaceAll("{{clinica_nome}}", item.clinicName);
    const result = await this.pool.query<IssuedDocumentRow>(
      `WITH inserted AS (
         INSERT INTO issued_documents
           (clinic_id, template_id, patient_id, plan_id, title, template_name,
            template_version, snapshot_body, created_by_user_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         RETURNING *
       )
       SELECT ${issuedDocumentColumns}
       FROM inserted d
       JOIN patients p ON p.id = d.patient_id
       LEFT JOIN patient_plans pp ON pp.id = d.plan_id`,
      [
        clinicId,
        input.templateId,
        input.patientId,
        input.planId || null,
        input.title,
        item.templateName,
        item.templateVersion,
        snapshot,
        actorUserId,
      ],
    );
    return mapIssuedDocument(result.rows[0]!);
  }

  async updateIssuedDocumentStatus(
    clinicId: string,
    documentId: string,
    status: Exclude<DocumentStatus, "draft">,
  ) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const current = await client.query<{ status: DocumentStatus }>(
        `SELECT status FROM issued_documents
         WHERE clinic_id = $1 AND id = $2 FOR UPDATE`,
        [clinicId, documentId],
      );
      if (!current.rows[0]) {
        await client.query("COMMIT");
        return null;
      }
      if (current.rows[0].status === "cancelled")
        throw new DomainError(
          "DOCUMENT_ALREADY_CANCELLED",
          "Um documento cancelado não pode ser alterado.",
          409,
        );
      if (status === "issued" && current.rows[0].status !== "draft")
        throw new DomainError(
          "DOCUMENT_ALREADY_ISSUED",
          "Este documento já foi emitido.",
          409,
        );
      await client.query(
        `UPDATE issued_documents
         SET status = $3,
             issued_at = CASE WHEN $3 = 'issued' THEN now() ELSE issued_at END,
             cancelled_at = CASE WHEN $3 = 'cancelled' THEN now() ELSE cancelled_at END,
             updated_at = now()
         WHERE clinic_id = $1 AND id = $2`,
        [clinicId, documentId, status],
      );
      const document = await this.findIssuedDocument(
        client,
        clinicId,
        documentId,
      );
      await client.query("COMMIT");
      return document;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async getSalesReport(clinicId: string, month: string): Promise<SalesReport> {
    const asOf = new Date();
    const bounds = salesReportBounds(month, asOf);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      const planResult = await client.query<{
        id: string;
        patientId: string;
        patientName: string;
        name: string;
        serviceName: string;
        totalValueInCents: number;
        cancelledValueInCents: number;
        createdAt: Date;
        cancelledAt: Date | null;
      }>(
        `SELECT pp.id, pp.patient_id AS "patientId", p.full_name AS "patientName",
                pp.name, s.name AS "serviceName",
                pp.total_value_in_cents AS "totalValueInCents",
                pp.cancelled_value_in_cents AS "cancelledValueInCents",
                pp.created_at AS "createdAt", pp.cancelled_at AS "cancelledAt"
         FROM patient_plans pp
         JOIN patients p ON p.id=pp.patient_id
         JOIN services s ON s.id=pp.service_id
         WHERE pp.clinic_id=$1 AND (
           (pp.created_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN $2::date AND $3::date
           OR (pp.cancelled_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN $2::date AND $3::date
         )`,
        [clinicId, bounds.previousFrom, bounds.currentTo],
      );
      const productResult = await client.query<{
        id: string;
        tabId: string;
        patientId: string;
        patientName: string;
        productName: string;
        quantity: number;
        amountInCents: number;
        closedAt: Date;
        cancelledAt: Date | null;
        receivableId: string | null;
      }>(
        `SELECT i.id, t.id AS "tabId", t.patient_id AS "patientId",
                p.full_name AS "patientName", pr.name AS "productName",
                i.quantity, (i.quantity*i.unit_price_in_cents)::int AS "amountInCents",
                t.closed_at AS "closedAt", t.cancelled_at AS "cancelledAt",
                t.receivable_id AS "receivableId"
         FROM patient_tab_items i
         JOIN patient_tabs t ON t.id=i.tab_id
         JOIN patients p ON p.id=t.patient_id
         JOIN products pr ON pr.id=i.product_id
         WHERE t.clinic_id=$1 AND t.closed_at IS NOT NULL AND (
           (t.closed_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN $2::date AND $3::date
           OR (t.cancelled_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN $2::date AND $3::date
         )`,
        [clinicId, bounds.previousFrom, bounds.currentTo],
      );
      const paymentResult = await client.query<{
        id: string;
        receivableId: string;
        kind: "payment" | "payment_reversal";
        patientId: string;
        patientName: string;
        planId: string | null;
        tabId: string | null;
        description: string;
        amountInCents: number;
        occurredAt: Date;
        paymentMethod: ReceivedPayment["paymentMethod"] | null;
      }>(
        `SELECT fe.id, fe.receivable_id AS "receivableId", fe.kind,
                r.patient_id AS "patientId", p.full_name AS "patientName",
                r.plan_id AS "planId", t.id AS "tabId", r.description,
                fe.amount_in_cents AS "amountInCents", fe.created_at AS "occurredAt",
                fe.metadata->>'paymentMethod' AS "paymentMethod"
         FROM financial_events fe
         JOIN receivables r ON r.id=fe.receivable_id
         JOIN patients p ON p.id=r.patient_id
         LEFT JOIN patient_tabs t ON t.receivable_id=r.id
         WHERE fe.clinic_id=$1 AND fe.kind IN ('payment','payment_reversal') AND
           (fe.created_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN $2::date AND $3::date`,
        [clinicId, bounds.previousFrom, bounds.currentTo],
      );
      const appointmentResult = await client.query<AppointmentRow>(
        `SELECT ${appointmentColumns} FROM appointments a ${appointmentJoins}
         WHERE a.clinic_id=$1 AND (
           (a.status='completed' AND (a.starts_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN $2::date AND $3::date)
           OR (a.status IN ('scheduled','confirmed') AND (a.starts_at AT TIME ZONE 'America/Sao_Paulo')::date >= $4::date)
         )`,
        [clinicId, bounds.previousFrom, bounds.currentTo, bounds.today],
      );
      await client.query("COMMIT");
      const sales: SaleMovement[] = [];
      for (const plan of planResult.rows) {
        const base = {
          sourceId: plan.id,
          sourceType: "plan" as const,
          patientId: plan.patientId,
          patientName: plan.patientName,
          itemName: `${plan.name} (${plan.serviceName})`,
          quantity: 1,
        };
        sales.push({
          ...base,
          id: `${plan.id}:sale`,
          kind: "sale",
          occurredAt: plan.createdAt.toISOString(),
          amountInCents: plan.totalValueInCents,
        });
        if (plan.cancelledAt)
          sales.push({
            ...base,
            id: `${plan.id}:cancellation`,
            kind: "cancellation",
            occurredAt: plan.cancelledAt.toISOString(),
            amountInCents: -plan.cancelledValueInCents,
          });
      }
      for (const item of productResult.rows) {
        const base = {
          sourceId: item.tabId,
          sourceType: "product" as const,
          patientId: item.patientId,
          patientName: item.patientName,
          itemName: item.productName,
          quantity: item.quantity,
          ...(item.receivableId ? { receivableId: item.receivableId } : {}),
        };
        sales.push({
          ...base,
          id: `${item.id}:sale`,
          kind: "sale",
          occurredAt: item.closedAt.toISOString(),
          amountInCents: item.amountInCents,
        });
        if (item.cancelledAt)
          sales.push({
            ...base,
            id: `${item.id}:cancellation`,
            kind: "cancellation",
            occurredAt: item.cancelledAt.toISOString(),
            amountInCents: -item.amountInCents,
          });
      }
      const payments: ReceivedPayment[] = paymentResult.rows.map((item) => ({
        id: item.id,
        receivableId: item.receivableId,
        kind: item.kind === "payment" ? "payment" : "reversal",
        ...(item.planId || item.tabId
          ? { sourceId: item.planId ?? item.tabId! }
          : {}),
        occurredAt: item.occurredAt.toISOString(),
        patientId: item.patientId,
        patientName: item.patientName,
        description: item.description,
        amountInCents: item.amountInCents,
        ...(item.paymentMethod ? { paymentMethod: item.paymentMethod } : {}),
      }));
      return buildSalesReport(
        month,
        sales,
        payments,
        appointmentResult.rows.map(mapAppointment),
        asOf,
      );
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async getManagementReport(
    clinicId: string,
    from: string,
    to: string,
  ): Promise<ManagementReport> {
    interface AppointmentAggregate {
      total: number;
      completed: number;
      noShows: number;
      cancelled: number;
    }
    interface BreakdownRow extends AppointmentAggregate {
      id: string;
      name: string;
    }
    const dateFilter = `(a.starts_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN $2::date AND $3::date`;
    const [
      appointmentResult,
      professionalResult,
      serviceResult,
      planResult,
      movementResult,
      financeResult,
      commercialResult,
      sourceResult,
    ] = await Promise.all([
      this.pool.query<AppointmentAggregate>(
        `SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE a.status = 'completed')::int AS completed,
                COUNT(*) FILTER (WHERE a.status = 'no_show')::int AS "noShows",
                COUNT(*) FILTER (WHERE a.status = 'cancelled')::int AS cancelled
         FROM appointments a WHERE a.clinic_id = $1 AND ${dateFilter}`,
        [clinicId, from, to],
      ),
      this.pool.query<BreakdownRow>(
        `SELECT pr.id, pr.full_name AS name, COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE a.status = 'completed')::int AS completed,
                COUNT(*) FILTER (WHERE a.status = 'no_show')::int AS "noShows",
                COUNT(*) FILTER (WHERE a.status = 'cancelled')::int AS cancelled
         FROM appointments a JOIN professionals pr ON pr.id = a.professional_id
         WHERE a.clinic_id = $1 AND ${dateFilter}
         GROUP BY pr.id, pr.full_name ORDER BY total DESC`,
        [clinicId, from, to],
      ),
      this.pool.query<BreakdownRow>(
        `SELECT s.id, s.name, COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE a.status = 'completed')::int AS completed,
                COUNT(*) FILTER (WHERE a.status = 'no_show')::int AS "noShows",
                COUNT(*) FILTER (WHERE a.status = 'cancelled')::int AS cancelled
         FROM appointments a JOIN services s ON s.id = a.service_id
         WHERE a.clinic_id = $1 AND ${dateFilter}
         GROUP BY s.id, s.name ORDER BY total DESC`,
        [clinicId, from, to],
      ),
      this.pool.query<{ active: number; availableSessions: number }>(
        `SELECT COUNT(*)::int AS active,
                COALESCE(SUM(remaining_sessions), 0)::int AS "availableSessions"
         FROM patient_plans WHERE clinic_id = $1 AND status = 'active'`,
        [clinicId],
      ),
      this.pool.query<{ consumed: number }>(
        `SELECT GREATEST(0, -COALESCE(SUM(sm.quantity), 0))::int AS consumed
         FROM session_movements sm
         WHERE sm.clinic_id = $1 AND sm.kind <> 'credit'
           AND (sm.created_at AT TIME ZONE 'America/Sao_Paulo')::date
               BETWEEN $2::date AND $3::date`,
        [clinicId, from, to],
      ),
      this.pool.query<{
        openInCents: number;
        overdueInCents: number;
        paidInPeriodInCents: number;
      }>(
        `SELECT
           COALESCE(SUM(amount_in_cents) FILTER (WHERE status = 'open'), 0)::int AS "openInCents",
           COALESCE(SUM(amount_in_cents) FILTER
             (WHERE status = 'open' AND due_date < CURRENT_DATE), 0)::int AS "overdueInCents",
           COALESCE((SELECT SUM(fe.amount_in_cents)
             FROM financial_events fe
             WHERE fe.clinic_id=$1 AND fe.kind IN ('payment','payment_reversal')
               AND (fe.created_at AT TIME ZONE 'America/Sao_Paulo')::date
                   BETWEEN $2::date AND $3::date), 0)::int AS "paidInPeriodInCents"
         FROM receivables WHERE clinic_id = $1`,
        [clinicId, from, to],
      ),
      this.pool.query<{
        leadsCreated: number;
        won: number;
        lost: number;
        averageFirstResponseMinutes: number;
      }>(
        `SELECT COUNT(*)::int AS "leadsCreated",
                COUNT(*) FILTER (WHERE stage = 'won')::int AS won,
                COUNT(*) FILTER (WHERE stage = 'lost')::int AS lost,
                COALESCE(AVG(EXTRACT(EPOCH FROM (first_contact.occurred_at - leads.created_at)) / 60)
                  FILTER (WHERE first_contact.occurred_at IS NOT NULL), 0)::int
                  AS "averageFirstResponseMinutes"
         FROM leads
         LEFT JOIN LATERAL (
           SELECT MIN(lc.occurred_at) AS occurred_at
           FROM lead_contacts lc
           WHERE lc.lead_id = leads.id AND lc.direction <> 'internal'
         ) first_contact ON true
         WHERE clinic_id = $1
           AND (created_at AT TIME ZONE 'America/Sao_Paulo')::date
               BETWEEN $2::date AND $3::date`,
        [clinicId, from, to],
      ),
      this.pool.query<{
        source: string;
        leads: number;
        won: number;
        lost: number;
      }>(
        `SELECT source, COUNT(*)::int AS leads,
                COUNT(*) FILTER (WHERE stage = 'won')::int AS won,
                COUNT(*) FILTER (WHERE stage = 'lost')::int AS lost
         FROM leads WHERE clinic_id = $1
           AND (created_at AT TIME ZONE 'America/Sao_Paulo')::date
               BETWEEN $2::date AND $3::date
         GROUP BY source ORDER BY leads DESC`,
        [clinicId, from, to],
      ),
    ]);
    const [dreResult, productProfitResult, serviceProfitResult, operationResult] =
      await Promise.all([
        this.pool.query<{
          serviceRevenueInCents: number;
          productRevenueInCents: number;
          productCostInCents: number;
          operatingExpensesInCents: number;
          commissionsInCents: number;
        }>(
          `WITH paid AS (
             SELECT r.* FROM receivables r WHERE r.clinic_id=$1 AND r.status='paid'
               AND (r.paid_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN $2::date AND $3::date
           ), product_tabs AS (
             SELECT t.id,t.receivable_id FROM patient_tabs t JOIN paid r ON r.id=t.receivable_id
             WHERE t.status='closed'
           ) SELECT
             COALESCE((SELECT sum(amount_in_cents) FROM paid r WHERE NOT EXISTS(SELECT 1 FROM product_tabs t WHERE t.receivable_id=r.id)),0)::int AS "serviceRevenueInCents",
             COALESCE((SELECT sum(r.amount_in_cents) FROM paid r JOIN product_tabs t ON t.receivable_id=r.id),0)::int AS "productRevenueInCents",
             COALESCE((SELECT sum(i.quantity*i.unit_cost_in_cents) FROM patient_tab_items i JOIN product_tabs t ON t.id=i.tab_id),0)::int AS "productCostInCents",
             COALESCE((SELECT sum(amount_in_cents) FROM payables WHERE clinic_id=$1 AND status='paid' AND (paid_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN $2::date AND $3::date),0)::int AS "operatingExpensesInCents",
             COALESCE((SELECT sum(amount_in_cents) FROM commission_entries WHERE clinic_id=$1 AND status='paid' AND (paid_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN $2::date AND $3::date),0)::int AS "commissionsInCents"`,
          [clinicId, from, to],
        ),
        this.pool.query<{
          id: string;
          name: string;
          unitsSold: number;
          revenueInCents: number;
          costInCents: number;
        }>(
          `SELECT p.id,p.name,sum(i.quantity)::int AS "unitsSold",sum(i.quantity*i.unit_price_in_cents)::int AS "revenueInCents",sum(i.quantity*i.unit_cost_in_cents)::int AS "costInCents"
           FROM patient_tab_items i JOIN products p ON p.id=i.product_id
           JOIN patient_tabs t ON t.id=i.tab_id JOIN receivables r ON r.id=t.receivable_id
           WHERE i.clinic_id=$1 AND t.status='closed' AND r.status='paid'
             AND (r.paid_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN $2::date AND $3::date
           GROUP BY p.id,p.name ORDER BY "revenueInCents" DESC`,
          [clinicId, from, to],
        ),
        this.pool.query<{
          id: string;
          name: string;
          completedAppointments: number;
          revenueInCents: number;
          commissionsInCents: number;
        }>(
          `SELECT s.id,s.name,
             (SELECT count(*)::int FROM appointments a WHERE a.clinic_id=$1 AND a.service_id=s.id AND a.status='completed' AND (a.starts_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN $2::date AND $3::date) AS "completedAppointments",
             (SELECT coalesce(sum(r.amount_in_cents),0)::int FROM receivables r JOIN patient_plans pp ON pp.id=r.plan_id WHERE r.clinic_id=$1 AND pp.service_id=s.id AND r.status='paid' AND (r.paid_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN $2::date AND $3::date) AS "revenueInCents",
             (SELECT coalesce(sum(c.amount_in_cents),0)::int FROM commission_entries c JOIN appointments a ON a.id=c.appointment_id WHERE c.clinic_id=$1 AND a.service_id=s.id AND c.status='paid' AND (c.paid_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN $2::date AND $3::date) AS "commissionsInCents"
           FROM services s WHERE s.clinic_id=$1
           ORDER BY "revenueInCents" DESC`,
          [clinicId, from, to],
        ),
        this.pool.query<{
          activeGroupSeats: number;
          totalGroupCapacity: number;
          waitlistCount: number;
          lowStockCount: number;
          averageReceiptInCents: number;
        }>(
          `SELECT
             (SELECT count(*)::int FROM group_enrollments e JOIN group_classes g ON g.id=e.group_id WHERE e.clinic_id=$1 AND e.status='active' AND g.active) AS "activeGroupSeats",
             (SELECT coalesce(sum(capacity),0)::int FROM group_classes WHERE clinic_id=$1 AND active) AS "totalGroupCapacity",
             (SELECT count(*)::int FROM group_enrollments e JOIN group_classes g ON g.id=e.group_id WHERE e.clinic_id=$1 AND e.status='waitlisted' AND g.active) AS "waitlistCount",
             (SELECT count(*)::int FROM products WHERE clinic_id=$1 AND active AND current_stock<=minimum_stock) AS "lowStockCount",
             (SELECT coalesce(avg(amount_in_cents),0)::int FROM receivables WHERE clinic_id=$1 AND status='paid' AND (paid_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN $2::date AND $3::date) AS "averageReceiptInCents"`,
          [clinicId, from, to],
        ),
      ]);
    const attendanceRate = (completed: number, noShows: number) => {
      const decided = completed + noShows;
      return decided ? Math.round((completed / decided) * 100) : 0;
    };
    const appointment = appointmentResult.rows[0]!;
    const plan = planResult.rows[0]!;
    const finance = financeResult.rows[0]!;
    const commercial = commercialResult.rows[0]!;
    const mapBreakdown = (row: BreakdownRow) => ({
      id: row.id,
      name: row.name,
      appointments: row.total,
      completed: row.completed,
      noShows: row.noShows,
      attendanceRate: attendanceRate(row.completed, row.noShows),
    });
    const percentage = (part: number, total: number) =>
      total ? Math.round((part / total) * 1000) / 10 : 0;
    const dre = dreResult.rows[0]!;
    const grossRevenueInCents =
      dre.serviceRevenueInCents + dre.productRevenueInCents;
    const grossProfitInCents = grossRevenueInCents - dre.productCostInCents;
    const netResultInCents =
      grossProfitInCents -
      dre.operatingExpensesInCents -
      dre.commissionsInCents;
    const byProduct = productProfitResult.rows.map((row) => {
      const grossProfitInCents = row.revenueInCents - row.costInCents;
      return {
        ...row,
        grossProfitInCents,
        grossMargin: percentage(grossProfitInCents, row.revenueInCents),
      };
    });
    const byServiceProfitability = serviceProfitResult.rows
      .filter(
        (row) => row.completedAppointments > 0 || row.revenueInCents > 0,
      )
      .map((row) => {
        const contributionInCents =
          row.revenueInCents - row.commissionsInCents;
        return {
          ...row,
          contributionInCents,
          contributionMargin: percentage(
            contributionInCents,
            row.revenueInCents,
          ),
        };
      });
    const operation = operationResult.rows[0]!;
    return {
      from,
      to,
      generatedAt: new Date().toISOString(),
      appointments: {
        ...appointment,
        attendanceRate: attendanceRate(
          appointment.completed,
          appointment.noShows,
        ),
      },
      plans: {
        ...plan,
        consumedInPeriod: movementResult.rows[0]!.consumed,
      },
      finance,
      commercial: {
        ...commercial,
        conversionRate: commercial.leadsCreated
          ? Math.round((commercial.won / commercial.leadsCreated) * 100)
          : 0,
      },
      byProfessional: professionalResult.rows.map(mapBreakdown),
      byService: serviceResult.rows.map(mapBreakdown),
      bySource: sourceResult.rows.map((row) => ({
        ...row,
        conversionRate: row.leads ? Math.round((row.won / row.leads) * 100) : 0,
      })),
      profitability: {
        dre: {
          ...dre,
          grossRevenueInCents,
          grossProfitInCents,
          netResultInCents,
          netMargin: percentage(netResultInCents, grossRevenueInCents),
        },
        byService: byServiceProfitability,
        byProduct,
        operational: {
          ...operation,
          groupOccupancyRate: percentage(
            operation.activeGroupSeats,
            operation.totalGroupCapacity,
          ),
          productUnitsSold: byProduct.reduce(
            (sum, item) => sum + item.unitsSold,
            0,
          ),
        },
      },
    };
  }

  private async addClinicalAccessEvent(
    clinicId: string,
    patientId: string,
    actorUserId: string,
    action: ClinicalAccessEvent["action"],
    entityType: ClinicalAccessEvent["entityType"],
    entityId?: string,
    client: Pool | PoolClient = this.pool,
  ) {
    await client.query(
      `INSERT INTO clinical_access_events
         (clinic_id, patient_id, actor_user_id, action, entity_type, entity_id)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [clinicId, patientId, actorUserId, action, entityType, entityId ?? null],
    );
  }

  private async addAdminAudit(
    client: Pool | PoolClient,
    clinicId: string,
    actorUserId: string,
    action: string,
    entityType: string,
    entityId?: string,
    metadata: Record<string, unknown> = {},
  ) {
    await client.query(
      `INSERT INTO audit_events
         (clinic_id, actor_user_id, action, entity_type, entity_id, metadata)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [clinicId, actorUserId, action, entityType, entityId ?? null, metadata],
    );
  }

  private async assertCommunicationAllowed(
    clinicId: string,
    patientId: string,
    channel: CommunicationChannel,
  ) {
    const result = await this.pool.query<{ allowed: boolean }>(
      `SELECT allowed FROM communication_preferences
       WHERE clinic_id = $1 AND patient_id = $2 AND channel = $3`,
      [clinicId, patientId, channel],
    );
    if (result.rows[0]?.allowed === false)
      throw new DomainError(
        "COMMUNICATION_OPT_OUT",
        "O cliente não autorizou mensagens neste canal.",
        409,
      );
  }

  private async findIssuedDocument(
    client: Pool | PoolClient,
    clinicId: string,
    documentId: string,
  ) {
    const result = await client.query<IssuedDocumentRow>(
      `SELECT ${issuedDocumentColumns}
       FROM issued_documents d
       JOIN patients p ON p.id = d.patient_id
       LEFT JOIN patient_plans pp ON pp.id = d.plan_id
       WHERE d.clinic_id = $1 AND d.id = $2`,
      [clinicId, documentId],
    );
    return result.rows[0] ? mapIssuedDocument(result.rows[0]) : null;
  }

  private async findLead(
    client: Pool | PoolClient,
    clinicId: string,
    leadId: string,
  ) {
    const result = await client.query<LeadRow>(
      `SELECT ${leadColumns} FROM leads WHERE clinic_id = $1 AND id = $2`,
      [clinicId, leadId],
    );
    return result.rows[0] ? mapLead(result.rows[0]) : null;
  }

  private async findLeadContact(clinicId: string, contactId: string) {
    const result = await this.pool.query<LeadContactRow>(
      `SELECT lc.id, lc.clinic_id AS "clinicId", lc.lead_id AS "leadId",
              lc.channel, lc.direction, lc.notes, u.full_name AS "actorName",
              lc.occurred_at AS "occurredAt", lc.created_at AS "createdAt"
       FROM lead_contacts lc JOIN users u ON u.id = lc.actor_user_id
       WHERE lc.clinic_id = $1 AND lc.id = $2`,
      [clinicId, contactId],
    );
    return result.rows[0] ? mapLeadContact(result.rows[0]) : null;
  }

  private async findLeadTask(clinicId: string, taskId: string) {
    const result = await this.pool.query<LeadTaskRow>(
      `SELECT lt.id, lt.clinic_id AS "clinicId", lt.lead_id AS "leadId",
              lt.title, lt.notes, lt.due_at AS "dueAt",
              lt.assigned_user_id AS "assignedUserId",
              u.full_name AS "assignedUserName", lt.status,
              lt.completed_at AS "completedAt", lt.created_at AS "createdAt",
              lt.updated_at AS "updatedAt"
       FROM lead_tasks lt LEFT JOIN users u ON u.id = lt.assigned_user_id
       WHERE lt.clinic_id = $1 AND lt.id = $2`,
      [clinicId, taskId],
    );
    return result.rows[0] ? mapLeadTask(result.rows[0]) : null;
  }

  private async findAppointment(
    clinicId: string,
    appointmentId: string,
    client: Pool | PoolClient = this.pool,
  ) {
    const result = await client.query<AppointmentRow>(
      `
        SELECT ${appointmentColumns}
        FROM appointments a
        ${appointmentJoins}
        WHERE a.clinic_id = $1 AND a.id = $2
      `,
      [clinicId, appointmentId],
    );
    return result.rows[0] ? mapAppointment(result.rows[0]) : null;
  }

  private async findPatientTab(
    clinicId: string,
    tabId: string,
    client: Pool | PoolClient = this.pool,
  ) {
    const [tab, items] = await Promise.all([
      client.query<PatientTabRow>(
        `SELECT t.id,t.clinic_id AS "clinicId",t.patient_id AS "patientId",p.full_name AS "patientName",t.notes,t.status,t.payment_status AS "paymentStatus",t.total_in_cents AS "totalInCents",t.receivable_id AS "receivableId",t.opened_at AS "openedAt",t.closed_at AS "closedAt",t.cancelled_at AS "cancelledAt" FROM patient_tabs t JOIN patients p ON p.id=t.patient_id WHERE t.clinic_id=$1 AND t.id=$2`,
        [clinicId, tabId],
      ),
      client.query<PatientTabItemRow>(
        `SELECT i.id,i.tab_id AS "tabId",i.product_id AS "productId",p.name AS "productName",i.quantity,i.unit_price_in_cents AS "unitPriceInCents",i.unit_cost_in_cents AS "unitCostInCents" FROM patient_tab_items i JOIN products p ON p.id=i.product_id WHERE i.clinic_id=$1 AND i.tab_id=$2 ORDER BY i.created_at`,
        [clinicId, tabId],
      ),
    ]);
    return tab.rows[0]
      ? mapPatientTab(tab.rows[0], items.rows.map(mapPatientTabItem))
      : null;
  }

  private async findScheduleBlock(
    clinicId: string,
    blockId: string,
    client: Pool | PoolClient = this.pool,
  ) {
    const result = await client.query<ScheduleBlockRow>(
      `SELECT b.id, b.clinic_id AS "clinicId",
              b.professional_id AS "professionalId", b.room_id AS "roomId",
              pr.full_name AS "professionalName", r.name AS "roomName",
              b.starts_at AS "startsAt", b.ends_at AS "endsAt", b.reason,
              b.status, b.created_at AS "createdAt", b.updated_at AS "updatedAt"
       FROM schedule_blocks b
       LEFT JOIN professionals pr ON pr.id = b.professional_id
       LEFT JOIN rooms r ON r.id = b.room_id
       WHERE b.clinic_id = $1 AND b.id = $2`,
      [clinicId, blockId],
    );
    return result.rows[0] ? mapScheduleBlock(result.rows[0]) : null;
  }

  private async findPatientPlan(
    client: Pool | PoolClient,
    clinicId: string,
    planId: string,
  ) {
    const result = await client.query<PatientPlanRow>(
      `SELECT ${patientPlanColumns}
       FROM patient_plans pp
       JOIN patients p ON p.id = pp.patient_id
       JOIN services s ON s.id = pp.service_id
       WHERE pp.clinic_id = $1 AND pp.id = $2`,
      [clinicId, planId],
    );
    return result.rows[0] ? mapPatientPlan(result.rows[0]) : null;
  }

  private async findReceivable(
    client: Pool | PoolClient,
    clinicId: string,
    receivableId: string,
  ) {
    const result = await client.query<ReceivableRow>(
      `SELECT ${receivableColumns}
       FROM receivables r JOIN patients p ON p.id = r.patient_id
       WHERE r.clinic_id = $1 AND r.id = $2`,
      [clinicId, receivableId],
    );
    return result.rows[0] ? mapReceivable(result.rows[0]) : null;
  }

  private async findPayable(
    client: Pool | PoolClient,
    clinicId: string,
    payableId: string,
  ) {
    const result = await client.query<PayableRow>(
      `SELECT ${payableColumns} FROM payables py
       JOIN financial_categories fc ON fc.id = py.category_id
       JOIN cost_centers cc ON cc.id = py.cost_center_id
       WHERE py.clinic_id = $1 AND py.id = $2`,
      [clinicId, payableId],
    );
    return result.rows[0] ? mapPayable(result.rows[0]) : null;
  }

  private async changeReceivablePayment(
    clinicId: string,
    actorUserId: string,
    receivableId: string,
    operation: "payment" | "payment_reversal",
    paymentMethod?: PaymentMethod,
  ) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const current = await client.query<{
        status: ReceivableStatus;
        amountInCents: number;
      }>(
        `SELECT status, amount_in_cents AS "amountInCents"
         FROM receivables WHERE clinic_id = $1 AND id = $2 FOR UPDATE`,
        [clinicId, receivableId],
      );
      if (!current.rows[0]) {
        await client.query("COMMIT");
        return null;
      }
      const expected = operation === "payment" ? "open" : "paid";
      if (current.rows[0].status !== expected) {
        throw new DomainError(
          operation === "payment"
            ? "RECEIVABLE_NOT_OPEN"
            : "RECEIVABLE_NOT_PAID",
          operation === "payment"
            ? "Somente contas abertas podem ser baixadas."
            : "Somente pagamentos confirmados podem ser estornados.",
          409,
        );
      }
      await client.query(
        operation === "payment"
          ? `UPDATE receivables SET status = 'paid', paid_at = now(), payment_method = $3, updated_at = now()
             WHERE clinic_id = $1 AND id = $2`
          : `UPDATE receivables SET status = 'open', paid_at = NULL, payment_method = NULL, updated_at = now()
             WHERE clinic_id = $1 AND id = $2`,
        operation === "payment"
          ? [clinicId, receivableId, paymentMethod]
          : [clinicId, receivableId],
      );
      await client.query(
        `INSERT INTO financial_events
           (clinic_id, receivable_id, actor_user_id, kind, amount_in_cents, metadata)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          clinicId,
          receivableId,
          actorUserId,
          operation,
          operation === "payment"
            ? current.rows[0].amountInCents
            : -current.rows[0].amountInCents,
          operation === "payment" ? { paymentMethod } : {},
        ],
      );
      const receivable = await this.findReceivable(
        client,
        clinicId,
        receivableId,
      );
      await client.query("COMMIT");
      return receivable;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  private async changePayablePayment(
    clinicId: string,
    actorUserId: string,
    payableId: string,
    operation: "payment" | "payment_reversal",
    paymentMethod?: PaymentMethod,
  ) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const current = await client.query<{
        status: Payable["status"];
        amountInCents: number;
      }>(
        `SELECT status, amount_in_cents AS "amountInCents"
         FROM payables WHERE clinic_id = $1 AND id = $2 FOR UPDATE`,
        [clinicId, payableId],
      );
      if (!current.rows[0]) {
        await client.query("COMMIT");
        return null;
      }
      const expected = operation === "payment" ? "open" : "paid";
      if (current.rows[0].status !== expected)
        throw new DomainError(
          operation === "payment" ? "PAYABLE_NOT_OPEN" : "PAYABLE_NOT_PAID",
          operation === "payment"
            ? "Somente contas abertas podem ser pagas."
            : "Somente contas pagas podem ser estornadas.",
          409,
        );
      await client.query(
        operation === "payment"
          ? `UPDATE payables SET status = 'paid', paid_at = now(),
                 payment_method = $3, paid_by_user_id = $4, updated_at = now()
             WHERE clinic_id = $1 AND id = $2`
          : `UPDATE payables SET status = 'open', paid_at = NULL,
                 payment_method = NULL, paid_by_user_id = NULL, updated_at = now()
             WHERE clinic_id = $1 AND id = $2`,
        operation === "payment"
          ? [clinicId, payableId, paymentMethod, actorUserId]
          : [clinicId, payableId],
      );
      await client.query(
        `INSERT INTO payable_events
           (clinic_id, payable_id, actor_user_id, kind, amount_in_cents, metadata)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [
          clinicId,
          payableId,
          actorUserId,
          operation,
          operation === "payment"
            ? -current.rows[0].amountInCents
            : current.rows[0].amountInCents,
          operation === "payment" ? { paymentMethod } : {},
        ],
      );
      const payable = await this.findPayable(client, clinicId, payableId);
      await client.query("COMMIT");
      return payable;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  private async consumeSessionInDatabase(
    client: PoolClient,
    clinicId: string,
    appointmentId: string,
    patientId: string,
    serviceId: string,
    startsAt: Date,
  ) {
    const planResult = await client.query<{
      id: string;
      remainingSessions: number;
    }>(
      `SELECT pp.id, pp.remaining_sessions AS "remainingSessions"
       FROM patient_plans pp JOIN clinics c ON c.id = pp.clinic_id
       WHERE pp.clinic_id = $1 AND pp.patient_id = $2 AND pp.service_id = $3
         AND pp.status = 'active'
         AND pp.valid_from <= ($4::timestamptz AT TIME ZONE c.timezone)::date
         AND (pp.valid_until IS NULL OR pp.valid_until >= ($4::timestamptz AT TIME ZONE c.timezone)::date)
       ORDER BY pp.valid_until NULLS LAST, pp.created_at
       LIMIT 1 FOR UPDATE`,
      [clinicId, patientId, serviceId, startsAt],
    );
    const plan = planResult.rows[0];
    if (!plan) return;
    const ledger = await client.query<{ balance: number; consumed: boolean }>(
      `SELECT coalesce(sum(quantity), 0)::int AS balance,
              bool_or(kind = 'consumption') AS consumed
       FROM session_movements WHERE plan_id = $1 AND appointment_id = $2`,
      [plan.id, appointmentId],
    );
    if ((ledger.rows[0]?.balance ?? 0) < 0) return;
    if (plan.remainingSessions < 1) {
      throw new DomainError(
        "NO_SESSION_BALANCE",
        "O cliente não possui saldo de sessões para este serviço.",
        409,
      );
    }
    await client.query(
      `INSERT INTO session_movements
         (clinic_id, plan_id, appointment_id, kind, quantity, reason)
       VALUES ($1, $2, $3, $4, -1, 'Atendimento finalizado')`,
      [
        clinicId,
        plan.id,
        appointmentId,
        ledger.rows[0]?.consumed ? "adjustment" : "consumption",
      ],
    );
    await client.query(
      `UPDATE patient_plans SET remaining_sessions = remaining_sessions - 1,
              updated_at = now() WHERE id = $1`,
      [plan.id],
    );
  }

  private async restoreSessionInDatabase(
    client: PoolClient,
    clinicId: string,
    appointmentId: string,
  ) {
    const planResult = await client.query<{ id: string; reversed: boolean }>(
      `SELECT pp.id,
              EXISTS (SELECT 1 FROM session_movements x
                      WHERE x.plan_id = pp.id AND x.appointment_id = $2
                        AND x.kind = 'reversal') AS reversed
       FROM patient_plans pp
       WHERE pp.clinic_id = $1
         AND (SELECT coalesce(sum(sm.quantity), 0)
              FROM session_movements sm
              WHERE sm.plan_id = pp.id AND sm.appointment_id = $2) < 0
       LIMIT 1 FOR UPDATE`,
      [clinicId, appointmentId],
    );
    const plan = planResult.rows[0];
    if (!plan) return;
    await client.query(
      `INSERT INTO session_movements
         (clinic_id, plan_id, appointment_id, kind, quantity, reason)
       VALUES ($1, $2, $3, $4, 1, 'Reversão do atendimento finalizado')`,
      [
        clinicId,
        plan.id,
        appointmentId,
        plan.reversed ? "adjustment" : "reversal",
      ],
    );
    await client.query(
      `UPDATE patient_plans SET remaining_sessions = remaining_sessions + 1,
              updated_at = now() WHERE id = $1`,
      [plan.id],
    );
  }

  private async findClinicalRecord(
    client: Pool | PoolClient,
    clinicId: string,
    recordId: string,
  ) {
    const result = await client.query<ClinicalRecordRow>(
      `
        SELECT ${clinicalRecordColumns}
        FROM clinical_records cr
        JOIN appointments a ON a.id = cr.appointment_id
        JOIN patients p ON p.id = cr.patient_id
        JOIN professionals pr ON pr.id = cr.professional_id
        JOIN users u ON u.id = cr.author_user_id
        WHERE cr.clinic_id = $1 AND cr.id = $2
      `,
      [clinicId, recordId],
    );
    return result.rows[0] ? mapClinicalRecord(result.rows[0]) : null;
  }

  private async findClinicalRecordByAppointment(
    client: PoolClient,
    clinicId: string,
    appointmentId: string,
  ) {
    const result = await client.query<{ id: string }>(
      "SELECT id FROM clinical_records WHERE clinic_id = $1 AND appointment_id = $2",
      [clinicId, appointmentId],
    );
    return result.rows[0]
      ? this.findClinicalRecord(client, clinicId, result.rows[0].id)
      : null;
  }

  private async captureClinicalRevision(
    client: PoolClient,
    clinicId: string,
    recordId: string,
  ) {
    await client.query(
      `
        INSERT INTO clinical_record_revisions (
          clinic_id, clinical_record_id, author_user_id, version, snapshot
        )
        SELECT clinic_id, id, author_user_id, version,
          jsonb_build_object(
            'status', status,
            'subjective', subjective,
            'objective', objective,
            'assessment', assessment,
            'plan', plan,
            'painScale', pain_scale
          )
        FROM clinical_records
        WHERE clinic_id = $1 AND id = $2
      `,
      [clinicId, recordId],
    );
  }
}
