import { validateClinicalAnswers } from "../../modules/clinical/clinical-integrity.js";
import type {
  AssessmentTemplate,
  AssessmentTemplateInput,
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
  ClinicalWorkspace,
  TherapeuticGoal,
  TherapeuticGoalInput,
  TherapeuticGoalStatus,
  TreatmentClosure,
  TreatmentClosureInput,
} from "@crm/contracts";
import { compareClinicalAlerts } from "@crm/contracts";
import {
  assertClinicalWritePermission,
  inspectClinicalAttachment,
} from "../../modules/clinical/clinical-integrity.js";
import { assertAppointmentStarted } from "../../modules/agenda/appointment-start.js";
import { DomainError } from "../../repository.js";
import type { MemoryRepositoryContext } from "./context.js";
import { now, uuid } from "./helpers.js";

export function createClinicalRepository(
  repositoryContext: MemoryRepositoryContext,
) {
  return {
    async listClinicalRecords(clinicId: string, patientId?: string) {
      return repositoryContext.clinicalRecords
        .filter(
          (record) =>
            record.clinicId === clinicId &&
            (!patientId ||
              repositoryContext
                .patientIds(clinicId, patientId)
                .has(record.patientId)),
        )
        .map((record) => ({
          ...record,
          professionalCrefito: repositoryContext.professionalCrefito(
            clinicId,
            record.professionalId,
          ),
        }))
        .sort((a, b) =>
          b.appointmentStartsAt.localeCompare(a.appointmentStartsAt),
        );
    },

    async saveClinicalRecord(
      clinicId: string,
      authorUserId: string,
      input: ClinicalRecordInput,
    ) {
      const appointment = repositoryContext.appointments.find(
        (item) => item.clinicId === clinicId && item.id === input.appointmentId,
      );
      const author = repositoryContext.users.find(
        (item) =>
          item.clinicId === clinicId && item.id === authorUserId && item.active,
      );
      if (!appointment || !author) {
        throw new DomainError(
          "CLINICAL_CONTEXT_NOT_FOUND",
          "Atendimento ou autor não encontrado.",
          404,
        );
      }
      const patientId = appointment.patientId;
      if (!patientId)
        throw new DomainError(
          "LEAD_APPOINTMENT_NOT_ALLOWED",
          "Atendimento de lead não tem prontuário. Converta o lead em cliente primeiro.",
          409,
        );
      if (appointment.status === "cancelled") {
        throw new DomainError(
          "CANCELLED_APPOINTMENT",
          "Não é possível registrar evolução em um atendimento cancelado.",
        );
      }

      assertAppointmentStarted(appointment.startsAt);

      const existing = repositoryContext.clinicalRecords.find(
        (record) => record.appointmentId === appointment.id,
      );
      assertClinicalWritePermission(author, Boolean(existing));
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
        patientId,
        professionalId: appointment.professionalId,
        status: "draft",
        version: 0,
        authorName: author.fullName,
        patientName: appointment.patientName,
        professionalName: appointment.professionalName,
        professionalCrefito: "",
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
        professionalCrefito: repositoryContext.professionalCrefito(
          clinicId,
          record.professionalId,
        ),
        version: record.version + 1,
        updatedAt: timestamp,
      });
      if (!existing) repositoryContext.clinicalRecords.push(record);
      repositoryContext.addClinicalRevision(record, author.fullName);
      return record;
    },

    async finalizeClinicalRecord(
      clinicId: string,
      authorUserId: string,
      recordId: string,
    ) {
      const record = repositoryContext.clinicalRecords.find(
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
      const author = repositoryContext.users.find(
        (item) => item.clinicId === clinicId && item.id === authorUserId,
      );
      if (!author) return null;
      record.status = "finalized";
      record.version += 1;
      record.authorName = author.fullName;
      record.finalizedAt = now();
      record.updatedAt = record.finalizedAt;
      repositoryContext.addClinicalRevision(record, author.fullName);
      return record;
    },

    async listClinicalRecordRevisions(clinicId: string, recordId: string) {
      const belongsToClinic = repositoryContext.clinicalRecords.some(
        (record) => record.clinicId === clinicId && record.id === recordId,
      );
      if (!belongsToClinic) return [];
      return repositoryContext.clinicalRecordRevisions
        .filter((revision) => revision.clinicalRecordId === recordId)
        .sort((a, b) => b.version - a.version);
    },

    async getClinicalWorkspace(
      clinicId: string,
      patientId: string,
      actorUserId: string,
      accessAction: "read" | "export" = "read",
    ): Promise<ClinicalWorkspace | null> {
      const patient = repositoryContext.patients.find(
        (item) => item.clinicId === clinicId && item.id === patientId,
      );
      if (!patient) return null;
      repositoryContext.addClinicalAccessEvent(
        clinicId,
        patientId,
        actorUserId,
        accessAction,
        "workspace",
      );
      return {
        patient,
        records: await repositoryContext.operations.listClinicalRecords(
          clinicId,
          patientId,
        ),
        // Inclui versões antigas e arquivadas: as avaliações já registradas usam os campos delas.
        templates: repositoryContext.assessmentTemplates.filter(
          (item) => item.clinicId === clinicId,
        ),
        assessments: repositoryContext.clinicalAssessments
          .filter(
            (item) =>
              item.clinicId === clinicId &&
              repositoryContext
                .patientIds(clinicId, patientId)
                .has(item.patientId),
          )
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
        goals: repositoryContext.therapeuticGoals
          .filter(
            (item) =>
              item.clinicId === clinicId &&
              repositoryContext
                .patientIds(clinicId, patientId)
                .has(item.patientId),
          )
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
        measurements: repositoryContext.clinicalMeasurements
          .filter(
            (item) =>
              item.clinicId === clinicId &&
              repositoryContext
                .patientIds(clinicId, patientId)
                .has(item.patientId),
          )
          .sort((a, b) => b.measuredAt.localeCompare(a.measuredAt)),
        closures: repositoryContext.treatmentClosures
          .filter(
            (item) =>
              item.clinicId === clinicId &&
              repositoryContext
                .patientIds(clinicId, patientId)
                .has(item.patientId),
          )
          .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)),
        attachments: repositoryContext.clinicalAttachments
          .filter(
            (item) =>
              item.clinicId === clinicId &&
              repositoryContext
                .patientIds(clinicId, patientId)
                .has(item.patientId),
          )
          .map(({ contentBase64: _, ...item }) => {
            void _;
            return item;
          })
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
        addenda: repositoryContext.clinicalAddenda
          .filter(
            (item) =>
              item.clinicId === clinicId &&
              repositoryContext
                .patientIds(clinicId, patientId)
                .has(item.patientId),
          )
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
        alerts: repositoryContext.clinicalAlerts
          .filter(
            (item) =>
              item.clinicId === clinicId &&
              !item.archivedAt &&
              repositoryContext
                .patientIds(clinicId, patientId)
                .has(item.patientId),
          )
          .map(({ archivedAt: _, ...item }) => {
            void _;
            return item;
          })
          .sort(compareClinicalAlerts),
      };
    },

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
      const previousVersions = repositoryContext.assessmentTemplates.filter(
        (item) => item.clinicId === clinicId && item.name === input.name,
      );
      const template: AssessmentTemplate = {
        ...input,
        id: uuid(),
        clinicId,
        version:
          Math.max(0, ...previousVersions.map((item) => item.version)) + 1,
        active: true,
        createdAt: timestamp,
      };
      repositoryContext.assessmentTemplates.push(template);
      return template;
    },

    async createClinicalAssessment(
      clinicId: string,
      authorUserId: string,
      input: ClinicalAssessmentInput,
    ) {
      const patient = repositoryContext.patients.find(
        (item) => item.clinicId === clinicId && item.id === input.patientId,
      );
      const author = repositoryContext.users.find(
        (item) => item.clinicId === clinicId && item.id === authorUserId,
      );
      const template = repositoryContext.assessmentTemplates.find(
        (item) =>
          item.clinicId === clinicId &&
          item.id === input.templateId &&
          item.active &&
          item.status !== "draft",
      );
      const appointment = input.appointmentId
        ? repositoryContext.appointments.find(
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
          "Cliente, modelo, atendimento ou autor não encontrado.",
          404,
        );
      validateClinicalAnswers(template.fields, input.values);
      const assessment: ClinicalAssessment = {
        ...input,
        id: uuid(),
        clinicId,
        templateName: template.name,
        authorName: author.fullName,
        createdAt: now(),
      };
      repositoryContext.clinicalAssessments.push(assessment);
      return assessment;
    },

    async createTherapeuticGoal(
      clinicId: string,
      authorUserId: string,
      input: TherapeuticGoalInput,
    ) {
      const patient = repositoryContext.patients.find(
        (item) => item.clinicId === clinicId && item.id === input.patientId,
      );
      const author = repositoryContext.users.find(
        (item) => item.clinicId === clinicId && item.id === authorUserId,
      );
      if (!patient || !author)
        throw new DomainError(
          "CLINICAL_CONTEXT_NOT_FOUND",
          "Cliente ou autor não encontrado.",
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
      repositoryContext.therapeuticGoals.push(goal);
      return goal;
    },

    async updateTherapeuticGoalStatus(
      clinicId: string,
      goalId: string,
      status: TherapeuticGoalStatus,
    ) {
      const goal = repositoryContext.therapeuticGoals.find(
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
    },

    async createClinicalMeasurement(
      clinicId: string,
      authorUserId: string,
      input: ClinicalMeasurementInput,
    ) {
      const patient = repositoryContext.patients.find(
        (item) => item.clinicId === clinicId && item.id === input.patientId,
      );
      const author = repositoryContext.users.find(
        (item) => item.clinicId === clinicId && item.id === authorUserId,
      );
      const goal = input.goalId
        ? repositoryContext.therapeuticGoals.find(
            (item) =>
              item.clinicId === clinicId &&
              item.id === input.goalId &&
              repositoryContext
                .patientIds(clinicId, input.patientId)
                .has(item.patientId),
          )
        : undefined;
      if (!patient || !author || (input.goalId && !goal))
        throw new DomainError(
          "CLINICAL_CONTEXT_NOT_FOUND",
          "Cliente, objetivo ou autor não encontrado.",
          404,
        );
      const measurement: ClinicalMeasurement = {
        ...input,
        id: uuid(),
        clinicId,
        authorName: author.fullName,
        createdAt: now(),
      };
      repositoryContext.clinicalMeasurements.push(measurement);
      return measurement;
    },

    async createTreatmentClosure(
      clinicId: string,
      authorUserId: string,
      input: TreatmentClosureInput,
    ) {
      const patient = repositoryContext.patients.find(
        (item) => item.clinicId === clinicId && item.id === input.patientId,
      );
      const author = repositoryContext.users.find(
        (item) => item.clinicId === clinicId && item.id === authorUserId,
      );
      if (!patient || !author)
        throw new DomainError(
          "CLINICAL_CONTEXT_NOT_FOUND",
          "Cliente ou autor não encontrado.",
          404,
        );
      const closure: TreatmentClosure = {
        ...input,
        id: uuid(),
        clinicId,
        authorName: author.fullName,
        createdAt: now(),
      };
      repositoryContext.treatmentClosures.push(closure);
      return closure;
    },

    async createClinicalAttachment(
      clinicId: string,
      authorUserId: string,
      input: ClinicalAttachmentInput,
    ): Promise<ClinicalAttachment> {
      const patient = repositoryContext.patients.find(
        (item) => item.clinicId === clinicId && item.id === input.patientId,
      );
      const author = repositoryContext.users.find(
        (item) => item.clinicId === clinicId && item.id === authorUserId,
      );
      if (!patient || !author)
        throw new DomainError(
          "CLINICAL_CONTEXT_NOT_FOUND",
          "Cliente ou autor não encontrado.",
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
      repositoryContext.clinicalAttachments.push(attachment);
      repositoryContext.addClinicalAccessEvent(
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
    },

    async getClinicalAttachmentContent(
      clinicId: string,
      actorUserId: string,
      attachmentId: string,
    ) {
      const attachment = repositoryContext.clinicalAttachments.find(
        (item) => item.clinicId === clinicId && item.id === attachmentId,
      );
      if (!attachment) return null;
      repositoryContext.addClinicalAccessEvent(
        clinicId,
        attachment.patientId,
        actorUserId,
        "download",
        "attachment",
        attachment.id,
      );
      return attachment;
    },

    async createClinicalAddendum(
      clinicId: string,
      authorUserId: string,
      input: ClinicalAddendumInput,
    ) {
      const record = repositoryContext.clinicalRecords.find(
        (item) =>
          item.clinicId === clinicId && item.id === input.clinicalRecordId,
      );
      const author = repositoryContext.users.find(
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
      repositoryContext.clinicalAddenda.push(addendum);
      repositoryContext.addClinicalAccessEvent(
        clinicId,
        record.patientId,
        authorUserId,
        "addendum",
        "clinical_record",
        record.id,
      );
      return addendum;
    },

    async createClinicalAlert(
      clinicId: string,
      authorUserId: string,
      input: ClinicalAlertInput,
    ) {
      const patient = repositoryContext.patients.find(
        (item) => item.clinicId === clinicId && item.id === input.patientId,
      );
      const author = repositoryContext.users.find(
        (item) => item.clinicId === clinicId && item.id === authorUserId,
      );
      if (!patient || !author)
        throw new DomainError(
          "CLINICAL_CONTEXT_NOT_FOUND",
          "Cliente ou autor não encontrado.",
          404,
        );
      const alert: ClinicalAlert = {
        ...input,
        id: uuid(),
        clinicId,
        authorName: author.fullName,
        createdAt: now(),
      };
      repositoryContext.clinicalAlerts.push({ ...alert });
      return alert;
    },

    async archiveClinicalAlert(clinicId: string, alertId: string) {
      const alert = repositoryContext.clinicalAlerts.find(
        (item) =>
          item.clinicId === clinicId && item.id === alertId && !item.archivedAt,
      );
      if (!alert) return false;
      alert.archivedAt = now();
      return true;
    },

    async listClinicalAccessEvents(clinicId: string, patientId: string) {
      return repositoryContext.clinicalAccessEvents
        .filter(
          (item) =>
            item.clinicId === clinicId &&
            repositoryContext
              .patientIds(clinicId, patientId)
              .has(item.patientId),
        )
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
  };
}
