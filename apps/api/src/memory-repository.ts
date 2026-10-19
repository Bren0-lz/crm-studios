import { createCommissionReconciliationRepository } from "./storage/memory/commission-reconciliation.js";
import { createExternalOperationsRepository } from "./storage/memory/external-operations.js";
import { createPlanPurchasesRepository } from "./storage/memory/plan-purchases.js";
import { createClinicWriteLock } from "./storage/memory/write-lock.js";
import { createFinancialDatesRepository } from "./storage/memory/financial-dates.js";
import { createRegistryRepository } from "./storage/memory/registry.js";
import { createAgendaLinksRepository } from "./storage/memory/agenda-links.js";
import { createDocumentSignaturesRepository } from "./storage/memory/document-signatures.js";
import { createAssessmentOperationsRepository } from "./storage/memory/assessment-operations.js";
import { createCommissionOperationsRepository } from "./storage/memory/commission-operations.js";
import { createFinanceOperationsRepository } from "./storage/memory/finance-operations.js";
import { createClinicalResourcesRepository } from "./storage/memory/clinical-resources.js";
import { createGroupOperationsRepository } from "./storage/memory/group-operations.js";
import { createPatientManagementRepository } from "./storage/memory/patient-management.js";
import { createCatalogsRepository } from "./storage/memory/catalogs.js";
import type { ClinicRepository } from "./repository.js";
import { createAdministrationRepository } from "./storage/memory/administration.js";
import { createAgendaRepository } from "./storage/memory/agenda.js";
import { createClinicalRepository } from "./storage/memory/clinical.js";
import { createCommercialRepository } from "./storage/memory/commercial.js";
import { createCommunicationsRepository } from "./storage/memory/communications.js";
import { MemoryRepositoryContext } from "./storage/memory/context.js";
import { createContractsRepository } from "./storage/memory/contracts.js";
import { createFinanceRepository } from "./storage/memory/finance.js";
import { createPatientsRepository } from "./storage/memory/patients.js";
import { createPlansRepository } from "./storage/memory/plans.js";
import { createRelationshipRepository } from "./storage/memory/relationship.js";
import { createReportsRepository } from "./storage/memory/reports.js";

