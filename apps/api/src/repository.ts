import type {
  WaitlistEntry,
  WaitlistEntryData,
  WaitlistEntryUpdate,
} from "@crm/contracts";
import type {
  AgendaNote,
  AgendaNoteInput,
  AgendaNoteUpdate,
  AgendaNoteScope,
} from "@crm/contracts";
import type {
  DocumentContent,
  DocumentDraftInput,
  DocumentPreview,
} from "@crm/contracts";
import type { Branch, BranchInput } from "@crm/contracts";
import type { OwnProfile, OwnProfileUpdate } from "@crm/contracts";
import type {
  CampaignRecipientStatus,
  CampaignRecipientUpdate,
  MessageImageMimeType,
  MessageTemplate,
  MessageTemplateImageContent,
  WhatsappCampaign,
  WhatsappCampaignDetail,
  WhatsappCampaignRecipientDraft,
} from "@crm/contracts";
import type { BranchScopeStore } from "./storage/branch-scope.js";
import type {
  ExternalOperation,
  ExternalOperationInput,
  ExternalOperationContent,
} from "@crm/contracts";
import type { PlanPurchaseInput, PlanPurchaseResult } from "@crm/contracts";
import type {
  PaymentTiming,
  FinancialDatesInput,
  SettlementAdjustments,
} from "@crm/contracts";
import type {
  AdministrativeRegistryInput,
  AdministrativeRegistryWorkspace,
} from "@crm/contracts";
import type {
  DocumentSignatureInput,
  DocumentSignatureContent,
} from "@crm/contracts";
import type {
  ProductUpdateInput,
  PatientTabItemUpdate,
  PatientTabServiceInput,
  Supplier,
  SupplierInput,
  ManualReceivableInput,
  FinancialClassification,
  DreGroup,
  DreReport,
  Receivable,
} from "@crm/contracts";
import type { ClinicalSource } from "@crm/contracts";
import type { ClinicalResource, ClinicalResourceInput } from "@crm/contracts";
import type { PatientMergeInput, PatientMergePreview } from "@crm/contracts";
import type {
  ClinicCatalogEntry,
  ClinicCatalogInput,
  ClinicCatalogKind,
} from "@crm/contracts";
import type {
  AdminAuditEvent,
  AdminAuditPage,
  AdminUser,
  AdminUserCommissionInput,
  AdminUserInput,
  AdminUserUpdate,
  AppModule,
  Appointment,
  AppointmentInput,
  AppointmentRescheduleEvent,
  AppointmentRescheduleInput,
  AppointmentStatus,
  AppointmentUpdateInput,
  AssessmentTemplate,
  AssessmentTemplateInput,
  AuditHistoryFilters,
  BirthdayEntry,
  BroadcastMessageDraft,
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
  ClinicSettings,
  ClinicSettingsInput,
  AutoFinalizationSettings,
  AutoFinalizationSettingsInput,
  NavTabLabel,
  NavTabLabelsInput,
  CommissionEntry,
  CommissionRule,
  CommissionRuleInput,
  CommunicationCenter,
  CommunicationPreference,
  CommunicationPreferenceInput,
  ContactActivity,
  ContactActivityInput,
  ContactSuggestion,
  CostCenter,
  CostCenterInput,
  DailyCash,
  DashboardSummary,
  DocumentStatus,
  DocumentTemplate,
  DocumentTemplateInput,
  FinancialCategory,
  FinancialCategoryInput,
  FinancialSummary,
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
  GuidedPatientInput,
  GuidedPatientResult,
  HistoryActor,
  Holiday,
  HolidayInput,
  InventoryWorkspace,
  IssuedDocument,
  IssuedDocumentInput,
  Lead,
  LeadActivity,
  LeadAppointmentInput,
  LeadContact,
  LeadContactInput,
  LeadConversion,
  LeadConversionInput,
  LeadDuplicateMatch,
  LeadFilter,
  LeadFilterOptions,
  LeadStageConfig,
  LeadStagesInput,
  LeadInsights,
  LeadPage,
  LeadStagePage,
  LeadDuplicateQuery,
  LeadInput,
  LeadStage,
  LeadTask,
  LeadTaskInput,
  LeadTaskStatus,
  ManagementReport,
  TeamProductionSources,
  ManualMessageInput,
  OutboundMessage,
  Patient,
  PatientInput,
  PatientPlan,
  PatientPlanInput,
  PatientTab,
  PatientTabCloseInput,
  PatientTabInput,
  PatientTabItemInput,
  PatientTag,
  PatientTagInput,
  PatientTagUpdate,
  PatientTimelineEntry,
  Payable,
  PayableInput,
  PaymentMethod,
  PaymentReceipt,
  PlanCatalogEntry,
  PlanCatalogInput,
  PlanRenewalInput,
  PlanPauseDetails,
  PlanStatus,
  PlanTemplate,
  PlanTemplateInput,
  PlanTemplateUpdate,
  Product,
  ProductInput,
  Professional,
  ProfessionalInput,
  ReceivableRenegotiation,
  ReceivableRenegotiationInput,
  ReceivedPayment,
  RecurringAppointmentInput,
  RecurringPayable,
  RecurringPayableInput,
  RelationshipSettings,
  ReminderGenerationResult,
  ReplacementBookingInput,
  ReplacementCredit,
  Room,
  RoomInput,
  SaleMovement,
  SalesReport,
  SalesPeriodReport,
  SatisfactionSurvey,
  SatisfactionSurveyInput,
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
  UserSummary,
} from "@crm/contracts";

export interface AuthenticatedUser extends UserSummary {
  sessionVersion?: number;
  /** Acessa todas as filiais (admin: sempre). */
  allBranches?: boolean;
  /** Filiais do usuário quando `allBranches` é `false`. */
  branchIds?: string[];
  clinicId: string;
  /** `true` quando há módulos ou edição gravados para o usuário comum (admin: `false`). */
  customModules: boolean;
  passwordHash: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Pedido de recálculo retroativo ao gravar regras de comissão. `expectedDigest` (da prévia
 * confirmada na tela) recusa a gravação se as comissões mudaram desde a prévia.
 */
export interface CommissionRecalculationRequest {
  expectedDigest?: string;
}

export interface ClinicRepository {
  /** Lista de espera das filiais da leitura, da entrada mais antiga para a mais nova. */
  listWaitlist(clinicId: string): Promise<WaitlistEntry[]>;
  createWaitlistEntry(
    clinicId: string,
    actorUserId: string,
    input: WaitlistEntryData,
  ): Promise<WaitlistEntry>;
  updateWaitlistEntry(
    clinicId: string,
    actorUserId: string,
    id: string,
    input: WaitlistEntryUpdate,
  ): Promise<WaitlistEntry | null>;
  deleteWaitlistEntry(clinicId: string, id: string): Promise<boolean>;

