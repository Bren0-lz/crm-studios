import { validateClinicalAnswers } from "../../modules/clinical/clinical-integrity.js";
import type {
  AssessmentField,
  AssessmentTemplateInput,
  ClinicalAddendumInput,
  ClinicalAlertInput,
  ClinicalAssessmentInput,
  ClinicalAttachment,
  ClinicalAttachmentContent,
  ClinicalAttachmentInput,
  ClinicalMeasurementInput,
  ClinicalRecordInput,
  ClinicalRecordRevision,
  ClinicalRecordStatus,
  ClinicalWorkspace,
  TherapeuticGoalInput,
  TherapeuticGoalStatus,
  TreatmentClosureInput,
} from "@crm/contracts";
import { compareClinicalAlerts } from "@crm/contracts";
import {
  assertClinicalWritePermission,
  inspectClinicalAttachment,
} from "../../modules/clinical/clinical-integrity.js";
import { assertAppointmentStarted } from "../../modules/agenda/appointment-start.js";
import { DomainError } from "../../repository.js";
import { randomUUID } from "node:crypto";
import type { MysqlRepositoryContext } from "./context.js";
import { writeAndRead } from "./sql.js";
import {
  type AssessmentTemplateRow,
  type ClinicalAccessEventRow,
  type ClinicalAddendumRow,
  type ClinicalAlertRow,
  type ClinicalAssessmentRow,
  type ClinicalAttachmentRow,
  type ClinicalMeasurementRow,
  type ClinicalRecordRow,
  type ClinicalRevisionRow,
  type PatientRow,
  type TherapeuticGoalRow,
  type TreatmentClosureRow,
  type UserRow,
  clinicalRecordColumns,
  mapAssessmentTemplate,
  mapClinicalAccessEvent,
  mapClinicalAddendum,
  mapClinicalAlert,
  mapClinicalAssessment,
  mapClinicalAttachment,
  mapClinicalMeasurement,
  mapClinicalRecord,
  mapPatient,
  mapTherapeuticGoal,
  mapTreatmentClosure,
  patientColumns,
  rowPermissions,
  userColumns,
} from "./helpers.js";