export class MemoryClinicRepository implements ClinicRepository {
  readonly getCommissionReconciliationPreview: ClinicRepository["getCommissionReconciliationPreview"];
  readonly reconcileCommission: ClinicRepository["reconcileCommission"];
  readonly settleCommissionAccount: ClinicRepository["settleCommissionAccount"];
  readonly reverseCommissionAccountPayment: ClinicRepository["reverseCommissionAccountPayment"];
  readonly listExternalOperations: ClinicRepository["listExternalOperations"];
  readonly createExternalOperation: ClinicRepository["createExternalOperation"];
  readonly getExternalOperationContent: ClinicRepository["getExternalOperationContent"];
  readonly purchasePatientPlan: ClinicRepository["purchasePatientPlan"];
  readonly getAdministrativeRegistry: ClinicRepository["getAdministrativeRegistry"];
  readonly updateAdministrativeRegistry: ClinicRepository["updateAdministrativeRegistry"];
  readonly listClinicCatalog: ClinicRepository["listClinicCatalog"];
  readonly saveClinicCatalog: ClinicRepository["saveClinicCatalog"];
  readonly getPatient: ClinicRepository["getPatient"];
  readonly setPatientStatus: ClinicRepository["setPatientStatus"];
  readonly previewInactivePatients: ClinicRepository["previewInactivePatients"];
  readonly inactivatePatients: ClinicRepository["inactivatePatients"];
  readonly previewPatientMerge: ClinicRepository["previewPatientMerge"];
  readonly mergePatients: ClinicRepository["mergePatients"];
  readonly recordReplacementAttendance: ClinicRepository["recordReplacementAttendance"];
  readonly updateGroupSessionProfessional: ClinicRepository["updateGroupSessionProfessional"];
  readonly revokeUserSessions: ClinicRepository["revokeUserSessions"];
  readonly completeManualMessage: ClinicRepository["completeManualMessage"];
  readonly saveAssessmentTemplate: ClinicRepository["saveAssessmentTemplate"];
  readonly createAbsenceSuccessor: ClinicRepository["createAbsenceSuccessor"];
  readonly recordDocumentSignature: ClinicRepository["recordDocumentSignature"];
  readonly getDocumentSignatureContent: ClinicRepository["getDocumentSignatureContent"];
  readonly listClinicalResources: ClinicRepository["listClinicalResources"];
  readonly saveClinicalResource: ClinicRepository["saveClinicalResource"];
  readonly finalizeClinicalResource: ClinicRepository["finalizeClinicalResource"];
  readonly listClinicalSources: ClinicRepository["listClinicalSources"];
  readonly updateProduct: ClinicRepository["updateProduct"];
  readonly updatePatientTabItem: ClinicRepository["updatePatientTabItem"];
  readonly addPatientTabService: ClinicRepository["addPatientTabService"];
  readonly removePatientTabService: ClinicRepository["removePatientTabService"];
  readonly createPatientTabAppointment: ClinicRepository["createPatientTabAppointment"];
  readonly listSuppliers: ClinicRepository["listSuppliers"];
  readonly saveSupplier: ClinicRepository["saveSupplier"];
  readonly createManualReceivable: ClinicRepository["createManualReceivable"];
  readonly classifyFinancialEntry: ClinicRepository["classifyFinancialEntry"];
  readonly setCategoryDreGroup: ClinicRepository["setCategoryDreGroup"];
  readonly setFinancialDates: ClinicRepository["setFinancialDates"];
  readonly getDreReport: ClinicRepository["getDreReport"];
  private readonly context: MemoryRepositoryContext;
  private readonly administration: ReturnType<
    typeof createAdministrationRepository
  >;
  private readonly finance: ReturnType<typeof createFinanceRepository>;
  private readonly relationship: ReturnType<
    typeof createRelationshipRepository
  >;
  private readonly agenda: ReturnType<typeof createAgendaRepository>;
  private readonly reports: ReturnType<typeof createReportsRepository>;
  private readonly patients: ReturnType<typeof createPatientsRepository>;
  private readonly plans: ReturnType<typeof createPlansRepository>;
  private readonly clinical: ReturnType<typeof createClinicalRepository>;
  private readonly commercial: ReturnType<typeof createCommercialRepository>;
  private readonly communications: ReturnType<
    typeof createCommunicationsRepository
  >;
  private readonly contracts: ReturnType<typeof createContractsRepository>;
  constructor(withRichDemo = false) {
    this.context = new MemoryRepositoryContext(withRichDemo);
    this.context.operations = this;
    const reconciliation = createCommissionReconciliationRepository(
      this.context,
    );
    this.getCommissionReconciliationPreview =
      reconciliation.getCommissionReconciliationPreview;
    this.reconcileCommission = reconciliation.reconcileCommission;
    this.settleCommissionAccount = reconciliation.settleCommissionAccount;
    this.reverseCommissionAccountPayment =
      reconciliation.reverseCommissionAccountPayment;
    const externalOperations = createExternalOperationsRepository(this.context);
    this.listExternalOperations = externalOperations.listExternalOperations;
    this.createExternalOperation = externalOperations.createExternalOperation;
    this.getExternalOperationContent =
      externalOperations.getExternalOperationContent;
    this.purchasePatientPlan = createPlanPurchasesRepository(
      this.context,
    ).purchasePatientPlan;
    const patientManagement = createPatientManagementRepository(this.context);
    this.getPatient = patientManagement.getPatient;
    this.setPatientStatus = patientManagement.setPatientStatus;
    this.previewInactivePatients = patientManagement.previewInactivePatients;
    this.inactivatePatients = patientManagement.inactivatePatients;
    this.previewPatientMerge = patientManagement.previewPatientMerge;
    this.mergePatients = patientManagement.mergePatients;
    const registry = createRegistryRepository(this.context);
    this.getAdministrativeRegistry = registry.getAdministrativeRegistry;
    this.updateAdministrativeRegistry = registry.updateAdministrativeRegistry;
    const catalogs = createCatalogsRepository(this.context);
    this.listClinicCatalog = catalogs.listClinicCatalog;
    this.saveClinicCatalog = catalogs.saveClinicCatalog;
    this.administration = createAdministrationRepository(this.context);
    this.finance = {
      ...createFinanceRepository(this.context),
      ...createCommissionOperationsRepository(this.context),
    };
    const financeOperations = createFinanceOperationsRepository(this.context);
    this.updateProduct = financeOperations.updateProduct;
    this.updatePatientTabItem = financeOperations.updatePatientTabItem;
    this.addPatientTabService = financeOperations.addPatientTabService;
    this.removePatientTabService = financeOperations.removePatientTabService;
    this.createPatientTabAppointment =
      financeOperations.createPatientTabAppointment;
    this.listSuppliers = financeOperations.listSuppliers;
    this.saveSupplier = financeOperations.saveSupplier;
    this.createManualReceivable = financeOperations.createManualReceivable;
    this.classifyFinancialEntry = financeOperations.classifyFinancialEntry;
    this.setCategoryDreGroup = financeOperations.setCategoryDreGroup;
    this.getDreReport = financeOperations.getDreReport;
    this.setFinancialDates = createFinancialDatesRepository(
      this.context,
    ).setFinancialDates;
    this.relationship = createRelationshipRepository(this.context);
    this.agenda = createAgendaRepository(this.context);
    this.createAbsenceSuccessor = createAgendaLinksRepository(
      this.context,
    ).createAbsenceSuccessor;
    const groupOperations = createGroupOperationsRepository(this.context);
    this.recordReplacementAttendance =
      groupOperations.recordReplacementAttendance;
    this.updateGroupSessionProfessional =
      groupOperations.updateGroupSessionProfessional;
    this.reports = createReportsRepository(this.context);
    this.patients = createPatientsRepository(this.context);
    this.plans = createPlansRepository(this.context);
    this.clinical = createClinicalRepository(this.context);
    this.saveAssessmentTemplate = createAssessmentOperationsRepository(
      this.context,
    ).saveAssessmentTemplate;
    const clinicalResources = createClinicalResourcesRepository(this.context);
    this.listClinicalResources = clinicalResources.listClinicalResources;
    this.listClinicalSources = clinicalResources.listClinicalSources;
    this.saveClinicalResource = clinicalResources.saveClinicalResource;
    this.finalizeClinicalResource = clinicalResources.finalizeClinicalResource;
    this.commercial = createCommercialRepository(this.context);
    this.communications = createCommunicationsRepository(this.context);
    this.contracts = createContractsRepository(this.context);
    const signatures = createDocumentSignaturesRepository(this.context);
    this.recordDocumentSignature = signatures.recordDocumentSignature;
    this.getDocumentSignatureContent = signatures.getDocumentSignatureContent;

    this.revokeUserSessions = this.administration.revokeUserSessions;
    this.findUserByEmail = this.administration.findUserByEmail;
    this.findUserById = this.administration.findUserById;
    this.listAdminUsers = this.administration.listAdminUsers;
    this.setAdminUserProfessional =
      this.administration.setAdminUserProfessional;
    this.createAdminUser = this.administration.createAdminUser;
    this.updateAdminUser = this.administration.updateAdminUser;
    this.resetAdminUserPassword = this.administration.resetAdminUserPassword;
    this.getClinicSettings = this.administration.getClinicSettings;
    this.updateClinicSettings = this.administration.updateClinicSettings;
    this.listAdminAuditEvents = this.administration.listAdminAuditEvents;
    this.listHistoryActors = this.administration.listHistoryActors;
    this.listAdminAuditPage = this.administration.listAdminAuditPage;
    this.recordAdminAuditEvent = this.administration.recordAdminAuditEvent;
    this.listProfessionals = this.administration.listProfessionals;
    this.createProfessional = this.administration.createProfessional;
    this.listRooms = this.administration.listRooms;
    this.createRoom = this.administration.createRoom;
    this.listServices = this.administration.listServices;
    this.createService = this.administration.createService;
    this.setAdminUserCommission = this.finance.setAdminUserCommission;
    this.getInventoryWorkspace = this.finance.getInventoryWorkspace;
    this.createProduct = this.finance.createProduct;
    this.createStockMovement = this.finance.createStockMovement;
    this.openPatientTab = this.finance.openPatientTab;
    this.addPatientTabItem = this.finance.addPatientTabItem;
    this.closePatientTab = this.finance.closePatientTab;
    this.cancelPatientTab = this.finance.cancelPatientTab;
    this.getFinancialSummary = this.finance.getFinancialSummary;
    this.settleReceivable = this.finance.settleReceivable;
    this.reverseReceivablePayment = this.finance.reverseReceivablePayment;
    this.adjustReceivable = this.finance.adjustReceivable;
    this.getPaymentReceipt = this.finance.getPaymentReceipt;
    this.getFinancialWorkspace = this.finance.getFinancialWorkspace;
    this.createFinancialCategory = this.finance.createFinancialCategory;
    this.createCostCenter = this.finance.createCostCenter;
    this.createPayable = this.finance.createPayable;
    this.settlePayable = this.finance.settlePayable;
    this.reversePayablePayment = this.finance.reversePayablePayment;
    this.listRecurringPayables = this.finance.listRecurringPayables;
    this.createRecurringPayable = this.finance.createRecurringPayable;
    this.updateRecurringPayable = this.finance.updateRecurringPayable;
    this.deleteRecurringPayable = this.finance.deleteRecurringPayable;
    this.generateDueRecurringPayables =
      this.finance.generateDueRecurringPayables;
    this.renegotiateReceivables = this.finance.renegotiateReceivables;
    this.createCommissionRule = this.finance.createCommissionRule;
    this.generateCommissions = this.finance.generateCommissions;
    this.settleCommission = this.finance.settleCommission;
    this.reverseCommission = this.finance.reverseCommission;
    this.getDailyCash = this.finance.getDailyCash;
    this.listReceivedPayments = this.finance.listReceivedPayments;
    this.getRelationshipSettings = this.relationship.getRelationshipSettings;
    this.updateRelationshipSettings =
      this.relationship.updateRelationshipSettings;
    this.listContactSuggestions = this.relationship.listContactSuggestions;
    this.createContactActivity = this.relationship.createContactActivity;
    this.listBirthdays = this.relationship.listBirthdays;
    this.listContactActivities = this.relationship.listContactActivities;
    this.createSatisfactionSurvey = this.relationship.createSatisfactionSurvey;
    this.listSatisfactionSurveys = this.relationship.listSatisfactionSurveys;
    this.listHolidays = this.agenda.listHolidays;
    this.createHoliday = this.agenda.createHoliday;
    this.deleteHoliday = this.agenda.deleteHoliday;
    this.listSubscriberIdsWithoutGroup =
      this.agenda.listSubscriberIdsWithoutGroup;
    this.listAppointments = this.agenda.listAppointments;
    this.listPendingFinalizationAppointments =
      this.agenda.listPendingFinalizationAppointments;
    this.createAppointment = this.agenda.createAppointment;
    this.createLeadAppointment = this.agenda.createLeadAppointment;
    this.rescheduleAppointment = this.agenda.rescheduleAppointment;
    this.listAppointmentReschedules = this.agenda.listAppointmentReschedules;
    this.findAppointmentServiceId = this.agenda.findAppointmentServiceId;
    this.findAppointment = this.agenda.findAppointment;
    this.updateAppointment = this.agenda.updateAppointment;
    this.createRecurringAppointments = this.agenda.createRecurringAppointments;
    this.listScheduleBlocks = this.agenda.listScheduleBlocks;
    this.createScheduleBlock = this.agenda.createScheduleBlock;
    this.cancelScheduleBlock = this.agenda.cancelScheduleBlock;
    this.getGroupWorkspace = this.agenda.getGroupWorkspace;
    this.createGroupClass = this.agenda.createGroupClass;
    this.updateGroupClass = this.agenda.updateGroupClass;
    this.createGroupEnrollment = this.agenda.createGroupEnrollment;
    this.cancelGroupEnrollment = this.agenda.cancelGroupEnrollment;
    this.listGroupSessions = this.agenda.listGroupSessions;
    this.recordGroupAttendance = groupOperations.recordGroupAttendance;
    this.completeGroupSession = this.agenda.completeGroupSession;
    this.bookReplacement = groupOperations.bookReplacement;
    this.updateAppointmentStatus = this.agenda.updateAppointmentStatus;
    this.getDashboard = this.reports.getDashboard;
    this.getSalesReport = this.reports.getSalesReport;
    this.getManagementReport = this.reports.getManagementReport;
    this.listPatients = this.patients.listPatients;
    this.createPatient = this.patients.createPatient;
    this.createPatientWithNextStep = this.patients.createPatientWithNextStep;
    this.importPatients = this.patients.importPatients;
    this.updatePatient = this.patients.updatePatient;
    this.listPatientTags = this.patients.listPatientTags;
    this.listOverduePatientIds = this.patients.listOverduePatientIds;
    this.createPatientTag = this.patients.createPatientTag;
    this.updatePatientTag = this.patients.updatePatientTag;
    this.deletePatientTag = this.patients.deletePatientTag;
    this.getPatientTimeline = this.patients.getPatientTimeline;
    this.listPlanTemplates = this.plans.listPlanTemplates;
    this.createPlanTemplate = this.plans.createPlanTemplate;
    this.updatePlanTemplate = this.plans.updatePlanTemplate;
    this.listPlanCatalog = this.plans.listPlanCatalog;
    this.createPlanCatalogEntry = this.plans.createPlanCatalogEntry;
    this.updatePlanCatalogEntry = this.plans.updatePlanCatalogEntry;
    this.deletePlanCatalogEntry = this.plans.deletePlanCatalogEntry;
    this.listPatientPlans = this.plans.listPatientPlans;
    this.createPatientPlan = this.plans.createPatientPlan;
    this.renewPatientPlan = this.plans.renewPatientPlan;
    this.updatePatientPlanAutoRenew = this.plans.updatePatientPlanAutoRenew;
    this.renewDuePatientPlans = this.plans.renewDuePatientPlans;
    this.updatePatientPlanStatus = this.plans.updatePatientPlanStatus;
    this.listSessionMovements = this.plans.listSessionMovements;
    this.listClinicalRecords = this.clinical.listClinicalRecords;
    this.saveClinicalRecord = this.clinical.saveClinicalRecord;
    this.finalizeClinicalRecord = this.clinical.finalizeClinicalRecord;
    this.listClinicalRecordRevisions =
      this.clinical.listClinicalRecordRevisions;
    this.getClinicalWorkspace = this.clinical.getClinicalWorkspace;
    this.createAssessmentTemplate = this.clinical.createAssessmentTemplate;
    this.createClinicalAssessment = this.clinical.createClinicalAssessment;
    this.createTherapeuticGoal = this.clinical.createTherapeuticGoal;
    this.updateTherapeuticGoalStatus =
      this.clinical.updateTherapeuticGoalStatus;
    this.createClinicalMeasurement = this.clinical.createClinicalMeasurement;
    this.createTreatmentClosure = this.clinical.createTreatmentClosure;
    this.createClinicalAttachment = this.clinical.createClinicalAttachment;
    this.getClinicalAttachmentContent =
      this.clinical.getClinicalAttachmentContent;
    this.createClinicalAddendum = this.clinical.createClinicalAddendum;
    this.listClinicalAccessEvents = this.clinical.listClinicalAccessEvents;
    this.listLeads = this.commercial.listLeads;
    this.createLead = this.commercial.createLead;
    this.updateLead = this.commercial.updateLead;
    this.moveLead = this.commercial.moveLead;
    this.convertLead = this.commercial.convertLead;
    this.getLeadActivity = this.commercial.getLeadActivity;
    this.createLeadContact = this.commercial.createLeadContact;
    this.createLeadTask = this.commercial.createLeadTask;
    this.updateLeadTaskStatus = this.commercial.updateLeadTaskStatus;
    this.completeManualMessage = this.communications.completeManualMessage;
    this.getCommunicationCenter = this.communications.getCommunicationCenter;
    this.setCommunicationPreference =
      this.communications.setCommunicationPreference;
    this.queueManualMessage = this.communications.queueManualMessage;
    this.queueBroadcastMessages = this.communications.queueBroadcastMessages;
    this.generateReminders = this.communications.generateReminders;
    this.listDocumentTemplates = this.contracts.listDocumentTemplates;
    this.createDocumentTemplate = this.contracts.createDocumentTemplate;
    this.createDocumentTemplateVersion =
      this.contracts.createDocumentTemplateVersion;
    this.listIssuedDocuments = this.contracts.listIssuedDocuments;
    this.createIssuedDocument = this.contracts.createIssuedDocument;
    this.updateIssuedDocumentStatus = this.contracts.updateIssuedDocumentStatus;
    // All clinics share the in-memory collections. One instance-wide guard
    // keeps composed rollback isolated from writes in any other clinic.
    // Nested repository calls reuse the current owner.
    const atomic = createClinicWriteLock();
    for (const [key, value] of Object.entries(this)) {
      if (typeof value !== "function") continue;
      const operation = value as (...args: unknown[]) => Promise<unknown>;
      Object.defineProperty(this, key, {
        value: (...args: unknown[]) =>
          atomic("repository", () => operation(...args)),
      });
    }
  }
  readonly findUserByEmail: ReturnType<
    typeof createAdministrationRepository
  >["findUserByEmail"];

