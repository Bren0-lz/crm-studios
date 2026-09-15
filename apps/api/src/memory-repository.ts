import { hashSync } from "bcryptjs";
import type {
  AdminAuditEvent,
  AdminUserInput,
  AdminUserUpdate,
  Appointment,
  AppointmentInput,
  AppointmentRescheduleEvent,
  AppointmentRescheduleInput,
  AppointmentStatus,
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
  ClinicalWorkspace,
  ClinicSettings,
  ClinicSettingsInput,
  CommissionEntry,
  CommissionRule,
  CommissionRuleInput,
  CommunicationPreference,
  CommunicationPreferenceInput,
  CostCenter,
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
  GroupEnrollment,
  GroupEnrollmentInput,
  GroupSession,
  GroupSessionSeriesInput,
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
  PatientTabItemInput,
  Payable,
  PayableInput,
  PaymentMethod,
  PaymentReceipt,
  PlanStatus,
  Professional,
  ProfessionalInput,
  Product,
  ProductInput,
  RecurringAppointmentInput,
  Room,
  RoomInput,
  ScheduleBlock,
  ScheduleBlockInput,
  Service,
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
  ReceivableRenegotiation,
  ReceivableRenegotiationInput,
  ReplacementBookingInput,
  ReplacementCredit,
} from "@crm/contracts";
import { inspectClinicalAttachment } from "./clinical-integrity.js";
import { buildSalesReport } from "./sales-report.js";
import {
  DomainError,
  type AuthenticatedUser,
  type ClinicRepository,
} from "./repository.js";

const CLINIC_ID = "11111111-1111-4111-8111-111111111111";
const now = () => new Date().toISOString();
const uuid = () => crypto.randomUUID();
const today = () => new Date().toISOString().slice(0, 10);
function addMonths(dateValue: string, months: number) {
  const [year, month, day] = dateValue.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1 + months, 1));
  const lastDay = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
  ).getUTCDate();
  date.setUTCDate(Math.min(day!, lastDay));
  return date.toISOString().slice(0, 10);
}
const localDate = (date: Date) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);

function dateAt(hour: number, minute = 0, addDays = 0) {
  const date = new Date();
  date.setDate(date.getDate() + addDays);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
}

export class MemoryClinicRepository implements ClinicRepository {
  private readonly appointmentReschedules: AppointmentRescheduleEvent[] = [];
  private readonly clinicalRecords: ClinicalRecord[] = [];
  private readonly clinicalRecordRevisions: ClinicalRecordRevision[] = [];
  private readonly assessmentTemplates: AssessmentTemplate[] = [
    {
      id: "c1000000-0000-4000-8000-000000000001",
      clinicId: CLINIC_ID,
      name: "Avaliação fisioterapêutica geral",
      specialty: "Fisioterapia",
      fields: [
        {
          key: "chief_complaint",
          label: "Queixa principal",
          type: "text",
          required: true,
        },
        {
          key: "pain_scale",
          label: "Escala de dor",
          type: "scale",
          required: true,
          unit: "0–10",
          min: 0,
          max: 10,
        },
        {
          key: "range_of_motion",
          label: "Amplitude de movimento",
          type: "number",
          required: false,
          unit: "graus",
        },
      ],
      version: 1,
      active: true,
      createdAt: now(),
    },
  ];
  private readonly clinicalAssessments: ClinicalAssessment[] = [];
  private readonly therapeuticGoals: TherapeuticGoal[] = [];
  private readonly clinicalMeasurements: ClinicalMeasurement[] = [];
  private readonly treatmentClosures: TreatmentClosure[] = [];
  private readonly clinicalAttachments: ClinicalAttachmentContent[] = [];
  private readonly clinicalAddenda: ClinicalAddendum[] = [];
  private readonly clinicalAccessEvents: ClinicalAccessEvent[] = [];
  private readonly adminAuditEvents: AdminAuditEvent[] = [];
  private readonly clinicSettings: ClinicSettings = {
    id: CLINIC_ID,
    name: "Clínica Movimenta",
    legalName: "Clínica Movimenta Ltda.",
    taxId: "",
    phone: "",
    email: "",
    address: "",
    timezone: "America/Sao_Paulo",
    updatedAt: now(),
  };
  private readonly patientPlans: PatientPlan[] = [];
  private readonly sessionMovements: SessionMovement[] = [];
  private readonly receivables: Receivable[] = [];
  private readonly receiptEvents: Array<{
    id: string;
    receivableId: string;
    kind: ReceivedPayment["kind"];
    occurredAt: string;
    amountInCents: number;
    paymentMethod?: PaymentMethod;
  }> = [];
  private readonly receivableRenegotiations: ReceivableRenegotiation[] = [];
  private readonly commissionRules: CommissionRule[] = [];
  private readonly commissions: CommissionEntry[] = [];
  private readonly payables: Payable[] = [];
  private readonly financialCategories: FinancialCategory[] = [
    {
      id: "f1000000-0000-4000-8000-000000000001",
      clinicId: CLINIC_ID,
      name: "Despesas administrativas",
      kind: "expense",
      active: true,
    },
    {
      id: "f1000000-0000-4000-8000-000000000002",
      clinicId: CLINIC_ID,
      name: "Materiais clínicos",
      kind: "expense",
      active: true,
    },
  ];
  private readonly costCenters: CostCenter[] = [
    {
      id: "f2000000-0000-4000-8000-000000000001",
      clinicId: CLINIC_ID,
      name: "Administrativo",
      active: true,
    },
    {
      id: "f2000000-0000-4000-8000-000000000002",
      clinicId: CLINIC_ID,
      name: "Operação clínica",
      active: true,
    },
  ];
  private readonly leads: Lead[] = [];
  private readonly leadContacts: LeadContact[] = [];
  private readonly leadTasks: LeadTask[] = [];
  private readonly communicationPreferences: CommunicationPreference[] = [];
  private readonly outboundMessages: Array<
    OutboundMessage & { idempotencyKey: string }
  > = [];
  private readonly documentTemplates: DocumentTemplate[] = [];
  private readonly issuedDocuments: IssuedDocument[] = [];
  private readonly users: AuthenticatedUser[] = [
    {
      id: "22222222-2222-4222-8222-222222222222",
      clinicId: CLINIC_ID,
      fullName: "Mariana Costa",
      email: "admin@movimenta.local",
      role: "owner",
      passwordHash: hashSync("Admin@123", 10),
      active: true,
      createdAt: now(),
      updatedAt: now(),
    },
  ];

  private readonly professionals: Professional[] = [
    {
      id: "33333333-3333-4333-8333-333333333333",
      clinicId: CLINIC_ID,
      fullName: "Dra. Ana Martins",
      crefito: "CREFITO-3 123456-F",
      specialty: "Fisioterapia ortopédica",
      color: "#5c6f68",
      active: true,
    },
    {
      id: "44444444-4444-4444-8444-444444444444",
      clinicId: CLINIC_ID,
      fullName: "Dr. Paulo Nunes",
      crefito: "CREFITO-3 654321-F",
      specialty: "Fisioterapia esportiva",
      color: "#9a6f4f",
      active: true,
    },
  ];

  private readonly rooms: Room[] = [
    {
      id: "55555555-5555-4555-8555-555555555555",
      clinicId: CLINIC_ID,
      name: "Sala Movimento",
      capacity: 1,
      active: true,
    },
    {
      id: "66666666-6666-4666-8666-666666666666",
      clinicId: CLINIC_ID,
      name: "Estúdio 1",
      capacity: 4,
      active: true,
    },
  ];

  private readonly services: Service[] = [
    {
      id: "77777777-7777-4777-8777-777777777777",
      clinicId: CLINIC_ID,
      name: "Fisioterapia individual",
      durationMinutes: 50,
      priceInCents: 18000,
      color: "#d96f4b",
      active: true,
    },
    {
      id: "88888888-8888-4888-8888-888888888888",
      clinicId: CLINIC_ID,
      name: "Avaliação funcional",
      durationMinutes: 60,
      priceInCents: 22000,
      color: "#3d7c78",
      active: true,
    },
  ];

  private readonly patients: Patient[] = [
    this.seedPatient(
      "99999999-9999-4999-8999-999999999999",
      "Helena Almeida",
      "11987654321",
      ["Pós-operatório"],
    ),
    this.seedPatient(
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      "Lucas Ribeiro",
      "11976543210",
      ["Esportivo"],
    ),
    this.seedPatient(
      "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      "Sônia Barros",
      "11965432109",
      ["Recorrente"],
    ),
  ];

  private readonly appointments: Appointment[] = [
    this.seedAppointment(
      "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      "99999999-9999-4999-8999-999999999999",
      "33333333-3333-4333-8333-333333333333",
      "55555555-5555-4555-8555-555555555555",
      "77777777-7777-4777-8777-777777777777",
      dateAt(9),
      "confirmed",
    ),
    this.seedAppointment(
      "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      "44444444-4444-4444-8444-444444444444",
      "55555555-5555-4555-8555-555555555555",
      "88888888-8888-4888-8888-888888888888",
      dateAt(10, 30),
      "scheduled",
    ),
    this.seedAppointment(
      "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      "33333333-3333-4333-8333-333333333333",
      "66666666-6666-4666-8666-666666666666",
      "77777777-7777-4777-8777-777777777777",
      dateAt(14),
      "scheduled",
    ),
  ];
  private readonly scheduleBlocks: ScheduleBlock[] = [];
  private readonly groupClasses: GroupClass[] = [];
  private readonly groupEnrollments: GroupEnrollment[] = [];
  private readonly groupSessions: GroupSession[] = [];
  private readonly groupAttendance: GroupAttendance[] = [];
  private readonly replacementCredits: ReplacementCredit[] = [];
  private readonly products: Product[] = [];
  private readonly stockMovements: StockMovement[] = [];
  private readonly patientTabs: PatientTab[] = [];

  private seedPatient(
    id: string,
    fullName: string,
    phone: string,
    tags: string[],
  ): Patient {
    return {
      id,
      clinicId: CLINIC_ID,
      recordNumber: `PAC-${id.slice(0, 4).toUpperCase()}`,
      fullName,
      phone,
      tags,
      status: "active",
      createdAt: now(),
      updatedAt: now(),
    };
  }

  private seedAppointment(
    id: string,
    patientId: string,
    professionalId: string,
    roomId: string,
    serviceId: string,
    startsAt: string,
    status: AppointmentStatus,
  ): Appointment {
    const patient = this.patients.find((item) => item.id === patientId)!;
    const professional = this.professionals.find(
      (item) => item.id === professionalId,
    )!;
    const room = this.rooms.find((item) => item.id === roomId)!;
    const service = this.services.find((item) => item.id === serviceId)!;
    const endsAt = new Date(
      new Date(startsAt).getTime() + service.durationMinutes * 60_000,
    ).toISOString();

    return {
      id,
      clinicId: CLINIC_ID,
      patientId,
      professionalId,
      roomId,
      serviceId,
      startsAt,
      endsAt,
      status,
      notes: "",
      patientName: patient.fullName,
      professionalName: professional.fullName,
      professionalColor: professional.color,
      roomName: room.name,
      serviceName: service.name,
      createdAt: now(),
      updatedAt: now(),
    };
  }

  async findUserByEmail(email: string) {
    return (
      this.users.find(
        (user) => user.email === email.toLowerCase() && user.active,
      ) ?? null
    );
  }

  async findUserById(clinicId: string, userId: string) {
    return (
      this.users.find(
        (user) =>
          user.clinicId === clinicId && user.id === userId && user.active,
      ) ?? null
    );
  }

  async listAdminUsers(clinicId: string) {
    return this.users
      .filter((user) => user.clinicId === clinicId)
      .map(({ passwordHash: _, ...user }) => {
        void _;
        return user;
      })
      .sort((a, b) => a.fullName.localeCompare(b.fullName));
  }