export function createClinicalRepository(
  repositoryContext: MysqlRepositoryContext,
) {
  return {
    async listClinicalRecords(clinicId: string, patientId?: string) {
      const result = await repositoryContext.pool.query<ClinicalRecordRow>(
        `
        SELECT ${clinicalRecordColumns}
        FROM clinical_records cr
        JOIN appointments a ON a.id = cr.appointment_id
        JOIN patients p ON p.id = cr.patient_id
        JOIN professionals pr ON pr.id = cr.professional_id
        JOIN users u ON u.id = cr.author_user_id
        WHERE cr.clinic_id = $1 AND ($2 IS NULL OR cr.patient_id IN (SELECT id FROM patients WHERE clinic_id=$1 AND (id=$2 OR merged_into_patient_id=$2)))
        ORDER BY a.starts_at DESC
      `,
        [clinicId, patientId ?? null],
      );
      return result.rows.map(mapClinicalRecord);
    },

    async saveClinicalRecord(
      clinicId: string,
      authorUserId: string,
      input: ClinicalRecordInput,
    ) {
      const client = await repositoryContext.pool.connect();
      try {
        await client.query("BEGIN");
        const leadAppointment = await client.query(
          `SELECT 1 FROM appointments
         WHERE clinic_id = $1 AND id = $2 AND lead_id IS NOT NULL`,
          [clinicId, input.appointmentId],
        );
        if (leadAppointment.rows[0])
          throw new DomainError(
            "LEAD_APPOINTMENT_NOT_ALLOWED",
            "Atendimento de lead não tem prontuário. Converta o lead em cliente primeiro.",
            409,
          );
        // Serialize creation/updating of the same appointment before deciding the operation.
        const locked = await client.query<{ startsAt: Date }>(
          `SELECT starts_at AS "startsAt" FROM appointments WHERE clinic_id=$1 AND id=$2 FOR UPDATE`,
          [clinicId, input.appointmentId],
        );
        if (locked.rows[0]) assertAppointmentStarted(locked.rows[0].startsAt);
        const current = await repositoryContext.findClinicalRecordByAppointment(
          client,
          clinicId,
          input.appointmentId,
        );
        const author = await client.query<UserRow>(
          `SELECT ${userColumns} FROM users WHERE clinic_id=$1 AND id=$2 AND active`,
          [clinicId, authorUserId],
        );
        assertClinicalWritePermission(
          author.rows[0]
            ? { permissions: rowPermissions(author.rows[0]) }
            : null,
          Boolean(current),
        );
        // Rascunho existente é atualizado; prontuário finalizado não muda (o atendimento
        // está travado acima, então não há gravação concorrente).
        const values = [
          clinicId,
          authorUserId,
          input.appointmentId,
          input.subjective,
          input.objective,
          input.assessment,
          input.plan,
          input.painScale ?? null,
        ];
        let savedId: string | undefined;
        if (current) {
          const updated = await client.query(
            `
            UPDATE clinical_records cr
            JOIN appointments a ON a.id = cr.appointment_id AND a.clinic_id = cr.clinic_id
            SET cr.author_user_id = $2, cr.subjective = $4, cr.objective = $5,
              cr.assessment = $6, cr.plan = $7, cr.pain_scale = $8,
              cr.version = cr.version + 1, cr.updated_at = NOW(6)
            WHERE cr.clinic_id = $1 AND cr.appointment_id = $3 AND cr.status = 'draft'
              AND a.status <> 'cancelled'
          `,
            values,
          );
          if (updated.rowCount) savedId = current.id;
        } else {
          const id = randomUUID();
          const inserted = await client.query(
            `
            INSERT INTO clinical_records (
              id, clinic_id, appointment_id, patient_id, professional_id, author_user_id,
              subjective, objective, assessment, plan, pain_scale
            )
            SELECT $9, $1, a.id, a.patient_id, a.professional_id, $2, $4, $5, $6, $7, $8
            FROM appointments a
            WHERE a.clinic_id = $1 AND a.id = $3 AND a.status <> 'cancelled'
          `,
            [...values, id],
          );
          if (inserted.rowCount) savedId = id;
        }
        if (!savedId) {
          const existing =
            await repositoryContext.findClinicalRecordByAppointment(
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
        await repositoryContext.captureClinicalRevision(
          client,
          clinicId,
          savedId,
        );
        const record = await repositoryContext.findClinicalRecord(
          client,
          clinicId,
          savedId,
        );
        await client.query("COMMIT");
        return record!;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    async finalizeClinicalRecord(
      clinicId: string,
      authorUserId: string,
      recordId: string,
    ) {
      const client = await repositoryContext.pool.connect();
      try {
        await client.query("BEGIN");
        const finalized = await client.query(
          `
          UPDATE clinical_records SET
            status = 'finalized', author_user_id = $2, version = version + 1,
            finalized_at = NOW(6), updated_at = NOW(6)
          WHERE clinic_id = $1 AND id = $3 AND status = 'draft'
            AND CHAR_LENGTH(TRIM(subjective)) > 0 AND CHAR_LENGTH(TRIM(objective)) > 0
            AND CHAR_LENGTH(TRIM(assessment)) > 0 AND CHAR_LENGTH(TRIM(plan)) > 0
        `,
          [clinicId, authorUserId, recordId],
        );
        if (!finalized.rowCount) {
          const existing = await repositoryContext.findClinicalRecord(
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
        await repositoryContext.captureClinicalRevision(
          client,
          clinicId,
          recordId,
        );
        const record = await repositoryContext.findClinicalRecord(
          client,
          clinicId,
          recordId,
        );
        await client.query("COMMIT");
        return record;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    async listClinicalRecordRevisions(clinicId: string, recordId: string) {
      const result = await repositoryContext.pool.query<ClinicalRevisionRow>(
        `
        SELECT rr.id, rr.clinical_record_id AS "clinicalRecordId", rr.version,
               JSON_VALUE(rr.snapshot, '$.status') AS status,
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
    },

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
        alerts,
      ] = await Promise.all([
        repositoryContext.pool.query<PatientRow>(
          `SELECT ${patientColumns} FROM patients WHERE clinic_id = $1 AND id = $2`,
          [clinicId, patientId],
        ),
        repositoryContext.operations.listClinicalRecords(clinicId, patientId),
        repositoryContext.pool.query<AssessmentTemplateRow>(
          `SELECT id, clinic_id AS "clinicId", name, specialty, fields, version,
                  active,status,family_id AS "familyId", created_at AS "createdAt"
           FROM assessment_templates
           WHERE clinic_id = $1 ORDER BY name, version DESC`,
          [clinicId],
        ),
        repositoryContext.pool.query<ClinicalAssessmentRow>(
          `SELECT ca.id, ca.clinic_id AS "clinicId", ca.patient_id AS "patientId",
                  ca.template_id AS "templateId", ca.appointment_id AS "appointmentId",
                  ca."values", ca.notes, at.name AS "templateName",
                  u.full_name AS "authorName", ca.created_at AS "createdAt"
           FROM clinical_assessments ca
           JOIN assessment_templates at ON at.id = ca.template_id
           JOIN users u ON u.id = ca.author_user_id
           WHERE ca.clinic_id = $1 AND ca.patient_id IN (SELECT id FROM patients WHERE clinic_id=$1 AND (id=$2 OR merged_into_patient_id=$2))
           ORDER BY ca.created_at DESC`,
          [clinicId, patientId],
        ),
        repositoryContext.pool.query<TherapeuticGoalRow>(
          `SELECT tg.id, tg.clinic_id AS "clinicId", tg.patient_id AS "patientId",
                  tg.title, tg.description, tg.baseline_value AS "baselineValue",
                  tg.target_value AS "targetValue", tg.unit,
                  tg.target_date AS "targetDate", tg.status,
                  tg.achieved_at AS "achievedAt", u.full_name AS "authorName",
                  tg.created_at AS "createdAt", tg.updated_at AS "updatedAt"
           FROM therapeutic_goals tg JOIN users u ON u.id = tg.author_user_id
           WHERE tg.clinic_id = $1 AND tg.patient_id IN (SELECT id FROM patients WHERE clinic_id=$1 AND (id=$2 OR merged_into_patient_id=$2))
           ORDER BY tg.created_at DESC`,
          [clinicId, patientId],
        ),
        repositoryContext.pool.query<ClinicalMeasurementRow>(
          `SELECT cm.id, cm.clinic_id AS "clinicId", cm.patient_id AS "patientId",
                  cm.goal_id AS "goalId", cm.name, cm.value, cm.unit,
                  cm.measured_at AS "measuredAt", cm.notes,
                  u.full_name AS "authorName", cm.created_at AS "createdAt"
           FROM clinical_measurements cm JOIN users u ON u.id = cm.author_user_id
           WHERE cm.clinic_id = $1 AND cm.patient_id IN (SELECT id FROM patients WHERE clinic_id=$1 AND (id=$2 OR merged_into_patient_id=$2))
           ORDER BY cm.measured_at DESC`,
          [clinicId, patientId],
        ),
        repositoryContext.pool.query<TreatmentClosureRow>(
          `SELECT tc.id, tc.clinic_id AS "clinicId", tc.patient_id AS "patientId",
                  tc.kind, tc.summary, tc.recommendations,
                  tc.occurred_at AS "occurredAt", u.full_name AS "authorName",
                  tc.created_at AS "createdAt"
           FROM treatment_closures tc JOIN users u ON u.id = tc.author_user_id
           WHERE tc.clinic_id = $1 AND tc.patient_id IN (SELECT id FROM patients WHERE clinic_id=$1 AND (id=$2 OR merged_into_patient_id=$2))
           ORDER BY tc.occurred_at DESC`,
          [clinicId, patientId],
        ),
        repositoryContext.pool.query<ClinicalAttachmentRow>(
          `SELECT ca.id, ca.clinic_id AS "clinicId", ca.patient_id AS "patientId",
                ca.file_name AS "fileName", ca.mime_type AS "mimeType",
                ca.size_in_bytes AS "sizeInBytes",ca.duration_in_seconds AS "durationInSeconds", ca.sha256, ca.notes,
                u.full_name AS "authorName", ca.created_at AS "createdAt"
         FROM clinical_attachments ca JOIN users u ON u.id = ca.author_user_id
         WHERE ca.clinic_id = $1 AND ca.patient_id IN (SELECT id FROM patients WHERE clinic_id=$1 AND (id=$2 OR merged_into_patient_id=$2))
         ORDER BY ca.created_at DESC`,
          [clinicId, patientId],
        ),
        repositoryContext.pool.query<ClinicalAddendumRow>(
          `SELECT ca.id, ca.clinic_id AS "clinicId", ca.patient_id AS "patientId",
                ca.clinical_record_id AS "clinicalRecordId", ca.reason,
                ca.content, u.full_name AS "authorName", ca.created_at AS "createdAt"
         FROM clinical_addenda ca JOIN users u ON u.id = ca.author_user_id
         WHERE ca.clinic_id = $1 AND ca.patient_id IN (SELECT id FROM patients WHERE clinic_id=$1 AND (id=$2 OR merged_into_patient_id=$2))
         ORDER BY ca.created_at DESC`,
          [clinicId, patientId],
        ),
        repositoryContext.pool.query<ClinicalAlertRow>(
          `SELECT ca.id, ca.clinic_id AS "clinicId", ca.patient_id AS "patientId",
                ca.severity, ca.text, u.full_name AS "authorName",
                ca.created_at AS "createdAt"
         FROM clinical_alerts ca JOIN users u ON u.id = ca.author_user_id
         WHERE ca.clinic_id = $1 AND ca.archived_at IS NULL
           AND ca.patient_id IN (SELECT id FROM patients WHERE clinic_id=$1 AND (id=$2 OR merged_into_patient_id=$2))`,
          [clinicId, patientId],
        ),
      ]);
      if (!patient.rows[0]) return null;
      await repositoryContext.addClinicalAccessEvent(
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
        alerts: alerts.rows.map(mapClinicalAlert).sort(compareClinicalAlerts),
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
      const version = await repositoryContext.pool.query<{ version: number }>(
        `SELECT coalesce(max(version) + 1, 1) AS version FROM assessment_templates
         WHERE clinic_id = $1 AND name = $2`,
        [clinicId, input.name],
      );
      const result = await writeAndRead<AssessmentTemplateRow>(
        repositoryContext.pool,
        `INSERT INTO assessment_templates
         (clinic_id, name, specialty, fields, version, id) VALUES ($1,$2,$3,$4,$6,$5)`,
        [
          clinicId,
          input.name,
          input.specialty,
          JSON.stringify(input.fields),
          randomUUID(),
          Number(version.rows[0]!.version),
        ],
        `SELECT id, clinic_id AS "clinicId", name, specialty, fields, version,
                 active, created_at AS "createdAt" FROM assessment_templates WHERE id = $5`,
      );
      return mapAssessmentTemplate(result.rows[0]!);
    },

    async createClinicalAssessment(
      clinicId: string,
      authorUserId: string,
      input: ClinicalAssessmentInput,
    ) {
      const context = await repositoryContext.pool.query<{
        fields: AssessmentField[];
        templateName: string;
      }>(
        `SELECT at.fields, at.name AS "templateName"
       FROM assessment_templates at
       WHERE at.clinic_id = $1 AND at.id = $2 AND at.active AND at.status='published'
         AND EXISTS (SELECT 1 FROM patients p WHERE p.clinic_id = $1 AND p.id = $3)
         AND EXISTS (SELECT 1 FROM users u WHERE u.clinic_id = $1 AND u.id = $4)
         AND ($5 IS NULL OR EXISTS (
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
      validateClinicalAnswers(context.rows[0].fields, input.values);
      const result = await writeAndRead<ClinicalAssessmentRow>(
        repositoryContext.pool,
        `INSERT INTO clinical_assessments (clinic_id, patient_id, template_id, appointment_id, author_user_id, "values", notes, id) VALUES ($1,$2,$3,$4,$5,$6,$7, $8)`,
        [
          clinicId,
          input.patientId,
          input.templateId,
          input.appointmentId || null,
          authorUserId,
          JSON.stringify(input.values),
          input.notes || null,
          randomUUID(),
        ],
        `SELECT i.id, i.clinic_id AS "clinicId", i.patient_id AS "patientId",
              i.template_id AS "templateId", i.appointment_id AS "appointmentId",
              i."values", i.notes, at.name AS "templateName",
              u.full_name AS "authorName", i.created_at AS "createdAt" FROM clinical_assessments i JOIN assessment_templates at ON at.id = i.template_id
       JOIN users u ON u.id = i.author_user_id WHERE i.id = $8`,
      );
      return mapClinicalAssessment(result.rows[0]!);
    },

    async createTherapeuticGoal(
      clinicId: string,
      authorUserId: string,
      input: TherapeuticGoalInput,
    ) {
      const result = await writeAndRead<TherapeuticGoalRow>(
        repositoryContext.pool,
        `INSERT INTO therapeutic_goals (clinic_id, patient_id, author_user_id, title, description,
            baseline_value, target_value, unit, target_date, id) SELECT $1,p.id,u.id,$4,$5,$6,$7,$8,$9, $10
         FROM patients p, users u
         WHERE p.clinic_id = $1 AND p.id = $2 AND u.clinic_id = $1 AND u.id = $3`,
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
          randomUUID(),
        ],
        `SELECT i.id, i.clinic_id AS "clinicId", i.patient_id AS "patientId",
              i.title, i.description, i.baseline_value AS "baselineValue",
              i.target_value AS "targetValue", i.unit,
              i.target_date AS "targetDate", i.status,
              i.achieved_at AS "achievedAt", u.full_name AS "authorName",
              i.created_at AS "createdAt", i.updated_at AS "updatedAt" FROM therapeutic_goals i JOIN users u ON u.id = i.author_user_id WHERE i.id = $10`,
      );
      if (!result.rows[0])
        throw new DomainError(
          "CLINICAL_CONTEXT_NOT_FOUND",
          "Cliente ou autor não encontrado.",
          404,
        );
      return mapTherapeuticGoal(result.rows[0]);
    },

    async updateTherapeuticGoalStatus(
      clinicId: string,
      goalId: string,
      status: TherapeuticGoalStatus,
    ) {
      const result = await writeAndRead<TherapeuticGoalRow>(
        repositoryContext.pool,
        `UPDATE therapeutic_goals SET
           achieved_at = CASE WHEN $3 = 'achieved' THEN NOW(6) ELSE achieved_at END,
           status = $3, updated_at = NOW(6)
         WHERE clinic_id = $1 AND id = $2 AND (status = 'active' OR status = $3)`,
        [clinicId, goalId, status],
        `SELECT i.id, i.clinic_id AS "clinicId", i.patient_id AS "patientId",
              i.title, i.description, i.baseline_value AS "baselineValue",
              i.target_value AS "targetValue", i.unit,
              i.target_date AS "targetDate", i.status,
              i.achieved_at AS "achievedAt", u.full_name AS "authorName",
              i.created_at AS "createdAt", i.updated_at AS "updatedAt"
       FROM therapeutic_goals i JOIN users u ON u.id = i.author_user_id
       WHERE i.clinic_id = $1 AND i.id = $2`,
      );
      if (result.rows[0]) return mapTherapeuticGoal(result.rows[0]);
      const existing = await repositoryContext.pool.query<{
        status: TherapeuticGoalStatus;
      }>(
        `SELECT status FROM therapeutic_goals WHERE clinic_id = $1 AND id = $2`,
        [clinicId, goalId],
      );
      if (!existing.rows[0]) return null;
      throw new DomainError(
        "THERAPEUTIC_GOAL_CLOSED",
        "Um objetivo encerrado não pode mudar de situação.",
        409,
      );
    },

    async createClinicalMeasurement(
      clinicId: string,
      authorUserId: string,
      input: ClinicalMeasurementInput,
    ) {
      const result = await writeAndRead<ClinicalMeasurementRow>(
        repositoryContext.pool,
        `INSERT INTO clinical_measurements (clinic_id, patient_id, goal_id, author_user_id, name, value, unit, measured_at, notes, id) SELECT $1,p.id,$3,u.id,$5,$6,$7,$8,$9, $10
         FROM patients p, users u
         WHERE p.clinic_id = $1 AND p.id = $2 AND u.clinic_id = $1 AND u.id = $4
           AND ($3 IS NULL OR EXISTS (
             SELECT 1 FROM therapeutic_goals tg
             WHERE tg.clinic_id = $1 AND tg.id = $3 AND tg.patient_id IN (SELECT id FROM patients WHERE clinic_id=$1 AND (id=$2 OR merged_into_patient_id=$2))
           ))`,
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
          randomUUID(),
        ],
        `SELECT i.id, i.clinic_id AS "clinicId", i.patient_id AS "patientId",
              i.goal_id AS "goalId", i.name, i.value, i.unit,
              i.measured_at AS "measuredAt", i.notes,
              u.full_name AS "authorName", i.created_at AS "createdAt" FROM clinical_measurements i JOIN users u ON u.id = i.author_user_id WHERE i.id = $10`,
      );
      if (!result.rows[0])
        throw new DomainError(
          "CLINICAL_CONTEXT_NOT_FOUND",
          "Cliente, objetivo ou autor não encontrado.",
          404,
        );
      return mapClinicalMeasurement(result.rows[0]);
    },

    async createTreatmentClosure(
      clinicId: string,
      authorUserId: string,
      input: TreatmentClosureInput,
    ) {
      const result = await writeAndRead<TreatmentClosureRow>(
        repositoryContext.pool,
        `INSERT INTO treatment_closures (clinic_id, patient_id, author_user_id, kind, summary, recommendations, occurred_at, id) SELECT $1,p.id,u.id,$4,$5,$6,$7, $8 FROM patients p, users u
         WHERE p.clinic_id = $1 AND p.id = $2 AND u.clinic_id = $1 AND u.id = $3`,
        [
          clinicId,
          input.patientId,
          authorUserId,
          input.kind,
          input.summary,
          input.recommendations || null,
          input.occurredAt,
          randomUUID(),
        ],
        `SELECT i.id, i.clinic_id AS "clinicId", i.patient_id AS "patientId",
              i.kind, i.summary, i.recommendations, i.occurred_at AS "occurredAt",
              u.full_name AS "authorName", i.created_at AS "createdAt" FROM treatment_closures i JOIN users u ON u.id = i.author_user_id WHERE i.id = $8`,
      );
      if (!result.rows[0])
        throw new DomainError(
          "CLINICAL_CONTEXT_NOT_FOUND",
          "Cliente ou autor não encontrado.",
          404,
        );
      return mapTreatmentClosure(result.rows[0]);
    },

    async createClinicalAttachment(
      clinicId: string,
      authorUserId: string,
      input: ClinicalAttachmentInput,
    ): Promise<ClinicalAttachment> {
      const inspected = inspectClinicalAttachment(input);
      const client = await repositoryContext.pool.connect();
      try {
        await client.query("BEGIN");
        const result = await writeAndRead<ClinicalAttachmentRow>(
          client,
          `INSERT INTO clinical_attachments (clinic_id, patient_id, author_user_id, file_name, mime_type,
              size_in_bytes, content, sha256, notes, duration_in_seconds, id) SELECT $1,p.id,u.id,$4,$5,$6,$7,$8,$9,$10, $11 FROM patients p, users u
           WHERE p.clinic_id = $1 AND p.id = $2 AND u.clinic_id = $1 AND u.id = $3`,
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
            input.durationInSeconds ?? null,
            randomUUID(),
          ],
          `SELECT i.id, i.clinic_id AS "clinicId", i.patient_id AS "patientId",
                i.file_name AS "fileName", i.mime_type AS "mimeType",
                i.size_in_bytes AS "sizeInBytes",i.duration_in_seconds AS "durationInSeconds", i.sha256, i.notes,
                u.full_name AS "authorName", i.created_at AS "createdAt" FROM clinical_attachments i JOIN users u ON u.id = i.author_user_id WHERE i.id = $11`,
        );
        if (!result.rows[0])
          throw new DomainError(
            "CLINICAL_CONTEXT_NOT_FOUND",
            "Cliente ou autor não encontrado.",
            404,
          );
        await repositoryContext.addClinicalAccessEvent(
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
    },

    async getClinicalAttachmentContent(
      clinicId: string,
      actorUserId: string,
      attachmentId: string,
    ): Promise<ClinicalAttachmentContent | null> {
      const result = await repositoryContext.pool.query<ClinicalAttachmentRow>(
        `SELECT ca.id, ca.clinic_id AS "clinicId", ca.patient_id AS "patientId",
              ca.file_name AS "fileName", ca.mime_type AS "mimeType",
              ca.size_in_bytes AS "sizeInBytes",ca.duration_in_seconds AS "durationInSeconds", ca.content, ca.sha256, ca.notes,
              u.full_name AS "authorName", ca.created_at AS "createdAt"
       FROM clinical_attachments ca JOIN users u ON u.id = ca.author_user_id
       WHERE ca.clinic_id = $1 AND ca.id = $2`,
        [clinicId, attachmentId],
      );
      if (!result.rows[0]?.content) return null;
      const metadata = mapClinicalAttachment(result.rows[0]);
      await repositoryContext.addClinicalAccessEvent(
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
    },

    async createClinicalAddendum(
      clinicId: string,
      authorUserId: string,
      input: ClinicalAddendumInput,
    ) {
      const client = await repositoryContext.pool.connect();
      try {
        await client.query("BEGIN");
        const result = await writeAndRead<ClinicalAddendumRow>(
          client,
          `INSERT INTO clinical_addenda (clinic_id, patient_id, clinical_record_id, author_user_id, reason, content, id) SELECT $1,cr.patient_id,cr.id,u.id,$4,$5, $6
           FROM clinical_records cr, users u
           WHERE cr.clinic_id = $1 AND cr.id = $2 AND cr.status = 'finalized'
             AND u.clinic_id = $1 AND u.id = $3`,
          [
            clinicId,
            input.clinicalRecordId,
            authorUserId,
            input.reason,
            input.content,
            randomUUID(),
          ],
          `SELECT i.id, i.clinic_id AS "clinicId", i.patient_id AS "patientId",
                i.clinical_record_id AS "clinicalRecordId", i.reason, i.content,
                u.full_name AS "authorName", i.created_at AS "createdAt" FROM clinical_addenda i JOIN users u ON u.id = i.author_user_id WHERE i.id = $6`,
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
        await repositoryContext.addClinicalAccessEvent(
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
    },

    async createClinicalAlert(
      clinicId: string,
      authorUserId: string,
      input: ClinicalAlertInput,
    ) {
      const result = await writeAndRead<ClinicalAlertRow>(
        repositoryContext.pool,
        `INSERT INTO clinical_alerts (clinic_id, patient_id, author_user_id, severity, text, id) SELECT $1, p.id, u.id, $4, $5, $6
           FROM patients p, users u
           WHERE p.clinic_id = $1 AND p.id = $2
             AND u.clinic_id = $1 AND u.id = $3`,
        [
          clinicId,
          input.patientId,
          authorUserId,
          input.severity,
          input.text,
          randomUUID(),
        ],
        `SELECT i.id, i.clinic_id AS "clinicId", i.patient_id AS "patientId",
                i.severity, i.text, u.full_name AS "authorName",
                i.created_at AS "createdAt" FROM clinical_alerts i JOIN users u ON u.id = i.author_user_id WHERE i.id = $6`,
      );
      if (!result.rows[0])
        throw new DomainError(
          "CLINICAL_CONTEXT_NOT_FOUND",
          "Cliente ou autor não encontrado.",
          404,
        );
      return mapClinicalAlert(result.rows[0]);
    },

    async archiveClinicalAlert(clinicId: string, alertId: string) {
      const result = await repositoryContext.pool.query(
        `UPDATE clinical_alerts SET archived_at = NOW(6)
         WHERE clinic_id = $1 AND id = $2 AND archived_at IS NULL`,
        [clinicId, alertId],
      );
      return (result.rowCount ?? 0) > 0;
    },

    async listClinicalAccessEvents(clinicId: string, patientId: string) {
      const result = await repositoryContext.pool.query<ClinicalAccessEventRow>(
        `SELECT id, clinic_id AS "clinicId", patient_id AS "patientId",
              actor_user_id AS "actorUserId", action,
              entity_type AS "entityType", entity_id AS "entityId",
              created_at AS "createdAt"
       FROM clinical_access_events
       WHERE clinic_id = $1 AND patient_id IN (SELECT id FROM patients WHERE clinic_id=$1 AND (id=$2 OR merged_into_patient_id=$2)) ORDER BY created_at DESC`,
        [clinicId, patientId],
      );
      return result.rows.map(mapClinicalAccessEvent);
    },
  };
}