  readonly findUserById: ReturnType<
    typeof createAdministrationRepository
  >["findUserById"];

  readonly listAdminUsers: ReturnType<
    typeof createAdministrationRepository
  >["listAdminUsers"];

  readonly setAdminUserProfessional: ReturnType<
    typeof createAdministrationRepository
  >["setAdminUserProfessional"];

  readonly createAdminUser: ReturnType<
    typeof createAdministrationRepository
  >["createAdminUser"];

  readonly updateAdminUser: ReturnType<
    typeof createAdministrationRepository
  >["updateAdminUser"];

  readonly resetAdminUserPassword: ReturnType<
    typeof createAdministrationRepository
  >["resetAdminUserPassword"];

  readonly getClinicSettings: ReturnType<
    typeof createAdministrationRepository
  >["getClinicSettings"];

  readonly updateClinicSettings: ReturnType<
    typeof createAdministrationRepository
  >["updateClinicSettings"];

  readonly listAdminAuditEvents: ReturnType<
    typeof createAdministrationRepository
  >["listAdminAuditEvents"];

  readonly listHistoryActors: ReturnType<
    typeof createAdministrationRepository
  >["listHistoryActors"];

  readonly listAdminAuditPage: ReturnType<
    typeof createAdministrationRepository
  >["listAdminAuditPage"];

