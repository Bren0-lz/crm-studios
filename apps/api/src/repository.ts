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
  CostCenter,
  CostCenterInput,
  DailyCash,
  CommunicationCenter,
  CommunicationPreference,
  CommunicationPreferenceInput,
  DashboardSummary,
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
  InventoryWorkspace,
  OutboundMessage,
  Patient,
  PatientInput,
  PatientPlan,
  PatientPlanInput,
  PatientTab,
  PatientTabCloseInput,
  PatientTabInput,
  PatientTabItemInput,
  PatientTimelineEntry,
  Payable,
  PayableInput,
  PaymentMethod,
  PaymentReceipt,
  PlanRenewalInput,
  PlanStatus,
  RecurringPayable,
  RecurringPayableInput,
  Professional,
  ProfessionalInput,
  Product,
  ProductInput,
  RecurringAppointmentInput,
  ReceivableRenegotiation,
  ReceivableRenegotiationInput,
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
  ReminderGenerationResult,
  RelationshipSettings,
  Holiday,
  HolidayInput,
  BirthdayEntry,
  ContactActivity,
  ContactActivityInput,
  ContactSuggestion,
  SatisfactionSurvey,
  SatisfactionSurveyInput,
  UserRole,
  ReplacementBookingInput,
  ReplacementCredit,
  UserSummary,
} from "@crm/contracts";

export interface AuthenticatedUser extends UserSummary {
  clinicId: string;
  passwordHash: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ClinicRepository {
  findUserByEmail(email: string): Promise<AuthenticatedUser | null>;
  findUserById(
    clinicId: string,
    userId: string,
  ): Promise<AuthenticatedUser | null>;
  listAdminUsers(clinicId: string): Promise<AdminUser[]>;
  createAdminUser(
    clinicId: string,
    actorUserId: string,
    input: AdminUserInput,
    passwordHash: string,
  ): Promise<AdminUser>;
  updateAdminUser(
    clinicId: string,
    actorUserId: string,
    userId: string,
    input: AdminUserUpdate,
  ): Promise<AdminUser | null>;
  resetAdminUserPassword(
    clinicId: string,
    actorUserId: string,
    userId: string,
    passwordHash: string,
  ): Promise<boolean>;
  getClinicSettings(clinicId: string): Promise<ClinicSettings | null>;
  updateClinicSettings(
    clinicId: string,
    actorUserId: string,
    input: ClinicSettingsInput,
  ): Promise<ClinicSettings>;
  listAdminAuditEvents(clinicId: string): Promise<AdminAuditEvent[]>;
  /** Devolve os padrões quando a clínica ainda não salvou configurações. */
  getRelationshipSettings(clinicId: string): Promise<RelationshipSettings>;
  updateRelationshipSettings(
    clinicId: string,
    input: RelationshipSettings,
  ): Promise<RelationshipSettings>;
  /** Por data crescente. `from`/`to` (aaaa-mm-dd) são inclusivos e opcionais. */
  listHolidays(clinicId: string, from?: string, to?: string): Promise<Holiday[]>;
  /** Uma data só pode ter um feriado por clínica (409 `HOLIDAY_DUPLICATE`). */
  createHoliday(clinicId: string, input: HolidayInput): Promise<Holiday>;
  /** `false` quando o feriado não existe na clínica. */
  deleteHoliday(clinicId: string, holidayId: string): Promise<boolean>;
  /** Sugestões de contato do dia (data da clínica), já filtradas pelo perfil. */
  listContactSuggestions(
    clinicId: string,
    role: UserRole,
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
  getDashboard(clinicId: string, date: string): Promise<DashboardSummary>;
  listPatients(clinicId: string, search?: string): Promise<Patient[]>;
  createPatient(clinicId: string, input: PatientInput): Promise<Patient>;
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
  updateAppointmentStatus(
    clinicId: string,
    appointmentId: string,
    status: AppointmentStatus,
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
  listClinicalAccessEvents(
    clinicId: string,
    patientId: string,
  ): Promise<ClinicalAccessEvent[]>;
  listPatientPlans(
    clinicId: string,
    patientId?: string,
  ): Promise<PatientPlan[]>;
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
  createCommissionRule(
    clinicId: string,
    input: CommissionRuleInput,
  ): Promise<CommissionRule>;
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
  ): Promise<CommissionEntry | null>;
  listLeads(clinicId: string): Promise<Lead[]>;
  createLead(clinicId: string, input: LeadInput): Promise<Lead>;
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
  generateReminders(
    clinicId: string,
    referenceDate: string,
  ): Promise<ReminderGenerationResult>;
  getManagementReport(
    clinicId: string,
    from: string,
    to: string,
  ): Promise<ManagementReport>;
  getSalesReport(clinicId: string, month: string): Promise<SalesReport>;
  /** Caixa do dia `date` (aaaa-mm-dd no fuso da clínica). */
  getDailyCash(clinicId: string, date: string): Promise<DailyCash>;
}

export class DomainError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode = 400,
  ) {
    super(message);
  }
}