  listAgendaNotes(
    clinicId: string,
    from: string,
    to: string,
    professionalScope?: string,
  ): Promise<AgendaNote[]>;
  createAgendaNotes(
    clinicId: string,
    actorUserId: string,
    input: AgendaNoteInput,
  ): Promise<AgendaNote[]>;
  updateAgendaNote(
    clinicId: string,
    actorUserId: string,
    id: string,
    input: AgendaNoteUpdate,
    scope: AgendaNoteScope,
    professionalScope?: string,
  ): Promise<AgendaNote[] | null>;
  deleteAgendaNote(
    clinicId: string,
    actorUserId: string,
    id: string,
    scope: AgendaNoteScope,
    professionalScope?: string,
  ): Promise<boolean>;

  /** Filial da requisição em curso (ver `storage/branch-scope.ts`). */
  readonly branchScope: BranchScopeStore;
  /** Todas as filiais da clínica (ativas e inativas), a padrão primeiro. */
  listBranches(clinicId: string): Promise<Branch[]>;
  /**
   * Cria (`id` ausente) ou altera a filial. `null` = filial inexistente; BRANCH_NAME_DUPLICATE
   * (409) e BRANCH_DEFAULT_INACTIVE (409, a padrão não pode ser desativada).
   */
  saveBranch(
    clinicId: string,
    actorUserId: string,
    input: BranchInput,
    id?: string,
  ): Promise<Branch | null>;
  getCommissionReconciliationPreview(
    clinicId: string,
    id: string,
  ): Promise<import("@crm/contracts").CommissionReconciliationPreview>;
  reconcileCommission(
    clinicId: string,
    actorId: string,
    id: string,
    input: import("@crm/contracts").CommissionReconciliationInput,
  ): Promise<import("@crm/contracts").CommissionReconciliation>;
  settleCommissionAccount(
    clinicId: string,
    actorId: string,
    id: string,
    professionalId: string,
    expectedAmountInCents: number,
  ): Promise<import("@crm/contracts").CommissionAccountPayment>;
  reverseCommissionAccountPayment(
    clinicId: string,
    actorId: string,
    paymentId: string,
  ): Promise<import("@crm/contracts").CommissionAccountPayment>;
  updateProduct(
    clinicId: string,
    actorUserId: string,
    id: string,
    input: ProductUpdateInput,
  ): Promise<Product | null>;
  updatePatientTabItem(
    clinicId: string,
    actorUserId: string,
    tabId: string,
    itemId: string,
    input: PatientTabItemUpdate | null,
  ): Promise<PatientTab>;
  addPatientTabService(
    clinicId: string,
    actorUserId: string,
    tabId: string,
    input: PatientTabServiceInput,
  ): Promise<PatientTab>;
  removePatientTabService(
    clinicId: string,
    actorUserId: string,
    tabId: string,
    itemId: string,
  ): Promise<PatientTab>;
  createPatientTabAppointment(
    clinicId: string,
    actorUserId: string,
    tabId: string,
    input: Omit<AppointmentInput, "patientId">,
  ): Promise<PatientTab>;
  listSuppliers(clinicId: string): Promise<Supplier[]>;
  saveSupplier(
    clinicId: string,
    actorUserId: string,
    input: SupplierInput,
    id?: string,
  ): Promise<Supplier | null>;
  createManualReceivable(
    clinicId: string,
    actorUserId: string,
    input: ManualReceivableInput,
  ): Promise<Receivable>;
  classifyFinancialEntry(
    clinicId: string,
    actorUserId: string,
    kind: "receivable" | "payable",
    id: string,
    input: FinancialClassification,
  ): Promise<Receivable | Payable>;
  setFinancialDates(
    clinicId: string,
    actorUserId: string,
    kind: "receivable" | "payable",
    id: string,
    input: FinancialDatesInput,
  ): Promise<Receivable | Payable>;
  setCategoryDreGroup(
    clinicId: string,
    actorUserId: string,
    id: string,
    dreGroup: DreGroup,
  ): Promise<FinancialCategory | null>;
  getDreReport(
    clinicId: string,
    from: string,
    to: string,
    costCenterId?: string,
  ): Promise<DreReport>;
  listClinicalSources(
    clinicId: string,
    patientId?: string,
  ): Promise<ClinicalSource[]>;
  listClinicalResources(
    clinicId: string,
    actorUserId: string,
    patientId?: string,
    action?: "read" | "export",
    catalogOnly?: boolean,
  ): Promise<ClinicalResource[]>;
  saveClinicalResource(
    clinicId: string,
    actorUserId: string,
    input: ClinicalResourceInput,
    id?: string,
  ): Promise<ClinicalResource>;
  finalizeClinicalResource(
    clinicId: string,
    actorUserId: string,
    id: string,
  ): Promise<ClinicalResource>;
  completeManualMessage(
    clinicId: string,
    actorUserId: string,
    messageId: string,
    status: "sent" | "cancelled",
  ): Promise<OutboundMessage>;
  revokeUserSessions(
    clinicId: string,
    actorUserId: string,
    userId: string,
  ): Promise<void>;
  recordReplacementAttendance(
    clinicId: string,
    actorUserId: string,
    attendanceId: string,
    status: Exclude<GroupAttendance["outcome"], undefined | "scheduled">,
  ): Promise<GroupAttendance>;
  updateGroupSessionProfessional(
    clinicId: string,
    actorUserId: string,
    sessionId: string,
    professionalId: string,
  ): Promise<GroupSession>;
  getPatient(clinicId: string, patientId: string): Promise<Patient | null>;
  setPatientStatus(
    clinicId: string,
    actorUserId: string,
    patientId: string,
    status: Patient["status"],
  ): Promise<Patient | null>;
  previewInactivePatients(clinicId: string, months: number): Promise<Patient[]>;
  inactivatePatients(
    clinicId: string,
    actorUserId: string,
    months: number,
    patientIds: string[],
  ): Promise<{ changed: number; skipped: number }>;
  previewPatientMerge(
    clinicId: string,
    sourceId: string,
    targetId: string,
  ): Promise<PatientMergePreview>;
  mergePatients(
    clinicId: string,
    actorUserId: string,
    input: PatientMergeInput,
  ): Promise<Patient>;
  getAdministrativeRegistry(
    clinicId: string,
  ): Promise<AdministrativeRegistryWorkspace>;
  updateAdministrativeRegistry(
    clinicId: string,
    actorUserId: string,
    id: string,
    input: AdministrativeRegistryInput,
  ): Promise<Professional | Room | Service>;
  listClinicCatalog(
    clinicId: string,
    kind: ClinicCatalogKind,
  ): Promise<ClinicCatalogEntry[]>;
  saveClinicCatalog(
    clinicId: string,
    actorUserId: string,
    kind: ClinicCatalogKind,
    input: ClinicCatalogInput,
    id?: string,
  ): Promise<ClinicCatalogEntry | null>;
  findUserByEmail(email: string): Promise<AuthenticatedUser | null>;
  findUserById(
    clinicId: string,
    userId: string,
  ): Promise<AuthenticatedUser | null>;
  listAdminUsers(clinicId: string): Promise<AdminUser[]>;
  /** Cria o usuário e, se `input.commission` vier, a regra de comissão dele (mesma transação). */
  createAdminUser(
    clinicId: string,
    actorUserId: string,
    input: AdminUserInput,
    passwordHash: string,
    /** Recalcula as comissões alcançadas pelas regras gravadas (mesma transação). */
    recalculation?: CommissionRecalculationRequest,
  ): Promise<AdminUser>;
  updateAdminUser(
    clinicId: string,
    actorUserId: string,
    userId: string,
    input: AdminUserUpdate,
    /** Recalcula as comissões alcançadas pelas regras gravadas (mesma transação). */
    recalculation?: CommissionRecalculationRequest,
  ): Promise<AdminUser | null>;
  resetAdminUserPassword(
    clinicId: string,
    actorUserId: string,
    userId: string,
    passwordHash: string,
  ): Promise<boolean>;
  /** Perfil do próprio usuário (foto e profissional ligado); `null` = usuário inexistente. */
  getOwnProfile(clinicId: string, userId: string): Promise<OwnProfile | null>;
  /**
   * O usuário altera o próprio nome e foto e, com profissional ligado, o nome e a cor dele na
   * agenda (mesma transação). `null` = usuário inexistente.
   */
  updateOwnProfile(
    clinicId: string,
    userId: string,
    input: OwnProfileUpdate,
  ): Promise<OwnProfile | null>;
  /**
   * Liga o usuário a um profissional da agenda (`professionals.user_id`) ou desliga (`null`).
   * Um usuário tem no máximo um profissional: ligar outro desliga o anterior. `null` = usuário
   * inexistente; PROFESSIONAL_NOT_FOUND (404) e PROFESSIONAL_ALREADY_LINKED (409, de outro usuário).
   */
  setAdminUserProfessional(
    clinicId: string,
    actorUserId: string,
    userId: string,
    professionalId: string | null,
  ): Promise<AdminUser | null>;
  /**
   * Nova regra de comissão do próprio usuário (`commission_rules.user_id`); não exige profissional
   * ligado. Na geração, prevalece sobre a regra do profissional ligado ao usuário. `null` =
   * usuário inexistente. Vigência já existente = correção do percentual dela (mesmo valor não muda
   * nada); COMMISSION_RULE_DUPLICATE (409) se essa regra já tem lançamentos de comissão.
   */
  setAdminUserCommission(
    clinicId: string,
    actorUserId: string,
    userId: string,
    input: AdminUserCommissionInput,
    /** Recalcula as comissões alcançadas pela regra (mesma transação). */
    recalculation?: CommissionRecalculationRequest,
  ): Promise<AdminUser | null>;
  getClinicSettings(clinicId: string): Promise<ClinicSettings | null>;
  updateClinicSettings(
    clinicId: string,
    actorUserId: string,
    input: ClinicSettingsInput,
  ): Promise<ClinicSettings>;
  /** Finalização automática da clínica (nunca configurada = desligada, 60 min). */
  getAutoFinalizationSettings(
    clinicId: string,
  ): Promise<AutoFinalizationSettings>;
  updateAutoFinalizationSettings(
    clinicId: string,
    actorUserId: string,
    input: AutoFinalizationSettingsInput,
  ): Promise<AutoFinalizationSettings>;
  /** Nomes das abas do menu da clínica (padrão onde não foram renomeadas), na ordem. */
  listNavTabLabels(clinicId: string): Promise<NavTabLabel[]>;
  /** Renomeia as abas do menu da clínica (vale para todas as filiais). */
  saveNavTabLabels(
    clinicId: string,
    input: NavTabLabelsInput,
  ): Promise<NavTabLabel[]>;
  listAdminAuditEvents(clinicId: string): Promise<AdminAuditEvent[]>;
  listAdminAuditPage(
    clinicId: string,
    cursor?: string,
    filters?: AuditHistoryFilters,
  ): Promise<AdminAuditPage>;
  listHistoryActors(clinicId: string): Promise<HistoryActor[]>;
  /** Registra um evento na auditoria administrativa (ex.: `patients.exported`). */
  recordAdminAuditEvent(
    clinicId: string,
    actorUserId: string,
    action: string,
    entityType: string,
    metadata?: Record<string, unknown>,
    entityId?: string,
  ): Promise<void>;
  /** Devolve os padrões quando a clínica ainda não salvou configurações. */
  getRelationshipSettings(clinicId: string): Promise<RelationshipSettings>;
  updateRelationshipSettings(
    clinicId: string,
    input: RelationshipSettings,
  ): Promise<RelationshipSettings>;
  /** Por data crescente. `from`/`to` (aaaa-mm-dd) são inclusivos e opcionais. */
  listHolidays(
    clinicId: string,
    from?: string,
    to?: string,
  ): Promise<Holiday[]>;
  /** Uma data só pode ter um feriado por clínica (409 `HOLIDAY_DUPLICATE`). */
  createHoliday(clinicId: string, input: HolidayInput): Promise<Holiday>;
  /** `false` quando o feriado não existe na clínica. */
  deleteHoliday(clinicId: string, holidayId: string): Promise<boolean>;
  /**
   * Sugestões de contato do dia (data da clínica), já filtradas pelos módulos que o usuário vê
   * (parcela vencida só para quem vê o Financeiro).
   */
  listContactSuggestions(
    clinicId: string,
    modules: readonly AppModule[],
  ): Promise<ContactSuggestion[]>;
  createContactActivity(
    clinicId: string,
    actorUserId: string,
    input: ContactActivityInput,
  ): Promise<ContactActivity>;
  /** Aniversariantes ativos do mês `aaaa-mm`, por dia. */
  listBirthdays(clinicId: string, month: string): Promise<BirthdayEntry[]>;
  /** Mais recentes primeiro. */
  listContactActivities(
    clinicId: string,
    patientId?: string,
  ): Promise<ContactActivity[]>;
  /**
   * Registra a nota NPS. Com atendimento: precisa ser do cliente e estar
   * `completed`; no máximo uma pesquisa por atendimento (409).
   */
  createSatisfactionSurvey(
    clinicId: string,
    actorUserId: string,
    input: SatisfactionSurveyInput,
  ): Promise<SatisfactionSurvey>;
  /**
   * Mais recentes primeiro. `from`/`to` (aaaa-mm-dd, inclusivos) comparam a
   * data de registro no fuso da clínica; sem limite quando omitidos.
   */
  listSatisfactionSurveys(
    clinicId: string,
    filter?: {
      from?: string | undefined;
      to?: string | undefined;
      patientId?: string | undefined;
    },
  ): Promise<SatisfactionSurvey[]>;
  /**
   * Histórico do cliente (mais recentes primeiro), sem conteúdo clínico.
   * `null` quando o cliente não existe na clínica.
   */
  getPatientTimeline(
    clinicId: string,
    patientId: string,
  ): Promise<PatientTimelineEntry[] | null>;
  /** `professionalIds`: só a agenda desses profissionais (ausente = todos). */
  getDashboard(
    clinicId: string,
    date: string,
    professionalIds?: readonly string[],
  ): Promise<DashboardSummary>;
  listPatients(clinicId: string, search?: string): Promise<Patient[]>;
  createPatient(clinicId: string, input: PatientInput): Promise<Patient>;
  /**
   * Cadastro guiado (`POST /patients/guided`): cria o cliente e o próximo passo — atendimento
   * experimental, plano (com matrícula opcional em turma de um serviço incluído) ou avulso — tudo ou
   * nada. Etiquetas e feriados já foram validados na rota; conflitos de agenda, turma
   * (`GROUP_OR_PATIENT_NOT_FOUND`, `GROUP_SERVICE_MISMATCH`) e plano usam as regras dos fluxos
   * existentes.
   */
  createPatientWithNextStep(
    clinicId: string,
    actorUserId: string,
    input: GuidedPatientInput,
  ): Promise<GuidedPatientResult>;
  /**
   * Ids dos assinantes sem turma vinculada: plano ativo (dentro da validade) que não é avulso e
   * sem matrícula ativa em turma ativa do serviço desse plano.
   */
  listSubscriberIdsWithoutGroup(clinicId: string): Promise<string[]>;
  /**
   * Cria os clientes importados de uma vez (tudo ou nada), ignorando os que já existem na base
   * no momento da gravação (mesmo CPF ou telefone, comparando só os dígitos).
   */
  importPatients(
    clinicId: string,
    inputs: PatientInput[],
  ): Promise<{ created: number; skipped: number }>;
  updatePatient(
    clinicId: string,
    patientId: string,
    input: PatientInput,
  ): Promise<Patient | null>;
  /** Etiquetas configuradas da clínica, por nome (pt-BR), com quantos clientes usam cada uma. */
  listPlanCatalog(clinicId: string): Promise<PlanCatalogEntry[]>;
  createPlanCatalogEntry(
    clinicId: string,
    actorUserId: string,
    input: PlanCatalogInput,
  ): Promise<PlanCatalogEntry>;
  updatePlanCatalogEntry(
    clinicId: string,
    actorUserId: string,
    id: string,
    input: PlanCatalogInput,
  ): Promise<PlanCatalogEntry | null>;
  deletePlanCatalogEntry(
    clinicId: string,
    actorUserId: string,
    id: string,
  ): Promise<boolean>;