  readonly recordAdminAuditEvent: ReturnType<
    typeof createAdministrationRepository
  >["recordAdminAuditEvent"];

  readonly listProfessionals: ReturnType<
    typeof createAdministrationRepository
  >["listProfessionals"];

  readonly createProfessional: ReturnType<
    typeof createAdministrationRepository
  >["createProfessional"];

  readonly listRooms: ReturnType<
    typeof createAdministrationRepository
  >["listRooms"];

  readonly createRoom: ReturnType<
    typeof createAdministrationRepository
  >["createRoom"];

  readonly listServices: ReturnType<
    typeof createAdministrationRepository
  >["listServices"];

  readonly createService: ReturnType<
    typeof createAdministrationRepository
  >["createService"];

  readonly setAdminUserCommission: ReturnType<
    typeof createFinanceRepository
  >["setAdminUserCommission"];

  readonly getInventoryWorkspace: ReturnType<
    typeof createFinanceRepository
  >["getInventoryWorkspace"];

  readonly createProduct: ReturnType<
    typeof createFinanceRepository
  >["createProduct"];

  readonly createStockMovement: ReturnType<
    typeof createFinanceRepository
  >["createStockMovement"];

  readonly openPatientTab: ReturnType<
    typeof createFinanceRepository
  >["openPatientTab"];

