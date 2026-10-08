import type {
  AdminAuditEvent,
  AdminAuditPage,
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
  CostCenter,
  CostCenterInput,
  DailyCash,
  BroadcastMessageDraft,
  CommunicationCenter,
  CommunicationPreference,
  CommunicationPreferenceInput,
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
  GuidedPatientInput,
  GuidedPatientResult,
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
  ReceivedPayment,
  SalesReport,
  IssuedDocument,
  InventoryWorkspace,
  IssuedDocumentInput,
  OutboundMessage,
  Patient,
  PatientInput,
  PatientTag,
  PatientTagInput,
  PatientTagUpdate,
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
  AppModule,
  ReplacementBookingInput,
  ReplacementCredit,
  UserSummary,
} from "@crm/contracts";

export interface AuthenticatedUser extends UserSummary {
  clinicId: string;
  /** `true` quando há módulos ou edição gravados para o usuário comum (admin: `false`). */
  customModules: boolean;
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
  /** Cria o usuário e, se `input.commission` vier, a regra de comissão dele (mesma transação). */
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
  ): Promise<AdminUser | null>;
  getClinicSettings(clinicId: string): Promise<ClinicSettings | null>;
  updateClinicSettings(
    clinicId: string,
    actorUserId: string,
    input: ClinicSettingsInput,
  ): Promise<ClinicSettings>;
  listAdminAuditEvents(clinicId: string): Promise<AdminAuditEvent[]>;
  listAdminAuditPage(clinicId: string, cursor?: string): Promise<AdminAuditPage>;
  /** Registra um evento na auditoria administrativa (ex.: `patients.exported`). */
  recordAdminAuditEvent(
    clinicId: string,
    actorUserId: string,
    action: string,
    entityType: string,
    metadata?: Record<string, unknown>,
  ): Promise<void>;
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
  getDashboard(clinicId: string, date: string): Promise<DashboardSummary>;
  listPatients(clinicId: string, search?: string): Promise<Patient[]>;
  createPatient(clinicId: string, input: PatientInput): Promise<Patient>;
  /**
   * Cadastro guiado (`POST /patients/guided`): cria o cliente e o próximo passo — atendimento
   * experimental, plano (com matrícula opcional em turma do mesmo serviço) ou avulso — tudo ou
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
  listPatientTags(clinicId: string): Promise<PatientTag[]>;
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
  /** Enfileira as mensagens `manual` de um comunicado de uma vez; devolve quantas gravou. */
  queueBroadcastMessages(
    clinicId: string,
    drafts: BroadcastMessageDraft[],
  ): Promise<number>;
  generateReminders(
    clinicId: string,
    referenceDate: string,
  ): Promise<ReminderGenerationResult>;
  listDocumentTemplates(clinicId: string): Promise<DocumentTemplate[]>;
  createDocumentTemplate(
    clinicId: string,
    input: DocumentTemplateInput,
  ): Promise<DocumentTemplate>;
  createDocumentTemplateVersion(
    clinicId: string,
    templateId: string,
    body: string,
  ): Promise<DocumentTemplate | null>;
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
  getSalesReport(clinicId: string, month: string): Promise<SalesReport>;
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