  listPatientTags(clinicId: string): Promise<PatientTag[]>;
  /**
   * Clientes com parcela vencida e em aberto (`status = open` e vencimento antes de `today`),
   * base da etiqueta automática "Pagamento atrasado" (QC7).
   */
  listOverduePatientIds(clinicId: string, today: string): Promise<string[]>;
  /**
   * Cria a etiqueta (auditoria `patient_tag.created`). Nome igual a outro da clínica sem
   * diferenciar maiúsculas/acentos: 409 `PATIENT_TAG_DUPLICATE`.
   */
  createPatientTag(
    clinicId: string,
    actorUserId: string,
    input: PatientTagInput,
  ): Promise<PatientTag>;
  /**
   * Renomeia e/ou troca a cor (auditoria `patient_tag.updated`). Renomear troca o nome nas
   * etiquetas dos clientes, tudo junto. Nome de outra etiqueta: 409 `PATIENT_TAG_DUPLICATE`.
   * `null` quando a etiqueta não existe na clínica.
   */
  updatePatientTag(
    clinicId: string,
    actorUserId: string,
    tagId: string,
    input: PatientTagUpdate,
  ): Promise<PatientTag | null>;
  /**
   * Exclui a etiqueta (auditoria `patient_tag.deleted`); `false` quando não existe. Em uso por
   * algum cliente: 409 `PATIENT_TAG_IN_USE` com `details.patientCount`.
   */
  deletePatientTag(
    clinicId: string,
    actorUserId: string,
    tagId: string,
  ): Promise<boolean>;
  listProfessionals(clinicId: string): Promise<Professional[]>;
  createProfessional(
    clinicId: string,
    input: ProfessionalInput,
  ): Promise<Professional>;
  listRooms(clinicId: string): Promise<Room[]>;
  createRoom(clinicId: string, input: RoomInput): Promise<Room>;
  listServices(clinicId: string): Promise<Service[]>;
  createService(clinicId: string, input: ServiceInput): Promise<Service>;
  listAppointments(
    clinicId: string,
    from: string,
    to: string,
  ): Promise<Appointment[]>;
  /** Agendados/confirmados com término antes de `now` (pendentes de finalização). */
  listPendingFinalizationAppointments(
    clinicId: string,
    now: string,
  ): Promise<Appointment[]>;
  /**
   * Finalização automática: marca como realizados os agendados/confirmados de todas as filiais
   * com término até `cutoff`, gravando `autoCompletedAt = at` e consumindo a sessão do plano.
   * Quem não puder ser finalizado (ex.: sem saldo) segue pendente. Devolve quantos finalizou.
   */
  autoFinalizeAppointments(
    clinicId: string,
    cutoff: string,
    at: string,
  ): Promise<number>;
  createAppointment(
    clinicId: string,
    input: AppointmentInput,
  ): Promise<Appointment>;
  rescheduleAppointment(
    clinicId: string,
    actorUserId: string,
    appointmentId: string,
    input: AppointmentRescheduleInput,
  ): Promise<Appointment | null>;
  listAppointmentReschedules(
    clinicId: string,
    appointmentId: string,
  ): Promise<AppointmentRescheduleEvent[] | null>;
  /** Serviço do atendimento (para checar os vínculos ao remarcar); `null` = não encontrado. */
  findAppointmentServiceId(
    clinicId: string,
    appointmentId: string,
  ): Promise<string | null>;
  /** Atendimento da clínica pelo id; `null` = não encontrado. */
  findAppointment(
    clinicId: string,
    appointmentId: string,
  ): Promise<Appointment | null>;
  /**
   * Altera serviço, sala e observação de um atendimento agendado/confirmado (QM6), com a
   * mesma checagem de conflito da criação e auditoria `appointment.updated`; `null` = não
   * encontrado.
   */
  updateAppointment(
    clinicId: string,
    actorUserId: string,
    appointmentId: string,
    input: AppointmentUpdateInput,
  ): Promise<Appointment | null>;
  createRecurringAppointments(
    clinicId: string,
    input: RecurringAppointmentInput,
  ): Promise<Appointment[]>;
  listScheduleBlocks(
    clinicId: string,
    from: string,
    to: string,
  ): Promise<ScheduleBlock[]>;
  createScheduleBlock(
    clinicId: string,
    input: ScheduleBlockInput,
  ): Promise<ScheduleBlock>;
  cancelScheduleBlock(
    clinicId: string,
    blockId: string,
  ): Promise<ScheduleBlock | null>;
  getGroupWorkspace(
    clinicId: string,
    from: string,
    to: string,
  ): Promise<GroupWorkspace>;
  createGroupClass(
    clinicId: string,
    input: GroupClassInput,
  ): Promise<GroupClass>;
  updateGroupClass(
    clinicId: string,
    groupId: string,
    input: GroupClassUpdateInput,
  ): Promise<GroupClass | null>;
  renameGroupClass(
    clinicId: string,
    groupId: string,
    name: string,
  ): Promise<GroupClass | null>;
  createGroupEnrollment(
    clinicId: string,
    input: GroupEnrollmentInput,
  ): Promise<GroupEnrollment>;
  cancelGroupEnrollment(
    clinicId: string,
    enrollmentId: string,
  ): Promise<GroupEnrollment | null>;
  listGroupSessions(
    clinicId: string,
    from: string,
    to: string,
  ): Promise<GroupSession[]>;
  recordGroupAttendance(
    clinicId: string,
    actorUserId: string,
    sessionId: string,
    patientId: string,
    input: GroupAttendanceInput,
  ): Promise<GroupAttendance>;
  completeGroupSession(
    clinicId: string,
    sessionId: string,
  ): Promise<GroupSession | null>;
  bookReplacement(
    clinicId: string,
    actorUserId: string,
    input: ReplacementBookingInput,
  ): Promise<{ attendance: GroupAttendance; credit: ReplacementCredit }>;
  getInventoryWorkspace(clinicId: string): Promise<InventoryWorkspace>;
  createProduct(
    clinicId: string,
    actorUserId: string,
    input: ProductInput,
  ): Promise<Product>;
  createStockMovement(
    clinicId: string,
    actorUserId: string,
    input: StockMovementInput,
  ): Promise<StockMovement>;
  openPatientTab(
    clinicId: string,
    actorUserId: string,
    input: PatientTabInput,
  ): Promise<PatientTab>;
  addPatientTabItem(
    clinicId: string,
    actorUserId: string,
    tabId: string,
    input: PatientTabItemInput,
  ): Promise<PatientTab | null>;
  closePatientTab(
    clinicId: string,
    actorUserId: string,
    tabId: string,
    input: PatientTabCloseInput,
  ): Promise<PatientTab | null>;
  cancelPatientTab(
    clinicId: string,
    actorUserId: string,
    tabId: string,
  ): Promise<PatientTab | null>;
  /** Venda de produtos em uma etapa: abre, preenche e fecha a comanda de forma atômica. */
  createProductSale(
    clinicId: string,
    actorUserId: string,
    input: import("@crm/contracts").ProductSaleInput,
  ): Promise<PatientTab>;
  createAbsenceSuccessor(
    clinicId: string,
    actorUserId: string,
    id: string,
    input: AppointmentRescheduleInput,
  ): Promise<Appointment>;
  updateAppointmentStatus(
    clinicId: string,
    appointmentId: string,
    status: AppointmentStatus,
    absenceReason?: string,
  ): Promise<Appointment | null>;
  listClinicalRecords(
    clinicId: string,
    patientId?: string,
  ): Promise<ClinicalRecord[]>;
  saveClinicalRecord(
    clinicId: string,
    authorUserId: string,
    input: ClinicalRecordInput,
  ): Promise<ClinicalRecord>;
  finalizeClinicalRecord(
    clinicId: string,
    authorUserId: string,
    recordId: string,
  ): Promise<ClinicalRecord | null>;
  listClinicalRecordRevisions(
    clinicId: string,
    recordId: string,
  ): Promise<ClinicalRecordRevision[]>;
  getClinicalWorkspace(
    clinicId: string,
    patientId: string,
    actorUserId: string,
    accessAction?: "read" | "export",
  ): Promise<ClinicalWorkspace | null>;
  saveAssessmentTemplate(
    clinicId: string,
    actorUserId: string,
    input: AssessmentTemplateInput,
    id?: string,
  ): Promise<AssessmentTemplate>;
  createAssessmentTemplate(
    clinicId: string,
    input: AssessmentTemplateInput,
  ): Promise<AssessmentTemplate>;
  createClinicalAssessment(
    clinicId: string,
    authorUserId: string,
    input: ClinicalAssessmentInput,
  ): Promise<ClinicalAssessment>;
  createTherapeuticGoal(
    clinicId: string,
    authorUserId: string,
    input: TherapeuticGoalInput,
  ): Promise<TherapeuticGoal>;
  updateTherapeuticGoalStatus(
    clinicId: string,
    goalId: string,
    status: TherapeuticGoalStatus,
  ): Promise<TherapeuticGoal | null>;
  createClinicalMeasurement(
    clinicId: string,
    authorUserId: string,
    input: ClinicalMeasurementInput,
  ): Promise<ClinicalMeasurement>;
  createTreatmentClosure(
    clinicId: string,
    authorUserId: string,
    input: TreatmentClosureInput,
  ): Promise<TreatmentClosure>;
  createClinicalAttachment(
    clinicId: string,
    authorUserId: string,
    input: ClinicalAttachmentInput,
  ): Promise<ClinicalAttachment>;
  getClinicalAttachmentContent(
    clinicId: string,
    actorUserId: string,
    attachmentId: string,
  ): Promise<ClinicalAttachmentContent | null>;
  createClinicalAddendum(
    clinicId: string,
    authorUserId: string,
    input: ClinicalAddendumInput,
  ): Promise<ClinicalAddendum>;
  createClinicalAlert(
    clinicId: string,
    authorUserId: string,
    input: ClinicalAlertInput,
  ): Promise<ClinicalAlert>;
  /** Tira o alerta do prontuário; `false` se não existe ou já foi removido. */
  archiveClinicalAlert(clinicId: string, alertId: string): Promise<boolean>;
  listClinicalAccessEvents(
    clinicId: string,
    patientId: string,
  ): Promise<ClinicalAccessEvent[]>;
  listPlanTemplates(clinicId: string): Promise<PlanTemplate[]>;
  createPlanTemplate(
    clinicId: string,
    actorUserId: string,
    input: PlanTemplateInput,
  ): Promise<PlanTemplate>;
  updatePlanTemplate(
    clinicId: string,
    actorUserId: string,
    id: string,
    input: PlanTemplateUpdate,
  ): Promise<PlanTemplate | null>;
  listPatientPlans(
    clinicId: string,
    patientId?: string,
  ): Promise<PatientPlan[]>;
  listExternalOperations(
    clinicId: string,
    patientId?: string,
  ): Promise<ExternalOperation[]>;
  createExternalOperation(
    clinicId: string,
    actorUserId: string,
    input: ExternalOperationInput,
  ): Promise<ExternalOperation>;
  getExternalOperationContent(
    clinicId: string,
    actorUserId: string,
    id: string,
  ): Promise<ExternalOperationContent | null>;
  purchasePatientPlan(
    clinicId: string,
    actorUserId: string,
    input: PlanPurchaseInput,
  ): Promise<PlanPurchaseResult>;
  createPatientPlan(
    clinicId: string,
    actorUserId: string,
    input: PatientPlanInput,
  ): Promise<PatientPlan>;
  updatePatientPlanStatus(
    clinicId: string,
    actorUserId: string,
    planId: string,
    status: PlanStatus,
    pause?: PlanPauseDetails,
  ): Promise<PatientPlan | null>;
  renewPatientPlan(
    clinicId: string,
    actorUserId: string,
    planId: string,
    input: PlanRenewalInput,
  ): Promise<PatientPlan | null>;
  updatePatientPlanAutoRenew(
    clinicId: string,
    actorUserId: string,
    planId: string,
    autoRenew: boolean,
  ): Promise<PatientPlan | null>;
  /** Cria o período seguinte dos planos com renovação automática já vencidos. */
  renewDuePatientPlans(clinicId: string, actorUserId: string): Promise<number>;
  listSessionMovements(
    clinicId: string,
    planId: string,
  ): Promise<SessionMovement[]>;
  getFinancialSummary(clinicId: string): Promise<FinancialSummary>;
  settleReceivable(
    clinicId: string,
    actorUserId: string,
    receivableId: string,
    paymentMethod: PaymentMethod,
    timing?: PaymentTiming,
    adjustments?: SettlementAdjustments,
  ): Promise<FinancialSummary["receivables"][number] | null>;
  reverseReceivablePayment(
    clinicId: string,
    actorUserId: string,
    receivableId: string,
  ): Promise<FinancialSummary["receivables"][number] | null>;
  adjustReceivable(
    clinicId: string,
    actorUserId: string,
    receivableId: string,
    amountInCents: number,
    reason: string,
  ): Promise<FinancialSummary["receivables"][number] | null>;
  getPaymentReceipt(
    clinicId: string,
    receivableId: string,
  ): Promise<PaymentReceipt | null>;
  getFinancialWorkspace(clinicId: string): Promise<FinancialWorkspace>;
  createFinancialCategory(
    clinicId: string,
    input: FinancialCategoryInput,
  ): Promise<FinancialCategory>;
  createCostCenter(
    clinicId: string,
    input: CostCenterInput,
  ): Promise<CostCenter>;
  createPayable(
    clinicId: string,
    actorUserId: string,
    input: PayableInput,
  ): Promise<Payable>;
  settlePayable(
    clinicId: string,
    actorUserId: string,
    payableId: string,
    paymentMethod: PaymentMethod,
    timing?: PaymentTiming,
  ): Promise<Payable | null>;
  reversePayablePayment(
    clinicId: string,
    actorUserId: string,
    payableId: string,
  ): Promise<Payable | null>;
  listRecurringPayables(clinicId: string): Promise<RecurringPayable[]>;
  createRecurringPayable(
    clinicId: string,
    actorUserId: string,
    input: RecurringPayableInput,
  ): Promise<RecurringPayable>;
  /** Substitui os dados do modelo; reativar marca o mês atual como retomada. */
  updateRecurringPayable(
    clinicId: string,
    actorUserId: string,
    recurringPayableId: string,
    input: RecurringPayableInput,
  ): Promise<RecurringPayable | null>;
  /** Exclui um modelo que ainda não gerou contas a pagar. */
  deleteRecurringPayable(
    clinicId: string,
    recurringPayableId: string,
  ): Promise<boolean>;
  /** Gera, uma única vez, as contas a pagar das competências devidas até o mês atual. */
  generateDueRecurringPayables(
    clinicId: string,
    actorUserId: string,
  ): Promise<number>;
  renegotiateReceivables(
    clinicId: string,
    actorUserId: string,
    input: ReceivableRenegotiationInput,
  ): Promise<ReceivableRenegotiation>;
  /**
   * Com `recalculation`, recalcula na mesma transação as comissões que passam a usar a regra
   * (abertas mudam de valor; pagas ganham ajuste) e registra `commission.recalculated`.
   */
  createCommissionRule(
    clinicId: string,
    input: CommissionRuleInput,
    recalculation?: CommissionRecalculationRequest & { actorId: string },
  ): Promise<CommissionRule>;
  /** Prévia do recálculo retroativo das regras, sem gravar nada. */
  previewCommissionRecalculation(
    clinicId: string,
    input: import("@crm/contracts").CommissionRecalculationPreviewInput,
  ): Promise<import("@crm/contracts").CommissionRecalculationPreview>;
  generateCommissions(
    clinicId: string,
    competence: string,
  ): Promise<CommissionEntry[]>;
  settleCommission(
    clinicId: string,
    actorUserId: string,
    commissionId: string,
  ): Promise<CommissionEntry | null>;
  reverseCommission(
    clinicId: string,
    commissionId: string,
    actorUserId?: string,
  ): Promise<CommissionEntry | null>;
  listLeads(clinicId: string): Promise<Lead[]>;
  /** Uma página de uma coluna do funil (filtros aplicados) + o total da etapa. */
  listLeadStagePage(
    clinicId: string,
    stage: LeadStage,
    filter: LeadFilter,
    page: LeadPage,
    timezone?: string,
  ): Promise<LeadStagePage>;
  /** Indicadores do funil calculados no banco, sem carregar todos os leads. */
  summarizeLeads(
    clinicId: string,
    filter: LeadFilter,
    timezone?: string,
  ): Promise<LeadInsights>;
  /** Valores distintos de origem, interesse, contato, motivo de perda e responsável. */
  listLeadFilterOptions(clinicId: string): Promise<LeadFilterOptions>;
  /** Etapas do funil da clínica, na ordem (padrão enquanto a clínica não editar). */
  listLeadStages(clinicId: string): Promise<LeadStageConfig[]>;
  /**
   * Salva o funil inteiro (vale para todas as filiais): nomes, etapas novas e removidas e a
   * etapa final. Etapa removida ou escolhida como final precisa estar sem leads.
   */
  saveLeadStages(
    clinicId: string,
    input: LeadStagesInput,
  ): Promise<LeadStageConfig[]>;
  /**
   * Clientes (não mesclados) e leads não convertidos com o mesmo telefone, e-mail ou CPF
   * (comparação normalizada, ver `matchingContactFields`). Devolve só id e nome.
   */
  findLeadDuplicates(
    clinicId: string,
    query: LeadDuplicateQuery,
  ): Promise<LeadDuplicateMatch[]>;
  createLead(clinicId: string, input: LeadInput): Promise<Lead>;
  updateLead(
    clinicId: string,
    actorUserId: string,
    id: string,
    input: LeadInput,
  ): Promise<Lead | null>;
  moveLead(
    clinicId: string,
    actorUserId: string,
    leadId: string,
    stage: LeadStage,
    lostReason?: string,
  ): Promise<Lead | null>;
  convertLead(
    clinicId: string,
    actorUserId: string,
    leadId: string,
    input?: LeadConversionInput,
  ): Promise<LeadConversion | null>;
  getLeadActivity(
    clinicId: string,
    leadId: string,
  ): Promise<LeadActivity | null>;
  createLeadContact(
    clinicId: string,
    actorUserId: string,
    leadId: string,
    input: LeadContactInput,
  ): Promise<LeadContact | null>;
  createLeadTask(
    clinicId: string,
    actorUserId: string,
    leadId: string,
    input: LeadTaskInput,
  ): Promise<LeadTask | null>;
  /**
   * Agenda experimental/avaliação para lead ainda não convertido. Mesmas
   * checagens de conflito da agenda (feriado fica na rota). `null` = lead
   * não encontrado; lead convertido dá `LEAD_ALREADY_CONVERTED` (409).
   */
  createLeadAppointment(
    clinicId: string,
    leadId: string,
    input: LeadAppointmentInput,
  ): Promise<Appointment | null>;
  updateLeadTaskStatus(
    clinicId: string,
    taskId: string,
    status: LeadTaskStatus,
  ): Promise<LeadTask | null>;
  getCommunicationCenter(clinicId: string): Promise<CommunicationCenter>;
  setCommunicationPreference(
    clinicId: string,
    input: CommunicationPreferenceInput,
  ): Promise<CommunicationPreference>;
  queueManualMessage(
    clinicId: string,
    input: ManualMessageInput,
  ): Promise<OutboundMessage>;
  /** Enfileira as mensagens `manual` de um comunicado de uma vez; devolve quantas gravou. */
  queueBroadcastMessages(
    clinicId: string,
    drafts: BroadcastMessageDraft[],
  ): Promise<number>;
  generateReminders(
    clinicId: string,
    referenceDate: string,
    options?: import("@crm/contracts").ReminderGenerationOptions,
  ): Promise<ReminderGenerationResult>;
  /** Acervo de mensagens padrão (inclui arquivadas, com `archivedAt`). */
  listMessageTemplates(clinicId: string): Promise<MessageTemplate[]>;
  /** Conteúdo de uma imagem de mensagem padrão (também das trocadas, usadas por campanhas). */
  getMessageTemplateImage(
    clinicId: string,
    imageId: string,
  ): Promise<MessageTemplateImageContent | null>;
  createMessageTemplate(
    clinicId: string,
    actorUserId: string,
    input: MessageTemplateWrite,
  ): Promise<MessageTemplate>;
  /** Imagens com `id` são mantidas (na ordem enviada); as demais do modelo saem. */
  updateMessageTemplate(
    clinicId: string,
    actorUserId: string,
    templateId: string,
    input: MessageTemplateWrite,
  ): Promise<MessageTemplate | null>;
  setMessageTemplateArchived(
    clinicId: string,
    actorUserId: string,
    templateId: string,
    archived: boolean,
  ): Promise<MessageTemplate | null>;
  listWhatsappCampaigns(clinicId: string): Promise<WhatsappCampaign[]>;
  getWhatsappCampaign(
    clinicId: string,
    campaignId: string,
  ): Promise<WhatsappCampaignDetail | null>;
  /** Grava a campanha com o texto e as imagens atuais do modelo (que precisa estar ativo). */
  createWhatsappCampaign(
    clinicId: string,
    actorUserId: string,
    input: {
      templateId: string;
      name: string;
      recipients: WhatsappCampaignRecipientDraft[];
    },
  ): Promise<WhatsappCampaignDetail>;
  /** Marca enviado/pulado (ou volta a pendente); conclui a campanha quando não sobra pendente. */
  setWhatsappCampaignRecipientStatus(
    clinicId: string,
    actorUserId: string,
    campaignId: string,
    recipientId: string,
    status: CampaignRecipientStatus,
  ): Promise<CampaignRecipientUpdate | null>;
  recordDocumentSignature(
    clinicId: string,
    actorUserId: string,
    id: string,
    input: DocumentSignatureInput,
  ): Promise<IssuedDocument>;
  getDocumentSignatureContent(
    clinicId: string,
    actorUserId: string,
    id: string,
  ): Promise<DocumentSignatureContent | null>;
  listDocumentTemplates(clinicId: string): Promise<DocumentTemplate[]>;
  createDocumentTemplate(
    clinicId: string,
    input: DocumentTemplateInput,
  ): Promise<DocumentTemplate>;
  createDocumentTemplateVersion(
    clinicId: string,
    templateId: string,
    body: string,
    content?: DocumentContent,
  ): Promise<DocumentTemplate | null>;
  previewDocument(
    clinicId: string,
    input: IssuedDocumentInput,
  ): Promise<DocumentPreview>;
  updateDocumentDraft(
    clinicId: string,
    documentId: string,
    input: DocumentDraftInput,
  ): Promise<IssuedDocument | null>;
  listIssuedDocuments(clinicId: string): Promise<IssuedDocument[]>;
  createIssuedDocument(
    clinicId: string,
    actorUserId: string,
    input: IssuedDocumentInput,
  ): Promise<IssuedDocument>;
  updateIssuedDocumentStatus(
    clinicId: string,
    documentId: string,
    status: Exclude<DocumentStatus, "draft">,
  ): Promise<IssuedDocument | null>;
  getManagementReport(
    clinicId: string,
    from: string,
    to: string,
  ): Promise<ManagementReport>;
  /**
   * Sessões concluídas no período (atendimentos com cliente e presenças em turma), comissões
   * geradas nas competências que o período toca e a previsão das que faltam gerar.
   */
  listTeamProduction(
    clinicId: string,
    from: string,
    to: string,
  ): Promise<TeamProductionSources>;
  getSalesPeriodReport(
    clinicId: string,
    from: string,
    to: string,
  ): Promise<SalesPeriodReport>;
  getSalesReport(clinicId: string, month: string): Promise<SalesReport>;
  /** Todas as vendas/estornos do cliente, mais recentes primeiro; null se não existir. */
  listPatientSales(
    clinicId: string,
    patientId: string,
  ): Promise<SaleMovement[] | null>;
  /** Caixa do dia `date` (aaaa-mm-dd no fuso da clínica). */
  getDailyCash(clinicId: string, date: string): Promise<DailyCash>;
  /**
   * Eventos de recebimento e estorno cuja data, no fuso da clínica, está entre
   * `from` e `to` (aaaa-mm-dd, inclusive), em ordem cronológica.
   */
  listReceivedPayments(
    clinicId: string,
    from: string,
    to: string,
  ): Promise<ReceivedPayment[]>;
}

export class DomainError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode = 400,
    /** Vai no corpo do erro como `details` (ex.: contagem, lista de itens recusados). */
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

/** 409 ao criar/renomear etiqueta com o nome de outra (sem diferenciar maiúsculas/acentos). */
export function patientTagDuplicateError(name: string) {
  return new DomainError(
    "PATIENT_TAG_DUPLICATE",
    `Já existe uma etiqueta chamada "${name}".`,
    409,
  );
}

/** 409 ao excluir etiqueta que algum cliente ainda usa. */
export function patientTagInUseError(name: string, patientCount: number) {
  return new DomainError(
    "PATIENT_TAG_IN_USE",
    `A etiqueta "${name}" está em uso por ${patientCount} ${patientCount === 1 ? "cliente" : "clientes"}. Retire-a desses clientes antes de excluir.`,
    409,
    { patientCount },
  );
}

/** 409 ao rebaixar ou desativar o último admin ativo da clínica (ninguém ficaria sem Administração). */
export function lastAdminError() {
  return new DomainError(
    "LAST_ADMIN",
    "A clínica precisa de pelo menos um admin ativo. Torne outro usuário admin antes.",
    409,
  );
}

/** Mensagem padrão já validada pela rota: imagens novas chegam com tipo e tamanho conferidos. */
export interface MessageTemplateWrite {
  title: string;
  body: string;
  images: Array<
    | { id: string }
    | {
        fileName: string;
        mimeType: MessageImageMimeType;
        sizeBytes: number;
        dataUrl: string;
      }
  >;
}