  readonly addPatientTabItem: ReturnType<
    typeof createFinanceRepository
  >["addPatientTabItem"];

  readonly closePatientTab: ReturnType<
    typeof createFinanceRepository
  >["closePatientTab"];

  readonly cancelPatientTab: ReturnType<
    typeof createFinanceRepository
  >["cancelPatientTab"];

  readonly getFinancialSummary: ReturnType<
    typeof createFinanceRepository
  >["getFinancialSummary"];

  readonly settleReceivable: ReturnType<
    typeof createFinanceRepository
  >["settleReceivable"];

  readonly reverseReceivablePayment: ReturnType<
    typeof createFinanceRepository
  >["reverseReceivablePayment"];

  readonly adjustReceivable: ReturnType<
    typeof createFinanceRepository
  >["adjustReceivable"];

  readonly getPaymentReceipt: ReturnType<
    typeof createFinanceRepository
  >["getPaymentReceipt"];

  readonly getFinancialWorkspace: ReturnType<
    typeof createFinanceRepository
  >["getFinancialWorkspace"];

  readonly createFinancialCategory: ReturnType<
    typeof createFinanceRepository
  >["createFinancialCategory"];

  readonly createCostCenter: ReturnType<
    typeof createFinanceRepository
  >["createCostCenter"];