  async createAdminUser(
    clinicId: string,
    actorUserId: string,
    input: AdminUserInput,
    passwordHash: string,
  ) {
    if (
      this.users.some(
        (user) =>
          user.clinicId === clinicId &&
          user.email === input.email.toLowerCase(),
      )
    )
      throw new DomainError(
        "USER_EMAIL_DUPLICATE",
        "Este e-mail já está em uso.",
        409,
      );
    const timestamp = now();
    const user: AuthenticatedUser = {
      id: uuid(),
      clinicId,
      fullName: input.fullName,
      email: input.email.toLowerCase(),
      role: input.role,
      passwordHash,
      active: true,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.users.push(user);
    this.addAdminAudit(actorUserId, "user.created", "user", user.id, {
      role: user.role,
      email: user.email,
    });
    const { passwordHash: _, ...summary } = user;
    void _;
    return summary;
  }

  async updateAdminUser(
    clinicId: string,
    actorUserId: string,
    userId: string,
    input: AdminUserUpdate,
  ) {
    const user = this.users.find(
      (item) => item.clinicId === clinicId && item.id === userId,
    );
    if (!user) return null;
    if (userId === actorUserId && !input.active)
      throw new DomainError(
        "CANNOT_DEACTIVATE_SELF",
        "Você não pode desativar o próprio acesso.",
        409,
      );
    Object.assign(user, input, { updatedAt: now() });
    this.addAdminAudit(actorUserId, "user.updated", "user", user.id, {
      role: user.role,
      active: user.active,
    });
    const { passwordHash: _, ...summary } = user;
    void _;
    return summary;
  }

  async resetAdminUserPassword(
    clinicId: string,
    actorUserId: string,
    userId: string,
    passwordHash: string,
  ) {
    const user = this.users.find(
      (item) => item.clinicId === clinicId && item.id === userId,
    );
    if (!user) return false;
    user.passwordHash = passwordHash;
    user.updatedAt = now();
    this.addAdminAudit(actorUserId, "user.password_reset", "user", user.id);
    return true;
  }

  async getClinicSettings(clinicId: string) {
    return clinicId === this.clinicSettings.id ? this.clinicSettings : null;
  }

  async updateClinicSettings(
    clinicId: string,
    actorUserId: string,
    input: ClinicSettingsInput,
  ) {
    if (clinicId !== this.clinicSettings.id)
      throw new DomainError("CLINIC_NOT_FOUND", "Clínica não encontrada.", 404);
    Object.assign(this.clinicSettings, input, { updatedAt: now() });
    this.addAdminAudit(actorUserId, "clinic.updated", "clinic", clinicId);
    return this.clinicSettings;
  }

  async listAdminAuditEvents(clinicId: string) {
    return clinicId === CLINIC_ID ? [...this.adminAuditEvents].reverse() : [];
  }

  private addAdminAudit(
    actorUserId: string,
    action: string,
    entityType: string,
    entityId?: string,
    metadata: Record<string, unknown> = {},
  ) {
    const actorName = this.users.find(
      (user) => user.id === actorUserId,
    )?.fullName;
    this.adminAuditEvents.push({
      id: uuid(),
      action,
      entityType,
      ...(entityId ? { entityId } : {}),
      ...(actorName ? { actorName } : {}),
      metadata,
      createdAt: now(),
    });
  }

  async getDashboard(
    clinicId: string,
    date: string,
  ): Promise<DashboardSummary> {
    const month = date.slice(0, 7);
    const appointmentsToday = this.appointments.filter(
      (item) =>
        item.clinicId === clinicId &&
        localDate(new Date(item.startsAt)) === date,
    );
    return {
      date,
      appointmentsToday: appointmentsToday.length,
      completedToday: appointmentsToday.filter(
        (item) => item.status === "completed",
      ).length,
      patientsActive: this.patients.filter(
        (item) => item.clinicId === clinicId && item.status === "active",
      ).length,
      noShowsThisMonth: this.appointments.filter(
        (item) =>
          item.clinicId === clinicId &&
          item.startsAt.startsWith(month) &&
          item.status === "no_show",
      ).length,
      nextAppointments: appointmentsToday
        .filter((item) => item.endsAt >= now())
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
        .slice(0, 5),
    };
  }

  async listPatients(clinicId: string, search = "") {
    const normalized = search.trim().toLocaleLowerCase("pt-BR");
    return this.patients
      .filter((item) => item.clinicId === clinicId)
      .filter((item) =>
        normalized
          ? [item.fullName, item.cpf, item.email, item.phone, item.recordNumber]
              .filter(Boolean)
              .some((value) =>
                value!.toLocaleLowerCase("pt-BR").includes(normalized),
              )
          : true,
      )
      .sort((a, b) => a.fullName.localeCompare(b.fullName, "pt-BR"));
  }

  async createPatient(clinicId: string, input: PatientInput) {
    const duplicatedCpf = input.cpf
      ? this.patients.some(
          (item) => item.clinicId === clinicId && item.cpf === input.cpf,
        )
      : false;
    if (duplicatedCpf)
      throw new DomainError(
        "PATIENT_DUPLICATE",
        "Já existe um paciente com este CPF.",
        409,
      );

    const timestamp = now();
    const patient: Patient = {
      ...input,
      id: uuid(),
      clinicId,
      recordNumber: `PAC-${String(this.patients.length + 1).padStart(5, "0")}`,
      status: "active",
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.patients.push(patient);
    return patient;
  }

  async updatePatient(clinicId: string, patientId: string, input: PatientInput) {
    const patient = this.patients.find(
      (item) => item.clinicId === clinicId && item.id === patientId,
    );
    if (!patient) return null;
    if (
      input.cpf &&
      this.patients.some(
        (item) =>
          item.clinicId === clinicId &&
          item.id !== patientId &&
          item.cpf === input.cpf,
      )
    )
      throw new DomainError(
        "PATIENT_DUPLICATE",
        "Já existe um paciente com este CPF.",
        409,
      );
    Object.assign(patient, input, { updatedAt: now() });
    for (const collection of [
      this.appointments,
      this.clinicalRecords,
      this.patientPlans,
      this.receivables,
      this.groupEnrollments,
      this.groupAttendance,
      this.replacementCredits,
      this.patientTabs,
    ]) {
      for (const item of collection)
        if (item.patientId === patientId) item.patientName = patient.fullName;
    }
    return patient;
  }

  async listProfessionals(clinicId: string) {
    return this.professionals.filter(
      (item) => item.clinicId === clinicId && item.active,
    );
  }

  async createProfessional(clinicId: string, input: ProfessionalInput) {
    const professional: Professional = {
      ...input,
      id: uuid(),
      clinicId,
      active: true,
    };
    this.professionals.push(professional);
    return professional;
  }

  async listRooms(clinicId: string) {
    return this.rooms.filter(
      (item) => item.clinicId === clinicId && item.active,
    );
  }

  async createRoom(clinicId: string, input: RoomInput) {
    const room: Room = { ...input, id: uuid(), clinicId, active: true };
    this.rooms.push(room);
    return room;
  }

  async listServices(clinicId: string) {
    return this.services.filter(
      (item) => item.clinicId === clinicId && item.active,
    );
  }

  async createService(clinicId: string, input: ServiceInput) {
    const service: Service = { ...input, id: uuid(), clinicId, active: true };
    this.services.push(service);
    return service;
  }

  async listAppointments(clinicId: string, from: string, to: string) {
    return this.appointments
      .filter(
        (item) =>
          item.clinicId === clinicId &&
          item.startsAt < to &&
          item.endsAt > from,
      )
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  }

  async createAppointment(clinicId: string, input: AppointmentInput) {
    const patient = this.patients.find(
      (item) => item.id === input.patientId && item.clinicId === clinicId,
    );
    const professional = this.professionals.find(
      (item) =>
        item.id === input.professionalId &&
        item.clinicId === clinicId &&
        item.active,
    );
    const room = this.rooms.find(
      (item) =>
        item.id === input.roomId && item.clinicId === clinicId && item.active,
    );
    const service = this.services.find(
      (item) =>
        item.id === input.serviceId &&
        item.clinicId === clinicId &&
        item.active,
    );
    if (!patient || !professional || !room || !service) {
      throw new DomainError(
        "RELATED_RECORD_NOT_FOUND",
        "Paciente, profissional, sala ou serviço não encontrado.",
        404,
      );
    }

    const startsAt = new Date(input.startsAt);
    const endsAt = new Date(
      startsAt.getTime() + service.durationMinutes * 60_000,
    );
    const conflict = this.appointments.some(
      (item) =>
        item.clinicId === clinicId &&
        item.status !== "cancelled" &&
        (item.professionalId === professional.id || item.roomId === room.id) &&
        new Date(item.startsAt) < endsAt &&
        new Date(item.endsAt) > startsAt,
    );
    const blocked = this.scheduleBlocks.some(
      (item) =>
        item.clinicId === clinicId &&
        item.status === "active" &&
        (item.professionalId === professional.id || item.roomId === room.id) &&
        new Date(item.startsAt) < endsAt &&
        new Date(item.endsAt) > startsAt,
    );
    const groupConflict = this.groupSessions.some((session) => {
      const group = this.groupClasses.find(
        (item) => item.id === session.groupId,
      );
      return (
        session.clinicId === clinicId &&
        session.status !== "cancelled" &&
        Boolean(group) &&
        (group!.professionalId === professional.id ||
          group!.roomId === room.id) &&
        new Date(session.startsAt) < endsAt &&
        new Date(session.endsAt) > startsAt
      );
    });
    if (conflict || blocked || groupConflict) {
      throw new DomainError(
        "APPOINTMENT_CONFLICT",
        "O profissional ou a sala está ocupado ou bloqueado nesse horário.",
        409,
      );
    }

    const timestamp = now();
    const appointment: Appointment = {
      ...input,
      id: uuid(),
      clinicId,
      endsAt: endsAt.toISOString(),
      status: "scheduled",
      patientName: patient.fullName,
      professionalName: professional.fullName,
      professionalColor: professional.color,
      roomName: room.name,
      serviceName: service.name,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.appointments.push(appointment);
    return appointment;
  }

  async rescheduleAppointment(
    clinicId: string,
    actorUserId: string,
    appointmentId: string,
    input: AppointmentRescheduleInput,
  ) {
    const appointment = this.appointments.find(
      (item) => item.clinicId === clinicId && item.id === appointmentId,
    );
    if (!appointment) return null;
    if (!["scheduled", "confirmed"].includes(appointment.status))
      throw new DomainError(
        "APPOINTMENT_RESCHEDULE_FORBIDDEN",
        "Somente atendimentos agendados ou confirmados podem ser reagendados.",
        409,
      );
    const professional = this.professionals.find(
      (item) =>
        item.clinicId === clinicId && item.id === input.professionalId && item.active,
    );
    const room = this.rooms.find(
      (item) => item.clinicId === clinicId && item.id === input.roomId && item.active,
    );
    const service = this.services.find(
      (item) => item.clinicId === clinicId && item.id === appointment.serviceId,
    );
    if (!professional || !room || !service)
      throw new DomainError(
        "RELATED_RECORD_NOT_FOUND",
        "Profissional, sala ou serviço não encontrado.",
        404,
      );
    const startsAt = new Date(input.startsAt);
    const endsAt = new Date(
      startsAt.getTime() + service.durationMinutes * 60_000,
    );
    if (
      appointment.startsAt === startsAt.toISOString() &&
      appointment.professionalId === professional.id &&
      appointment.roomId === room.id
    )
      return appointment;
    const overlaps = (from: string, to: string) =>
      new Date(from) < endsAt && new Date(to) > startsAt;
    const appointmentConflict = this.appointments.some(
      (item) =>
        item.clinicId === clinicId &&
        item.id !== appointmentId &&
        item.status !== "cancelled" &&
        (item.professionalId === professional.id || item.roomId === room.id) &&
        overlaps(item.startsAt, item.endsAt),
    );
    const blockConflict = this.scheduleBlocks.some(
      (item) =>
        item.clinicId === clinicId &&
        item.status === "active" &&
        (item.professionalId === professional.id || item.roomId === room.id) &&
        overlaps(item.startsAt, item.endsAt),
    );
    const groupConflict = this.groupSessions.some((session) => {
      const group = this.groupClasses.find(
        (item) => item.id === session.groupId,
      );
      return (
        session.clinicId === clinicId &&
        session.status !== "cancelled" &&
        Boolean(group) &&
        (group!.professionalId === professional.id || group!.roomId === room.id) &&
        overlaps(session.startsAt, session.endsAt)
      );
    });
    if (appointmentConflict || blockConflict || groupConflict)
      throw new DomainError(
        "APPOINTMENT_CONFLICT",
        "O profissional ou a sala está ocupado ou bloqueado nesse horário.",
        409,
      );
    const actor = this.users.find(
      (item) => item.clinicId === clinicId && item.id === actorUserId,
    );
    const event: AppointmentRescheduleEvent = {
      id: uuid(),
      appointmentId,
      previousStartsAt: appointment.startsAt,
      previousEndsAt: appointment.endsAt,
      previousProfessionalId: appointment.professionalId,
      previousProfessionalName: appointment.professionalName,
      previousRoomId: appointment.roomId,
      previousRoomName: appointment.roomName,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      professionalId: professional.id,
      professionalName: professional.fullName,
      roomId: room.id,
      roomName: room.name,
      actorName: actor?.fullName ?? "Usuário",
      createdAt: now(),
    };
    Object.assign(appointment, {
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      professionalId: professional.id,
      professionalName: professional.fullName,
      professionalColor: professional.color,
      roomId: room.id,
      roomName: room.name,
      updatedAt: event.createdAt,
    });
    this.appointmentReschedules.push(event);
    return appointment;
  }

  async listAppointmentReschedules(clinicId: string, appointmentId: string) {
    if (
      !this.appointments.some(
        (item) => item.clinicId === clinicId && item.id === appointmentId,
      )
    )
      return null;
    return this.appointmentReschedules
      .filter((item) => item.appointmentId === appointmentId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async createRecurringAppointments(
    clinicId: string,
    input: RecurringAppointmentInput,
  ) {
    const originalLength = this.appointments.length;
    const seriesId = uuid();
    const appointments: Appointment[] = [];
    try {
      for (let index = 0; index < input.occurrences; index += 1) {
        const startsAt = new Date(input.startsAt);
        startsAt.setUTCDate(
          startsAt.getUTCDate() + index * input.intervalWeeks * 7,
        );
        const appointment = await this.createAppointment(clinicId, {
          patientId: input.patientId,
          professionalId: input.professionalId,
          roomId: input.roomId,
          serviceId: input.serviceId,
          startsAt: startsAt.toISOString(),
          notes: input.notes,
        });
        appointment.seriesId = seriesId;
        appointments.push(appointment);
      }
      return appointments;
    } catch (error) {
      this.appointments.splice(originalLength);
      throw error;
    }
  }

  async listScheduleBlocks(clinicId: string, from: string, to: string) {
    return this.scheduleBlocks
      .filter(
        (item) =>
          item.clinicId === clinicId &&
          item.status === "active" &&
          item.startsAt < to &&
          item.endsAt > from,
      )
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  }

  async createScheduleBlock(clinicId: string, input: ScheduleBlockInput) {
    const professional = input.professionalId
      ? this.professionals.find(
          (item) =>
            item.clinicId === clinicId && item.id === input.professionalId,
        )
      : undefined;
    const room = input.roomId
      ? this.rooms.find(
          (item) => item.clinicId === clinicId && item.id === input.roomId,
        )
      : undefined;
    if ((input.professionalId && !professional) || (input.roomId && !room))
      throw new DomainError(
        "RELATED_RECORD_NOT_FOUND",
        "Profissional ou sala não encontrado.",
        404,
      );
    const startsAt = new Date(input.startsAt);
    const endsAt = new Date(input.endsAt);
    const appointmentConflict = this.appointments.some(
      (item) =>
        item.clinicId === clinicId &&
        item.status !== "cancelled" &&
        (item.professionalId === input.professionalId ||
          item.roomId === input.roomId) &&
        new Date(item.startsAt) < endsAt &&
        new Date(item.endsAt) > startsAt,
    );
    const blockConflict = this.scheduleBlocks.some(
      (item) =>
        item.clinicId === clinicId &&
        item.status === "active" &&
        (Boolean(
          input.professionalId && item.professionalId === input.professionalId,
        ) ||
          Boolean(input.roomId && item.roomId === input.roomId)) &&
        new Date(item.startsAt) < endsAt &&
        new Date(item.endsAt) > startsAt,
    );
    const groupConflict = this.groupSessions.some((session) => {
      const group = this.groupClasses.find(
        (item) => item.id === session.groupId,
      );
      return (
        session.clinicId === clinicId &&
        session.status !== "cancelled" &&
        Boolean(group) &&
        (Boolean(
          input.professionalId &&
          group!.professionalId === input.professionalId,
        ) ||
          Boolean(input.roomId && group!.roomId === input.roomId)) &&
        new Date(session.startsAt) < endsAt &&
        new Date(session.endsAt) > startsAt
      );
    });
    if (appointmentConflict || blockConflict || groupConflict)
      throw new DomainError(
        "SCHEDULE_BLOCK_CONFLICT",
        "O bloqueio conflita com um atendimento ou bloqueio existente.",
        409,
      );
    const timestamp = now();
    const block: ScheduleBlock = {
      ...input,
      id: uuid(),
      clinicId,
      ...(professional ? { professionalName: professional.fullName } : {}),
      ...(room ? { roomName: room.name } : {}),
      status: "active",
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.scheduleBlocks.push(block);
    return block;
  }

  async cancelScheduleBlock(clinicId: string, blockId: string) {
    const block = this.scheduleBlocks.find(
      (item) => item.clinicId === clinicId && item.id === blockId,
    );
    if (!block) return null;
    block.status = "cancelled";
    block.updatedAt = now();
    return block;
  }

  async getGroupWorkspace(
    clinicId: string,
    from: string,
    to: string,
  ): Promise<GroupWorkspace> {
    return {
      groups: this.groupClasses.filter((item) => item.clinicId === clinicId),
      enrollments: this.groupEnrollments.filter(
        (item) => item.clinicId === clinicId,
      ),
      sessions: this.groupSessions
        .filter(
          (item) =>
            item.clinicId === clinicId &&
            item.startsAt < to &&
            item.endsAt > from,
        )
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
      attendance: this.groupAttendance.filter(
        (item) =>
          item.clinicId === clinicId &&
          this.groupSessions.some(
            (session) =>
              session.id === item.sessionId &&
              session.startsAt < to &&
              session.endsAt > from,
          ),
      ),
      replacementCredits: this.replacementCredits.filter(
        (item) => item.clinicId === clinicId,
      ),
    };
  }

  async createGroupClass(clinicId: string, input: GroupClassInput) {
    const service = this.services.find(
      (item) =>
        item.clinicId === clinicId &&
        item.id === input.serviceId &&
        item.active,
    );
    const professional = this.professionals.find(
      (item) =>
        item.clinicId === clinicId &&
        item.id === input.professionalId &&
        item.active,
    );
    const room = this.rooms.find(
      (item) =>
        item.clinicId === clinicId && item.id === input.roomId && item.active,
    );
    if (!service || !professional || !room)
      throw new DomainError(
        "GROUP_RELATED_RECORD_NOT_FOUND",
        "ServiÃ§o, profissional ou sala nÃ£o encontrado.",
        404,
      );
    if (input.capacity > room.capacity)
      throw new DomainError(
        "GROUP_EXCEEDS_ROOM_CAPACITY",
        "A capacidade da turma excede a capacidade da sala.",
        409,
      );
    const group: GroupClass = {
      ...input,
      id: uuid(),
      clinicId,
      serviceName: service.name,
      professionalName: professional.fullName,
      roomName: room.name,
      activeEnrollments: 0,
      waitlistCount: 0,
      active: true,
      createdAt: now(),
    };
    this.groupClasses.push(group);
    return group;
  }

  async createGroupEnrollment(clinicId: string, input: GroupEnrollmentInput) {
    const group = this.groupClasses.find(
      (item) =>
        item.clinicId === clinicId && item.id === input.groupId && item.active,
    );
    const patient = this.patients.find(
      (item) =>
        item.clinicId === clinicId &&
        item.id === input.patientId &&
        item.status === "active",
    );
    if (!group || !patient)
      throw new DomainError(
        "GROUP_OR_PATIENT_NOT_FOUND",
        "Turma ou paciente ativo nÃ£o encontrado.",
        404,
      );
    if (
      this.groupEnrollments.some(
        (item) =>
          item.clinicId === clinicId &&
          item.groupId === input.groupId &&
          item.patientId === input.patientId &&
          item.status !== "cancelled",
      )
    )
      throw new DomainError(
        "GROUP_ENROLLMENT_EXISTS",
        "O paciente jÃ¡ estÃ¡ matriculado ou na lista de espera.",
        409,
      );
    const activeCount = this.groupEnrollments.filter(
      (item) => item.groupId === group.id && item.status === "active",
    ).length;
    const waitlist = this.groupEnrollments.filter(
      (item) => item.groupId === group.id && item.status === "waitlisted",
    );
    const timestamp = now();
    const status = activeCount < group.capacity ? "active" : "waitlisted";
    const enrollment: GroupEnrollment = {
      ...input,
      id: uuid(),
      clinicId,
      patientName: patient.fullName,
      status,
      ...(status === "waitlisted"
        ? {
            queuePosition:
              Math.max(0, ...waitlist.map((item) => item.queuePosition ?? 0)) +
              1,
          }
        : {}),
      enrolledAt: timestamp,
      updatedAt: timestamp,
    };
    this.groupEnrollments.push(enrollment);
    this.refreshGroupCounts(group);
    return enrollment;
  }

  async cancelGroupEnrollment(clinicId: string, enrollmentId: string) {
    const enrollment = this.groupEnrollments.find(
      (item) => item.clinicId === clinicId && item.id === enrollmentId,
    );
    if (!enrollment) return null;
    const wasActive = enrollment.status === "active";
    enrollment.status = "cancelled";
    delete enrollment.queuePosition;
    enrollment.updatedAt = now();
    if (wasActive) {
      const next = this.groupEnrollments
        .filter(
          (item) =>
            item.groupId === enrollment.groupId && item.status === "waitlisted",
        )
        .sort(
          (a, b) =>
            (a.queuePosition ?? 0) - (b.queuePosition ?? 0) ||
            a.enrolledAt.localeCompare(b.enrolledAt),
        )[0];
      if (next) {
        next.status = "active";
        delete next.queuePosition;
        next.updatedAt = now();
      }
    }
    const remaining = this.groupEnrollments
      .filter(
        (item) =>
          item.groupId === enrollment.groupId && item.status === "waitlisted",
      )
      .sort((a, b) => (a.queuePosition ?? 0) - (b.queuePosition ?? 0));
    remaining.forEach((item, index) => {
      item.queuePosition = index + 1;
    });
    const group = this.groupClasses.find(
      (item) => item.id === enrollment.groupId,
    );
    if (group) this.refreshGroupCounts(group);
    return enrollment;
  }

  async createGroupSessionSeries(
    clinicId: string,
    input: GroupSessionSeriesInput,
  ) {
    const group = this.groupClasses.find(
      (item) =>
        item.clinicId === clinicId && item.id === input.groupId && item.active,
    );
    if (!group)
      throw new DomainError("GROUP_NOT_FOUND", "Turma nÃ£o encontrada.", 404);
    const service = this.services.find((item) => item.id === group.serviceId)!;
    const created: GroupSession[] = [];
    for (let index = 0; index < input.occurrences; index += 1) {
      const startsAt = new Date(input.startsAt);
      startsAt.setUTCDate(
        startsAt.getUTCDate() + index * input.intervalWeeks * 7,
      );
      const endsAt = new Date(
        startsAt.getTime() + service.durationMinutes * 60_000,
      );
      if (this.hasGroupScheduleConflict(clinicId, group, startsAt, endsAt))
        throw new DomainError(
          "GROUP_SESSION_CONFLICT",
          `Conflito de agenda na ocorrÃªncia ${index + 1}.`,
          409,
        );
      created.push({
        id: uuid(),
        clinicId,
        groupId: group.id,
        groupName: group.name,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        status: "scheduled",
        attendanceCount: 0,
        createdAt: now(),
      });
    }
    this.groupSessions.push(...created);
    return created;
  }

  async recordGroupAttendance(
    clinicId: string,
    _actorUserId: string,
    sessionId: string,
    patientId: string,
    input: GroupAttendanceInput,
  ) {
    const session = this.groupSessions.find(
      (item) => item.clinicId === clinicId && item.id === sessionId,
    );
    const enrollment = session
      ? this.groupEnrollments.find(
          (item) =>
            item.groupId === session.groupId &&
            item.patientId === patientId &&
            item.status === "active",
        )
      : undefined;
    if (!session || session.status === "cancelled" || !enrollment)
      throw new DomainError(
        "GROUP_ATTENDANCE_NOT_ALLOWED",
        "SessÃ£o ou matrÃ­cula ativa nÃ£o encontrada.",
        404,
      );
    let attendance = this.groupAttendance.find(
      (item) => item.sessionId === sessionId && item.patientId === patientId,
    );
    const credit = this.replacementCredits.find(
      (item) =>
        item.sourceSessionId === sessionId && item.patientId === patientId,
    );
    if (credit?.status === "used" && input.status !== "excused_absence")
      throw new DomainError(
        "REPLACEMENT_ALREADY_USED",
        "A reposiÃ§Ã£o desta falta jÃ¡ foi utilizada.",
        409,
      );
    if (attendance) {
      attendance.status = input.status;
      attendance.recordedAt = now();
      if (input.notes) attendance.notes = input.notes;
      else delete attendance.notes;
    } else {
      attendance = {
        id: uuid(),
        clinicId,
        sessionId,
        patientId,
        patientName: enrollment.patientName,
        status: input.status,
        ...(input.notes ? { notes: input.notes } : {}),
        recordedAt: now(),
      };
      this.groupAttendance.push(attendance);
    }
    if (input.status === "excused_absence" && !credit) {
      this.replacementCredits.push({
        id: uuid(),
        clinicId,
        patientId,
        patientName: enrollment.patientName,
        sourceSessionId: sessionId,
        status: "available",
        createdAt: now(),
      });
    } else if (
      input.status !== "excused_absence" &&
      credit?.status === "available"
    ) {
      credit.status = "cancelled";
    }
    session.attendanceCount = this.groupAttendance.filter(
      (item) => item.sessionId === sessionId,
    ).length;
    return attendance;
  }

  async completeGroupSession(clinicId: string, sessionId: string) {
    const session = this.groupSessions.find(
      (item) => item.clinicId === clinicId && item.id === sessionId,
    );
    if (!session) return null;
    if (session.status !== "cancelled") session.status = "completed";
    return session;
  }

  async bookReplacement(
    clinicId: string,
    _actorUserId: string,
    input: ReplacementBookingInput,
  ) {
    const credit = this.replacementCredits.find(
      (item) => item.clinicId === clinicId && item.id === input.creditId,
    );
    const session = this.groupSessions.find(
      (item) => item.clinicId === clinicId && item.id === input.sessionId,
    );
    const group = session
      ? this.groupClasses.find((item) => item.id === session.groupId)
      : undefined;
    if (
      !credit ||
      credit.status !== "available" ||
      !session ||
      !group ||
      session.status !== "scheduled"
    )
      throw new DomainError(
        "REPLACEMENT_NOT_AVAILABLE",
        "CrÃ©dito ou sessÃ£o de reposiÃ§Ã£o indisponÃ­vel.",
        409,
      );
    if (
      this.groupAttendance.some(
        (item) =>
          item.sessionId === session.id && item.patientId === credit.patientId,
      )
    )
      throw new DomainError(
        "REPLACEMENT_DUPLICATE_ATTENDANCE",
        "O paciente jÃ¡ possui presenÃ§a registrada nesta sessÃ£o.",
        409,
      );
    const regularSeats = this.groupEnrollments.filter(
      (item) => item.groupId === group.id && item.status === "active",
    ).length;
    const replacementSeats = this.groupAttendance.filter(
      (item) => item.sessionId === session.id && item.status === "replacement",
    ).length;
    const patientIsRegular = this.groupEnrollments.some(
      (item) =>
        item.groupId === group.id &&
        item.patientId === credit.patientId &&
        item.status === "active",
    );
    if (!patientIsRegular && regularSeats + replacementSeats >= group.capacity)
      throw new DomainError(
        "GROUP_SESSION_FULL",
        "A sessÃ£o estÃ¡ lotada.",
        409,
      );
    const attendance: GroupAttendance = {
      id: uuid(),
      clinicId,
      sessionId: session.id,
      patientId: credit.patientId,
      patientName: credit.patientName,
      status: "replacement",
      recordedAt: now(),
    };
    this.groupAttendance.push(attendance);
    session.attendanceCount += 1;
    credit.status = "used";
    credit.usedSessionId = session.id;
    credit.usedAt = now();
    return { attendance, credit };
  }

  async getInventoryWorkspace(clinicId: string): Promise<InventoryWorkspace> {
    const products = this.products.filter((item) => item.clinicId === clinicId);
    const tabs = this.patientTabs.filter((item) => item.clinicId === clinicId);
    return {
      products,
      movements: this.stockMovements
        .filter((item) => item.clinicId === clinicId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      tabs: tabs.sort((a, b) => b.openedAt.localeCompare(a.openedAt)),
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
    _actorUserId: string,
    input: ProductInput,
  ) {
    if (
      this.products.some(
        (item) =>
          item.clinicId === clinicId &&
          item.sku.toLocaleLowerCase() === input.sku.toLocaleLowerCase(),
      )
    )
      throw new DomainError(
        "PRODUCT_SKU_EXISTS",
        "JÃ¡ existe um produto com este SKU.",
        409,
      );
    const timestamp = now();
    const product: Product = {
      name: input.name,
      sku: input.sku,
      unit: input.unit,
      costInCents: input.costInCents,
      salePriceInCents: input.salePriceInCents,
      minimumStock: input.minimumStock,
      id: uuid(),
      clinicId,
      currentStock: input.initialStock,
      lowStock: input.initialStock <= input.minimumStock,
      active: true,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.products.push(product);
    if (input.initialStock > 0)
      this.pushStockMovement(
        product,
        "initial_stock",
        input.initialStock,
        "Estoque inicial",
      );
    return product;
  }

  async createStockMovement(
    clinicId: string,
    _actorUserId: string,
    input: StockMovementInput,
  ) {
    const product = this.products.find(
      (item) => item.clinicId === clinicId && item.id === input.productId,
    );
    if (!product)
      throw new DomainError(
        "PRODUCT_NOT_FOUND",
        "Produto nÃ£o encontrado.",
        404,
      );
    const quantity = ["adjustment_out", "loss"].includes(input.kind)
      ? -input.quantity
      : input.quantity;
    if (product.currentStock + quantity < 0)
      throw new DomainError(
        "INSUFFICIENT_STOCK",
        "O estoque disponÃ­vel Ã© insuficiente.",
        409,
      );
    product.currentStock += quantity;
    product.lowStock = product.currentStock <= product.minimumStock;
    product.updatedAt = now();
    return this.pushStockMovement(product, input.kind, quantity, input.notes);
  }

  async openPatientTab(
    clinicId: string,
    _actorUserId: string,
    input: PatientTabInput,
  ) {
    const patient = this.patients.find(
      (item) =>
        item.clinicId === clinicId &&
        item.id === input.patientId &&
        item.status === "active",
    );
    if (!patient)
      throw new DomainError(
        "PATIENT_NOT_FOUND",
        "Paciente nÃ£o encontrado.",
        404,
      );
    const tab: PatientTab = {
      ...input,
      id: uuid(),
      clinicId,
      patientName: patient.fullName,
      status: "open",
      paymentStatus: "pending",
      totalInCents: 0,
      items: [],
      openedAt: now(),
    };
    this.patientTabs.push(tab);
    return tab;
  }

  async addPatientTabItem(
    clinicId: string,
    _actorUserId: string,
    tabId: string,
    input: PatientTabItemInput,
  ) {
    const tab = this.patientTabs.find(
      (item) => item.clinicId === clinicId && item.id === tabId,
    );
    if (!tab) return null;
    if (tab.status !== "open")
      throw new DomainError(
        "PATIENT_TAB_NOT_OPEN",
        "Somente comandas abertas podem receber itens.",
        409,
      );
    const product = this.products.find(
      (item) =>
        item.clinicId === clinicId &&
        item.id === input.productId &&
        item.active,
    );
    if (!product)
      throw new DomainError(
        "PRODUCT_NOT_FOUND",
        "Produto nÃ£o encontrado.",
        404,
      );
    if (product.currentStock < input.quantity)
      throw new DomainError(
        "INSUFFICIENT_STOCK",
        "O estoque disponÃ­vel Ã© insuficiente.",
        409,
      );
    const existing = tab.items.find((item) => item.productId === product.id);
    if (existing) {
      existing.quantity += input.quantity;
      existing.totalInCents = existing.quantity * existing.unitPriceInCents;
    } else {
      tab.items.push({
        id: uuid(),
        productId: product.id,
        productName: product.name,
        quantity: input.quantity,
        unitPriceInCents: product.salePriceInCents,
        unitCostInCents: product.costInCents,
        totalInCents: input.quantity * product.salePriceInCents,
      });
    }
    product.currentStock -= input.quantity;
    product.lowStock = product.currentStock <= product.minimumStock;
    product.updatedAt = now();
    this.pushStockMovement(
      product,
      "sale",
      -input.quantity,
      `Reserva na comanda de ${tab.patientName}`,
      tab.id,
    );
    tab.totalInCents = tab.items.reduce(
      (sum, item) => sum + item.totalInCents,
      0,
    );
    return tab;
  }

  async closePatientTab(
    clinicId: string,
    _actorUserId: string,
    tabId: string,
    input: PatientTabCloseInput,
  ) {
    const tab = this.patientTabs.find(
      (item) => item.clinicId === clinicId && item.id === tabId,
    );
    if (!tab) return null;
    if (tab.status !== "open" || tab.items.length === 0)
      throw new DomainError(
        "PATIENT_TAB_CANNOT_CLOSE",
        "A comanda precisa estar aberta e conter ao menos um item.",
        409,
      );
    const timestamp = now();
    const receivable: Receivable = {
      id: uuid(),
      clinicId,
      patientId: tab.patientId,
      patientName: tab.patientName,
      description: `Comanda ${tab.id.slice(0, 8).toUpperCase()}`,
      installmentNumber: 1,
      installmentCount: 1,
      dueDate: input.dueDate,
      amountInCents: tab.totalInCents,
      status: input.settlement === "paid" ? "paid" : "open",
      ...(input.settlement === "paid"
        ? { paidAt: timestamp, paymentMethod: input.paymentMethod! }
        : {}),
      overdue: input.settlement === "receivable" && input.dueDate < today(),
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.receivables.push(receivable);
    if (receivable.status === "paid")
      this.receiptEvents.push({
        id: uuid(),
        receivableId: receivable.id,
        kind: "payment",
        occurredAt: timestamp,
        amountInCents: receivable.amountInCents,
        paymentMethod: input.paymentMethod!,
      });
    tab.status = "closed";
    tab.paymentStatus = input.settlement;
    tab.receivableId = receivable.id;
    tab.closedAt = timestamp;
    return tab;
  }

  async cancelPatientTab(
    clinicId: string,
    _actorUserId: string,
    tabId: string,
  ) {
    const tab = this.patientTabs.find(
      (item) => item.clinicId === clinicId && item.id === tabId,
    );
    if (!tab) return null;
    if (tab.status === "cancelled")
      throw new DomainError(
        "PATIENT_TAB_ALREADY_CANCELLED",
        "A comanda jÃ¡ foi cancelada.",
        409,
      );
    for (const item of tab.items) {
      const product = this.products.find(
        (candidate) => candidate.id === item.productId,
      )!;
      product.currentStock += item.quantity;
      product.lowStock = product.currentStock <= product.minimumStock;
      product.updatedAt = now();
      this.pushStockMovement(
        product,
        "sale_reversal",
        item.quantity,
        `Estorno da comanda de ${tab.patientName}`,
        tab.id,
      );
    }
    if (tab.receivableId) {
      const receivable = this.receivables.find(
        (item) => item.id === tab.receivableId,
      );
      if (receivable) {
        receivable.status = "cancelled";
        delete receivable.paidAt;
        delete receivable.paymentMethod;
        receivable.overdue = false;
        receivable.updatedAt = now();
      }
    }
    tab.status = "cancelled";
    tab.paymentStatus = "cancelled";
    tab.cancelledAt = now();
    return tab;
  }

  private pushStockMovement(
    product: Product,
    kind: StockMovement["kind"],
    quantity: number,
    notes: string,
    patientTabId?: string,
  ) {
    const movement: StockMovement = {
      id: uuid(),
      clinicId: product.clinicId,
      productId: product.id,
      productName: product.name,
      kind,
      quantity,
      balanceAfter: product.currentStock,
      notes,
      ...(patientTabId ? { patientTabId } : {}),
      createdAt: now(),
    };
    this.stockMovements.push(movement);
    return movement;
  }

  private refreshGroupCounts(group: GroupClass) {
    group.activeEnrollments = this.groupEnrollments.filter(
      (item) => item.groupId === group.id && item.status === "active",
    ).length;
    group.waitlistCount = this.groupEnrollments.filter(
      (item) => item.groupId === group.id && item.status === "waitlisted",
    ).length;
  }

  private hasGroupScheduleConflict(
    clinicId: string,
    group: GroupClass,
    startsAt: Date,
    endsAt: Date,
  ) {
    const overlaps = (start: string, end: string) =>
      new Date(start) < endsAt && new Date(end) > startsAt;
    return (
      this.appointments.some(
        (item) =>
          item.clinicId === clinicId &&
          item.status !== "cancelled" &&
          (item.professionalId === group.professionalId ||
            item.roomId === group.roomId) &&
          overlaps(item.startsAt, item.endsAt),
      ) ||
      this.scheduleBlocks.some(
        (item) =>
          item.clinicId === clinicId &&
          item.status === "active" &&
          (item.professionalId === group.professionalId ||
            item.roomId === group.roomId) &&
          overlaps(item.startsAt, item.endsAt),
      ) ||
      this.groupSessions.some((item) => {
        const existingGroup = this.groupClasses.find(
          (candidate) => candidate.id === item.groupId,
        );
        return (
          item.clinicId === clinicId &&
          item.status !== "cancelled" &&
          Boolean(existingGroup) &&
          (existingGroup!.professionalId === group.professionalId ||
            existingGroup!.roomId === group.roomId) &&
          overlaps(item.startsAt, item.endsAt)
        );
      })
    );
  }

  async updateAppointmentStatus(
    clinicId: string,
    appointmentId: string,
    status: AppointmentStatus,
  ) {
    const appointment = this.appointments.find(
      (item) => item.id === appointmentId && item.clinicId === clinicId,
    );
    if (!appointment) return null;
    const previousStatus = appointment.status;
    if (previousStatus !== "completed" && status === "completed") {
      this.consumeSession(appointment);
    } else if (previousStatus === "completed" && status !== "completed") {
      this.restoreSession(appointment);
    }
    appointment.status = status;
    appointment.updatedAt = now();
    return appointment;
  }

  async listClinicalRecords(clinicId: string, patientId?: string) {
    return this.clinicalRecords
      .filter(
        (record) =>
          record.clinicId === clinicId &&
          (!patientId || record.patientId === patientId),
      )
      .sort((a, b) =>
        b.appointmentStartsAt.localeCompare(a.appointmentStartsAt),
      );
  }

  async saveClinicalRecord(
    clinicId: string,
    authorUserId: string,
    input: ClinicalRecordInput,
  ) {
    const appointment = this.appointments.find(
      (item) => item.clinicId === clinicId && item.id === input.appointmentId,
    );
    const author = this.users.find(
      (item) => item.clinicId === clinicId && item.id === authorUserId,
    );
    if (!appointment || !author) {
      throw new DomainError(
        "CLINICAL_CONTEXT_NOT_FOUND",
        "Atendimento ou autor não encontrado.",
        404,
      );
    }
    if (appointment.status === "cancelled") {
      throw new DomainError(
        "CANCELLED_APPOINTMENT",
        "Não é possível registrar evolução em um atendimento cancelado.",
      );
    }

    const existing = this.clinicalRecords.find(
      (record) => record.appointmentId === appointment.id,
    );
    if (existing?.status === "finalized") {
      throw new DomainError(
        "CLINICAL_RECORD_FINALIZED",
        "Este prontuário já foi finalizado e não pode ser alterado.",
        409,
      );
    }

    const timestamp = now();
    const record: ClinicalRecord = existing ?? {
      id: uuid(),
      clinicId,
      appointmentId: appointment.id,
      patientId: appointment.patientId,
      professionalId: appointment.professionalId,
      status: "draft",
      version: 0,
      authorName: author.fullName,
      patientName: appointment.patientName,
      professionalName: appointment.professionalName,
      appointmentStartsAt: appointment.startsAt,
      subjective: "",
      objective: "",
      assessment: "",
      plan: "",
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    Object.assign(record, input, {
      authorName: author.fullName,
      version: record.version + 1,
      updatedAt: timestamp,
    });
    if (!existing) this.clinicalRecords.push(record);
    this.addClinicalRevision(record, author.fullName);
    return record;
  }

  async finalizeClinicalRecord(
    clinicId: string,
    authorUserId: string,
    recordId: string,
  ) {
    const record = this.clinicalRecords.find(
      (item) => item.clinicId === clinicId && item.id === recordId,
    );
    if (!record) return null;
    if (record.status === "finalized") return record;
    if (
      !record.subjective.trim() ||
      !record.objective.trim() ||
      !record.assessment.trim() ||
      !record.plan.trim()
    ) {
      throw new DomainError(
        "INCOMPLETE_CLINICAL_RECORD",
        "Preencha todas as etapas SOAP antes de finalizar.",
      );
    }
    const author = this.users.find(
      (item) => item.clinicId === clinicId && item.id === authorUserId,
    );
    if (!author) return null;
    record.status = "finalized";
    record.version += 1;
    record.authorName = author.fullName;
    record.finalizedAt = now();
    record.updatedAt = record.finalizedAt;
    this.addClinicalRevision(record, author.fullName);
    return record;
  }

  async listClinicalRecordRevisions(clinicId: string, recordId: string) {
    const belongsToClinic = this.clinicalRecords.some(
      (record) => record.clinicId === clinicId && record.id === recordId,
    );
    if (!belongsToClinic) return [];
    return this.clinicalRecordRevisions
      .filter((revision) => revision.clinicalRecordId === recordId)
      .sort((a, b) => b.version - a.version);
  }

  private addClinicalRevision(record: ClinicalRecord, authorName: string) {
    this.clinicalRecordRevisions.push({
      id: uuid(),
      clinicalRecordId: record.id,
      version: record.version,
      status: record.status,
      subjective: record.subjective,
      objective: record.objective,
      assessment: record.assessment,
      plan: record.plan,
      ...(record.painScale !== undefined
        ? { painScale: record.painScale }
        : {}),
      authorName,
      createdAt: now(),
    });
  }

  async getClinicalWorkspace(
    clinicId: string,
    patientId: string,
    actorUserId: string,
    accessAction: "read" | "export" = "read",
  ): Promise<ClinicalWorkspace | null> {
    const patient = this.patients.find(
      (item) => item.clinicId === clinicId && item.id === patientId,
    );
    if (!patient) return null;
    this.addClinicalAccessEvent(
      clinicId,
      patientId,
      actorUserId,
      accessAction,
      "workspace",
    );
    return {
      patient,
      records: await this.listClinicalRecords(clinicId, patientId),
      templates: this.assessmentTemplates.filter(
        (item) => item.clinicId === clinicId && item.active,
      ),
      assessments: this.clinicalAssessments
        .filter(
          (item) => item.clinicId === clinicId && item.patientId === patientId,
        )
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      goals: this.therapeuticGoals
        .filter(
          (item) => item.clinicId === clinicId && item.patientId === patientId,
        )
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      measurements: this.clinicalMeasurements
        .filter(
          (item) => item.clinicId === clinicId && item.patientId === patientId,
        )
        .sort((a, b) => b.measuredAt.localeCompare(a.measuredAt)),
      closures: this.treatmentClosures
        .filter(
          (item) => item.clinicId === clinicId && item.patientId === patientId,
        )
        .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)),
      attachments: this.clinicalAttachments
        .filter(
          (item) => item.clinicId === clinicId && item.patientId === patientId,
        )
        .map(({ contentBase64: _, ...item }) => {
          void _;
          return item;
        })
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      addenda: this.clinicalAddenda
        .filter(
          (item) => item.clinicId === clinicId && item.patientId === patientId,
        )
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
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
    const timestamp = now();
    const previousVersions = this.assessmentTemplates.filter(
      (item) => item.clinicId === clinicId && item.name === input.name,
    );
    const template: AssessmentTemplate = {
      ...input,
      id: uuid(),
      clinicId,
      version: Math.max(0, ...previousVersions.map((item) => item.version)) + 1,
      active: true,
      createdAt: timestamp,
    };
    this.assessmentTemplates.push(template);
    return template;
  }

  async createClinicalAssessment(
    clinicId: string,
    authorUserId: string,
    input: ClinicalAssessmentInput,
  ) {
    const patient = this.patients.find(
      (item) => item.clinicId === clinicId && item.id === input.patientId,
    );
    const author = this.users.find(
      (item) => item.clinicId === clinicId && item.id === authorUserId,
    );
    const template = this.assessmentTemplates.find(
      (item) =>
        item.clinicId === clinicId &&
        item.id === input.templateId &&
        item.active,
    );
    const appointment = input.appointmentId
      ? this.appointments.find(
          (item) =>
            item.clinicId === clinicId &&
            item.id === input.appointmentId &&
            item.patientId === input.patientId,
        )
      : undefined;
    if (
      !patient ||
      !author ||
      !template ||
      (input.appointmentId && !appointment)
    )
      throw new DomainError(
        "CLINICAL_CONTEXT_NOT_FOUND",
        "Paciente, modelo, atendimento ou autor não encontrado.",
        404,
      );
    for (const field of template.fields) {
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
    const assessment: ClinicalAssessment = {
      ...input,
      id: uuid(),
      clinicId,
      templateName: template.name,
      authorName: author.fullName,
      createdAt: now(),
    };
    this.clinicalAssessments.push(assessment);
    return assessment;
  }

  async createTherapeuticGoal(
    clinicId: string,
    authorUserId: string,
    input: TherapeuticGoalInput,
  ) {
    const patient = this.patients.find(
      (item) => item.clinicId === clinicId && item.id === input.patientId,
    );
    const author = this.users.find(
      (item) => item.clinicId === clinicId && item.id === authorUserId,
    );
    if (!patient || !author)
      throw new DomainError(
        "CLINICAL_CONTEXT_NOT_FOUND",
        "Paciente ou autor não encontrado.",
        404,
      );
    const timestamp = now();
    const goal: TherapeuticGoal = {
      ...input,
      id: uuid(),
      clinicId,
      status: "active",
      authorName: author.fullName,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.therapeuticGoals.push(goal);
    return goal;
  }

  async updateTherapeuticGoalStatus(
    clinicId: string,
    goalId: string,
    status: TherapeuticGoalStatus,
  ) {
    const goal = this.therapeuticGoals.find(
      (item) => item.clinicId === clinicId && item.id === goalId,
    );
    if (!goal) return null;
    if (goal.status !== "active" && goal.status !== status)
      throw new DomainError(
        "THERAPEUTIC_GOAL_CLOSED",
        "Um objetivo encerrado não pode mudar de situação.",
        409,
      );
    goal.status = status;
    goal.updatedAt = now();
    if (status === "achieved") goal.achievedAt = goal.updatedAt;
    return goal;
  }

  async createClinicalMeasurement(
    clinicId: string,
    authorUserId: string,
    input: ClinicalMeasurementInput,
  ) {
    const patient = this.patients.find(
      (item) => item.clinicId === clinicId && item.id === input.patientId,
    );
    const author = this.users.find(
      (item) => item.clinicId === clinicId && item.id === authorUserId,
    );
    const goal = input.goalId
      ? this.therapeuticGoals.find(
          (item) =>
            item.clinicId === clinicId &&
            item.id === input.goalId &&
            item.patientId === input.patientId,
        )
      : undefined;
    if (!patient || !author || (input.goalId && !goal))
      throw new DomainError(
        "CLINICAL_CONTEXT_NOT_FOUND",
        "Paciente, objetivo ou autor não encontrado.",
        404,
      );
    const measurement: ClinicalMeasurement = {
      ...input,
      id: uuid(),
      clinicId,
      authorName: author.fullName,
      createdAt: now(),
    };
    this.clinicalMeasurements.push(measurement);
    return measurement;
  }

  async createTreatmentClosure(
    clinicId: string,
    authorUserId: string,
    input: TreatmentClosureInput,
  ) {
    const patient = this.patients.find(
      (item) => item.clinicId === clinicId && item.id === input.patientId,
    );
    const author = this.users.find(
      (item) => item.clinicId === clinicId && item.id === authorUserId,
    );
    if (!patient || !author)
      throw new DomainError(
        "CLINICAL_CONTEXT_NOT_FOUND",
        "Paciente ou autor não encontrado.",
        404,
      );
    const closure: TreatmentClosure = {
      ...input,
      id: uuid(),
      clinicId,
      authorName: author.fullName,
      createdAt: now(),
    };
    this.treatmentClosures.push(closure);
    return closure;
  }

  async createClinicalAttachment(
    clinicId: string,
    authorUserId: string,
    input: ClinicalAttachmentInput,
  ): Promise<ClinicalAttachment> {
    const patient = this.patients.find(
      (item) => item.clinicId === clinicId && item.id === input.patientId,
    );
    const author = this.users.find(
      (item) => item.clinicId === clinicId && item.id === authorUserId,
    );
    if (!patient || !author)
      throw new DomainError(
        "CLINICAL_CONTEXT_NOT_FOUND",
        "Paciente ou autor não encontrado.",
        404,
      );
    const { sha256 } = inspectClinicalAttachment(input);
    const attachment: ClinicalAttachmentContent = {
      id: uuid(),
      clinicId,
      patientId: input.patientId,
      fileName: input.fileName,
      mimeType: input.mimeType,
      sizeInBytes: input.sizeInBytes,
      contentBase64: input.contentBase64,
      ...(input.notes ? { notes: input.notes } : {}),
      sha256,
      authorName: author.fullName,
      createdAt: now(),
    };
    this.clinicalAttachments.push(attachment);
    this.addClinicalAccessEvent(
      clinicId,
      input.patientId,
      authorUserId,
      "upload",
      "attachment",
      attachment.id,
    );
    const { contentBase64: _, ...metadata } = attachment;
    void _;
    return metadata;
  }

  async getClinicalAttachmentContent(
    clinicId: string,
    actorUserId: string,
    attachmentId: string,
  ) {
    const attachment = this.clinicalAttachments.find(
      (item) => item.clinicId === clinicId && item.id === attachmentId,
    );
    if (!attachment) return null;
    this.addClinicalAccessEvent(
      clinicId,
      attachment.patientId,
      actorUserId,
      "download",
      "attachment",
      attachment.id,
    );
    return attachment;
  }

  async createClinicalAddendum(
    clinicId: string,
    authorUserId: string,
    input: ClinicalAddendumInput,
  ) {
    const record = this.clinicalRecords.find(
      (item) =>
        item.clinicId === clinicId && item.id === input.clinicalRecordId,
    );
    const author = this.users.find(
      (item) => item.clinicId === clinicId && item.id === authorUserId,
    );
    if (!record || !author)
      throw new DomainError(
        "CLINICAL_CONTEXT_NOT_FOUND",
        "Prontuário ou autor não encontrado.",
        404,
      );
    if (record.status !== "finalized")
      throw new DomainError(
        "CLINICAL_RECORD_NOT_FINALIZED",
        "Adendos só podem ser incluídos em evoluções finalizadas.",
        409,
      );
    const addendum: ClinicalAddendum = {
      ...input,
      id: uuid(),
      clinicId,
      patientId: record.patientId,
      authorName: author.fullName,
      createdAt: now(),
    };
    this.clinicalAddenda.push(addendum);
    this.addClinicalAccessEvent(
      clinicId,
      record.patientId,
      authorUserId,
      "addendum",
      "clinical_record",
      record.id,
    );
    return addendum;
  }

  async listClinicalAccessEvents(clinicId: string, patientId: string) {
    return this.clinicalAccessEvents
      .filter(
        (item) => item.clinicId === clinicId && item.patientId === patientId,
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  private addClinicalAccessEvent(
    clinicId: string,
    patientId: string,
    actorUserId: string,
    action: ClinicalAccessEvent["action"],
    entityType: ClinicalAccessEvent["entityType"],
    entityId?: string,
  ) {
    this.clinicalAccessEvents.push({
      id: uuid(),
      clinicId,
      patientId,
      actorUserId,
      action,
      entityType,
      ...(entityId ? { entityId } : {}),
      createdAt: now(),
    });
  }

  async listPatientPlans(clinicId: string, patientId?: string) {
    const currentDate = today();
    for (const plan of this.patientPlans) {
      if (
        plan.status === "active" &&
        plan.validUntil &&
        plan.validUntil < currentDate
      ) {
        plan.status = "expired";
      }
    }
    return this.patientPlans
      .filter(
        (plan) =>
          plan.clinicId === clinicId &&
          (!patientId || plan.patientId === patientId),
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async createPatientPlan(
    clinicId: string,
    _actorUserId: string,
    input: PatientPlanInput,
  ) {
    const patient = this.patients.find(
      (item) => item.clinicId === clinicId && item.id === input.patientId,
    );
    const service = this.services.find(
      (item) => item.clinicId === clinicId && item.id === input.serviceId,
    );
    if (!patient || !service) {
      throw new DomainError(
        "PLAN_CONTEXT_NOT_FOUND",
        "Paciente ou serviço não encontrado.",
        404,
      );
    }
    const timestamp = now();
    const plan: PatientPlan = {
      ...input,
      id: uuid(),
      clinicId,
      patientName: patient.fullName,
      serviceName: service.name,
      status: "active",
      remainingSessions: input.totalSessions,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const baseAmount = Math.floor(input.totalValueInCents / input.installments);
    const remainder = input.totalValueInCents % input.installments;
    const installments: Receivable[] = Array.from(
      { length: input.installments },
      (_, index) => ({
        id: uuid(),
        clinicId,
        patientId: patient.id,
        planId: plan.id,
        patientName: patient.fullName,
        description: `${plan.name} · ${index + 1}/${input.installments}`,
        installmentNumber: index + 1,
        installmentCount: input.installments,
        dueDate: addMonths(input.firstDueDate, index),
        amountInCents: baseAmount + (index < remainder ? 1 : 0),
        status: "open",
        overdue: false,
        createdAt: timestamp,
        updatedAt: timestamp,
      }),
    );
    this.patientPlans.push(plan);
    this.receivables.push(...installments);
    this.sessionMovements.push({
      id: uuid(),
      planId: plan.id,
      kind: "credit",
      quantity: input.totalSessions,
      reason: "Crédito inicial do plano",
      createdAt: timestamp,
    });
    return plan;
  }

  async updatePatientPlanStatus(
    clinicId: string,
    _actorUserId: string,
    planId: string,
    status: PlanStatus,
  ) {
    const plan = this.patientPlans.find(
      (item) => item.clinicId === clinicId && item.id === planId,
    );
    if (!plan) return null;
    if (plan.status === "cancelled" && status !== "cancelled") {
      throw new DomainError(
        "PLAN_CANCELLED",
        "Um plano cancelado não pode ser reativado.",
        409,
      );
    }
    if (plan.status === status) return plan;
    plan.status = status;
    plan.updatedAt = now();
    if (status === "cancelled") {
      plan.cancelledAt = plan.updatedAt;
      plan.cancelledValueInCents = this.receivables
        .filter((item) => item.planId === plan.id && item.status === "open")
        .reduce((sum, item) => sum + item.amountInCents, 0);
      for (const receivable of this.receivables) {
        if (receivable.planId === plan.id && receivable.status === "open") {
          receivable.status = "cancelled";
          receivable.overdue = false;
          receivable.updatedAt = plan.updatedAt;
        }
      }
    }
    return plan;
  }

  async listSessionMovements(clinicId: string, planId: string) {
    const belongs = this.patientPlans.some(
      (plan) => plan.clinicId === clinicId && plan.id === planId,
    );
    return belongs
      ? this.sessionMovements
          .filter((movement) => movement.planId === planId)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      : [];
  }

  async getFinancialSummary(clinicId: string): Promise<FinancialSummary> {
    const currentDate = today();
    const month = currentDate.slice(0, 7);
    const receivables = this.receivables
      .filter((item) => item.clinicId === clinicId)
      .map((item) => ({
        ...item,
        overdue: item.status === "open" && item.dueDate < currentDate,
      }))
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    return {
      openInCents: receivables
        .filter((item) => item.status === "open")
        .reduce((sum, item) => sum + item.amountInCents, 0),
      overdueInCents: receivables
        .filter((item) => item.overdue)
        .reduce((sum, item) => sum + item.amountInCents, 0),
      paidThisMonthInCents: receivables
        .filter(
          (item) => item.status === "paid" && item.paidAt?.startsWith(month),
        )
        .reduce((sum, item) => sum + item.amountInCents, 0),
      receivables,
    };
  }

  async settleReceivable(
    clinicId: string,
    _actorUserId: string,
    receivableId: string,
    paymentMethod: PaymentMethod,
  ) {
    const receivable = this.receivables.find(
      (item) => item.clinicId === clinicId && item.id === receivableId,
    );
    if (!receivable) return null;
    if (receivable.status !== "open") {
      throw new DomainError(
        "RECEIVABLE_NOT_OPEN",
        "Somente contas abertas podem ser baixadas.",
        409,
      );
    }
    receivable.status = "paid";
    receivable.paidAt = now();
    receivable.paymentMethod = paymentMethod;
    receivable.overdue = false;
    receivable.updatedAt = receivable.paidAt;
    this.receiptEvents.push({
      id: uuid(),
      receivableId,
      kind: "payment",
      occurredAt: receivable.paidAt,
      amountInCents: receivable.amountInCents,
      paymentMethod,
    });
    return receivable;
  }

  async reverseReceivablePayment(
    clinicId: string,
    _actorUserId: string,
    receivableId: string,
  ) {
    const receivable = this.receivables.find(
      (item) => item.clinicId === clinicId && item.id === receivableId,
    );
    if (!receivable) return null;
    if (receivable.status !== "paid") {
      throw new DomainError(
        "RECEIVABLE_NOT_PAID",
        "Somente pagamentos confirmados podem ser estornados.",
        409,
      );
    }
    receivable.status = "open";
    this.receiptEvents.push({
      id: uuid(),
      receivableId,
      kind: "reversal",
      occurredAt: now(),
      amountInCents: -receivable.amountInCents,
    });
    delete receivable.paidAt;
    delete receivable.paymentMethod;
    receivable.overdue = receivable.dueDate < today();
    receivable.updatedAt = now();
    return receivable;
  }

  async adjustReceivable(
    clinicId: string,
    _actorUserId: string,
    receivableId: string,
    amountInCents: number,
    _reason: string,
  ) {
    // The PostgreSQL implementation persists the reason in the immutable
    // financial event. The in-memory adapter still consumes it so both
    // implementations keep the same observable command contract.
    void _reason;
    const receivable = this.receivables.find(
      (item) => item.clinicId === clinicId && item.id === receivableId,
    );
    if (!receivable) return null;
    if (receivable.status !== "open")
      throw new DomainError(
        "RECEIVABLE_NOT_OPEN",
        "Somente contas abertas podem ser ajustadas.",
        409,
      );
    receivable.amountInCents = amountInCents;
    receivable.updatedAt = now();
    return receivable;
  }

  async getPaymentReceipt(
    clinicId: string,
    receivableId: string,
  ): Promise<PaymentReceipt | null> {
    const receivable = this.receivables.find(
      (item) => item.clinicId === clinicId && item.id === receivableId,
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
    const summary = await this.getFinancialSummary(clinicId);
    const currentDate = today();
    const month = currentDate.slice(0, 7);
    const payables = this.payables
      .filter((item) => item.clinicId === clinicId)
      .map((item) => ({
        ...item,
        overdue: item.status === "open" && item.dueDate < currentDate,
      }))
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    const paidExpensesThisMonthInCents = payables
      .filter(
        (item) => item.status === "paid" && item.paidAt?.startsWith(month),
      )
      .reduce((sum, item) => sum + item.amountInCents, 0);
    const paidCommissionsThisMonthInCents = this.commissions
      .filter(
        (item) =>
          item.clinicId === clinicId &&
          item.status === "paid" &&
          item.paidAt?.startsWith(month),
      )
      .reduce((sum, item) => sum + item.amountInCents, 0);
    return {
      summary,
      categories: this.financialCategories.filter(
        (item) => item.clinicId === clinicId && item.active,
      ),
      costCenters: this.costCenters.filter(
        (item) => item.clinicId === clinicId && item.active,
      ),
      payables,
      payableOpenInCents: payables
        .filter((item) => item.status === "open")
        .reduce((sum, item) => sum + item.amountInCents, 0),
      payableOverdueInCents: payables
        .filter((item) => item.overdue)
        .reduce((sum, item) => sum + item.amountInCents, 0),
      paidExpensesThisMonthInCents,
      cashBalanceThisMonthInCents:
        summary.paidThisMonthInCents -
        paidExpensesThisMonthInCents -
        paidCommissionsThisMonthInCents,
      commissionRules: this.commissionRules.filter(
        (item) => item.clinicId === clinicId && item.active,
      ),
      commissions: this.commissions.filter(
        (item) => item.clinicId === clinicId,
      ),
      commissionOpenInCents: this.commissions
        .filter((item) => item.clinicId === clinicId && item.status === "open")
        .reduce((sum, item) => sum + item.amountInCents, 0),
      paidCommissionsThisMonthInCents,
    };
  }

  async createFinancialCategory(
    clinicId: string,
    input: FinancialCategoryInput,
  ) {
    if (
      this.financialCategories.some(
        (item) =>
          item.clinicId === clinicId &&
          item.kind === input.kind &&
          item.name.toLocaleLowerCase() === input.name.toLocaleLowerCase(),
      )
    )
      throw new DomainError(
        "FINANCIAL_CATEGORY_DUPLICATE",
        "Esta categoria já existe.",
        409,
      );
    const category: FinancialCategory = {
      ...input,
      id: uuid(),
      clinicId,
      active: true,
    };
    this.financialCategories.push(category);
    return category;
  }

  async createCostCenter(clinicId: string, input: CostCenterInput) {
    if (
      this.costCenters.some(
        (item) =>
          item.clinicId === clinicId &&
          item.name.toLocaleLowerCase() === input.name.toLocaleLowerCase(),
      )
    )
      throw new DomainError(
        "COST_CENTER_DUPLICATE",
        "Este centro de custo já existe.",
        409,
      );
    const costCenter: CostCenter = {
      ...input,
      id: uuid(),
      clinicId,
      active: true,
    };
    this.costCenters.push(costCenter);
    return costCenter;
  }

  async createPayable(
    clinicId: string,
    _actorUserId: string,
    input: PayableInput,
  ) {
    const category = this.financialCategories.find(
      (item) =>
        item.clinicId === clinicId &&
        item.id === input.categoryId &&
        item.kind === "expense" &&
        item.active,
    );
    const costCenter = this.costCenters.find(
      (item) =>
        item.clinicId === clinicId &&
        item.id === input.costCenterId &&
        item.active,
    );
    if (!category || !costCenter)
      throw new DomainError(
        "FINANCIAL_CLASSIFICATION_NOT_FOUND",
        "Categoria de despesa ou centro de custo não encontrado.",
        404,
      );
    const timestamp = now();
    const payable: Payable = {
      ...input,
      id: uuid(),
      clinicId,
      categoryName: category.name,
      costCenterName: costCenter.name,
      status: "open",
      overdue: input.dueDate < today(),
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.payables.push(payable);
    return payable;
  }

  async settlePayable(
    clinicId: string,
    _actorUserId: string,
    payableId: string,
    paymentMethod: PaymentMethod,
  ) {
    return this.changePayable(clinicId, payableId, "payment", paymentMethod);
  }

  async reversePayablePayment(
    clinicId: string,
    _actorUserId: string,
    payableId: string,
  ) {
    return this.changePayable(clinicId, payableId, "payment_reversal");
  }

  async renegotiateReceivables(
    clinicId: string,
    _actorUserId: string,
    input: ReceivableRenegotiationInput,
  ) {
    const ids = [...new Set(input.receivableIds)];
    if (ids.length !== input.receivableIds.length)
      throw new DomainError(
        "RENEGOTIATION_DUPLICATE_ITEM",
        "Há parcelas repetidas.",
      );
    const originals = this.receivables.filter(
      (item) => item.clinicId === clinicId && ids.includes(item.id),
    );
    if (
      originals.length !== ids.length ||
      originals.some((item) => item.status !== "open")
    )
      throw new DomainError(
        "RENEGOTIATION_INVALID_ITEMS",
        "Selecione somente parcelas abertas.",
        409,
      );
    const patientId = originals[0]!.patientId;
    if (originals.some((item) => item.patientId !== patientId))
      throw new DomainError(
        "RENEGOTIATION_PATIENT_MISMATCH",
        "As parcelas devem pertencer ao mesmo paciente.",
      );
    const timestamp = now();
    originals.forEach((item) => {
      item.status = "cancelled";
      item.updatedAt = timestamp;
    });
    const base = Math.floor(input.totalAmountInCents / input.installments);
    const remainder = input.totalAmountInCents % input.installments;
    const patientName = originals[0]!.patientName;
    const renegotiationId = uuid();
    const newReceivables = Array.from(
      { length: input.installments },
      (_, index) => ({
        id: uuid(),
        clinicId,
        patientId,
        patientName,
        description: `Renegociação · ${input.reason}`,
        installmentNumber: index + 1,
        installmentCount: input.installments,
        dueDate: addMonths(input.firstDueDate, index),
        amountInCents: base + (index < remainder ? 1 : 0),
        status: "open" as const,
        overdue: addMonths(input.firstDueDate, index) < today(),
        createdAt: timestamp,
        updatedAt: timestamp,
      }),
    );
    this.receivables.push(...newReceivables);
    const renegotiation: ReceivableRenegotiation = {
      id: renegotiationId,
      clinicId,
      patientId,
      originalAmountInCents: originals.reduce(
        (sum, item) => sum + item.amountInCents,
        0,
      ),
      renegotiatedAmountInCents: input.totalAmountInCents,
      reason: input.reason,
      originalReceivableIds: ids,
      newReceivables,
      createdAt: timestamp,
    };
    this.receivableRenegotiations.push(renegotiation);
    return renegotiation;
  }

  async createCommissionRule(clinicId: string, input: CommissionRuleInput) {
    const professional = this.professionals.find(
      (item) => item.clinicId === clinicId && item.id === input.professionalId,
    );
    if (!professional)
      throw new DomainError(
        "PROFESSIONAL_NOT_FOUND",
        "Profissional não encontrado.",
        404,
      );
    if (
      this.commissionRules.some(
        (item) =>
          item.professionalId === input.professionalId &&
          item.effectiveFrom === input.effectiveFrom,
      )
    )
      throw new DomainError(
        "COMMISSION_RULE_DUPLICATE",
        "Já existe uma regra nesta vigência.",
        409,
      );
    const rule: CommissionRule = {
      ...input,
      id: uuid(),
      clinicId,
      professionalName: professional.fullName,
      active: true,
      createdAt: now(),
    };
    this.commissionRules.push(rule);
    return rule;
  }

  async generateCommissions(clinicId: string, competence: string) {
    for (const appointment of this.appointments.filter(
      (item) =>
        item.clinicId === clinicId &&
        item.status === "completed" &&
        item.startsAt.slice(0, 7) === competence,
    )) {
      if (
        this.commissions.some((item) => item.appointmentId === appointment.id)
      )
        continue;
      const rule = this.commissionRules
        .filter(
          (item) =>
            item.professionalId === appointment.professionalId &&
            item.effectiveFrom <= appointment.startsAt.slice(0, 10),
        )
        .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];
      const service = this.services.find(
        (item) => item.id === appointment.serviceId,
      );
      if (!rule || !service) continue;
      this.commissions.push({
        id: uuid(),
        clinicId,
        professionalId: appointment.professionalId,
        professionalName: appointment.professionalName,
        appointmentId: appointment.id,
        competence,
        baseAmountInCents: service.priceInCents,
        percentage: rule.percentage,
        amountInCents: Math.round(
          (service.priceInCents * rule.percentage) / 100,
        ),
        status: "open",
        createdAt: now(),
      });
    }
    return this.commissions.filter(
      (item) => item.clinicId === clinicId && item.competence === competence,
    );
  }

  async settleCommission(
    clinicId: string,
    _actorUserId: string,
    commissionId: string,
  ) {
    const item = this.commissions.find(
      (entry) => entry.clinicId === clinicId && entry.id === commissionId,
    );
    if (!item) return null;
    if (item.status !== "open")
      throw new DomainError(
        "COMMISSION_NOT_OPEN",
        "A comissão já foi paga.",
        409,
      );
    item.status = "paid";
    item.paidAt = now();
    return item;
  }

  async reverseCommission(clinicId: string, commissionId: string) {
    const item = this.commissions.find(
      (entry) => entry.clinicId === clinicId && entry.id === commissionId,
    );
    if (!item) return null;
    if (item.status !== "paid")
      throw new DomainError(
        "COMMISSION_NOT_PAID",
        "A comissão ainda não foi paga.",
        409,
      );
    item.status = "open";
    delete item.paidAt;
    return item;
  }

  private changePayable(
    clinicId: string,
    payableId: string,
    operation: "payment" | "payment_reversal",
    paymentMethod?: PaymentMethod,
  ) {
    const payable = this.payables.find(
      (item) => item.clinicId === clinicId && item.id === payableId,
    );
    if (!payable) return null;
    const expected = operation === "payment" ? "open" : "paid";
    if (payable.status !== expected)
      throw new DomainError(
        operation === "payment" ? "PAYABLE_NOT_OPEN" : "PAYABLE_NOT_PAID",
        operation === "payment"
          ? "Somente contas abertas podem ser pagas."
          : "Somente contas pagas podem ser estornadas.",
        409,
      );
    payable.status = operation === "payment" ? "paid" : "open";
    payable.updatedAt = now();
    if (operation === "payment") {
      payable.paidAt = payable.updatedAt;
      payable.paymentMethod = paymentMethod!;
      payable.overdue = false;
    } else {
      delete payable.paidAt;
      delete payable.paymentMethod;
      payable.overdue = payable.dueDate < today();
    }
    return payable;
  }

  private consumeSession(appointment: Appointment) {
    const appointmentDate = appointment.startsAt.slice(0, 10);
    const plans = this.patientPlans
      .filter(
        (plan) =>
          plan.clinicId === appointment.clinicId &&
          plan.patientId === appointment.patientId &&
          plan.serviceId === appointment.serviceId &&
          plan.status === "active" &&
          plan.validFrom <= appointmentDate &&
          (!plan.validUntil || plan.validUntil >= appointmentDate),
      )
      .sort((a, b) =>
        (a.validUntil || "9999-12-31").localeCompare(
          b.validUntil || "9999-12-31",
        ),
      );
    const plan = plans[0];
    if (!plan) return;
    if (plan.remainingSessions < 1) {
      throw new DomainError(
        "NO_SESSION_BALANCE",
        "O paciente não possui saldo de sessões para este serviço.",
        409,
      );
    }
    const appointmentMovements = this.sessionMovements.filter(
      (movement) =>
        movement.appointmentId === appointment.id &&
        movement.planId === plan.id,
    );
    const netConsumption = appointmentMovements.reduce(
      (sum, movement) => sum + movement.quantity,
      0,
    );
    if (netConsumption < 0) return;
    plan.remainingSessions -= 1;
    plan.updatedAt = now();
    this.sessionMovements.push({
      id: uuid(),
      planId: plan.id,
      appointmentId: appointment.id,
      kind: appointmentMovements.some((item) => item.kind === "consumption")
        ? "adjustment"
        : "consumption",
      quantity: -1,
      reason: "Atendimento finalizado",
      createdAt: now(),
    });
  }

  private restoreSession(appointment: Appointment) {
    const plan = this.patientPlans.find((candidate) => {
      const balance = this.sessionMovements
        .filter(
          (movement) =>
            movement.planId === candidate.id &&
            movement.appointmentId === appointment.id,
        )
        .reduce((sum, movement) => sum + movement.quantity, 0);
      return candidate.clinicId === appointment.clinicId && balance < 0;
    });
    if (!plan) return;
    const alreadyReversed = this.sessionMovements.some(
      (movement) =>
        movement.planId === plan.id &&
        movement.appointmentId === appointment.id &&
        movement.kind === "reversal",
    );
    plan.remainingSessions += 1;
    plan.updatedAt = now();
    this.sessionMovements.push({
      id: uuid(),
      planId: plan.id,
      appointmentId: appointment.id,
      kind: alreadyReversed ? "adjustment" : "reversal",
      quantity: 1,
      reason: "Reversão do atendimento finalizado",
      createdAt: now(),
    });
  }

  async listLeads(clinicId: string) {
    return this.leads
      .filter((lead) => lead.clinicId === clinicId)
      .map((lead) => {
        const tasks = this.leadTasks.filter(
          (task) => task.clinicId === clinicId && task.leadId === lead.id,
        );
        const contacts = this.leadContacts.filter(
          (contact) =>
            contact.clinicId === clinicId && contact.leadId === lead.id,
        );
        const responsibleName = lead.responsibleUserId
          ? this.users.find((user) => user.id === lead.responsibleUserId)
              ?.fullName
          : undefined;
        const lastContactAt = contacts.sort((a, b) =>
          b.occurredAt.localeCompare(a.occurredAt),
        )[0]?.occurredAt;
        return {
          ...lead,
          ...(responsibleName ? { responsibleName } : {}),
          openTasks: tasks.filter((task) => task.status === "open").length,
          overdueTasks: tasks.filter(
            (task) => task.status === "open" && task.dueAt < now(),
          ).length,
          ...(lastContactAt ? { lastContactAt } : {}),
        };
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async createLead(clinicId: string, input: LeadInput) {
    if (
      input.responsibleUserId &&
      !this.users.some(
        (user) =>
          user.clinicId === clinicId && user.id === input.responsibleUserId,
      )
    )
      throw new DomainError(
        "RESPONSIBLE_USER_NOT_FOUND",
        "Responsável não encontrado.",
        404,
      );
    const timestamp = now();
    const responsibleName = input.responsibleUserId
      ? this.users.find((user) => user.id === input.responsibleUserId)?.fullName
      : undefined;
    const lead: Lead = {
      ...input,
      id: uuid(),
      clinicId,
      stage: "new_contact",
      ...(responsibleName ? { responsibleName } : {}),
      openTasks: 0,
      overdueTasks: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.leads.push(lead);
    return lead;
  }

  async moveLead(
    clinicId: string,
    _actorUserId: string,
    leadId: string,
    stage: LeadStage,
    lostReason?: string,
  ) {
    const lead = this.leads.find(
      (item) => item.clinicId === clinicId && item.id === leadId,
    );
    if (!lead) return null;
    if (lead.convertedPatientId) {
      throw new DomainError(
        "LEAD_ALREADY_CONVERTED",
        "Este lead já foi convertido em paciente.",
        409,
      );
    }
    if (stage === "won") {
      throw new DomainError(
        "LEAD_CONVERSION_REQUIRED",
        "Use a conversão para marcar o lead como ganho.",
      );
    }
    lead.stage = stage;
    if (stage === "lost" && lostReason) lead.lostReason = lostReason;
    else delete lead.lostReason;
    lead.updatedAt = now();
    return lead;
  }

  async convertLead(
    clinicId: string,
    _actorUserId: string,
    leadId: string,
  ): Promise<LeadConversion | null> {
    const lead = this.leads.find(
      (item) => item.clinicId === clinicId && item.id === leadId,
    );
    if (!lead) return null;
    if (lead.convertedPatientId) {
      const converted = this.patients.find(
        (patient) => patient.id === lead.convertedPatientId,
      );
      return converted
        ? { lead, patient: converted, reusedExisting: true }
        : null;
    }
    let patient = this.patients.find(
      (item) =>
        item.clinicId === clinicId &&
        (item.phone === lead.phone ||
          Boolean(lead.email && item.email === lead.email)),
    );
    const reusedExisting = Boolean(patient);
    patient ??= await this.createPatient(clinicId, {
      fullName: lead.fullName,
      phone: lead.phone,
      email: lead.email,
      notes: lead.notes,
      tags: ["Convertido do CRM"],
    });
    lead.convertedPatientId = patient.id;
    lead.stage = "won";
    delete lead.lostReason;
    lead.updatedAt = now();
    return { lead, patient, reusedExisting };
  }

  async getLeadActivity(
    clinicId: string,
    leadId: string,
  ): Promise<LeadActivity | null> {
    if (
      !this.leads.some(
        (item) => item.clinicId === clinicId && item.id === leadId,
      )
    )
      return null;
    return {
      contacts: this.leadContacts
        .filter((item) => item.clinicId === clinicId && item.leadId === leadId)
        .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)),
      tasks: this.leadTasks
        .filter((item) => item.clinicId === clinicId && item.leadId === leadId)
        .sort((a, b) => a.dueAt.localeCompare(b.dueAt)),
    };
  }

  async createLeadContact(
    clinicId: string,
    actorUserId: string,
    leadId: string,
    input: LeadContactInput,
  ) {
    const lead = this.leads.find(
      (item) => item.clinicId === clinicId && item.id === leadId,
    );
    if (!lead) return null;
    const actor = this.users.find(
      (item) => item.clinicId === clinicId && item.id === actorUserId,
    );
    if (!actor)
      throw new DomainError("USER_NOT_FOUND", "Usuário não encontrado.", 404);
    const contact: LeadContact = {
      ...input,
      id: uuid(),
      clinicId,
      leadId,
      actorName: actor.fullName,
      occurredAt: input.occurredAt ?? now(),
      createdAt: now(),
    };
    this.leadContacts.push(contact);
    lead.updatedAt = now();
    lead.lastContactAt = contact.occurredAt;
    return contact;
  }

  async createLeadTask(
    clinicId: string,
    actorUserId: string,
    leadId: string,
    input: LeadTaskInput,
  ) {
    const lead = this.leads.find(
      (item) => item.clinicId === clinicId && item.id === leadId,
    );
    if (!lead) return null;
    const assignedUserId = input.assignedUserId || actorUserId;
    const assigned = this.users.find(
      (item) => item.clinicId === clinicId && item.id === assignedUserId,
    );
    if (!assigned)
      throw new DomainError(
        "ASSIGNED_USER_NOT_FOUND",
        "Usuário responsável pela tarefa não encontrado.",
        404,
      );
    const timestamp = now();
    const task: LeadTask = {
      ...input,
      assignedUserId,
      id: uuid(),
      clinicId,
      leadId,
      assignedUserName: assigned.fullName,
      status: "open",
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.leadTasks.push(task);
    lead.updatedAt = timestamp;
    this.refreshLeadTaskStats(lead);
    return task;
  }

  async updateLeadTaskStatus(
    clinicId: string,
    taskId: string,
    status: LeadTaskStatus,
  ) {
    const task = this.leadTasks.find(
      (item) => item.clinicId === clinicId && item.id === taskId,
    );
    if (!task) return null;
    task.status = status;
    task.updatedAt = now();
    if (status === "completed") task.completedAt = now();
    else delete task.completedAt;
    const lead = this.leads.find((item) => item.id === task.leadId);
    if (lead) this.refreshLeadTaskStats(lead);
    return task;
  }

  private refreshLeadTaskStats(lead: Lead) {
    const tasks = this.leadTasks.filter(
      (item) => item.clinicId === lead.clinicId && item.leadId === lead.id,
    );
    lead.openTasks = tasks.filter((item) => item.status === "open").length;
    lead.overdueTasks = tasks.filter(
      (item) => item.status === "open" && item.dueAt < now(),
    ).length;
  }

  async getCommunicationCenter(clinicId: string) {
    return {
      deliveryMode: "outbox_only" as const,
      preferences: this.communicationPreferences.filter(
        (item) => item.clinicId === clinicId,
      ),
      messages: this.outboundMessages
        .filter((item) => item.clinicId === clinicId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((message) => this.toOutboundMessage(message)),
    };
  }

  async setCommunicationPreference(
    clinicId: string,
    input: CommunicationPreferenceInput,
  ) {
    const patient = this.patients.find(
      (item) => item.clinicId === clinicId && item.id === input.patientId,
    );
    if (!patient)
      throw new DomainError(
        "PATIENT_NOT_FOUND",
        "Paciente não encontrado.",
        404,
      );
    const existing = this.communicationPreferences.find(
      (item) =>
        item.clinicId === clinicId &&
        item.patientId === input.patientId &&
        item.channel === input.channel,
    );
    if (existing) {
      existing.allowed = input.allowed;
      existing.updatedAt = now();
      return existing;
    }
    const preference: CommunicationPreference = {
      ...input,
      id: uuid(),
      clinicId,
      updatedAt: now(),
    };
    this.communicationPreferences.push(preference);
    return preference;
  }

  async queueManualMessage(clinicId: string, input: ManualMessageInput) {
    const patient = this.patients.find(
      (item) => item.clinicId === clinicId && item.id === input.patientId,
    );
    if (!patient)
      throw new DomainError(
        "PATIENT_NOT_FOUND",
        "Paciente não encontrado.",
        404,
      );
    this.assertChannelAllowed(clinicId, patient.id, input.channel);
    const recipient = input.channel === "email" ? patient.email : patient.phone;
    if (!recipient)
      throw new DomainError(
        "COMMUNICATION_RECIPIENT_MISSING",
        "O paciente não possui contato para o canal selecionado.",
      );
    return this.pushMessage({
      clinicId,
      patient,
      channel: input.channel,
      kind: "manual",
      recipient,
      body: input.body,
      scheduledFor: input.scheduledFor ?? now(),
      idempotencyKey: `manual:${uuid()}`,
    });
  }

  async generateReminders(clinicId: string, referenceDate: string) {
    let queued = 0;
    let skippedByPreference = 0;
    let alreadyQueued = 0;
    for (const appointment of this.appointments.filter(
      (item) =>
        item.clinicId === clinicId &&
        ["scheduled", "confirmed"].includes(item.status) &&
        localDate(new Date(item.startsAt)) === referenceDate,
    )) {
      const patient = this.patients.find(
        (item) => item.id === appointment.patientId,
      )!;
      const key = `appointment:${appointment.id}:whatsapp`;
      if (this.outboundMessages.some((item) => item.idempotencyKey === key)) {
        alreadyQueued += 1;
      } else if (!this.channelAllowed(clinicId, patient.id, "whatsapp")) {
        skippedByPreference += 1;
      } else {
        const time = new Intl.DateTimeFormat("pt-BR", {
          timeZone: "America/Sao_Paulo",
          hour: "2-digit",
          minute: "2-digit",
        }).format(new Date(appointment.startsAt));
        this.pushMessage({
          clinicId,
          patient,
          channel: "whatsapp",
          kind: "appointment_reminder",
          recipient: patient.phone,
          body: `Olá, ${patient.fullName}. Lembramos do seu atendimento em ${referenceDate.split("-").reverse().join("/")} às ${time}.`,
          scheduledFor: now(),
          idempotencyKey: key,
        });
        queued += 1;
      }
    }
    for (const receivable of this.receivables.filter(
      (item) =>
        item.clinicId === clinicId &&
        item.status === "open" &&
        item.dueDate <= referenceDate,
    )) {
      const patient = this.patients.find(
        (item) => item.id === receivable.patientId,
      )!;
      const key = `receivable:${receivable.id}:whatsapp`;
      if (this.outboundMessages.some((item) => item.idempotencyKey === key)) {
        alreadyQueued += 1;
      } else if (!this.channelAllowed(clinicId, patient.id, "whatsapp")) {
        skippedByPreference += 1;
      } else {
        this.pushMessage({
          clinicId,
          patient,
          channel: "whatsapp",
          kind: "payment_reminder",
          recipient: patient.phone,
          body: `Olá, ${patient.fullName}. Identificamos uma parcela com vencimento em ${receivable.dueDate.split("-").reverse().join("/")}. Fale com a clínica se precisar de ajuda.`,
          scheduledFor: now(),
          idempotencyKey: key,
        });
        queued += 1;
      }
    }
    return { queued, skippedByPreference, alreadyQueued };
  }

  async listDocumentTemplates(clinicId: string) {
    return this.documentTemplates
      .filter((item) => item.clinicId === clinicId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async createDocumentTemplate(clinicId: string, input: DocumentTemplateInput) {
    if (
      this.documentTemplates.some(
        (item) =>
          item.clinicId === clinicId &&
          item.active &&
          item.name.toLocaleLowerCase() === input.name.toLocaleLowerCase(),
      )
    )
      throw new DomainError(
        "DOCUMENT_TEMPLATE_DUPLICATE",
        "Já existe um modelo ativo com este nome.",
        409,
      );
    const template: DocumentTemplate = {
      ...input,
      id: uuid(),
      clinicId,
      version: 1,
      active: true,
      createdAt: now(),
    };
    this.documentTemplates.push(template);
    return template;
  }

  async createDocumentTemplateVersion(
    clinicId: string,
    templateId: string,
    body: string,
  ) {
    const template = this.documentTemplates.find(
      (item) => item.clinicId === clinicId && item.id === templateId,
    );
    if (!template) return null;
    const versions = this.documentTemplates.filter(
      (item) =>
        item.clinicId === clinicId &&
        item.name.toLocaleLowerCase() === template.name.toLocaleLowerCase(),
    );
    for (const item of versions) item.active = false;
    const next: DocumentTemplate = {
      id: uuid(),
      clinicId,
      name: template.name,
      kind: template.kind,
      body,
      version: Math.max(...versions.map((item) => item.version)) + 1,
      active: true,
      previousVersionId: template.id,
      createdAt: now(),
    };
    this.documentTemplates.push(next);
    return next;
  }

  async listIssuedDocuments(clinicId: string) {
    return this.issuedDocuments
      .filter((item) => item.clinicId === clinicId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async createIssuedDocument(
    clinicId: string,
    _actorUserId: string,
    input: IssuedDocumentInput,
  ) {
    const template = this.documentTemplates.find(
      (item) =>
        item.clinicId === clinicId &&
        item.id === input.templateId &&
        item.active,
    );
    if (!template)
      throw new DomainError(
        "DOCUMENT_TEMPLATE_NOT_FOUND",
        "Modelo ativo não encontrado.",
        404,
      );
    const patient = this.patients.find(
      (item) => item.clinicId === clinicId && item.id === input.patientId,
    );
    if (!patient)
      throw new DomainError(
        "PATIENT_NOT_FOUND",
        "Paciente não encontrado.",
        404,
      );
    const plan = input.planId
      ? this.patientPlans.find(
          (item) =>
            item.clinicId === clinicId &&
            item.id === input.planId &&
            item.patientId === patient.id,
        )
      : undefined;
    if (input.planId && !plan)
      throw new DomainError(
        "DOCUMENT_PLAN_MISMATCH",
        "O plano informado não pertence ao paciente.",
      );
    const timestamp = now();
    const issuedDocument: IssuedDocument = {
      ...input,
      id: uuid(),
      clinicId,
      templateName: template.name,
      templateVersion: template.version,
      patientName: patient.fullName,
      ...(plan ? { planName: plan.name } : {}),
      snapshotBody: this.renderDocument(
        template.body,
        patient.fullName,
        plan?.name,
      ),
      status: "draft",
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.issuedDocuments.push(issuedDocument);
    return issuedDocument;
  }

  async updateIssuedDocumentStatus(
    clinicId: string,
    documentId: string,
    status: Exclude<DocumentStatus, "draft">,
  ) {
    const document = this.issuedDocuments.find(
      (item) => item.clinicId === clinicId && item.id === documentId,
    );
    if (!document) return null;
    if (document.status === "cancelled")
      throw new DomainError(
        "DOCUMENT_ALREADY_CANCELLED",
        "Um documento cancelado não pode ser alterado.",
        409,
      );
    if (status === "issued" && document.status !== "draft")
      throw new DomainError(
        "DOCUMENT_ALREADY_ISSUED",
        "Este documento já foi emitido.",
        409,
      );
    document.status = status;
    document.updatedAt = now();
    if (status === "issued") document.issuedAt = now();
    if (status === "cancelled") document.cancelledAt = now();
    return document;
  }

  async getSalesReport(clinicId: string, month: string): Promise<SalesReport> {
    const sales: SaleMovement[] = [];
    for (const plan of this.patientPlans.filter((item) => item.clinicId === clinicId)) {
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
        occurredAt: plan.createdAt,
        amountInCents: plan.totalValueInCents,
      });
      if (plan.cancelledAt)
        sales.push({
          ...base,
          id: `${plan.id}:cancellation`,
          kind: "cancellation",
          occurredAt: plan.cancelledAt,
          amountInCents: -(plan.cancelledValueInCents ?? plan.totalValueInCents),
        });
    }
    for (const tab of this.patientTabs.filter(
      (item) => item.clinicId === clinicId && item.closedAt,
    )) {
      for (const item of tab.items) {
        const base = {
          sourceId: tab.id,
          sourceType: "product" as const,
          patientId: tab.patientId,
          patientName: tab.patientName,
          itemName: item.productName,
          quantity: item.quantity,
          ...(tab.receivableId ? { receivableId: tab.receivableId } : {}),
        };
        sales.push({
          ...base,
          id: `${item.id}:sale`,
          kind: "sale",
          occurredAt: tab.closedAt!,
          amountInCents: item.totalInCents,
        });
        if (tab.cancelledAt)
          sales.push({
            ...base,
            id: `${item.id}:cancellation`,
            kind: "cancellation",
            occurredAt: tab.cancelledAt,
            amountInCents: -item.totalInCents,
          });
      }
    }
    const payments: ReceivedPayment[] = this.receiptEvents
      .map((event) => {
        const item = this.receivables.find((candidate) => candidate.id === event.receivableId);
        if (!item || item.clinicId !== clinicId) return null;
        const tab = this.patientTabs.find((candidate) => candidate.receivableId === item.id);
        return {
          id: event.id,
          receivableId: item.id,
          kind: event.kind,
          ...(item.planId || tab ? { sourceId: item.planId ?? tab!.id } : {}),
          occurredAt: event.occurredAt,
          patientId: item.patientId,
          patientName: item.patientName,
          description: item.description,
          amountInCents: event.amountInCents,
          ...(event.paymentMethod ? { paymentMethod: event.paymentMethod } : {}),
        };
      })
      .filter((item): item is ReceivedPayment => item !== null);
    return buildSalesReport(
      month,
      sales,
      payments,
      this.appointments.filter((item) => item.clinicId === clinicId),
    );
  }

  async getManagementReport(
    clinicId: string,
    from: string,
    to: string,
  ): Promise<ManagementReport> {
    const appointments = this.appointments.filter((item) => {
      const date = localDate(new Date(item.startsAt));
      return item.clinicId === clinicId && date >= from && date <= to;
    });
    const attendance = (completed: number, noShows: number) => {
      const decided = completed + noShows;
      return decided ? Math.round((completed / decided) * 100) : 0;
    };
    const breakdown = (
      entries: Array<{ id: string; name: string }>,
      idOf: (appointment: Appointment) => string,
    ) =>
      entries
        .map((entry) => {
          const items = appointments.filter((item) => idOf(item) === entry.id);
          const completed = items.filter(
            (item) => item.status === "completed",
          ).length;
          const noShows = items.filter(
            (item) => item.status === "no_show",
          ).length;
          return {
            ...entry,
            appointments: items.length,
            completed,
            noShows,
            attendanceRate: attendance(completed, noShows),
          };
        })
        .filter((item) => item.appointments > 0)
        .sort((a, b) => b.appointments - a.appointments);
    const leads = this.leads.filter((item) => {
      const date = localDate(new Date(item.createdAt));
      return item.clinicId === clinicId && date >= from && date <= to;
    });
    const sources = [...new Set(leads.map((item) => item.source))];
    const bySource = sources
      .map((source) => {
        const items = leads.filter((item) => item.source === source);
        const won = items.filter((item) => item.stage === "won").length;
        const lost = items.filter((item) => item.stage === "lost").length;
        return {
          source,
          leads: items.length,
          won,
          lost,
          conversionRate: items.length
            ? Math.round((won / items.length) * 100)
            : 0,
        };
      })
      .sort((a, b) => b.leads - a.leads);
    const completed = appointments.filter(
      (item) => item.status === "completed",
    ).length;
    const noShows = appointments.filter(
      (item) => item.status === "no_show",
    ).length;
    const openReceivables = this.receivables.filter(
      (item) => item.clinicId === clinicId && item.status === "open",
    );
    const paidInPeriod = this.receivables.filter((item) => {
      if (item.clinicId !== clinicId || item.status !== "paid" || !item.paidAt)
        return false;
      const date = localDate(new Date(item.paidAt));
      return date >= from && date <= to;
    });
    const planMovements = this.sessionMovements.filter((item) => {
      const plan = this.patientPlans.find(
        (candidate) =>
          candidate.id === item.planId && candidate.clinicId === clinicId,
      );
      const date = localDate(new Date(item.createdAt));
      return plan && item.kind !== "credit" && date >= from && date <= to;
    });
    const netMovement = planMovements.reduce(
      (sum, item) => sum + item.quantity,
      0,
    );
    const activePlans = this.patientPlans.filter(
      (item) => item.clinicId === clinicId && item.status === "active",
    );
    const won = leads.filter((item) => item.stage === "won").length;
    const lost = leads.filter((item) => item.stage === "lost").length;
    const responseTimes = leads
      .map((lead) => {
        const first = this.leadContacts
          .filter(
            (contact) =>
              contact.leadId === lead.id && contact.direction !== "internal",
          )
          .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))[0];
        return first
          ? Math.max(
              0,
              (new Date(first.occurredAt).getTime() -
                new Date(lead.createdAt).getTime()) /
                60_000,
            )
          : null;
      })
      .filter((value): value is number => value !== null);
    const inPeriod = (value?: string) => {
      if (!value) return false;
      const date = localDate(new Date(value));
      return date >= from && date <= to;
    };
    const paidProductTabs = this.patientTabs.filter((tab) => {
      if (tab.clinicId !== clinicId || tab.status !== "closed") return false;
      const receivable = this.receivables.find(
        (item) => item.id === tab.receivableId && item.status === "paid",
      );
      return inPeriod(receivable?.paidAt);
    });
    const productReceivableIds = new Set(
      paidProductTabs.flatMap((item) =>
        item.receivableId ? [item.receivableId] : [],
      ),
    );
    const productRevenueInCents = paidProductTabs.reduce(
      (sum, item) => sum + item.totalInCents,
      0,
    );
    const productCostInCents = paidProductTabs.reduce(
      (sum, tab) =>
        sum +
        tab.items.reduce(
          (itemSum, item) => itemSum + item.quantity * item.unitCostInCents,
          0,
        ),
      0,
    );
    const serviceRevenueInCents = paidInPeriod
      .filter((item) => !productReceivableIds.has(item.id))
      .reduce((sum, item) => sum + item.amountInCents, 0);
    const operatingExpensesInCents = this.payables
      .filter(
        (item) =>
          item.clinicId === clinicId &&
          item.status === "paid" &&
          inPeriod(item.paidAt),
      )
      .reduce((sum, item) => sum + item.amountInCents, 0);
    const paidCommissions = this.commissions.filter(
      (item) =>
        item.clinicId === clinicId &&
        item.status === "paid" &&
        inPeriod(item.paidAt),
    );
    const commissionsInCents = paidCommissions.reduce(
      (sum, item) => sum + item.amountInCents,
      0,
    );
    const grossRevenueInCents =
      serviceRevenueInCents + productRevenueInCents;
    const grossProfitInCents = grossRevenueInCents - productCostInCents;
    const netResultInCents =
      grossProfitInCents - operatingExpensesInCents - commissionsInCents;
    const percentage = (part: number, total: number) =>
      total ? Math.round((part / total) * 1000) / 10 : 0;
    const byProduct = this.products
      .filter((product) => product.clinicId === clinicId)
      .map((product) => {
        const soldItems = paidProductTabs.flatMap((tab) =>
          tab.items.filter((item) => item.productId === product.id),
        );
        const unitsSold = soldItems.reduce(
          (sum, item) => sum + item.quantity,
          0,
        );
        const revenueInCents = soldItems.reduce(
          (sum, item) => sum + item.totalInCents,
          0,
        );
        const costInCents = soldItems.reduce(
          (sum, item) => sum + item.quantity * item.unitCostInCents,
          0,
        );
        const grossProfitInCents = revenueInCents - costInCents;
        return {
          id: product.id,
          name: product.name,
          unitsSold,
          revenueInCents,
          costInCents,
          grossProfitInCents,
          grossMargin: percentage(grossProfitInCents, revenueInCents),
        };
      })
      .filter((item) => item.unitsSold > 0)
      .sort((a, b) => b.revenueInCents - a.revenueInCents);
    const byServiceProfitability = this.services
      .filter((service) => service.clinicId === clinicId)
      .map((service) => {
        const serviceReceivables = paidInPeriod.filter((receivable) => {
          const plan = this.patientPlans.find(
            (item) => item.id === receivable.planId,
          );
          return plan?.serviceId === service.id;
        });
        const revenueInCents = serviceReceivables.reduce(
          (sum, item) => sum + item.amountInCents,
          0,
        );
        const completedAppointments = appointments.filter(
          (item) =>
            item.serviceId === service.id && item.status === "completed",
        ).length;
        const serviceCommissions = paidCommissions
          .filter((commission) => {
            const appointment = this.appointments.find(
              (item) => item.id === commission.appointmentId,
            );
            return appointment?.serviceId === service.id;
          })
          .reduce((sum, item) => sum + item.amountInCents, 0);
        const contributionInCents = revenueInCents - serviceCommissions;
        return {
          id: service.id,
          name: service.name,
          completedAppointments,
          revenueInCents,
          commissionsInCents: serviceCommissions,
          contributionInCents,
          contributionMargin: percentage(
            contributionInCents,
            revenueInCents,
          ),
        };
      })
      .filter(
        (item) => item.completedAppointments > 0 || item.revenueInCents > 0,
      )
      .sort((a, b) => b.revenueInCents - a.revenueInCents);
    const groups = this.groupClasses.filter(
      (item) => item.clinicId === clinicId && item.active,
    );
    const activeGroupSeats = groups.reduce(
      (sum, item) => sum + item.activeEnrollments,
      0,
    );
    const totalGroupCapacity = groups.reduce(
      (sum, item) => sum + item.capacity,
      0,
    );
    return {
      from,
      to,
      generatedAt: now(),
      appointments: {
        total: appointments.length,
        completed,
        noShows,
        cancelled: appointments.filter((item) => item.status === "cancelled")
          .length,
        attendanceRate: attendance(completed, noShows),
      },
      plans: {
        active: activePlans.length,
        availableSessions: activePlans.reduce(
          (sum, item) => sum + item.remainingSessions,
          0,
        ),
        consumedInPeriod: Math.max(0, -netMovement),
      },
      finance: {
        openInCents: openReceivables.reduce(
          (sum, item) => sum + item.amountInCents,
          0,
        ),
        overdueInCents: openReceivables
          .filter((item) => item.dueDate < today())
          .reduce((sum, item) => sum + item.amountInCents, 0),
        paidInPeriodInCents: this.receiptEvents
          .filter((event) => {
            const receivable = this.receivables.find((item) => item.id === event.receivableId);
            return receivable?.clinicId === clinicId && inPeriod(event.occurredAt);
          })
          .reduce((sum, event) => sum + event.amountInCents, 0),
      },
      commercial: {
        leadsCreated: leads.length,
        won,
        lost,
        conversionRate: leads.length
          ? Math.round((won / leads.length) * 100)
          : 0,
        averageFirstResponseMinutes: responseTimes.length
          ? Math.round(
              responseTimes.reduce((sum, value) => sum + value, 0) /
                responseTimes.length,
            )
          : 0,
      },
      byProfessional: breakdown(
        this.professionals.map((item) => ({
          id: item.id,
          name: item.fullName,
        })),
        (appointment) => appointment.professionalId,
      ),
      byService: breakdown(
        this.services.map((item) => ({ id: item.id, name: item.name })),
        (appointment) => appointment.serviceId,
      ),
      bySource,
      profitability: {
        dre: {
          serviceRevenueInCents,
          productRevenueInCents,
          grossRevenueInCents,
          productCostInCents,
          grossProfitInCents,
          operatingExpensesInCents,
          commissionsInCents,
          netResultInCents,
          netMargin: percentage(netResultInCents, grossRevenueInCents),
        },
        byService: byServiceProfitability,
        byProduct,
        operational: {
          groupOccupancyRate: percentage(
            activeGroupSeats,
            totalGroupCapacity,
          ),
          activeGroupSeats,
          totalGroupCapacity,
          waitlistCount: groups.reduce(
            (sum, item) => sum + item.waitlistCount,
            0,
          ),
          lowStockCount: this.products.filter(
            (item) =>
              item.clinicId === clinicId &&
              item.currentStock <= item.minimumStock,
          ).length,
          productUnitsSold: byProduct.reduce(
            (sum, item) => sum + item.unitsSold,
            0,
          ),
          averageReceiptInCents: paidInPeriod.length
            ? Math.round(
                paidInPeriod.reduce(
                  (sum, item) => sum + item.amountInCents,
                  0,
                ) / paidInPeriod.length,
              )
            : 0,
        },
      },
    };
  }

  private renderDocument(body: string, patientName: string, planName?: string) {
    return body
      .replaceAll("{{paciente_nome}}", patientName)
      .replaceAll("{{plano_nome}}", planName ?? "Não vinculado")
      .replaceAll("{{data_emissao}}", new Date().toLocaleDateString("pt-BR"))
      .replaceAll("{{clinica_nome}}", "Movimenta");
  }

  private channelAllowed(
    clinicId: string,
    patientId: string,
    channel: CommunicationPreference["channel"],
  ) {
    return (
      this.communicationPreferences.find(
        (item) =>
          item.clinicId === clinicId &&
          item.patientId === patientId &&
          item.channel === channel,
      )?.allowed ?? true
    );
  }

  private assertChannelAllowed(
    clinicId: string,
    patientId: string,
    channel: CommunicationPreference["channel"],
  ) {
    if (!this.channelAllowed(clinicId, patientId, channel))
      throw new DomainError(
        "COMMUNICATION_OPT_OUT",
        "O paciente não autorizou mensagens neste canal.",
        409,
      );
  }

  private pushMessage(input: {
    clinicId: string;
    patient: Patient;
    channel: CommunicationPreference["channel"];
    kind: OutboundMessage["kind"];
    recipient: string;
    body: string;
    scheduledFor: string;
    idempotencyKey: string;
  }) {
    const message: OutboundMessage & { idempotencyKey: string } = {
      id: uuid(),
      clinicId: input.clinicId,
      patientId: input.patient.id,
      patientName: input.patient.fullName,
      channel: input.channel,
      kind: input.kind,
      recipient: input.recipient,
      body: input.body,
      status: "queued",
      scheduledFor: input.scheduledFor,
      attempts: 0,
      createdAt: now(),
      idempotencyKey: input.idempotencyKey,
    };
    this.outboundMessages.push(message);
    return this.toOutboundMessage(message);
  }

  private toOutboundMessage(
    message: OutboundMessage & { idempotencyKey: string },
  ): OutboundMessage {
    return {
      id: message.id,
      clinicId: message.clinicId,
      patientId: message.patientId,
      patientName: message.patientName,
      channel: message.channel,
      kind: message.kind,
      recipient: message.recipient,
      body: message.body,
      status: message.status,
      scheduledFor: message.scheduledFor,
      attempts: message.attempts,
      createdAt: message.createdAt,
      ...(message.sentAt ? { sentAt: message.sentAt } : {}),
      ...(message.lastError ? { lastError: message.lastError } : {}),
    };
  }
}
