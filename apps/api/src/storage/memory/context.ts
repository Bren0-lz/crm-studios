import { starterAssessmentTemplates } from "@crm/contracts";
import type { ExternalOperation, PaymentProof } from "@crm/contracts";
import type {
  StoredMessageTemplate,
  StoredMessageTemplateImage,
  StoredWhatsappCampaign,
} from "./campaigns.js";
import type {
  StoredAutoCampaign,
  StoredAutoCampaignDelivery,
  StoredAutoCampaignRedemption,
} from "./auto-campaigns.js";
import type { CommissionPaymentEvent } from "@crm/contracts";
import type { PlanPurchaseResult } from "@crm/contracts";
import type {
  PayablePaymentEvent,
  FinancialDateCorrection,
} from "@crm/contracts";
import type { PaymentTiming } from "@crm/contracts";
import type { PaymentPart } from "@crm/contracts";
import { resolvePaymentParts } from "@crm/contracts";
import {
  assertPaymentParts,
  latestPaymentBatch,
  storedPaymentParts,
} from "../../modules/finance/payment-parts.js";
import type { Supplier, SupplierOrder } from "@crm/contracts";
import type {
  ClinicalResource,
  ClinicCatalogEntry,
  NavTabLabel,
  NotificationPreferences,
  IntegrationKey,
  AutoFinalizationSettings,
  PaymentMethodSettings,
  ProLaboreSettings,
} from "@crm/contracts";
import {
  type AdminAuditEvent,
  type AdminUser,
  type AdminUserCommissionInput,
  serviceCommissionsInForce,
  type AppModule,
  appModuleSchema,
  type Appointment,
  type AppointmentInput,
  type AppointmentRescheduleEvent,
  type AppointmentStatus,
  formatSequenceNumber,
  documentTemplateValues,
  renderDocumentTemplate,
  type AssessmentTemplate,
  type ClinicalAccessEvent,
  type ClinicalAddendum,
  type ClinicalAlert,
  type ClinicalAssessment,
  type ClinicalAttachmentContent,
  type ClinicalMeasurement,
  type ClinicalRecord,
  type ClinicalRecordRevision,
  type ClinicSettings,
  type CommissionEntry,
  type CommissionRule,
  type CommunicationPreference,
  type ContactActivity,
  type CostCenter,
  DEFAULT_PATIENT_TAG_COLOR,
  type DocumentTemplate,
  effectiveEditModules,
  effectiveModules,
  effectivePermissions,
  type FinancialCategory,
  type GroupAttendance,
  type GroupClass,
  type GroupEnrollment,
  type GroupSession,
  historyAction,
  type Holiday,
  type IssuedDocument,
  type Lead,
  type LeadContact,
  type LeadTask,
  type OutboundMessage,
  type Patient,
  type PatientPlan,
  type PatientPlanInput,
  type PatientTab,
  type PatientTag,
  patientTagKey,
  type Payable,
  type PaymentMethod,
  permissionEditModules,
  type PermissionKey,
  permissionModules,
  type PlanCatalogEntry,
  discountedPlanInstallments,
  planInstallmentSchedule,
  withPlanPaymentParts,
  type PlanTemplate,
  type PlanTemplateInput,
  type Product,
  type ProductSize,
  productNeedsRestock,
  productSizeStock,
  type Professional,
  type Receivable,
  type ReceivableRenegotiation,
  type ReceivedPayment,
  type RecurringPayable,
  type RecurringPayableInput,
  type RelationshipSettings,
  type ReplacementCredit,
  type Room,
  type SatisfactionSurvey,
  type ScheduleBlock,
  type Service,
  type SessionMovement,
  type StockMovement,
  type TherapeuticGoal,
  type TreatmentClosure,
} from "@crm/contracts";
import { hashSync } from "bcryptjs";
import { demoPatients } from "../../demo-patients.js";
import {
  buildDemoScenarios,
  demoMessageTemplates,
  demoProfessionals,
  demoRooms,
  demoServices,
} from "../../demo-scenarios.js";
import { clinicDateOf } from "../../modules/finance/daily-cash.js";
import {
  findWeeklyScheduleConflicts,
  groupScheduleConflictMessage,
  intervalHitsSlots,
  localParts,
  weeklyOccurrences,
  zonedTimeToUtc,
} from "../../modules/groups/group-schedule.js";
import {
  formatPlanServices,
  validatePlanComposition,
} from "../../modules/plans/plan-services.js";
import type { ClinicRepository } from "../../repository.js";
import { type AuthenticatedUser, DomainError } from "../../repository.js";
import type { Branch, UserBranchAccess } from "@crm/contracts";
import { BranchScopeStore } from "../branch-scope.js";
import {
  CLINIC_ID,
  DEFAULT_BRANCH_ID,
  dateAt,
  now,
  type StoredRecurringPayable,
  today,
  uuid,
} from "./helpers.js";

export class MemoryRepositoryContext {
  operations!: ClinicRepository;
  readonly branchScope = new BranchScopeStore();
  readonly branches: Branch[] = [
    {
      id: DEFAULT_BRANCH_ID,
      clinicId: CLINIC_ID,
      name: "Matriz",
      active: true,
      isDefault: true,
      phones: [],
    },
  ];

  /** Filial padrão da clínica (criada na primeira consulta, como o gatilho do PostgreSQL). */
  defaultBranchId(clinicId: string) {
    const current = this.branches.find(
      (branch) => branch.clinicId === clinicId && branch.isDefault,
    );
    if (current) return current.id;
    const branch: Branch = {
      id: uuid(),
      clinicId,
      name: "Matriz",
      active: true,
      isDefault: true,
      phones: [],
    };
    this.branches.push(branch);
    return branch.id;
  }

  /** Filial do registro; os anteriores às filiais ficam na padrão. */
  branchOf(item: { clinicId: string; branchId?: string }) {
    return item.branchId ?? this.defaultBranchId(item.clinicId);
  }

  /** O registro está nas filiais da leitura em curso? */
  inBranchScope(item: { clinicId: string; branchId?: string }) {
    const ids = this.branchScope.readIds();
    return !ids || ids.includes(this.branchOf(item));
  }

  /** Valida as filiais sem alterar o usuário ou a auditoria. */
  validateUserBranchAccess(user: AuthenticatedUser, access: UserBranchAccess) {
    const branchIds = access.allBranches ? [] : [...new Set(access.branchIds)];
    if (
      branchIds.some(
        (id) =>
          !this.branches.some(
            (branch) => branch.clinicId === user.clinicId && branch.id === id,
          ),
      )
    )
      throw new DomainError("BRANCH_NOT_FOUND", "Filial não encontrada.", 404);
    return branchIds;
  }

  setUserBranchAccess(
    user: AuthenticatedUser,
    access: UserBranchAccess,
    actorUserId: string,
  ) {
    const branchIds = this.validateUserBranchAccess(user, access);
    user.allBranches = access.allBranches;
    user.branchIds = branchIds;
    this.addAdminAudit(
      actorUserId,
      "users.branches_updated",
      "user",
      user.id,
      { allBranches: user.allBranches, branchIds },
      user.clinicId,
    );
  }

  /** O profissional (e o que é dele: comissões, acertos) está nas filiais da leitura? */
  professionalInBranchScope(professionalId: string) {
    const professional = this.professionals.find(
      (item) => item.id === professionalId,
    );
    return professional
      ? this.inBranchScope(professional)
      : this.branchScope.readIds() === null;
  }

  /** Só os registros das filiais da leitura em curso (relatórios e painéis). */
  scoped<T extends { clinicId: string; branchId?: string }>(items: T[]) {
    return items.filter((item) => this.inBranchScope(item));
  }

  /** Comissões dos profissionais das filiais da leitura em curso. */
  scopedCommissions() {
    return this.commissions.filter((item) =>
      this.professionalInBranchScope(item.professionalId),
    );
  }

  /** A turma está nas filiais da leitura em curso? */
  groupInBranchScope(groupId: string) {
    const group = this.groupClasses.find((item) => item.id === groupId);
    return Boolean(group && this.inBranchScope(group));
  }