  readonly createPayable: ReturnType<
    typeof createFinanceRepository
  >["createPayable"];

  readonly settlePayable: ReturnType<
    typeof createFinanceRepository
  >["settlePayable"];

  readonly reversePayablePayment: ReturnType<
    typeof createFinanceRepository
  >["reversePayablePayment"];

  readonly listRecurringPayables: ReturnType<
    typeof createFinanceRepository
  >["listRecurringPayables"];

  readonly createRecurringPayable: ReturnType<
    typeof createFinanceRepository
  >["createRecurringPayable"];

  readonly updateRecurringPayable: ReturnType<
    typeof createFinanceRepository
  >["updateRecurringPayable"];

  readonly deleteRecurringPayable: ReturnType<
    typeof createFinanceRepository
  >["deleteRecurringPayable"];

  readonly generateDueRecurringPayables: ReturnType<
    typeof createFinanceRepository
  >["generateDueRecurringPayables"];

  readonly renegotiateReceivables: ReturnType<
    typeof createFinanceRepository
  >["renegotiateReceivables"];

  readonly createCommissionRule: ReturnType<
    typeof createFinanceRepository
  >["createCommissionRule"];

  readonly generateCommissions: ReturnType<
    typeof createFinanceRepository
  >["generateCommissions"];

  readonly settleCommission: ReturnType<
    typeof createFinanceRepository
  >["settleCommission"];

  readonly reverseCommission: ReturnType<
    typeof createFinanceRepository
  >["reverseCommission"];

  readonly getDailyCash: ReturnType<
    typeof createFinanceRepository
  >["getDailyCash"];

  readonly listReceivedPayments: ReturnType<
    typeof createFinanceRepository
  >["listReceivedPayments"];

  readonly getRelationshipSettings: ReturnType<
    typeof createRelationshipRepository
  >["getRelationshipSettings"];

  readonly updateRelationshipSettings: ReturnType<
    typeof createRelationshipRepository
  >["updateRelationshipSettings"];

  readonly listContactSuggestions: ReturnType<
    typeof createRelationshipRepository
  >["listContactSuggestions"];

  readonly createContactActivity: ReturnType<
    typeof createRelationshipRepository
  >["createContactActivity"];

  readonly listBirthdays: ReturnType<
    typeof createRelationshipRepository
  >["listBirthdays"];

  readonly listContactActivities: ReturnType<
    typeof createRelationshipRepository
  >["listContactActivities"];

  readonly createSatisfactionSurvey: ReturnType<
    typeof createRelationshipRepository
  >["createSatisfactionSurvey"];

  readonly listSatisfactionSurveys: ReturnType<
    typeof createRelationshipRepository
  >["listSatisfactionSurveys"];

  readonly listHolidays: ReturnType<
    typeof createAgendaRepository
  >["listHolidays"];

  readonly createHoliday: ReturnType<
    typeof createAgendaRepository
  >["createHoliday"];

  readonly deleteHoliday: ReturnType<
    typeof createAgendaRepository
  >["deleteHoliday"];

  readonly listSubscriberIdsWithoutGroup: ReturnType<
    typeof createAgendaRepository
  >["listSubscriberIdsWithoutGroup"];

  readonly listAppointments: ReturnType<
    typeof createAgendaRepository
  >["listAppointments"];

  readonly listPendingFinalizationAppointments: ReturnType<
    typeof createAgendaRepository
  >["listPendingFinalizationAppointments"];

  readonly createAppointment: ReturnType<
    typeof createAgendaRepository
  >["createAppointment"];

