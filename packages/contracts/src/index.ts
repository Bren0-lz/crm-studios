import { z } from "zod";

export const patientStatusSchema = z.enum(["active", "inactive"]);
export type PatientStatus = z.infer<typeof patientStatusSchema>;

export const appointmentStatusSchema = z.enum([
  "scheduled",
  "confirmed",
  "completed",
  "no_show",
  "excused_absence",
  "professional_absence",
  "cancelled",
]);
export type AppointmentStatus = z.infer<typeof appointmentStatusSchema>;

export const loginSchema = z.object({
  email: z.email().transform((value) => value.toLowerCase()),
  password: z.string().min(8),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const userRoleSchema = z.enum([
  "owner",
  "reception",
  "physiotherapist",
  "finance",
]);
export type UserRole = z.infer<typeof userRoleSchema>;
const strongPasswordSchema = z
  .string()
  .min(10)
  .max(128)
  .regex(/[a-z]/, "Inclua uma letra minúscula.")
  .regex(/[A-Z]/, "Inclua uma letra maiúscula.")
  .regex(/[0-9]/, "Inclua um número.");
export const adminUserInputSchema = z.object({
  fullName: z.string().trim().min(3).max(160),
  email: z.email().transform((value) => value.toLowerCase()),
  role: userRoleSchema,
  password: strongPasswordSchema,
});
export type AdminUserInput = z.infer<typeof adminUserInputSchema>;
export const adminUserUpdateSchema = z.object({
  fullName: z.string().trim().min(3).max(160),
  role: userRoleSchema,
  active: z.boolean(),
});
export type AdminUserUpdate = z.infer<typeof adminUserUpdateSchema>;
export const passwordResetSchema = z.object({ password: strongPasswordSchema });
export const clinicSettingsInputSchema = z.object({
  name: z.string().trim().min(2).max(160),
  legalName: z.string().trim().max(200).optional().or(z.literal("")),
  taxId: z.string().trim().max(20).optional().or(z.literal("")),
  phone: z.string().trim().max(24).optional().or(z.literal("")),
  email: z.email().optional().or(z.literal("")),
  address: z.string().trim().max(500).optional().or(z.literal("")),
  timezone: z.string().trim().min(3).max(80),
});
export type ClinicSettingsInput = z.infer<typeof clinicSettingsInputSchema>;

export const patientInputSchema = z.object({
  fullName: z.string().trim().min(3).max(160),
  cpf: z.string().trim().min(11).max(14).optional().or(z.literal("")),
  email: z.email().optional().or(z.literal("")),
  phone: z.string().trim().min(8).max(24),
  birthDate: z.iso.date().optional().or(z.literal("")),
  emergencyContactName: z.string().trim().max(160).optional().or(z.literal("")),
  emergencyContactPhone: z.string().trim().max(24).optional().or(z.literal("")),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
});
export type PatientInput = z.infer<typeof patientInputSchema>;

export const professionalInputSchema = z.object({
  fullName: z.string().trim().min(3).max(160),
  crefito: z.string().trim().min(4).max(40),
  specialty: z.string().trim().min(2).max(100),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});
export type ProfessionalInput = z.infer<typeof professionalInputSchema>;

export const roomInputSchema = z.object({
  name: z.string().trim().min(2).max(80),
  capacity: z.number().int().min(1).max(100),
});
export type RoomInput = z.infer<typeof roomInputSchema>;

export const serviceInputSchema = z.object({
  name: z.string().trim().min(2).max(120),
  durationMinutes: z.number().int().min(15).max(480),
  priceInCents: z.number().int().min(0),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});
export type ServiceInput = z.infer<typeof serviceInputSchema>;

export const appointmentInputSchema = z.object({
  patientId: z.uuid(),
  professionalId: z.uuid(),
  roomId: z.uuid(),
  serviceId: z.uuid(),
  startsAt: z.iso.datetime({ offset: true }),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
});
export type AppointmentInput = z.infer<typeof appointmentInputSchema>;

export const recurringAppointmentInputSchema = appointmentInputSchema.extend({
  occurrences: z.number().int().min(2).max(52),
  intervalWeeks: z.number().int().min(1).max(4).default(1),
});
export type RecurringAppointmentInput = z.infer<
  typeof recurringAppointmentInputSchema
>;

export const scheduleBlockInputSchema = z
  .object({
    professionalId: z.uuid().optional(),
    roomId: z.uuid().optional(),
    startsAt: z.iso.datetime({ offset: true }),
    endsAt: z.iso.datetime({ offset: true }),
    reason: z.string().trim().min(3).max(300),
  })
  .refine((value) => value.professionalId || value.roomId, {
    message: "Informe o profissional ou a sala.",
    path: ["professionalId"],
  })
  .refine(
    (value) =>
      new Date(value.endsAt).getTime() > new Date(value.startsAt).getTime(),
    {
      message: "O término deve ser posterior ao início.",
      path: ["endsAt"],
    },
  );
export type ScheduleBlockInput = z.infer<typeof scheduleBlockInputSchema>;

export const groupClassInputSchema = z.object({
  name: z.string().trim().min(3).max(120),
  serviceId: z.uuid(),
  professionalId: z.uuid(),
  roomId: z.uuid(),
  capacity: z.number().int().min(1).max(100),
});
export type GroupClassInput = z.infer<typeof groupClassInputSchema>;
export const groupSessionSeriesInputSchema = z.object({
  groupId: z.uuid(),
  startsAt: z.iso.datetime({ offset: true }),
  occurrences: z.number().int().min(1).max(52),
  intervalWeeks: z.number().int().min(1).max(4).default(1),
});
export type GroupSessionSeriesInput = z.infer<
  typeof groupSessionSeriesInputSchema
>;
export const groupEnrollmentInputSchema = z.object({
  groupId: z.uuid(),
  patientId: z.uuid(),
});
export type GroupEnrollmentInput = z.infer<typeof groupEnrollmentInputSchema>;
export const groupAttendanceInputSchema = z.object({
  status: z.enum(["present", "absent", "excused_absence"]),
  notes: z.string().trim().max(500).optional().or(z.literal("")),
});
export type GroupAttendanceInput = z.infer<typeof groupAttendanceInputSchema>;
export const replacementBookingInputSchema = z.object({
  creditId: z.uuid(),
  sessionId: z.uuid(),
});
export type ReplacementBookingInput = z.infer<
  typeof replacementBookingInputSchema
>;

export const productInputSchema = z.object({
  name: z.string().trim().min(2).max(160),
  sku: z.string().trim().min(1).max(60),
  unit: z.string().trim().min(1).max(20).default("un"),
  costInCents: z.number().int().min(0),
  salePriceInCents: z.number().int().min(0),
  initialStock: z.number().int().min(0).max(1_000_000).default(0),
  minimumStock: z.number().int().min(0).max(1_000_000).default(0),
});
export type ProductInput = z.infer<typeof productInputSchema>;
export const stockMovementInputSchema = z.object({
  productId: z.uuid(),
  kind: z.enum(["purchase", "adjustment_in", "adjustment_out", "loss"]),
  quantity: z.number().int().min(1).max(1_000_000),
  notes: z.string().trim().min(3).max(500),
});
export type StockMovementInput = z.infer<typeof stockMovementInputSchema>;
export const patientTabInputSchema = z.object({
  patientId: z.uuid(),
  notes: z.string().trim().max(500).optional().or(z.literal("")),
});
export type PatientTabInput = z.infer<typeof patientTabInputSchema>;
export const patientTabItemInputSchema = z.object({
  productId: z.uuid(),
  quantity: z.number().int().min(1).max(10_000),
});
export type PatientTabItemInput = z.infer<typeof patientTabItemInputSchema>;
export const appointmentStatusInputSchema = z.object({
  status: appointmentStatusSchema,
});

export const clinicalRecordStatusSchema = z.enum(["draft", "finalized"]);
export type ClinicalRecordStatus = z.infer<typeof clinicalRecordStatusSchema>;

export const clinicalRecordInputSchema = z.object({
  appointmentId: z.uuid(),
  subjective: z.string().trim().max(5000).default(""),
  objective: z.string().trim().max(5000).default(""),
  assessment: z.string().trim().max(5000).default(""),
  plan: z.string().trim().max(5000).default(""),
  painScale: z.number().int().min(0).max(10).optional(),
});
export type ClinicalRecordInput = z.infer<typeof clinicalRecordInputSchema>;

export const assessmentFieldSchema = z.object({
  key: z
    .string()
    .trim()
    .regex(/^[a-z][a-z0-9_]*$/)
    .max(60),
  label: z.string().trim().min(2).max(120),
  type: z.enum(["text", "number", "scale", "boolean"]),
  required: z.boolean().default(false),
  unit: z.string().trim().max(30).optional().or(z.literal("")),
  min: z.number().optional(),
  max: z.number().optional(),
});
export type AssessmentField = z.infer<typeof assessmentFieldSchema>;

export const assessmentTemplateInputSchema = z.object({
  name: z.string().trim().min(3).max(120),
  specialty: z.string().trim().min(2).max(100),
  fields: z.array(assessmentFieldSchema).min(1).max(60),
});
export type AssessmentTemplateInput = z.infer<
  typeof assessmentTemplateInputSchema
>;

const assessmentValueSchema = z.union([
  z.string().max(5000),
  z.number(),
  z.boolean(),
]);
export const clinicalAssessmentInputSchema = z.object({
  patientId: z.uuid(),
  templateId: z.uuid(),
  appointmentId: z.uuid().optional().or(z.literal("")),
  values: z.record(z.string(), assessmentValueSchema),
  notes: z.string().trim().max(5000).optional().or(z.literal("")),
});
export type ClinicalAssessmentInput = z.infer<
  typeof clinicalAssessmentInputSchema
>;

export const therapeuticGoalInputSchema = z.object({
  patientId: z.uuid(),
  title: z.string().trim().min(3).max(160),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
  baselineValue: z.number().optional(),
  targetValue: z.number().optional(),
  unit: z.string().trim().max(30).optional().or(z.literal("")),
  targetDate: z.iso.date().optional().or(z.literal("")),
});
export type TherapeuticGoalInput = z.infer<typeof therapeuticGoalInputSchema>;
export const therapeuticGoalStatusSchema = z.enum([
  "active",
  "achieved",
  "cancelled",
]);
export type TherapeuticGoalStatus = z.infer<typeof therapeuticGoalStatusSchema>;

export const clinicalMeasurementInputSchema = z.object({
  patientId: z.uuid(),
  goalId: z.uuid().optional().or(z.literal("")),
  name: z.string().trim().min(2).max(120),
  value: z.number(),
  unit: z.string().trim().min(1).max(30),
  measuredAt: z.iso.datetime({ offset: true }),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
});
export type ClinicalMeasurementInput = z.infer<
  typeof clinicalMeasurementInputSchema
>;

export const treatmentClosureInputSchema = z.object({
  patientId: z.uuid(),
  kind: z.enum(["discharge", "referral", "abandonment"]),
  summary: z.string().trim().min(10).max(5000),
  recommendations: z.string().trim().max(3000).optional().or(z.literal("")),
  occurredAt: z.iso.datetime({ offset: true }),
});
export type TreatmentClosureInput = z.infer<typeof treatmentClosureInputSchema>;

export const clinicalAttachmentInputSchema = z.object({
  patientId: z.uuid(),
  fileName: z.string().trim().min(1).max(180),
  mimeType: z.enum(["application/pdf", "image/png", "image/jpeg"]),
  sizeInBytes: z
    .number()
    .int()
    .min(1)
    .max(5 * 1024 * 1024),
  contentBase64: z.string().min(4).max(7_000_000),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
});
export type ClinicalAttachmentInput = z.infer<
  typeof clinicalAttachmentInputSchema
>;

export const clinicalAddendumInputSchema = z.object({
  clinicalRecordId: z.uuid(),
  reason: z.string().trim().min(5).max(500),
  content: z.string().trim().min(10).max(5000),
});
export type ClinicalAddendumInput = z.infer<typeof clinicalAddendumInputSchema>;

export const planKindSchema = z.enum([
  "single",
  "fixed_package",
  "recurring",
  "custom",
]);
export const planStatusSchema = z.enum([
  "active",
  "paused",
  "expired",
  "cancelled",
]);
export const planTransitionSchema = z.enum(["active", "paused", "cancelled"]);
export type PlanStatus = z.infer<typeof planStatusSchema>;
export const patientPlanInputSchema = z
  .object({
    patientId: z.uuid(),
    serviceId: z.uuid(),
    name: z.string().trim().min(3).max(120),
    kind: planKindSchema,
    totalSessions: z.number().int().min(1).max(1000),
    validFrom: z.iso.date(),
    validUntil: z.iso.date().optional().or(z.literal("")),
    totalValueInCents: z.number().int().min(0),
    installments: z.number().int().min(1).max(36),
    firstDueDate: z.iso.date(),
  })
  .refine((value) => !value.validUntil || value.validUntil >= value.validFrom, {
    message: "A validade final deve ser posterior à inicial.",
    path: ["validUntil"],
  });
export type PatientPlanInput = z.infer<typeof patientPlanInputSchema>;

export const receivableStatusSchema = z.enum(["open", "paid", "cancelled"]);
export type ReceivableStatus = z.infer<typeof receivableStatusSchema>;
export const paymentMethodSchema = z.enum([
  "pix",
  "card",
  "cash",
  "bank_transfer",
  "boleto",
  "other",
]);
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;
export const paymentInputSchema = z.object({
  paymentMethod: paymentMethodSchema.default("pix"),
});
export const patientTabCloseInputSchema = z
  .object({
    settlement: z.enum(["paid", "receivable"]),
    paymentMethod: paymentMethodSchema.optional(),
    dueDate: z.iso.date(),
  })
  .refine(
    (value) => value.settlement !== "paid" || Boolean(value.paymentMethod),
    { message: "Informe a forma de pagamento.", path: ["paymentMethod"] },
  );
export type PatientTabCloseInput = z.infer<typeof patientTabCloseInputSchema>;
export const receivableAdjustmentInputSchema = z.object({
  amountInCents: z.number().int().min(0),
  reason: z.string().trim().min(5).max(500),
});
export const receivableRenegotiationInputSchema = z.object({
  receivableIds: z.array(z.uuid()).min(1).max(36),
  totalAmountInCents: z.number().int().min(0),
  installments: z.number().int().min(1).max(36),
  firstDueDate: z.iso.date(),
  reason: z.string().trim().min(5).max(500),
});
export type ReceivableRenegotiationInput = z.infer<
  typeof receivableRenegotiationInputSchema
>;
export const commissionRuleInputSchema = z.object({
  professionalId: z.uuid(),
  percentage: z.number().min(0).max(100),
  effectiveFrom: z.iso.date(),
});
export type CommissionRuleInput = z.infer<typeof commissionRuleInputSchema>;
export const commissionGenerationInputSchema = z.object({
  competence: z.string().regex(/^\d{4}-\d{2}$/),
});
export const financialCategoryInputSchema = z.object({
  name: z.string().trim().min(2).max(100),
  kind: z.enum(["income", "expense"]),
});
export type FinancialCategoryInput = z.infer<
  typeof financialCategoryInputSchema
>;
export const costCenterInputSchema = z.object({
  name: z.string().trim().min(2).max(100),
});
export type CostCenterInput = z.infer<typeof costCenterInputSchema>;
export const payableInputSchema = z.object({
  description: z.string().trim().min(3).max(200),
  supplier: z.string().trim().max(160).optional().or(z.literal("")),
  categoryId: z.uuid(),
  costCenterId: z.uuid(),
  dueDate: z.iso.date(),
  amountInCents: z.number().int().min(1),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
});
export type PayableInput = z.infer<typeof payableInputSchema>;

export const leadStageSchema = z.enum([
  "new_contact",
  "contacted",
  "evaluation",
  "proposal",
  "won",
  "lost",
]);
export type LeadStage = z.infer<typeof leadStageSchema>;
export const leadInputSchema = z.object({
  fullName: z.string().trim().min(3).max(160),
  phone: z.string().trim().min(8).max(24),
  email: z.email().optional().or(z.literal("")),
  source: z.string().trim().min(2).max(80),
  interest: z.string().trim().min(2).max(120),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
  responsibleUserId: z.uuid().optional().or(z.literal("")),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
});
export type LeadInput = z.infer<typeof leadInputSchema>;
export const leadMoveSchema = z
  .object({
    stage: leadStageSchema,
    lostReason: z.string().trim().max(500).optional(),
  })
  .refine((value) => value.stage !== "lost" || Boolean(value.lostReason), {
    message: "Informe o motivo da perda.",
    path: ["lostReason"],
  });

export const leadContactChannelSchema = z.enum([
  "phone",
  "whatsapp",
  "email",
  "in_person",
  "note",
]);
export type LeadContactChannel = z.infer<typeof leadContactChannelSchema>;
export const leadContactInputSchema = z.object({
  channel: leadContactChannelSchema,
  direction: z.enum(["inbound", "outbound", "internal"]),
  notes: z.string().trim().min(2).max(2000),
  occurredAt: z.iso.datetime().optional(),
});
export type LeadContactInput = z.infer<typeof leadContactInputSchema>;
export const leadTaskStatusSchema = z.enum(["open", "completed", "cancelled"]);
export type LeadTaskStatus = z.infer<typeof leadTaskStatusSchema>;
export const leadTaskInputSchema = z.object({
  title: z.string().trim().min(3).max(200),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
  dueAt: z.iso.datetime(),
  assignedUserId: z.uuid().optional().or(z.literal("")),
});
export type LeadTaskInput = z.infer<typeof leadTaskInputSchema>;

export const communicationChannelSchema = z.enum(["whatsapp", "email"]);
export type CommunicationChannel = z.infer<typeof communicationChannelSchema>;
export const communicationKindSchema = z.enum([
  "appointment_reminder",
  "payment_reminder",
  "manual",
]);
export type CommunicationKind = z.infer<typeof communicationKindSchema>;
export const communicationPreferenceInputSchema = z.object({
  patientId: z.uuid(),
  channel: communicationChannelSchema,
  allowed: z.boolean(),
});
export type CommunicationPreferenceInput = z.infer<
  typeof communicationPreferenceInputSchema
>;
export const manualMessageInputSchema = z.object({
  patientId: z.uuid(),
  channel: communicationChannelSchema,
  body: z.string().trim().min(1).max(500),
  scheduledFor: z.iso.datetime().optional(),
});
export type ManualMessageInput = z.infer<typeof manualMessageInputSchema>;
export const reminderGenerationInputSchema = z.object({
  referenceDate: z.iso.date(),
});

export const documentKindSchema = z.enum([
  "contract",
  "attendance_declaration",
  "consent",
  "other",
]);
export type DocumentKind = z.infer<typeof documentKindSchema>;
export const documentTemplateInputSchema = z.object({
  name: z.string().trim().min(3).max(120),
  kind: documentKindSchema,
  body: z.string().trim().min(20).max(20_000),
});
export type DocumentTemplateInput = z.infer<typeof documentTemplateInputSchema>;
export const documentTemplateVersionInputSchema = z.object({
  body: z.string().trim().min(20).max(20_000),
});
export const issuedDocumentInputSchema = z.object({
  templateId: z.uuid(),
  patientId: z.uuid(),
  planId: z.uuid().optional(),
  title: z.string().trim().min(3).max(160),
});
export type IssuedDocumentInput = z.infer<typeof issuedDocumentInputSchema>;
export const documentStatusSchema = z.enum(["draft", "issued", "cancelled"]);
export type DocumentStatus = z.infer<typeof documentStatusSchema>;
export const documentTransitionSchema = z.enum(["issued", "cancelled"]);

export const managementReportFilterSchema = z
  .object({
    from: z.iso.date(),
    to: z.iso.date(),
  })
  .refine((value) => value.from <= value.to, {
    message: "A data inicial deve ser anterior à data final.",
    path: ["from"],
  });
export type ManagementReportFilter = z.infer<
  typeof managementReportFilterSchema
>;

export interface UserSummary {
  id: string;
  fullName: string;
  email: string;
  role: UserRole;
}

export interface AdminUser extends UserSummary {
  clinicId: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ClinicSettings extends ClinicSettingsInput {
  id: string;
  updatedAt: string;
}

export interface AdminAuditEvent {
  id: string;
  action: string;
  entityType: string;
  entityId?: string;
  actorName?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface PermissionMatrixItem {
  role: UserRole;
  modules: string[];
}

export interface Patient extends PatientInput {
  id: string;
  clinicId: string;
  recordNumber: string;
  status: PatientStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Professional extends ProfessionalInput {
  id: string;
  clinicId: string;
  active: boolean;
}

export interface Room extends RoomInput {
  id: string;
  clinicId: string;
  active: boolean;
}

export interface Service extends ServiceInput {
  id: string;
  clinicId: string;
  active: boolean;
}

export interface Appointment extends AppointmentInput {
  id: string;
  clinicId: string;
  endsAt: string;
  status: AppointmentStatus;
  patientName: string;
  professionalName: string;
  professionalColor: string;
  roomName: string;
  serviceName: string;
  createdAt: string;
  updatedAt: string;
  seriesId?: string;
}

export interface ScheduleBlock extends ScheduleBlockInput {
  id: string;
  clinicId: string;
  professionalName?: string;
  roomName?: string;
  status: "active" | "cancelled";
  createdAt: string;
  updatedAt: string;
}

export interface GroupClass extends GroupClassInput {
  id: string;
  clinicId: string;
  serviceName: string;
  professionalName: string;
  roomName: string;
  activeEnrollments: number;
  waitlistCount: number;
  active: boolean;
  createdAt: string;
}

export interface GroupEnrollment extends GroupEnrollmentInput {
  id: string;
  clinicId: string;
  patientName: string;
  status: "active" | "waitlisted" | "cancelled";
  queuePosition?: number;
  enrolledAt: string;
  updatedAt: string;
}

export interface GroupSession {
  id: string;
  clinicId: string;
  groupId: string;
  groupName: string;
  startsAt: string;
  endsAt: string;
  status: "scheduled" | "completed" | "cancelled";
  attendanceCount: number;
  createdAt: string;
}

export interface GroupAttendance {
  id: string;
  clinicId: string;
  sessionId: string;
  patientId: string;
  patientName: string;
  status: "present" | "absent" | "excused_absence" | "replacement";
  notes?: string;
  recordedAt: string;
}

export interface ReplacementCredit {
  id: string;
  clinicId: string;
  patientId: string;
  patientName: string;
  sourceSessionId: string;
  status: "available" | "used" | "cancelled";
  usedSessionId?: string;
  createdAt: string;
  usedAt?: string;
}

export interface GroupWorkspace {
  groups: GroupClass[];
  enrollments: GroupEnrollment[];
  sessions: GroupSession[];
  attendance: GroupAttendance[];
  replacementCredits: ReplacementCredit[];
}

export interface Product extends Omit<ProductInput, "initialStock"> {
  id: string;
  clinicId: string;
  currentStock: number;
  lowStock: boolean;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface StockMovement {
  id: string;
  clinicId: string;
  productId: string;
  productName: string;
  kind:
    | "initial_stock"
    | "purchase"
    | "adjustment_in"
    | "adjustment_out"
    | "loss"
    | "sale"
    | "sale_reversal";
  quantity: number;
  balanceAfter: number;
  notes: string;
  patientTabId?: string;
  createdAt: string;
}

export interface PatientTabItem {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPriceInCents: number;
  unitCostInCents: number;
  totalInCents: number;
}

export interface PatientTab extends PatientTabInput {
  id: string;
  clinicId: string;
  patientName: string;
  status: "open" | "closed" | "cancelled";
  paymentStatus: "pending" | "paid" | "receivable" | "cancelled";
  totalInCents: number;
  items: PatientTabItem[];
  receivableId?: string;
  openedAt: string;
  closedAt?: string;
  cancelledAt?: string;
}

export interface InventoryWorkspace {
  products: Product[];
  movements: StockMovement[];
  tabs: PatientTab[];
  lowStockCount: number;
  inventoryCostInCents: number;
  openTabsInCents: number;
}

export interface DashboardSummary {
  date: string;
  appointmentsToday: number;
  completedToday: number;
  patientsActive: number;
  noShowsThisMonth: number;
  nextAppointments: Appointment[];
}

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

export interface PatientPlan extends PatientPlanInput {
  id: string;
  clinicId: string;
  patientName: string;
  serviceName: string;
  status: PlanStatus;
  remainingSessions: number;
  createdAt: string;
  updatedAt: string;
}

export interface SessionMovement {
  id: string;
  planId: string;
  appointmentId?: string;
  kind: "credit" | "consumption" | "reversal" | "adjustment";
  quantity: number;
  reason: string;
  createdAt: string;
}

export interface Receivable {
  id: string;
  clinicId: string;
  patientId: string;
  planId?: string;
  patientName: string;
  description: string;
  installmentNumber: number;
  installmentCount: number;
  dueDate: string;
  amountInCents: number;
  status: ReceivableStatus;
  paidAt?: string;
  overdue: boolean;
  createdAt: string;
  updatedAt: string;
  paymentMethod?: PaymentMethod;
}

export interface FinancialSummary {
  openInCents: number;
  overdueInCents: number;
  paidThisMonthInCents: number;
  receivables: Receivable[];
}

export interface FinancialCategory extends FinancialCategoryInput {
  id: string;
  clinicId: string;
  active: boolean;
}

export interface CostCenter extends CostCenterInput {
  id: string;
  clinicId: string;
  active: boolean;
}

export interface Payable extends PayableInput {
  id: string;
  clinicId: string;
  categoryName: string;
  costCenterName: string;
  status: "open" | "paid" | "cancelled";
  paymentMethod?: PaymentMethod;
  paidAt?: string;
  overdue: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface FinancialWorkspace {
  summary: FinancialSummary;
  categories: FinancialCategory[];
  costCenters: CostCenter[];
  payables: Payable[];
  payableOpenInCents: number;
  payableOverdueInCents: number;
  paidExpensesThisMonthInCents: number;
  cashBalanceThisMonthInCents: number;
  commissionRules: CommissionRule[];
  commissions: CommissionEntry[];
  commissionOpenInCents: number;
  paidCommissionsThisMonthInCents: number;
}

export interface ReceivableRenegotiation {
  id: string;
  clinicId: string;
  patientId: string;
  originalAmountInCents: number;
  renegotiatedAmountInCents: number;
  reason: string;
  originalReceivableIds: string[];
  newReceivables: Receivable[];
  createdAt: string;
}

export interface CommissionRule extends CommissionRuleInput {
  id: string;
  clinicId: string;
  professionalName: string;
  active: boolean;
  createdAt: string;
}

export interface CommissionEntry {
  id: string;
  clinicId: string;
  professionalId: string;
  professionalName: string;
  appointmentId: string;
  competence: string;
  baseAmountInCents: number;
  percentage: number;
  amountInCents: number;
  status: "open" | "paid";
  paidAt?: string;
  createdAt: string;
}

export interface PaymentReceipt {
  receiptNumber: string;
  patientName: string;
  description: string;
  amountInCents: number;
  paymentMethod: PaymentMethod;
  paidAt: string;
}

export interface Lead extends LeadInput {
  id: string;
  clinicId: string;
  stage: LeadStage;
  lostReason?: string;
  convertedPatientId?: string;
  createdAt: string;
  updatedAt: string;
  responsibleName?: string;
  openTasks: number;
  overdueTasks: number;
  lastContactAt?: string;
}

export interface LeadConversion {
  lead: Lead;
  patient: Patient;
  reusedExisting: boolean;
}

export interface LeadContact extends LeadContactInput {
  id: string;
  clinicId: string;
  leadId: string;
  actorName: string;
  occurredAt: string;
  createdAt: string;
}

export interface LeadTask extends LeadTaskInput {
  id: string;
  clinicId: string;
  leadId: string;
  status: LeadTaskStatus;
  assignedUserName?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface LeadActivity {
  contacts: LeadContact[];
  tasks: LeadTask[];
}

export interface CommunicationPreference extends CommunicationPreferenceInput {
  id: string;
  clinicId: string;
  updatedAt: string;
}

export interface OutboundMessage {
  id: string;
  clinicId: string;
  patientId: string;
  patientName: string;
  channel: CommunicationChannel;
  kind: CommunicationKind;
  recipient: string;
  body: string;
  status: "queued" | "sent" | "failed" | "cancelled";
  scheduledFor: string;
  sentAt?: string;
  attempts: number;
  lastError?: string;
  createdAt: string;
}

export interface CommunicationCenter {
  deliveryMode: "outbox_only";
  preferences: CommunicationPreference[];
  messages: OutboundMessage[];
}

export interface ReminderGenerationResult {
  queued: number;
  skippedByPreference: number;
  alreadyQueued: number;
}

export interface DocumentTemplate extends DocumentTemplateInput {
  id: string;
  clinicId: string;
  version: number;
  active: boolean;
  previousVersionId?: string;
  createdAt: string;
}

export interface IssuedDocument extends IssuedDocumentInput {
  id: string;
  clinicId: string;
  templateName: string;
  templateVersion: number;
  patientName: string;
  planName?: string;
  snapshotBody: string;
  status: DocumentStatus;
  issuedAt?: string;
  cancelledAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AppointmentReportBreakdown {
  id: string;
  name: string;
  appointments: number;
  completed: number;
  noShows: number;
  attendanceRate: number;
}

export interface CommercialSourceBreakdown {
  source: string;
  leads: number;
  won: number;
  lost: number;
  conversionRate: number;
}

export interface ManagementReport {
  from: string;
  to: string;
  generatedAt: string;
  appointments: {
    total: number;
    completed: number;
    noShows: number;
    cancelled: number;
    attendanceRate: number;
  };
  plans: {
    active: number;
    availableSessions: number;
    consumedInPeriod: number;
  };
  finance: {
    openInCents: number;
    overdueInCents: number;
    paidInPeriodInCents: number;
  };
  commercial: {
    leadsCreated: number;
    won: number;
    lost: number;
    conversionRate: number;
    averageFirstResponseMinutes: number;
  };
  byProfessional: AppointmentReportBreakdown[];
  byService: AppointmentReportBreakdown[];
  bySource: CommercialSourceBreakdown[];
  profitability: {
    dre: {
      serviceRevenueInCents: number;
      productRevenueInCents: number;
      grossRevenueInCents: number;
      productCostInCents: number;
      grossProfitInCents: number;
      operatingExpensesInCents: number;
      commissionsInCents: number;
      netResultInCents: number;
      netMargin: number;
    };
    byService: Array<{
      id: string;
      name: string;
      completedAppointments: number;
      revenueInCents: number;
      commissionsInCents: number;
      contributionInCents: number;
      contributionMargin: number;
    }>;
    byProduct: Array<{
      id: string;
      name: string;
      unitsSold: number;
      revenueInCents: number;
      costInCents: number;
      grossProfitInCents: number;
      grossMargin: number;
    }>;
    operational: {
      groupOccupancyRate: number;
      activeGroupSeats: number;
      totalGroupCapacity: number;
      waitlistCount: number;
      lowStockCount: number;
      productUnitsSold: number;
      averageReceiptInCents: number;
    };
  };
}

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}
