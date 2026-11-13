export {
  adminUserSelect,
  mapAdminUser,
  mapAuthenticatedUser,
  present,
  rowPermissions,
  userColumns,
} from "./mappers/administration.js";
export type {
  AdminUserRow,
  ProfessionalRow,
  RoomRow,
  ServiceRow,
  UserRow,
} from "./mappers/administration.js";
export {
  appointmentColumns,
  appointmentJoins,
  groupEnrollmentColumns,
  groupEnrollmentCoversSessionSql,
  groupSessionColumns,
  hasGroupSessionConflict,
  holidayColumns,
  mapAppointment,
  mapGroupAttendance,
  mapGroupClass,
  mapGroupEnrollment,
  mapGroupSession,
  mapHoliday,
  mapReplacementCredit,
  mapScheduleBlock,
} from "./mappers/agenda.js";
export type {
  AppointmentRow,
  GroupAttendanceRow,
  GroupClassRow,
  GroupEnrollmentRow,
  GroupSessionRow,
  HolidayRow,
  ReplacementCreditRow,
  ScheduleBlockRow,
} from "./mappers/agenda.js";
export {
  clinicalRecordColumns,
  mapAssessmentTemplate,
  mapClinicalAccessEvent,
  mapClinicalAddendum,
  mapClinicalAlert,
  mapClinicalAssessment,
  mapClinicalAttachment,
  mapClinicalMeasurement,
  mapClinicalRecord,
  mapTherapeuticGoal,
  mapTreatmentClosure,
} from "./mappers/clinical.js";
export type {
  AssessmentTemplateRow,
  ClinicalAccessEventRow,
  ClinicalAddendumRow,
  ClinicalAlertRow,
  ClinicalAssessmentRow,
  ClinicalAttachmentRow,
  ClinicalMeasurementRow,
  ClinicalRecordRow,
  ClinicalRevisionRow,
  TherapeuticGoalRow,
  TreatmentClosureRow,
} from "./mappers/clinical.js";
export {
  leadColumns,
  mapLead,
  mapLeadContact,
  mapLeadStageChange,
  mapLeadTask,
} from "./mappers/commercial.js";
export type {
  LeadContactRow,
  LeadRow,
  LeadStageChangeRow,
  LeadTaskRow,
} from "./mappers/commercial.js";
export { bool, json, phoneSearchDigits } from "./mappers/common.js";
export {
  communicationRecipient,
  mapCommunicationPreference,
  mapOutboundMessage,
  outboundMessageColumns,
} from "./mappers/communications.js";
export type {
  CommunicationPreferenceRow,
  OutboundMessageRow,
} from "./mappers/communications.js";
export {
  documentTemplateColumns,
  issuedDocumentColumns,
  issuedDocumentJoins,
  mapDocumentTemplate,
  mapIssuedDocument,
} from "./mappers/contracts.js";
export type {
  DocumentTemplateRow,
  IssuedDocumentRow,
} from "./mappers/contracts.js";
export {
  hasDatabaseCode,
  mapAdminUserWithCommission,
  mapCommissionEntry,
  mapCommissionRule,
  mapPatientTab,
  mapPatientTabItem,
  mapPayable,
  mapProduct,
  productStockRowsColumn,
  mapReceivable,
  mapRecurringPayable,
  mapStockMovement,
  payableColumns,
  paymentInstallmentsValue,
  receivableColumns,
  recurringPayableColumns,
} from "./mappers/finance.js";
export type {
  CommissionEntryRow,
  CommissionRuleRow,
  CostCenterRow,
  FinancialCategoryRow,
  PatientTabItemRow,
  PatientTabRow,
  PayableRow,
  ProductRow,
  ReceivableRow,
  RecurringPayableRow,
  StockMovementRow,
} from "./mappers/finance.js";
export {
  ensurePatientTags,
  mapPatient,
  mapPatientTag,
  patientColumns,
  patientTagColumns,
} from "./mappers/patients.js";
export type { PatientRow, PatientTagRow } from "./mappers/patients.js";
export {
  mapPatientPlan,
  mapPlanCatalog,
  mapPlanTemplate,
  patientPlanColumns,
  planCatalogColumns,
  planTemplateColumns,
} from "./mappers/plans.js";
export type {
  PatientPlanRow,
  PlanCatalogRow,
  PlanTemplateRow,
  SessionMovementRow,
} from "./mappers/plans.js";
export {
  contactActivityColumns,
  mapContactActivity,
  mapSatisfactionSurvey,
  satisfactionSurveyColumns,
} from "./mappers/relationship.js";
export type {
  ContactActivityRow,
  SatisfactionSurveyRow,
} from "./mappers/relationship.js";

/**
 * Filtro de filial: o parâmetro `$n` recebe `context.branchReadIds()` (`null` = todas as
 * filiais; senão um array, enviado como JSON).
 */
export const branchClause = (column: string, parameter: number) =>
  `($${parameter} IS NULL OR JSON_CONTAINS($${parameter}, JSON_QUOTE(${column})))`;