  readonly createLeadAppointment: ReturnType<
    typeof createAgendaRepository
  >["createLeadAppointment"];

  readonly rescheduleAppointment: ReturnType<
    typeof createAgendaRepository
  >["rescheduleAppointment"];

  readonly findAppointmentServiceId: ReturnType<
    typeof createAgendaRepository
  >["findAppointmentServiceId"];

  readonly findAppointment: ReturnType<
    typeof createAgendaRepository
  >["findAppointment"];

  readonly updateAppointment: ReturnType<
    typeof createAgendaRepository
  >["updateAppointment"];
  readonly listAppointmentReschedules: ReturnType<
    typeof createAgendaRepository
  >["listAppointmentReschedules"];

  readonly createRecurringAppointments: ReturnType<
    typeof createAgendaRepository
  >["createRecurringAppointments"];

  readonly listScheduleBlocks: ReturnType<
    typeof createAgendaRepository
  >["listScheduleBlocks"];

  readonly createScheduleBlock: ReturnType<
    typeof createAgendaRepository
  >["createScheduleBlock"];

  readonly cancelScheduleBlock: ReturnType<
    typeof createAgendaRepository
  >["cancelScheduleBlock"];

  readonly getGroupWorkspace: ReturnType<
    typeof createAgendaRepository
  >["getGroupWorkspace"];

  readonly createGroupClass: ReturnType<
    typeof createAgendaRepository
  >["createGroupClass"];

  readonly updateGroupClass: ReturnType<
    typeof createAgendaRepository
  >["updateGroupClass"];

  readonly createGroupEnrollment: ReturnType<
    typeof createAgendaRepository
  >["createGroupEnrollment"];

  readonly cancelGroupEnrollment: ReturnType<
    typeof createAgendaRepository
  >["cancelGroupEnrollment"];

  readonly listGroupSessions: ReturnType<
    typeof createAgendaRepository
  >["listGroupSessions"];

  readonly recordGroupAttendance: ReturnType<
    typeof createAgendaRepository
  >["recordGroupAttendance"];

  readonly completeGroupSession: ReturnType<
    typeof createAgendaRepository
  >["completeGroupSession"];

  readonly bookReplacement: ReturnType<
    typeof createAgendaRepository
  >["bookReplacement"];

  readonly updateAppointmentStatus: ReturnType<
    typeof createAgendaRepository
  >["updateAppointmentStatus"];

  readonly getDashboard: ReturnType<
    typeof createReportsRepository
  >["getDashboard"];

  readonly getSalesReport: ReturnType<
    typeof createReportsRepository
  >["getSalesReport"];

  readonly getManagementReport: ReturnType<
    typeof createReportsRepository
  >["getManagementReport"];

  readonly listPatients: ReturnType<
    typeof createPatientsRepository
  >["listPatients"];

  readonly createPatient: ReturnType<
    typeof createPatientsRepository
  >["createPatient"];

  readonly createPatientWithNextStep: ReturnType<
    typeof createPatientsRepository
  >["createPatientWithNextStep"];

  readonly importPatients: ReturnType<
    typeof createPatientsRepository
  >["importPatients"];

  readonly updatePatient: ReturnType<
    typeof createPatientsRepository
  >["updatePatient"];

  readonly listPatientTags: ReturnType<
    typeof createPatientsRepository
  >["listPatientTags"];

  readonly listOverduePatientIds: ReturnType<
    typeof createPatientsRepository
  >["listOverduePatientIds"];

  readonly createPatientTag: ReturnType<
    typeof createPatientsRepository
  >["createPatientTag"];

  readonly updatePatientTag: ReturnType<
    typeof createPatientsRepository
  >["updatePatientTag"];

  readonly deletePatientTag: ReturnType<
    typeof createPatientsRepository
  >["deletePatientTag"];

  readonly getPatientTimeline: ReturnType<
    typeof createPatientsRepository
  >["getPatientTimeline"];

  readonly listPlanTemplates: ReturnType<
    typeof createPlansRepository
  >["listPlanTemplates"];

  readonly createPlanTemplate: ReturnType<
    typeof createPlansRepository
  >["createPlanTemplate"];

  readonly updatePlanTemplate: ReturnType<
    typeof createPlansRepository
  >["updatePlanTemplate"];

  readonly listPlanCatalog: ReturnType<
    typeof createPlansRepository
  >["listPlanCatalog"];

  readonly createPlanCatalogEntry: ReturnType<
    typeof createPlansRepository
  >["createPlanCatalogEntry"];

  readonly updatePlanCatalogEntry: ReturnType<
    typeof createPlansRepository
  >["updatePlanCatalogEntry"];

  readonly deletePlanCatalogEntry: ReturnType<
    typeof createPlansRepository
  >["deletePlanCatalogEntry"];

  readonly listPatientPlans: ReturnType<
    typeof createPlansRepository
  >["listPatientPlans"];