  /** Recusa (403) gravar em filial fora das filiais da requisição. */
  assertBranchInScope(branchId: string) {
    const ids = this.branchScope.readIds();
    if (ids && !ids.includes(branchId))
      throw new DomainError(
        "BRANCH_ACCESS_DENIED",
        "Este registro é de uma filial que não está selecionada.",
        403,
      );
  }

  /**
   * Filial comum aos recursos (profissional, sala, turma…) de uma gravação: recusa mistura de
   * filiais (409 BRANCH_MISMATCH) e filial fora do escopo da requisição (403).
   */
  resourceBranch(...items: { clinicId: string; branchId?: string }[]) {
    return this.sameBranch(
      "Profissional e sala precisam ser da mesma filial.",
      ...items,
    );
  }

  /** Como `resourceBranch`, com a mensagem própria da operação. */
  sameBranch(
    message: string,
    ...items: { clinicId: string; branchId?: string }[]
  ) {
    const ids = new Set(items.map((item) => this.branchOf(item)));
    if (ids.size > 1) throw new DomainError("BRANCH_MISMATCH", message, 409);
    const [branchId] = [...ids];
    this.assertBranchInScope(branchId!);
    return branchId!;
  }

  /** Filial em que a requisição em curso grava. */
  writeBranchId(clinicId: string) {
    return this.branchScope.writeId() ?? this.defaultBranchId(clinicId);
  }
  readonly externalOperations: (ExternalOperation & {
    contentBase64: string;
  })[] = [];
  readonly paymentProofs: (PaymentProof & {
    contentBase64: string;
    deletedAt?: string;
    deletedByUserId?: string;
    deletionReason?: string;
  })[] = [];

  /** Estorno da baixa: os comprovantes ficam no histórico, marcados como da baixa estornada. */
  markPaymentProofsReversed(
    clinicId: string,
    entityType: PaymentProof["entityType"],
    entityId: string,
  ) {
    const timestamp = now();
    for (const proof of this.paymentProofs)
      if (
        proof.clinicId === clinicId &&
        proof.entityType === entityType &&
        proof.entityId === entityId &&
        !proof.reversedAt &&
        !proof.deletedAt
      )
        proof.reversedAt = timestamp;
  }
  readonly planPurchases = new Map<
    string,
    { fingerprint: string; result: PlanPurchaseResult }
  >();

  readonly commissionAdjustments: import("@crm/contracts").CommissionAdjustment[] =
    [];
  readonly commissionReconciliations: import("@crm/contracts").CommissionReconciliation[] =
    [];
  readonly commissionAccountPayments: import("@crm/contracts").CommissionAccountPayment[] =
    [];
  readonly commissionPaymentEvents: CommissionPaymentEvent[] = [];
  /** Colaboradores da folha de pagamento (`payroll_employees`). */
  readonly payrollEmployees: import("./payroll.js").PayrollEmployeeRecord[] =
    [];
  readonly planTemplates: PlanTemplate[] = [];

  readonly appointmentReschedules: AppointmentRescheduleEvent[] = [];

  readonly clinicalRecords: ClinicalRecord[] = [];

  readonly clinicalRecordRevisions: ClinicalRecordRevision[] = [];

  readonly assessmentTemplates: AssessmentTemplate[] = [
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
    // Fichas iniciais (mesmo conteúdo da migração 0101).
    ...starterAssessmentTemplates.map(
      (template, index): AssessmentTemplate => ({
        ...structuredClone(template),
        id: `c1000000-0000-4000-8000-00000000000${index + 2}`,
        clinicId: CLINIC_ID,
        version: 1,
        active: true,
        createdAt: now(),
      }),
    ),
  ];

  readonly clinicalAssessments: ClinicalAssessment[] = [];

  readonly therapeuticGoals: TherapeuticGoal[] = [];

  readonly clinicalMeasurements: ClinicalMeasurement[] = [];

  readonly treatmentClosures: TreatmentClosure[] = [];

  readonly clinicalAttachments: ClinicalAttachmentContent[] = [];

  readonly clinicalAddenda: ClinicalAddendum[] = [];

  /** Alertas clínicos; `archivedAt` marca os removidos (o histórico fica). */
  readonly clinicalAlerts: (ClinicalAlert & { archivedAt?: string })[] = [];

  readonly clinicalAccessEvents: ClinicalAccessEvent[] = [];

  readonly adminAuditEvents: AdminAuditEvent[] = [];

  readonly relationshipSettings = new Map<string, RelationshipSettings>();

  readonly agendaNotes: import("@crm/contracts").AgendaNote[] = [];
  readonly waitlistEntries: import("./waitlist.js").WaitlistRow[] = [];
  readonly holidays = new Map<string, Holiday[]>();

  readonly contactActivities: ContactActivity[] = [];

  readonly satisfactionSurveys: SatisfactionSurvey[] = [];

  readonly clinicSettings: ClinicSettings = {
    id: CLINIC_ID,
    name: "Studios Aryana",
    legalName: "Studios Aryana Ltda.",
    taxId: "",
    phone: "",
    email: "",
    address: "",
    timezone: "America/Sao_Paulo",
    updatedAt: now(),
  };

  readonly patientPlans: PatientPlan[] = [];

  readonly sessionMovements: SessionMovement[] = [];

  readonly receivables: Receivable[] = [];
  /** Número do recibo (sequencial por clínica), atribuído na primeira emissão (QM15). */
  readonly receiptNumbers: Array<{
    clinicId: string;
    receivableId: string;
    number: number;
  }> = [];

  readonly payablePaymentEvents: PayablePaymentEvent[] = [];
  readonly financialDateCorrections: FinancialDateCorrection[] = [];
  readonly receiptEvents: Array<{
    id: string;
    receivableId: string;
    kind: ReceivedPayment["kind"];
    occurredAt: string;
    availableAt?: string | undefined;
    amountInCents: number;
    paymentMethod?: PaymentMethod;
    /** U39: desconto e juros aplicados na baixa; saldo de pagamento parcial. */
    discountInCents?: number;
    interestInCents?: number;
    balanceReceivableId?: string;
  }> = [];

  readonly receivableRenegotiations: ReceivableRenegotiation[] = [];

  readonly commissionRules: CommissionRule[] = [];

  /**
   * Regras de comissão do próprio usuário (`commission_rules.user_id` no PostgreSQL). Prevalecem
   * sobre as do profissional ligado; não aparecem na lista de regras do Financeiro.
   */
  readonly userCommissionRules: Array<{
    id: string;
    clinicId: string;
    userId: string;
    kind?: AdminUserCommissionInput["kind"];
    fixedAmountInCents?: number | undefined;
    serviceId?: string | undefined;
    effectiveUntil?: string | undefined;
    percentage: number;
    effectiveFrom: string;
    active: boolean;
    createdAt: string;
  }> = [];

  readonly commissions: CommissionEntry[] = [];

  /** Regras (`commission_entries.rule_id` no PostgreSQL) que já geraram algum lançamento. */
  readonly commissionEntryRuleIds = new Set<string>();

  readonly payables: Payable[] = [];

  readonly recurringPayables: StoredRecurringPayable[] = [];

