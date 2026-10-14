import type { PoolClient } from "pg";
import type {
  DocumentStatus,
  DocumentTemplateInput,
  IssuedDocumentInput,
  PatientPlanService,
} from "@crm/contracts";
import { formatPlanServices } from "../../modules/plans/plan-services.js";
import { DomainError } from "../../repository.js";
import type { PostgresRepositoryContext } from "./context.js";
import {
  type DocumentTemplateRow,
  type IssuedDocumentRow,
  documentTemplateColumns,
  hasDatabaseCode,
  issuedDocumentColumns,
  mapDocumentTemplate,
  mapIssuedDocument,
} from "./helpers.js";

export function createContractsRepository(
  repositoryContext: PostgresRepositoryContext,
) {
  return {
    async listDocumentTemplates(clinicId: string) {
      const result = await repositoryContext.pool.query<DocumentTemplateRow>(
        `SELECT ${documentTemplateColumns} FROM document_templates
       WHERE clinic_id = $1 ORDER BY name, version DESC`,
        [clinicId],
      );
      return result.rows.map(mapDocumentTemplate);
    },

    async createDocumentTemplate(
      clinicId: string,
      input: DocumentTemplateInput,
    ) {
      try {
        const result = await repositoryContext.pool.query<DocumentTemplateRow>(
          `INSERT INTO document_templates
           (clinic_id, name, kind, version, body)
         VALUES ($1,$2,$3,1,$4)
         RETURNING ${documentTemplateColumns}`,
          [clinicId, input.name, input.kind, input.body],
        );
        return mapDocumentTemplate(result.rows[0]!);
      } catch (error) {
        if (hasDatabaseCode(error, "23505"))
          throw new DomainError(
            "DOCUMENT_TEMPLATE_DUPLICATE",
            "Já existe um modelo ativo com este nome.",
            409,
          );
        throw error;
      }
    },

    async createDocumentTemplateVersion(
      clinicId: string,
      templateId: string,
      body: string,
    ) {
      const client = await repositoryContext.pool.connect();
      try {
        await client.query("BEGIN");
        const current = await client.query<DocumentTemplateRow>(
          `SELECT ${documentTemplateColumns} FROM document_templates
         WHERE clinic_id = $1 AND id = $2 FOR UPDATE`,
          [clinicId, templateId],
        );
        if (!current.rows[0]) {
          await client.query("COMMIT");
          return null;
        }
        const template = current.rows[0];
        const versionResult = await client.query<{ nextVersion: number }>(
          `SELECT COALESCE(MAX(version), 0) + 1 AS "nextVersion"
         FROM document_templates WHERE clinic_id = $1 AND name = $2`,
          [clinicId, template.name],
        );
        await client.query(
          `UPDATE document_templates SET active = false
         WHERE clinic_id = $1 AND name = $2 AND active`,
          [clinicId, template.name],
        );
        const result = await client.query<DocumentTemplateRow>(
          `INSERT INTO document_templates
           (clinic_id, name, kind, version, body, previous_version_id)
         VALUES ($1,$2,$3,$4,$5,$6)
         RETURNING ${documentTemplateColumns}`,
          [
            clinicId,
            template.name,
            template.kind,
            versionResult.rows[0]!.nextVersion,
            body,
            template.id,
          ],
        );
        await client.query("COMMIT");
        return mapDocumentTemplate(result.rows[0]!);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    async listIssuedDocuments(clinicId: string) {
      const result = await repositoryContext.pool.query<IssuedDocumentRow>(
        `SELECT ${issuedDocumentColumns}
       FROM issued_documents d
       JOIN patients p ON p.id = d.patient_id
       LEFT JOIN patient_plans pp ON pp.id = d.plan_id
       WHERE d.clinic_id = $1 ORDER BY d.created_at DESC`,
        [clinicId],
      );
      return result.rows.map(mapIssuedDocument);
    },

    async createIssuedDocument(
      clinicId: string,
      actorUserId: string,
      input: IssuedDocumentInput,
    ) {
      return repositoryContext.inTransaction((client) =>
        createIssuedDocumentInTransaction(
          repositoryContext,
          client,
          clinicId,
          actorUserId,
          input,
        ),
      );
    },

    async updateIssuedDocumentStatus(
      clinicId: string,
      documentId: string,
      status: Exclude<DocumentStatus, "draft">,
    ) {
      const client = await repositoryContext.pool.connect();
      try {
        await client.query("BEGIN");
        const current = await client.query<{ status: DocumentStatus }>(
          `SELECT status FROM issued_documents
         WHERE clinic_id = $1 AND id = $2 FOR UPDATE`,
          [clinicId, documentId],
        );
        if (!current.rows[0]) {
          await client.query("COMMIT");
          return null;
        }
        if (current.rows[0].status === "cancelled")
          throw new DomainError(
            "DOCUMENT_ALREADY_CANCELLED",
            "Um documento cancelado não pode ser alterado.",
            409,
          );
        if (status === "issued" && current.rows[0].status !== "draft")
          throw new DomainError(
            "DOCUMENT_ALREADY_ISSUED",
            "Este documento já foi emitido.",
            409,
          );
        await client.query(
          `UPDATE issued_documents
         SET status = $3,
             issued_at = CASE WHEN $3 = 'issued' THEN now() ELSE issued_at END,
             cancelled_at = CASE WHEN $3 = 'cancelled' THEN now() ELSE cancelled_at END,
             updated_at = now()
         WHERE clinic_id = $1 AND id = $2`,
          [clinicId, documentId, status],
        );
        const document = await repositoryContext.findIssuedDocument(
          client,
          clinicId,
          documentId,
        );
        await client.query("COMMIT");
        return document;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
  };
}

export async function createIssuedDocumentInTransaction(
  repositoryContext: PostgresRepositoryContext,
  client: PoolClient,
  clinicId: string,
  actorUserId: string,
  input: IssuedDocumentInput,
) {
  const professionalId = input.professionalId;
  const context = await client.query<{
    templateName: string;
    templateVersion: number;
    templateBody: string;
    patientName: string;
    planName: string | null;
    planServices: PatientPlanService[] | null;
    clinicName: string;
    professionalName: string | null;
    professionalCrefito: string | null;
  }>(
    `SELECT dt.name AS "templateName", dt.version AS "templateVersion",
              dt.body AS "templateBody", p.full_name AS "patientName",
              pp.name AS "planName", c.name AS "clinicName",
              (SELECT jsonb_agg(jsonb_build_object('serviceName', x.service_name, 'totalSessions', x.total_sessions, 'totalValueInCents', x.total_value_in_cents) ORDER BY x.position) FROM patient_plan_services x WHERE x.plan_id=pp.id) AS "planServices",
              pr.full_name AS "professionalName",
              pr.crefito AS "professionalCrefito"
       FROM document_templates dt
       JOIN clinics c ON c.id = dt.clinic_id
       JOIN patients p ON p.clinic_id = dt.clinic_id AND p.id = $3
       LEFT JOIN patient_plans pp
         ON pp.clinic_id = dt.clinic_id AND pp.id = $4 AND pp.patient_id = p.id
       LEFT JOIN professionals pr
         ON pr.clinic_id = dt.clinic_id AND pr.id = $5
       WHERE dt.clinic_id = $1 AND dt.id = $2 AND dt.active
         AND ($4::uuid IS NULL OR pp.id IS NOT NULL)
         AND ($5::uuid IS NULL OR pr.id IS NOT NULL)`,
    [
      clinicId,
      input.templateId,
      input.patientId,
      input.planId || null,
      professionalId || null,
    ],
  );
  if (!context.rows[0]) {
    const template = await client.query(
      `SELECT 1 FROM document_templates
         WHERE clinic_id = $1 AND id = $2 AND active`,
      [clinicId, input.templateId],
    );
    if (!template.rows[0])
      throw new DomainError(
        "DOCUMENT_TEMPLATE_NOT_FOUND",
        "Modelo ativo não encontrado.",
        404,
      );
    const patient = await client.query(
      `SELECT 1 FROM patients WHERE clinic_id = $1 AND id = $2`,
      [clinicId, input.patientId],
    );
    if (!patient.rows[0])
      throw new DomainError(
        "PATIENT_NOT_FOUND",
        "Cliente não encontrado.",
        404,
      );
    if (professionalId) {
      const professional = await client.query(
        `SELECT 1 FROM professionals WHERE clinic_id = $1 AND id = $2`,
        [clinicId, professionalId],
      );
      if (!professional.rows[0])
        throw new DomainError(
          "PROFESSIONAL_NOT_FOUND",
          "Profissional não encontrado.",
          404,
        );
    }
    throw new DomainError(
      "DOCUMENT_PLAN_MISMATCH",
      "O plano informado não pertence ao cliente.",
    );
  }
  const item = context.rows[0];
  const emissionDate = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
  }).format(new Date());
  const snapshot = item.templateBody
    .replaceAll("{{paciente_nome}}", item.patientName)
    .replaceAll("{{plano_nome}}", item.planName ?? "Não vinculado")
    .replaceAll(
      "{{plano_servicos}}",
      formatPlanServices(item.planServices ?? []) || "Não vinculado",
    )
    .replaceAll("{{profissional_nome}}", item.professionalName ?? "")
    .replaceAll("{{profissional_crefito}}", item.professionalCrefito ?? "")
    .replaceAll("{{data_emissao}}", emissionDate)
    .replaceAll("{{clinica_nome}}", item.clinicName);
  const result = await client.query<IssuedDocumentRow>(
    `WITH inserted AS (
         INSERT INTO issued_documents
           (clinic_id, template_id, patient_id, plan_id, title, template_name,
            template_version, snapshot_body, created_by_user_id, professional_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         RETURNING *
       )
       SELECT ${issuedDocumentColumns}
       FROM inserted d
       JOIN patients p ON p.id = d.patient_id
       LEFT JOIN patient_plans pp ON pp.id = d.plan_id`,
    [
      clinicId,
      input.templateId,
      input.patientId,
      input.planId || null,
      input.title,
      item.templateName,
      item.templateVersion,
      snapshot,
      actorUserId,
      professionalId || null,
    ],
  );
  return mapIssuedDocument(result.rows[0]!);
}