  readonly createPatientPlan: ReturnType<
    typeof createPlansRepository
  >["createPatientPlan"];

  readonly renewPatientPlan: ReturnType<
    typeof createPlansRepository
  >["renewPatientPlan"];

  readonly updatePatientPlanAutoRenew: ReturnType<
    typeof createPlansRepository
  >["updatePatientPlanAutoRenew"];

  readonly renewDuePatientPlans: ReturnType<
    typeof createPlansRepository
  >["renewDuePatientPlans"];

  readonly updatePatientPlanStatus: ReturnType<
    typeof createPlansRepository
  >["updatePatientPlanStatus"];

  readonly listSessionMovements: ReturnType<
    typeof createPlansRepository
  >["listSessionMovements"];

  readonly listClinicalRecords: ReturnType<
    typeof createClinicalRepository
  >["listClinicalRecords"];

  readonly saveClinicalRecord: ReturnType<
    typeof createClinicalRepository
  >["saveClinicalRecord"];

  readonly finalizeClinicalRecord: ReturnType<
    typeof createClinicalRepository
  >["finalizeClinicalRecord"];

  readonly listClinicalRecordRevisions: ReturnType<
    typeof createClinicalRepository
  >["listClinicalRecordRevisions"];

  readonly getClinicalWorkspace: ReturnType<
    typeof createClinicalRepository
  >["getClinicalWorkspace"];

  readonly createAssessmentTemplate: ReturnType<
    typeof createClinicalRepository
  >["createAssessmentTemplate"];

  readonly createClinicalAssessment: ReturnType<
    typeof createClinicalRepository
  >["createClinicalAssessment"];

  readonly createTherapeuticGoal: ReturnType<
    typeof createClinicalRepository
  >["createTherapeuticGoal"];

  readonly updateTherapeuticGoalStatus: ReturnType<
    typeof createClinicalRepository
  >["updateTherapeuticGoalStatus"];

  readonly createClinicalMeasurement: ReturnType<
    typeof createClinicalRepository
  >["createClinicalMeasurement"];

  readonly createTreatmentClosure: ReturnType<
    typeof createClinicalRepository
  >["createTreatmentClosure"];

  readonly createClinicalAttachment: ReturnType<
    typeof createClinicalRepository
  >["createClinicalAttachment"];

  readonly getClinicalAttachmentContent: ReturnType<
    typeof createClinicalRepository
  >["getClinicalAttachmentContent"];

  readonly createClinicalAddendum: ReturnType<
    typeof createClinicalRepository
  >["createClinicalAddendum"];

  readonly listClinicalAccessEvents: ReturnType<
    typeof createClinicalRepository
  >["listClinicalAccessEvents"];

  readonly listLeads: ReturnType<
    typeof createCommercialRepository
  >["listLeads"];

  readonly updateLead: ClinicRepository["updateLead"];
  readonly createLead: ReturnType<
    typeof createCommercialRepository
  >["createLead"];

  readonly moveLead: ReturnType<typeof createCommercialRepository>["moveLead"];

  readonly convertLead: ReturnType<
    typeof createCommercialRepository
  >["convertLead"];

  readonly getLeadActivity: ReturnType<
    typeof createCommercialRepository
  >["getLeadActivity"];

  readonly createLeadContact: ReturnType<
    typeof createCommercialRepository
  >["createLeadContact"];

  readonly createLeadTask: ReturnType<
    typeof createCommercialRepository
  >["createLeadTask"];

  readonly updateLeadTaskStatus: ReturnType<
    typeof createCommercialRepository
  >["updateLeadTaskStatus"];

  readonly getCommunicationCenter: ReturnType<
    typeof createCommunicationsRepository
  >["getCommunicationCenter"];

  readonly setCommunicationPreference: ReturnType<
    typeof createCommunicationsRepository
  >["setCommunicationPreference"];

  readonly queueManualMessage: ReturnType<
    typeof createCommunicationsRepository
  >["queueManualMessage"];

  readonly queueBroadcastMessages: ReturnType<
    typeof createCommunicationsRepository
  >["queueBroadcastMessages"];

  readonly generateReminders: ReturnType<
    typeof createCommunicationsRepository
  >["generateReminders"];

  readonly listDocumentTemplates: ReturnType<
    typeof createContractsRepository
  >["listDocumentTemplates"];

  readonly createDocumentTemplate: ReturnType<
    typeof createContractsRepository
  >["createDocumentTemplate"];

  readonly createDocumentTemplateVersion: ReturnType<
    typeof createContractsRepository
  >["createDocumentTemplateVersion"];

  readonly listIssuedDocuments: ReturnType<
    typeof createContractsRepository
  >["listIssuedDocuments"];

  readonly createIssuedDocument: ReturnType<
    typeof createContractsRepository
  >["createIssuedDocument"];

  readonly updateIssuedDocumentStatus: ReturnType<
    typeof createContractsRepository
  >["updateIssuedDocumentStatus"];
}