  readonly financialCategories: FinancialCategory[] = [
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

  readonly costCenters: CostCenter[] = [
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

  readonly leads: Lead[] = [];

  readonly leadContacts: LeadContact[] = [];

  readonly leadTasks: LeadTask[] = [];

  readonly communicationPreferences: CommunicationPreference[] = [];

  readonly outboundMessages: Array<
    OutboundMessage & { idempotencyKey: string }
  > = [];

  readonly messageTemplates: StoredMessageTemplate[] = [];

  readonly messageTemplateImages: StoredMessageTemplateImage[] = [];

  readonly whatsappCampaigns: StoredWhatsappCampaign[] = [];

  readonly autoCampaigns: StoredAutoCampaign[] = [];

  readonly autoCampaignDeliveries: StoredAutoCampaignDelivery[] = [];

  readonly autoCampaignRedemptions: StoredAutoCampaignRedemption[] = [];

  readonly documentTemplates: DocumentTemplate[] = [];

  readonly issuedDocuments: IssuedDocument[] = [];

  /** Ligação profissional da agenda → usuário (`professionals.user_id` no PostgreSQL). */
  readonly professionalUsers = new Map<string, string>();

  /** Foto do perfil por usuário (`users.avatar_data_url` no PostgreSQL). */
  readonly userAvatars = new Map<string, string>();

  /** Preferências do sino por usuário (`user_notification_preferences` no PostgreSQL). */
  readonly notificationPreferences = new Map<string, NotificationPreferences>();

  /** Chaves da API externa (`integration_api_keys` no MySQL), com o hash do token. */
  readonly integrationKeys: (IntegrationKey & {
    clinicId: string;
    tokenHash: string;
  })[] = [];

  /** WhatsApp por usuário (`users.whatsapp` no PostgreSQL). */
  readonly userWhatsapps = new Map<string, string>();

  readonly users: AuthenticatedUser[] = [
    {
      id: "22222222-2222-4222-8222-222222222222",
      clinicId: CLINIC_ID,
      fullName: "Aryana Dutra",
      email: "admin@movimenta.local",
      role: "admin",
      permissions: effectivePermissions("admin"),
      modules: effectiveModules("admin"),
      editModules: effectiveEditModules("admin"),
      customModules: false,
      passwordHash: hashSync("Admin@123", 10),
      active: true,
      dashboardAccess: false,
      createdAt: now(),
      updatedAt: now(),
    },
  ];

  readonly professionals: Professional[] = [
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

  readonly rooms: Room[] = [
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

  readonly services: Service[] = [
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

  readonly patients: Patient[] = [
    ...demoPatients.map((patient) => ({ ...patient, tags: [...patient.tags] })),
    this.seedPatient(
      "99999999-9999-4999-8999-999999999999",
      "Helena Almeida",
      "11987654321",
      ["Pós-operatório"],
      1,
    ),
    this.seedPatient(
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      "Lucas Ribeiro",
      "11976543210",
      ["Esportivo"],
      2,
    ),
    this.seedPatient(
      "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      "Sônia Barros",
      "11965432109",
      ["Recorrente"],
      3,
    ),
  ];

  readonly appointments: Appointment[] = [
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

  readonly scheduleBlocks: ScheduleBlock[] = [];

  readonly groupClasses: GroupClass[] = [];

  readonly groupEnrollments: GroupEnrollment[] = [];

  readonly groupSessions: GroupSession[] = [];

  readonly groupSessionsGeneratedUntil = new Map<string, Date>();

  patientIds(clinicId: string, patientId: string) {
    return new Set(
      this.patients
        .filter(
          (item) =>
            item.clinicId === clinicId &&
            (item.id === patientId || item.mergedIntoPatientId === patientId),
        )
        .map((item) => item.id),
    );
  }
  readonly clinicalResources: ClinicalResource[] = [];
  readonly clinicCatalogEntries: ClinicCatalogEntry[] = [];
  /** Abas do menu renomeadas, por clínica. */
  readonly navTabLabels = new Map<string, NavTabLabel[]>();
  /** Finalização automática configurada, por clínica (sem entrada = padrão). */
  readonly autoFinalizationSettings = new Map<
    string,
    AutoFinalizationSettings
  >();
  /** Parcelamento por forma de pagamento, por clínica (sem entrada = até 36x em todas). */
  readonly paymentMethodSettings = new Map<string, PaymentMethodSettings>();
  /** Pró-labore configurado, por clínica (sem entrada = padrão). */
  readonly proLaboreSettings = new Map<string, ProLaboreSettings>();
  /** Funil editado, por clínica (sem entrada = etapas padrão). */
  readonly leadStages = new Map<
    string,
    Array<{ stage: string; label: string }>
  >();
  readonly groupAttendance: GroupAttendance[] = [];

  readonly replacementCredits: ReplacementCredit[] = [];

  readonly suppliers: Supplier[] = [];
  readonly supplierOrders: SupplierOrder[] = [];
  readonly products: Product[] = [];
  /** Saldo por produto e chave de estoque ("" = sem tamanho); `currentStock` é a soma. */
  readonly productStocks = new Map<string, Map<string, number>>();

  readonly stockMovements: StockMovement[] = [];

  readonly patientTabs: PatientTab[] = [];

  /** Etiquetas configuradas; começam com as etiquetas que os clientes demo já têm. */
  readonly patientTags: Omit<PatientTag, "patientCount">[] = [];

  constructor(withRichDemo = false) {
    for (const patient of this.patients)
      for (const tag of patient.tags)
        this.ensurePatientTag(patient.clinicId, tag);
    if (!withRichDemo) return;
    const data = buildDemoScenarios();
    this.professionals.push(...demoProfessionals);
    this.rooms.push(...demoRooms);
    this.services.push(...demoServices);
    this.appointments.push(...data.appointments);
    this.patientPlans.push(...data.plans);
    this.sessionMovements.push(...data.movements);
    this.receivables.push(...data.receivables);
    this.groupClasses.push(...data.groups);
    this.groupEnrollments.push(...data.enrollments);
    this.groupSessions.push(...data.sessions);
    this.groupAttendance.push(...data.attendance);
    const createdAt = new Date().toISOString();
    this.messageTemplates.push(
      ...demoMessageTemplates.map((template) => ({
        ...template,
        clinicId: CLINIC_ID,
        createdAt,
        updatedAt: createdAt,
      })),
    );
    this.receiptEvents.push(
      ...data.financialEvents
        .filter((event) => event.kind === "payment")
        .map((event) => ({
          id: event.id,
          receivableId: event.receivableId,
          kind: "payment" as const,
          occurredAt: event.createdAt,
          amountInCents: event.amountInCents,
          paymentMethod:
            this.receivables.find((item) => item.id === event.receivableId)
              ?.paymentMethod ?? "pix",
        })),
    );
  }

  seedPatient(
    id: string,
    fullName: string,
    phone: string,
    tags: string[],
    number: number,
  ): Patient {
    return {
      id,
      clinicId: CLINIC_ID,
      // PAC-00001..00003, como no seed do PostgreSQL; os demo começam em PAC-00004 (QM15).
      recordNumber: formatSequenceNumber("PAC", number),
      fullName,
      phone,
      tags,
      status: "active",
      createdAt: now(),
      updatedAt: now(),
    };
  }

  seedAppointment(
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
      visitType: "regular",
      patientName: patient.fullName,
      professionalName: professional.fullName,
      professionalColor: professional.color,
      roomName: room.name,
      serviceName: service.name,
      createdAt: now(),
      updatedAt: now(),
    };
  }

  /** Usuário sem senha, com o profissional ligado e a regra de comissão vigente hoje. */
  toAdminUser(user: AuthenticatedUser): AdminUser {
    const { passwordHash: _, ...summary } = user;
    void _;
    const professional = this.linkedProfessional(user.clinicId, user.id);
    const today = clinicDateOf(new Date(), this.clinicSettings.timezone);
    const rule = this.userCommissionRuleOn(user.clinicId, user.id, today);
    const allBranches = user.role === "admin" || (user.allBranches ?? true);
    const whatsapp = this.userWhatsapps.get(user.id);
    const serviceCommissions = this.userServiceCommissions(
      user.clinicId,
      user.id,
      today,
    );
    const salaryInCents = this.payrollEmployees.find(
      (item) => item.clinicId === user.clinicId && item.userId === user.id,
    )?.baseSalaryInCents;
    return {
      ...summary,
      ...(whatsapp ? { whatsapp } : {}),
      allBranches,
      branchIds: allBranches ? [] : [...(user.branchIds ?? [])],
      dashboardAccess: user.dashboardAccess ?? false,
      ...(professional
        ? {
            professional: {
              ...structuredClone(professional),
              branchId: this.branchOf(professional),
            },
            professionalId: professional.id,
            professionalName: professional.fullName,
          }
        : {}),
      ...(rule
        ? {
            ...(rule.kind ? { commissionKind: rule.kind } : {}),
            ...(rule.fixedAmountInCents !== undefined
              ? { commissionFixedAmountInCents: rule.fixedAmountInCents }
              : {}),
            commissionPercentage: rule.percentage,
            commissionEffectiveFrom: rule.effectiveFrom,
          }
        : {}),
      ...(serviceCommissions.length ? { serviceCommissions } : {}),
      ...(salaryInCents ? { salaryInCents } : {}),
    };
  }

  /** Regras por serviço do usuário vigentes hoje ou agendadas, com o nome do serviço. */
  userServiceCommissions(clinicId: string, userId: string, today: string) {
    return serviceCommissionsInForce(
      this.userCommissionRules.flatMap((rule) => {
        const service =
          rule.active && rule.clinicId === clinicId && rule.userId === userId
            ? this.services.find(
                (item) =>
                  item.clinicId === clinicId && item.id === rule.serviceId,
              )
            : undefined;
        return service
          ? [
              {
                serviceId: service.id,
                serviceName: service.name,
                kind: rule.kind ?? "percentage",
                percentage: rule.percentage,
                ...(rule.fixedAmountInCents !== undefined
                  ? { fixedAmountInCents: rule.fixedAmountInCents }
                  : {}),
                effectiveFrom: rule.effectiveFrom,
                ...(rule.effectiveUntil
                  ? { effectiveUntil: rule.effectiveUntil }
                  : {}),
              },
            ]
          : [];
      }),
      today,
    );
  }

  /** Regra do usuário vigente na data (ativa, maior vigência que já começou). */
  userCommissionRuleOn(clinicId: string, userId: string, date: string) {
    return this.userCommissionRules
      .filter(
        (item) =>
          item.clinicId === clinicId &&
          item.userId === userId &&
          item.active &&
          item.effectiveFrom <= date &&
          !item.serviceId &&
          (!item.effectiveUntil || item.effectiveUntil >= date),
      )
      .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];
  }

  validateUserCommissionRule(
    clinicId: string,
    userId: string,
    input: AdminUserCommissionInput,
  ) {
    if (
      input.serviceId &&
      !this.services.some(
        (item) => item.clinicId === clinicId && item.id === input.serviceId,
      )
    )
      throw new DomainError(
        "SERVICE_NOT_FOUND",
        "Serviço não encontrado.",
        404,
      );
    const existing = this.userCommissionRules.find(
      (item) =>
        item.clinicId === clinicId &&
        item.userId === userId &&
        item.serviceId === input.serviceId &&
        item.effectiveFrom === input.effectiveFrom,
    );
    if (existing) {
      // Mesma vigência: é uma correção do percentual, desde que a regra não tenha lançamentos.
      if (
        existing.percentage === input.percentage &&
        existing.kind === input.kind &&
        existing.fixedAmountInCents === input.fixedAmountInCents &&
        existing.effectiveUntil === input.effectiveUntil
      )
        return existing;
      if (this.commissionEntryRuleIds.has(existing.id))
        throw new DomainError(
          "COMMISSION_RULE_DUPLICATE",
          "Esta comissão já foi usada em lançamentos; escolha outra data de início.",
          409,
        );
    }
    return existing;
  }

  addUserCommissionRule(
    clinicId: string,
    actorUserId: string,
    userId: string,
    input: AdminUserCommissionInput,
  ) {
    const existing = this.validateUserCommissionRule(clinicId, userId, input);
    if (existing) {
      if (
        existing.percentage === input.percentage &&
        existing.kind === input.kind &&
        existing.fixedAmountInCents === input.fixedAmountInCents &&
        existing.effectiveUntil === input.effectiveUntil
      )
        return;
      const previousPercentage = existing.percentage;
      Object.assign(existing, input);
      this.addAdminAudit(
        actorUserId,
        "users.commission_updated",
        "user",
        userId,
        {
          ruleId: existing.id,
          percentage: existing.percentage,
          previousPercentage,
          effectiveFrom: existing.effectiveFrom,
        },
        clinicId,
      );
      return;
    }
    const rule = {
      id: uuid(),
      clinicId,
      userId,
      ...input,
      percentage: input.percentage,
      effectiveFrom: input.effectiveFrom,
      active: true,
      createdAt: now(),
    };
    this.userCommissionRules.push(rule);
    this.addAdminAudit(
      actorUserId,
      "users.commission_updated",
      "user",
      userId,
      {
        ruleId: rule.id,
        percentage: rule.percentage,
        effectiveFrom: rule.effectiveFrom,
      },
      clinicId,
    );
  }

  linkedProfessional(clinicId: string, userId: string) {
    return this.professionals.find(
      (item) =>
        item.clinicId === clinicId &&
        this.professionalUsers.get(item.id) === userId,
    );
  }

  setUserPermissions(
    user: AuthenticatedUser,
    permissions: readonly PermissionKey[],
  ) {
    user.permissions = effectivePermissions(user.role, permissions);
    user.modules = permissionModules(user.permissions);
    user.editModules =
      user.role === "admin"
        ? effectiveEditModules("admin")
        : permissionEditModules(user.permissions);
    user.customModules = user.role !== "admin" && user.permissions.length > 0;
  }

  systemHistoryEvents(clinicId: string): AdminAuditEvent[] {
    if (clinicId !== CLINIC_ID) return [];
    const sources: {
      records: readonly object[];
      module: AppModule;
      action: string;
      event?: boolean;
    }[] = [
      { records: this.patients, module: "patients", action: "patient.created" },
      {
        records: this.appointments,
        module: "agenda",
        action: "appointment.created",
      },
      { records: this.patientPlans, module: "plans", action: "plan.created" },
      {
        records: this.sessionMovements,
        module: "plans",
        action: "session.movement",
        event: true,
      },
      {
        records: this.receiptEvents,
        module: "finance",
        action: "financial",
        event: true,
      },
      {
        records: this.appointmentReschedules,
        module: "agenda",
        action: "appointment.rescheduled",
        event: true,
      },
      { records: this.leads, module: "crm", action: "lead.created" },
      {
        records: this.leadContacts,
        module: "crm",
        action: "lead.contact",
        event: true,
      },
      { records: this.leadTasks, module: "crm", action: "lead.task_created" },
      { records: this.products, module: "patients", action: "product.created" },
      {
        records: this.stockMovements,
        module: "patients",
        action: "stock.movement",
        event: true,
      },
      { records: this.patientTabs, module: "patients", action: "tab.created" },
      { records: this.groupClasses, module: "groups", action: "group.created" },
      {
        records: this.groupEnrollments,
        module: "groups",
        action: "group.enrolled",
      },
      {
        records: this.groupAttendance,
        module: "groups",
        action: "group.attendance",
        event: true,
      },
      {
        records: this.replacementCredits,
        module: "groups",
        action: "group.replacement_created",
      },
      {
        records: this.groupSessions,
        module: "groups",
        action: "group.session_created",
      },
      {
        records: this.scheduleBlocks,
        module: "agenda",
        action: "schedule.block_created",
      },
      {
        records: this.contactActivities,
        module: "relationship",
        action: "relationship.contact",
        event: true,
      },
      {
        records: this.outboundMessages,
        module: "communications",
        action: "message.created",
        event: true,
      },
      {
        records: this.satisfactionSurveys,
        module: "agenda",
        action: "satisfaction.created",
        event: true,
      },
      {
        records: this.clinicalRecords,
        module: "clinical",
        action: "clinical.record_created",
      },
      {
        records: this.clinicalRecordRevisions,
        module: "clinical",
        action: "clinical.revision",
        event: true,
      },
      {
        records: this.clinicalAccessEvents,
        module: "clinical",
        action: "clinical.access",
        event: true,
      },
      {
        records: this.clinicalAttachments,
        module: "clinical",
        action: "clinical.attachment_created",
      },
      {
        records: this.clinicalAddenda,
        module: "clinical",
        action: "clinical.addendum_created",
      },
      {
        records: this.clinicalAlerts,
        module: "clinical",
        action: "clinical.alert_created",
      },
      {
        records: this.clinicalAssessments,
        module: "clinical",
        action: "clinical.assessment_created",
      },
      {
        records: this.assessmentTemplates,
        module: "clinical",
        action: "clinical.template_created",
      },
      {
        records: this.therapeuticGoals,
        module: "clinical",
        action: "clinical.goal_created",
      },
      {
        records: this.clinicalMeasurements,
        module: "clinical",
        action: "clinical.measurement_created",
      },
      {
        records: this.treatmentClosures,
        module: "clinical",
        action: "clinical.closure_created",
      },
      {
        records: this.receivableRenegotiations,
        module: "finance",
        action: "finance.renegotiated",
      },
      {
        records: this.commissionRules,
        module: "finance",
        action: "commission.rule_created",
      },
      {
        records: this.commissions,
        module: "finance",
        action: "commission.created",
      },
      {
        records: this.recurringPayables,
        module: "finance",
        action: "recurring_payable.created",
      },
      {
        records: this.documentTemplates,
        module: "contracts",
        action: "contract.template_created",
      },
      {
        records: this.issuedDocuments,
        module: "contracts",
        action: "contract.created",
      },
    ];
    return sources.flatMap((source) =>
      source.records.flatMap((record) => {
        const data = record as Record<string, unknown>;
        const createdAt =
          data.createdAt ??
          data.occurredAt ??
          data.enrolledAt ??
          data.recordedAt;
        if (
          typeof data.id !== "string" ||
          typeof createdAt !== "string" ||
          (data.clinicId && data.clinicId !== clinicId)
        )
          return [];
        const action =
          source.action === "financial"
            ? `financial.${data.kind}`
            : source.action === "clinical.access"
              ? `clinical.access.${data.action}`
              : source.action === "plan.created" && data.sourceTabId
                ? "plan.tab_credit"
                : source.action;
        const actorUserId =
          source.event && typeof data.actorUserId === "string"
            ? data.actorUserId
            : undefined;
        const actorName = source.event
          ? (data.actorName ??
            data.authorName ??
            this.users.find((user) => user.id === actorUserId)?.fullName)
          : undefined;
        const metadata: Record<string, unknown> = {
          source: source.action,
          importedHistory: true,
        };
        if (source.module === "clinical") {
          for (const key of [
            "clinicalRecordId",
            "patientId",
            "version",
            "entityId",
            "entityType",
          ])
            if (data[key] !== undefined) metadata[key] = data[key];
        } else if (source.event) {
          for (const [key, value] of Object.entries(data))
            if (
              ![
                "body",
                "contentBase64",
                "snapshotBody",
                "idempotencyKey",
              ].includes(key)
            )
              metadata[key] = value;
        }
        return [
          {
            id: data.id,
            clinicId,
            module: source.module,
            action,
            entityType: source.action,
            entityId: data.id,
            description: historyAction(action)?.label ?? "Atividade registrada",
            createdAt,
            metadata,
            ...(actorUserId ? { actorUserId } : {}),
            ...(typeof actorName === "string" ? { actorName } : {}),
          },
        ];
      }),
    );
  }

  recordAudit(
    clinicId: string,
    actorUserId: string,
    action: string,
    entityType: string,
    metadata: Record<string, unknown> = {},
    entityId?: string,
  ) {
    this.addAdminAudit(
      actorUserId,
      action,
      entityType,
      entityId,
      metadata,
      clinicId,
    );
  }

  addAdminAudit(
    actorUserId: string,
    action: string,
    entityType: string,
    entityId?: string,
    metadata: Record<string, unknown> = {},
    clinicId = CLINIC_ID,
  ) {
    const actorName = this.users.find(
      (user) => user.id === actorUserId,
    )?.fullName;
    this.adminAuditEvents.push({
      id: uuid(),
      clinicId,
      module:
        historyAction(action)?.module ??
        appModuleSchema.safeParse(metadata._module).data ??
        "settings",
      description:
        historyAction(action)?.label ??
        (typeof metadata._description === "string"
          ? metadata._description
          : "Alteração registrada"),
      actorUserId,
      action,
      entityType,
      ...(entityId ? { entityId } : {}),
      ...(actorName ? { actorName } : {}),
      metadata,
      createdAt: now(),
    });
  }

  /** Garante a etiqueta configurada (cor padrão) — dados demo e "Convertido do CRM". */
  ensurePatientTag(clinicId: string, name: string) {
    const key = patientTagKey(name);
    if (!key) return;
    if (
      this.patientTags.some(
        (tag) => tag.clinicId === clinicId && patientTagKey(tag.name) === key,
      )
    )
      return;
    const timestamp = now();
    this.patientTags.push({
      id: uuid(),
      clinicId,
      name: name.trim(),
      color: DEFAULT_PATIENT_TAG_COLOR,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  }

  withPatientCount(tag: Omit<PatientTag, "patientCount">): PatientTag {
    return {
      ...tag,
      patientCount: this.patients.filter(
        (patient) =>
          patient.clinicId === tag.clinicId && patient.tags.includes(tag.name),
      ).length,
    };
  }

  assertTemplateServices(
    clinicId: string,
    entries: PlanTemplateInput["services"],
  ) {
    if (
      entries.some(
        (entry) =>
          !this.services.some(
            (item) =>
              item.id === entry.serviceId &&
              item.clinicId === clinicId &&
              item.active,
          ),
      )
    )
      throw new DomainError(
        "PLAN_TEMPLATE_SERVICE_NOT_FOUND",
        "Serviço ativo não encontrado nesta clínica.",
        404,
      );
  }

  readonly planCatalog: PlanCatalogEntry[] = [];

  insertAppointment(
    clinicId: string,
    input: Omit<AppointmentInput, "patientId">,
    owner:
      | { patientId: string; patientName: string }
      | { leadId: string; leadName: string; patientName: string },
  ) {
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
    if (!professional || !room || !service) {
      throw new DomainError(
        "RELATED_RECORD_NOT_FOUND",
        "Cliente, profissional, sala ou serviço não encontrado.",
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
    const groupConflict =
      this.groupSessions.some((session) => {
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
      }) ||
      this.hasWeeklyGroupSlotConflict(
        clinicId,
        professional.id,
        room.id,
        startsAt,
        endsAt,
      );
    if (conflict || blocked || groupConflict) {
      throw new DomainError(
        "APPOINTMENT_CONFLICT",
        "O profissional ou a sala está ocupado ou bloqueado nesse horário.",
        409,
      );
    }

    const branchId = this.resourceBranch(professional, room);
    const timestamp = now();
    const appointment: Appointment = {
      branchId,
      professionalId: input.professionalId,
      roomId: input.roomId,
      serviceId: input.serviceId,
      startsAt: input.startsAt,
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      visitType: input.visitType,
      ...owner,
      id: uuid(),
      clinicId,
      endsAt: endsAt.toISOString(),
      status: "scheduled",
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

  ensureGroupSessions(
    clinicId: string,
    until: Date,
    options: { groupId?: string; renewBefore?: Date } = {},
  ) {
    const nowDate = new Date();
    const renewBefore = options.renewBefore ?? until;
    for (const group of this.groupClasses) {
      if (group.clinicId !== clinicId || !group.active) continue;
      if (options.groupId && group.id !== options.groupId) continue;
      const generatedUntil = this.groupSessionsGeneratedUntil.get(group.id);
      if (generatedUntil && generatedUntil >= renewBefore) continue;
      const after =
        generatedUntil && generatedUntil > nowDate ? generatedUntil : nowDate;
      for (const occurrence of weeklyOccurrences(
        group.weeklySlots,
        this.clinicSettings.timezone,
        after,
        until,
      )) {
        const startsAt = occurrence.startsAt.toISOString();
        if (
          this.groupSessions.some(
            (item) => item.groupId === group.id && item.startsAt === startsAt,
          )
        )
          continue;
        if (
          this.hasGroupScheduleConflict(
            clinicId,
            group,
            occurrence.startsAt,
            occurrence.endsAt,
          )
        )
          continue;
        this.groupSessions.push({
          id: uuid(),
          clinicId,
          groupId: group.id,
          groupName: group.name,
          professionalId: group.professionalId,
          professionalName: group.professionalName,
          roomId: group.roomId,
          roomName: group.roomName,
          startsAt,
          endsAt: occurrence.endsAt.toISOString(),
          status: "scheduled",
          attendanceCount: 0,
          createdAt: now(),
        });
      }
      this.groupSessionsGeneratedUntil.set(group.id, until);
    }
  }

  assertGroupScheduleAvailable(
    clinicId: string,
    group: {
      id?: string;
      professionalId: string;
      roomId: string;
      weeklySlots: GroupClass["weeklySlots"];
    },
  ) {
    const nowDate = new Date();
    const sharesResource = (item: {
      professionalId?: string;
      roomId?: string;
    }) =>
      item.professionalId === group.professionalId ||
      item.roomId === group.roomId;
    const busy = [
      ...this.appointments
        .filter(
          (item) =>
            item.clinicId === clinicId &&
            item.status !== "cancelled" &&
            new Date(item.endsAt) > nowDate &&
            sharesResource(item),
        )
        .map((item) => ({
          startsAt: new Date(item.startsAt),
          endsAt: new Date(item.endsAt),
          label: `Atendimento de ${item.patientName}`,
        })),
      ...this.groupSessions
        .filter(
          (item) =>
            item.clinicId === clinicId &&
            item.status !== "cancelled" &&
            item.groupId !== group.id &&
            new Date(item.endsAt) > nowDate,
        )
        .filter((item) => {
          const other = this.groupClasses.find(
            (candidate) => candidate.id === item.groupId,
          );
          return Boolean(other && sharesResource(other));
        })
        .map((item) => ({
          startsAt: new Date(item.startsAt),
          endsAt: new Date(item.endsAt),
          label: item.groupName,
        })),
    ];
    const patterns = this.groupClasses
      .filter(
        (item) =>
          item.clinicId === clinicId &&
          item.active &&
          item.id !== group.id &&
          sharesResource(item),
      )
      .map((item) => ({ slots: item.weeklySlots, label: item.name }));
    const conflicts = findWeeklyScheduleConflicts(
      group.weeklySlots,
      this.clinicSettings.timezone,
      busy,
      patterns,
    );
    if (conflicts.length)
      throw new DomainError(
        "GROUP_SCHEDULE_CONFLICT",
        groupScheduleConflictMessage(conflicts),
        409,
      );
  }

  // Horários fixos das turmas ocupam a agenda depois do período já reservado.
  hasWeeklyGroupSlotConflict(
    clinicId: string,
    professionalId: string,
    roomId: string,
    startsAt: Date,
    endsAt: Date,
  ) {
    const timezone = this.clinicSettings.timezone;
    return this.groupClasses.some((group) => {
      if (group.clinicId !== clinicId || !group.active) return false;
      if (group.professionalId !== professionalId && group.roomId !== roomId)
        return false;
      const slot = intervalHitsSlots(
        group.weeklySlots,
        timezone,
        startsAt,
        endsAt,
      );
      if (!slot) return false;
      const occurrence = zonedTimeToUtc(
        localParts(startsAt, timezone).date,
        slot.startTime,
        timezone,
      );
      return (
        occurrence >
        (this.groupSessionsGeneratedUntil.get(group.id) ?? new Date())
      );
    });
  }

  productStockOf(productId: string, size: ProductSize | undefined) {
    return this.productStocks.get(productId)?.get(size ?? "") ?? 0;
  }

  /** Recalcula total, aviso de reposição e saldos por tamanho a partir das chaves de estoque. */
  refreshProductStock(product: Product) {
    const rows = [...(this.productStocks.get(product.id) ?? new Map())];
    product.currentStock = rows.reduce((sum, [, stock]) => sum + stock, 0);
    product.sizeStock = productSizeStock(
      product.sizes,
      rows.map(([size, currentStock]) => ({
        size: (size || null) as ProductSize | null,
        currentStock,
      })),
    );
    product.lowStock = productNeedsRestock(product);
  }

  /** Soma `delta` ao saldo do tamanho (recusa saldo negativo) e devolve o novo saldo dele. */
  changeProductStock(
    product: Product,
    size: ProductSize | undefined,
    delta: number,
  ) {
    const balance = this.productStockOf(product.id, size) + delta;
    if (balance < 0)
      throw new DomainError(
        "INSUFFICIENT_STOCK",
        "O estoque disponível é insuficiente.",
        409,
      );
    const rows = this.productStocks.get(product.id) ?? new Map();
    rows.set(size ?? "", balance);
    this.productStocks.set(product.id, rows);
    this.refreshProductStock(product);
    product.updatedAt = now();
    return balance;
  }

  pushStockMovement(
    product: Product,
    kind: StockMovement["kind"],
    quantity: number,
    notes: string,
    patientTabId?: string,
    size?: ProductSize,
  ) {
    const movement: StockMovement = {
      id: uuid(),
      clinicId: product.clinicId,
      productId: product.id,
      productName: product.name,
      kind,
      ...(size ? { size } : {}),
      quantity,
      balanceAfter: this.productStockOf(product.id, size),
      notes,
      ...(patientTabId ? { patientTabId } : {}),
      createdAt: now(),
    };
    this.stockMovements.push(movement);
    return movement;
  }

  refreshGroupCounts(group: GroupClass) {
    group.activeEnrollments = this.groupEnrollments.filter(
      (item) => item.groupId === group.id && item.status === "active",
    ).length;
    group.waitlistCount = this.groupEnrollments.filter(
      (item) => item.groupId === group.id && item.status === "waitlisted",
    ).length;
  }

  hasGroupScheduleConflict(
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

  professionalCrefito(clinicId: string, professionalId: string) {
    return (
      this.professionals.find(
        (item) => item.clinicId === clinicId && item.id === professionalId,
      )?.crefito ?? ""
    );
  }

  addClinicalRevision(record: ClinicalRecord, authorName: string) {
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

  addClinicalAccessEvent(
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

  insertPatientPlan(
    clinicId: string,
    patient: Patient,
    rawInput: Omit<PatientPlanInput, "planTemplateId"> & {
      planTemplateId?: string | undefined;
    },
    creditReason: string,
    renewedFrom?: PatientPlan,
  ) {
    // Plano picado: forma e parcelas derivadas das formas; forma única dispensa a lista.
    const input = withPlanPaymentParts(rawInput);
    const totals = validatePlanComposition(
      input.services,
      input.totalValueInCents,
      renewedFrom?.services.map((item) => item.serviceId),
    );
    const timestamp = now();
    const { planTemplateId, ...terms } = input;
    // Renovação fica na filial do plano anterior; venda nova, na filial da requisição.
    const branchId = renewedFrom
      ? this.branchOf(renewedFrom)
      : this.writeBranchId(clinicId);
    const plan: PatientPlan = {
      ...terms,
      ...totals,
      branchId,
      services: input.services.map((item) => ({
        ...item,
        serviceName:
          renewedFrom?.services.find(
            (entry) => entry.serviceId === item.serviceId,
          )?.serviceName ??
          this.services.find(
            (service) =>
              service.id === item.serviceId && service.clinicId === clinicId,
          )!.name,
        remainingSessions: item.totalSessions,
      })),
      ...(planTemplateId ? { planTemplateId } : {}),
      id: uuid(),
      clinicId,
      patientName: patient.fullName,
      serviceName: input.services
        .map(
          (item) =>
            renewedFrom?.services.find(
              (entry) => entry.serviceId === item.serviceId,
            )?.serviceName ??
            this.services.find(
              (service) =>
                service.id === item.serviceId && service.clinicId === clinicId,
            )!.name,
        )
        .join(", "),
      status: "active",
      remainingSessions: totals.totalSessions,
      autoRenew: input.autoRenew ?? input.kind === "recurring",
      ...(renewedFrom ? { renewedFromPlanId: renewedFrom.id } : {}),
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    if (plan.autoRenew && !plan.validUntil) plan.autoRenew = false;
    // O desconto é do plano: a renovação segue o do plano anterior, com o que já foi usado.
    const discounted = discountedPlanInstallments(
      planInstallmentSchedule(input),
      input.discount,
      renewedFrom?.discount,
      input.orderDiscountInCents,
    );
    delete plan.discount;
    delete plan.orderDiscountInCents;
    if (discounted.discount) plan.discount = discounted.discount;
    const installments: Receivable[] = discounted.installments.map(
      (installment) => ({
        id: uuid(),
        clinicId,
        branchId,
        patientId: patient.id,
        planId: plan.id,
        patientName: patient.fullName,
        description: `${plan.name} · ${installment.installmentNumber}/${discounted.installments.length}`,
        postedOn: clinicDateOf(
          new Date(timestamp),
          this.clinicSettings.timezone,
        ),
        competence: clinicDateOf(
          new Date(timestamp),
          this.clinicSettings.timezone,
        ).slice(0, 7),
        installmentNumber: installment.installmentNumber,
        installmentCount: discounted.installments.length,
        dueDate: installment.dueDate,
        amountInCents: installment.amountInCents,
        // Plano picado: a forma prevista desta cobrança (sugerida na baixa).
        ...(input.paymentParts && installment.paymentMethod
          ? {
              paymentParts: [
                {
                  paymentMethod: installment.paymentMethod,
                  amountInCents: installment.amountInCents,
                },
              ],
            }
          : {}),
        ...(installment.customerDiscountInCents
          ? { customerDiscountInCents: installment.customerDiscountInCents }
          : {}),
        status: "open",
        overdue: false,
        createdAt: timestamp,
        updatedAt: timestamp,
      }),
    );
    if (renewedFrom) {
      renewedFrom.renewedByPlanId = plan.id;
      renewedFrom.updatedAt = timestamp;
    }
    this.patientPlans.push(plan);
    this.receivables.push(...installments);
    for (const item of plan.services)
      this.sessionMovements.push({
        id: uuid(),
        planId: plan.id,
        serviceId: item.serviceId,
        serviceName: item.serviceName,
        kind: "credit",
        quantity: item.totalSessions,
        reason: creditReason,
        createdAt: timestamp,
      });
    return plan;
  }

  assertRenewable(plan: PatientPlan) {
    if (plan.sourceTabId)
      throw new DomainError(
        "TAB_PLAN_MANAGED",
        "O serviço avulso deve ser administrado pela comanda de origem.",
        409,
      );
    if (plan.status === "cancelled") {
      throw new DomainError(
        "PLAN_CANCELLED",
        "Um plano cancelado não pode ser renovado.",
        409,
      );
    }
    if (plan.renewedByPlanId) {
      throw new DomainError(
        "PLAN_ALREADY_RENEWED",
        "Este plano já foi renovado.",
        409,
      );
    }
  }

  findExpenseClassification(
    clinicId: string,
    categoryId: string,
    costCenterId: string,
  ) {
    const category = this.financialCategories.find(
      (item) =>
        item.clinicId === clinicId &&
        item.id === categoryId &&
        item.kind === "expense" &&
        item.active,
    );
    const costCenter = this.costCenters.find(
      (item) =>
        item.clinicId === clinicId && item.id === costCenterId && item.active,
    );
    if (!category || !costCenter)
      throw new DomainError(
        "FINANCIAL_CLASSIFICATION_NOT_FOUND",
        "Categoria de despesa ou centro de custo não encontrado.",
        404,
      );
    return { category, costCenter };
  }

  recurringPayableFields(input: RecurringPayableInput) {
    return {
      description: input.description,
      ...(input.supplier ? { supplier: input.supplier } : {}),
      categoryId: input.categoryId,
      costCenterId: input.costCenterId,
      amountType: input.amountType,
      amountInCents: input.amountInCents,
      dayOfMonth: input.dayOfMonth,
      ...(input.reminderDaysBefore !== undefined
        ? { reminderDaysBefore: input.reminderDaysBefore }
        : {}),
      startMonth: input.startMonth,
      ...(input.endMonth ? { endMonth: input.endMonth } : {}),
      active: input.active,
    };
  }

  toRecurringPayable(model: StoredRecurringPayable): RecurringPayable {
    const lastCompetence = this.payables
      .filter((item) => item.recurringPayableId === model.id)
      .map((item) => item.competence!)
      .sort()
      .at(-1);
    return {
      ...model,
      categoryName:
        this.financialCategories.find((item) => item.id === model.categoryId)
          ?.name ?? "",
      costCenterName:
        this.costCenters.find((item) => item.id === model.costCenterId)?.name ??
        "",
      ...(lastCompetence ? { lastCompetence } : {}),
    };
  }

  changePayable(
    clinicId: string,
    payableId: string,
    operation: "payment" | "payment_reversal",
    paymentMethod?: PaymentMethod,
    timing?: PaymentTiming,
    payments?: PaymentPart[],
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
    if (operation === "payment" && payable.amountPending)
      throw new DomainError(
        "PAYABLE_AMOUNT_PENDING",
        "Informe o valor do mês antes de pagar esta conta.",
        409,
      );
    const commission = payable.commissionId
      ? this.commissions.find(
          (item) =>
            item.clinicId === clinicId && item.id === payable.commissionId,
        )
      : undefined;
    if (payable.commissionId && (!commission || commission.status !== expected))
      throw new DomainError(
        "COMMISSION_EXPENSE_STATE",
        "Concilie a situação da comissão com a despesa antes de continuar.",
        409,
      );
    // Despesa da folha: as comissões e os ajustes incluídos pagam (e estornam) junto.
    const payrollCommissions = this.commissions.filter(
        (item) =>
          item.clinicId === clinicId && item.payrollPayableId === payableId,
      ),
      payrollAdjustments = this.commissionAdjustments.filter(
        (item) =>
          item.clinicId === clinicId && item.payrollPayableId === payableId,
      );
    if (
      [...payrollCommissions, ...payrollAdjustments].some(
        (item) => item.status !== expected,
      )
    )
      throw new DomainError(
        "PAYROLL_EXPENSE_STATE",
        "Uma comissão desta folha mudou de situação; revise a folha antes de continuar.",
        409,
      );
    // Picado: as formas somam o valor da conta; o estorno devolve forma por forma.
    const parts =
      operation === "payment"
        ? resolvePaymentParts({
            payments,
            paymentMethod,
            amountInCents: payable.amountInCents,
          })
        : [];
    if (operation === "payment")
      assertPaymentParts(parts, payable.amountInCents);
    const reversedParts =
      operation === "payment_reversal"
        ? latestPaymentBatch(
            this.payablePaymentEvents.filter(
              (item) =>
                item.clinicId === clinicId && item.payableId === payableId,
            ),
          )
        : [];
    const previousMethod = payable.paymentMethod;
    payable.status = operation === "payment" ? "paid" : "open";
    if (operation === "payment_reversal")
      this.markPaymentProofsReversed(clinicId, "payable", payableId);
    payable.updatedAt = now();
    if (operation === "payment") {
      payable.paidAt = timing?.paidAt ?? payable.updatedAt;
      if (timing?.availableAt) payable.cashAvailableAt = timing.availableAt;
      payable.paymentMethod = parts[0]!.paymentMethod;
      const stored = storedPaymentParts(parts);
      if (stored) payable.paymentParts = stored;
      else delete payable.paymentParts;
      payable.overdue = false;
    } else {
      delete payable.paidAt;
      delete payable.paymentMethod;
      delete payable.paymentParts;
      payable.overdue = payable.dueDate < today();
    }
    for (const item of [
      ...(commission ? [commission] : []),
      ...payrollCommissions,
      ...payrollAdjustments,
    ]) {
      item.status = payable.status as "open" | "paid";
      if (payable.paidAt) item.paidAt = payable.paidAt;
      else delete item.paidAt;
    }
    const occurredAt = timing?.paidAt ?? now();
    const movements =
      operation === "payment"
        ? parts.map((part) => ({
            amountInCents: part.amountInCents,
            paymentMethod: part.paymentMethod as PaymentMethod | undefined,
          }))
        : reversedParts.length
          ? reversedParts.map((item) => ({
              amountInCents: -item.amountInCents,
              paymentMethod: item.paymentMethod,
            }))
          : [
              {
                amountInCents: -payable.amountInCents,
                paymentMethod: previousMethod,
              },
            ];
    for (const movement of movements)
      this.payablePaymentEvents.push({
        id: uuid(),
        clinicId,
        payableId,
        kind: operation === "payment" ? "payment" : "reversal",
        occurredAt,
        ...(operation === "payment" && payable.cashAvailableAt
          ? { availableAt: payable.cashAvailableAt }
          : {}),
        amountInCents: movement.amountInCents,
        ...(movement.paymentMethod
          ? { paymentMethod: movement.paymentMethod }
          : {}),
      });
    return payable;
  }

  consumeSession(appointment: Appointment) {
    // Atendimento de lead não tem plano: nunca consome sessão.
    if (!appointment.patientId) return;
    const appointmentDate = clinicDateOf(
      new Date(appointment.startsAt),
      this.clinicSettings.timezone,
    );
    const plans = this.patientPlans
      .filter(
        (plan) =>
          plan.clinicId === appointment.clinicId &&
          plan.patientId === appointment.patientId &&
          (!plan.sourceAppointmentId ||
            plan.sourceAppointmentId === appointment.id) &&
          plan.services.some(
            (item) => item.serviceId === appointment.serviceId,
          ) &&
          plan.status === "active" &&
          plan.validFrom <= appointmentDate &&
          (!plan.validUntil || plan.validUntil >= appointmentDate),
      )
      // O crédito pago na comanda deste atendimento tem prioridade sobre
      // qualquer outro plano válido para o serviço.
      .sort(
        (a, b) =>
          Number(b.sourceAppointmentId === appointment.id) -
            Number(a.sourceAppointmentId === appointment.id) ||
          (a.validUntil || "9999-12-31").localeCompare(
            b.validUntil || "9999-12-31",
          ),
      );
    const plan = plans[0];
    if (!plan) {
      if (
        this.patientTabs.some(
          (t) =>
            t.clinicId === appointment.clinicId &&
            t.services?.some((item) => item.appointmentId === appointment.id),
        ) ||
        this.patientPlans.some(
          (p) =>
            p.clinicId === appointment.clinicId &&
            p.sourceAppointmentId === appointment.id,
        )
      )
        throw new DomainError(
          "NO_SESSION_BALANCE",
          "Feche a comanda de origem para disponibilizar o crédito deste serviço.",
          409,
        );
      return;
    }
    const planService = plan.services.find(
      (item) => item.serviceId === appointment.serviceId,
    )!;
    if (planService.remainingSessions < 1) {
      throw new DomainError(
        "NO_SESSION_BALANCE",
        "O cliente não possui saldo de sessões para este serviço.",
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
    planService.remainingSessions -= 1;
    plan.remainingSessions = plan.services.reduce(
      (sum, item) => sum + item.remainingSessions,
      0,
    );
    if (plan.sourceTabId && plan.remainingSessions === 0)
      plan.status = "expired";
    plan.updatedAt = now();
    this.sessionMovements.push({
      id: uuid(),
      planId: plan.id,
      appointmentId: appointment.id,
      kind: appointmentMovements.some((item) => item.kind === "consumption")
        ? "adjustment"
        : "consumption",
      quantity: -1,
      serviceId: planService.serviceId,
      serviceName: planService.serviceName,
      reason: "Atendimento finalizado",
      createdAt: now(),
    });
  }

  restoreSession(appointment: Appointment) {
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
    const original = this.sessionMovements.find(
      (movement) =>
        movement.planId === plan.id &&
        movement.appointmentId === appointment.id &&
        movement.quantity < 0,
    )!;
    const planService = plan.services.find(
      (item) => item.serviceId === original.serviceId,
    )!;
    planService.remainingSessions += 1;
    plan.remainingSessions = plan.services.reduce(
      (sum, item) => sum + item.remainingSessions,
      0,
    );
    if (plan.sourceTabId && plan.status === "expired") plan.status = "active";
    plan.updatedAt = now();
    this.sessionMovements.push({
      id: uuid(),
      planId: plan.id,
      appointmentId: appointment.id,
      kind: alreadyReversed ? "adjustment" : "reversal",
      quantity: 1,
      serviceId: planService.serviceId,
      serviceName: planService.serviceName,
      reason: "Reversão do atendimento finalizado",
      createdAt: now(),
    });
  }

  refreshLeadTaskStats(lead: Lead) {
    const tasks = this.leadTasks.filter(
      (item) => item.clinicId === lead.clinicId && item.leadId === lead.id,
    );
    lead.openTasks = tasks.filter((item) => item.status === "open").length;
    lead.overdueTasks = tasks.filter(
      (item) => item.status === "open" && item.dueAt < now(),
    ).length;
  }

  receivedPayments(clinicId: string): ReceivedPayment[] {
    return this.receiptEvents
      .map((event) => {
        const item = this.receivables.find(
          (candidate) => candidate.id === event.receivableId,
        );
        if (!item || item.clinicId !== clinicId || !this.inBranchScope(item))
          return null;
        const tab = this.patientTabs.find(
          (candidate) => candidate.receivableId === item.id,
        );
        const correction = this.financialDateCorrections
          .filter(
            (item) =>
              item.clinicId === clinicId &&
              item.kind === "receivable" &&
              item.eventId === event.id,
          )
          .at(-1);
        return {
          id: event.id,
          receivableId: item.id,
          kind: event.kind,
          ...(item.planId || tab ? { sourceId: item.planId ?? tab!.id } : {}),
          occurredAt: correction?.occurredAt ?? event.occurredAt,
          ...(correction || event.availableAt
            ? { availableAt: correction?.availableAt ?? event.availableAt }
            : {}),
          patientId: item.patientId,
          patientName: item.patientName,
          description: item.description,
          amountInCents: event.amountInCents,
          ...(event.paymentMethod
            ? { paymentMethod: event.paymentMethod }
            : {}),
        };
      })
      .filter((item): item is ReceivedPayment => item !== null);
  }

  renderDocument(
    body: string,
    patient: Patient,
    plan?: PatientPlan,
    professional?: Professional,
  ) {
    return renderDocumentTemplate(
      body,
      documentTemplateValues({
        clinic: this.clinicSettings,
        patient,
        ...(plan
          ? {
              plan: {
                ...plan,
                services: formatPlanServices(plan.services),
              },
            }
          : {}),
        ...(professional ? { professional } : {}),
        issuedOn: new Date().toLocaleDateString("pt-BR"),
      }),
    );
  }

  channelAllowed(
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

  assertChannelAllowed(
    clinicId: string,
    patientId: string,
    channel: CommunicationPreference["channel"],
  ) {
    if (!this.channelAllowed(clinicId, patientId, channel))
      throw new DomainError(
        "COMMUNICATION_OPT_OUT",
        "O cliente não autorizou mensagens neste canal.",
        409,
      );
  }

  pushMessage(input: {
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

  toOutboundMessage(
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
      ...(() => {
        const survey = this.satisfactionSurveys.find(
          (item) =>
            item.clinicId === message.clinicId &&
            item.sourceMessageId === message.id,
        );
        return survey ? { satisfactionSurveyId: survey.id } : {};
      })(),
      ...(message.manualCompletion
        ? { manualCompletion: structuredClone(message.manualCompletion) }
        : {}),
    };
  }
}
