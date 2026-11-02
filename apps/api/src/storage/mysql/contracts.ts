import {
  documentTemplateInputSchema,
  documentTemplateVersionInputSchema,
  documentBranding,
  prepareDocumentContent,
  documentContentFields,
  documentContentText,
  type DocumentContent,
  type DocumentDraftInput,
  type DocumentPreview,
} from "@crm/contracts";
import type { PoolClient } from "../../infrastructure/mysql-client.js";
import {
  documentTemplateValues,
  type DocumentTemplateContext,
  type DocumentStatus,
  type DocumentTemplateInput,
  type IssuedDocumentInput,
  type PatientPlanService,
} from "@crm/contracts";
import { formatPlanServices } from "../../modules/plans/plan-services.js";
import { DomainError } from "../../repository.js";
import { randomUUID } from "node:crypto";
import type { MysqlRepositoryContext } from "./context.js";
import { orderedItems } from "./mappers/plans.js";
import { writeAndRead } from "./sql.js";
import {
  type DocumentTemplateRow,
  type IssuedDocumentRow,
  documentTemplateColumns,
  hasDatabaseCode,
  issuedDocumentColumns,
  issuedDocumentJoins,
  json,
  mapDocumentTemplate,
  mapIssuedDocument,
} from "./helpers.js";

export function createContractsRepository(
  repositoryContext: MysqlRepositoryContext,
) {
  return {
    async previewDocument(clinicId: string, input: IssuedDocumentInput) {
      return repositoryContext.inTransaction((client) =>
        prepareDocumentInTransaction(client, clinicId, input),
      );
    },
    async updateDocumentDraft(
      clinicId: string,
      documentId: string,
      input: DocumentDraftInput,
    ) {
      if (documentContentFields(input.content).length)
        throw new DomainError(
          "DOCUMENT_UNFILLED_FIELDS",
          "Preencha os campos antes de salvar o contrato.",
        );
      return repositoryContext.inTransaction(async (client) => {
        const current = await client.query<{ status: DocumentStatus }>(
          "SELECT status FROM issued_documents WHERE clinic_id=$1 AND id=$2 FOR UPDATE",
          [clinicId, documentId],
        );
        if (!current.rows[0]) return null;
        if (current.rows[0].status !== "draft")
          throw new DomainError(
            "DOCUMENT_NOT_DRAFT",
            "Apenas rascunhos podem ser editados.",
            409,
          );
        await client.query(
          "UPDATE issued_documents SET title=$3, snapshot_body=$4, snapshot_content=$5, updated_at=NOW(6) WHERE clinic_id=$1 AND id=$2",
          [
            clinicId,
            documentId,
            input.title,
            documentContentText(input.content),
            JSON.stringify(input.content),
          ],
        );
        return repositoryContext.findIssuedDocument(
          client,
          clinicId,
          documentId,
        );
      });
    },
    async listDocumentTemplates(clinicId: string) {
      const result = await repositoryContext.pool.query<DocumentTemplateRow>(
        `SELECT ${documentTemplateColumns} FROM document_templates
       WHERE clinic_id = $1 AND deleted_at IS NULL ORDER BY name, version DESC`,
        [clinicId],
      );
      return result.rows.map(mapDocumentTemplate);
    },

    async createDocumentTemplate(
      clinicId: string,
      input: DocumentTemplateInput,
    ) {
      input = documentTemplateInputSchema.parse(input);
      try {
        const result = await writeAndRead<DocumentTemplateRow>(
          repositoryContext.pool,
          `INSERT INTO document_templates
           (clinic_id, name, kind, version, body, content, id)
         VALUES ($1,$2,$3,1,$4,$5,$6)`,
          [
            clinicId,
            input.name,
            input.kind,
            input.body,
            input.content ? JSON.stringify(input.content) : null,
            randomUUID(),
          ],
          `SELECT ${documentTemplateColumns} FROM document_templates WHERE id = $6`,
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
      content?: DocumentContent,
    ) {
      ({ body, content } = documentTemplateVersionInputSchema.parse({
        body,
        content,
      }));
      const client = await repositoryContext.pool.connect();
      try {
        await client.query("BEGIN");
        const current = await client.query<DocumentTemplateRow>(
          `SELECT ${documentTemplateColumns} FROM document_templates
         WHERE clinic_id = $1 AND deleted_at IS NULL AND id = $2 FOR UPDATE`,
          [clinicId, templateId],
        );
        if (!current.rows[0]) {
          await client.query("COMMIT");
          return null;
        }
        const template = current.rows[0];
        const versionResult = await client.query<{ nextVersion: number }>(
          `SELECT COALESCE(MAX(version), 0) + 1 AS "nextVersion"
         FROM document_templates
         WHERE clinic_id = $1 AND name = $2 AND deleted_at IS NULL`,
          [clinicId, template.name],
        );
        await client.query(
          `UPDATE document_templates SET active = false
         WHERE clinic_id = $1 AND name = $2 AND active`,
          [clinicId, template.name],
        );
        const result = await writeAndRead<DocumentTemplateRow>(
          client,
          `INSERT INTO document_templates
           (clinic_id, name, kind, version, body, previous_version_id, content, id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [
            clinicId,
            template.name,
            template.kind,
            versionResult.rows[0]!.nextVersion,
            body,
            template.id,
            content ? JSON.stringify(content) : null,
            randomUUID(),
          ],
          `SELECT ${documentTemplateColumns} FROM document_templates WHERE id = $8`,
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

    async deleteDocumentTemplate(clinicId: string, templateId: string) {
      // Só marca: os contratos emitidos continuam apontando para as versões.
      const result = await repositoryContext.pool.query(
        `UPDATE document_templates SET deleted_at = NOW(6), active = 0
         WHERE clinic_id = $1 AND deleted_at IS NULL AND name = (
           -- Tabela derivada: o MySQL não lê na subconsulta a tabela que está atualizando.
           SELECT name FROM (
             SELECT name FROM document_templates
             WHERE clinic_id = $1 AND id = $2 AND deleted_at IS NULL
           ) target
         )`,
        [clinicId, templateId],
      );
      return (result.rowCount ?? 0) > 0;
    },

    async listIssuedDocuments(clinicId: string) {
      const result = await repositoryContext.pool.query<IssuedDocumentRow>(
        `SELECT ${issuedDocumentColumns}
       FROM issued_documents d
       ${issuedDocumentJoins}
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
             issued_at = CASE WHEN $3 = 'issued' THEN NOW(6) ELSE issued_at END,
             cancelled_at = CASE WHEN $3 = 'cancelled' THEN NOW(6) ELSE cancelled_at END,
             updated_at = NOW(6)
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
  repositoryContext: MysqlRepositoryContext,
  client: PoolClient,
  clinicId: string,
  actorUserId: string,
  input: IssuedDocumentInput,
) {
  const item = await prepareDocumentInTransaction(client, clinicId, input);
  const result = await writeAndRead<IssuedDocumentRow>(
    client,
    `INSERT INTO issued_documents
       (clinic_id, template_id, patient_id, plan_id, title, template_name,
        template_version, snapshot_body, created_by_user_id, professional_id, snapshot_content, branding, id, supplier_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
    [
      clinicId,
      input.templateId,
      input.patientId || null,
      input.planId || null,
      input.title,
      item.templateName,
      item.templateVersion,
      item.snapshotBody,
      actorUserId,
      input.professionalId || null,
      JSON.stringify(item.snapshotContent),
      JSON.stringify(item.branding),
      randomUUID(),
      input.supplierId || null,
    ],
    `SELECT ${issuedDocumentColumns}
       FROM issued_documents d
       ${issuedDocumentJoins}
      WHERE d.id = $13`,
  );
  return mapIssuedDocument(result.rows[0]!);
}

async function prepareDocumentInTransaction(
  client: PoolClient,
  clinicId: string,
  input: IssuedDocumentInput,
): Promise<DocumentPreview> {
  const professionalId = input.professionalId;
  const context = await client.query<{
    templateName: string;
    templateVersion: number;
    templateBody: string;
    templateContent: DocumentContent | null;
    clinicLogo: string;
    clinicTimezone: string;
    patientName: string | null;
    supplier: NonNullable<DocumentTemplateContext["supplier"]> | null;
    planName: string | null;
    planServices: PatientPlanService[] | null;
    planTotalValueInCents: number | null;
    planInstallments: number | null;
    planValidFrom: string | null;
    planValidUntil: string | null;
    patientCpf: string | null;
    patientProfile: Partial<
      Record<
        | "residenceType"
        | "address"
        | "addressNumber"
        | "complement"
        | "buildingName"
        | "block"
        | "floor"
        | "unit"
        | "neighborhood"
        | "city"
        | "state"
        | "postalCode",
        string
      >
    > | null;
    clinicName: string;
    clinicLegalName: string | null;
    clinicTaxId: string | null;
    clinicAddress: string | null;
    clinicPhone: string | null;
    clinicEmail: string | null;
    professionalName: string | null;
    professionalCrefito: string | null;
  }>(
    `SELECT dt.name AS "templateName", dt.version AS "templateVersion",
              dt.body AS "templateBody", dt.content AS "templateContent", c.logo_data_url AS "clinicLogo", c.timezone AS "clinicTimezone", p.full_name AS "patientName",
              p.cpf AS "patientCpf", p.profile AS "patientProfile",
              pp.name AS "planName",
              pp.total_value_in_cents AS "planTotalValueInCents",
              pp.installments AS "planInstallments",
              pp.valid_from AS "planValidFrom",
              pp.valid_until AS "planValidUntil",
              c.name AS "clinicName", c.legal_name AS "clinicLegalName",
              c.tax_id AS "clinicTaxId", c.address AS "clinicAddress",
              c.phone AS "clinicPhone", c.email AS "clinicEmail",
              (SELECT JSON_ARRAYAGG(JSON_OBJECT('position', x.position, 'serviceName', x.service_name, 'totalSessions', x.total_sessions, 'totalValueInCents', x.total_value_in_cents)) FROM patient_plan_services x WHERE x.plan_id=pp.id) AS "planServices",
              pr.full_name AS "professionalName",
              pr.crefito AS "professionalCrefito",
              CASE WHEN s.id IS NOT NULL THEN JSON_OBJECT(
                'name', s.name, 'kind', s.kind, 'document', s.document,
                'hiredOn', DATE_FORMAT(s.hired_on, '%Y-%m-%d'), 'contractAmountInCents', s.contract_amount_in_cents,
                'billingCycle', s.billing_cycle, 'paymentMethod', s.payment_method,
                'installments', s.installments, 'paymentTerms', s.payment_terms) END AS supplier
       FROM document_templates dt
       JOIN clinics c ON c.id = dt.clinic_id
       LEFT JOIN patients p ON p.clinic_id = dt.clinic_id AND p.id = $3
       LEFT JOIN suppliers s ON s.clinic_id = dt.clinic_id AND s.id = $6
       LEFT JOIN patient_plans pp
         ON pp.clinic_id = dt.clinic_id AND pp.id = $4 AND pp.patient_id = p.id
       LEFT JOIN professionals pr
         ON pr.clinic_id = dt.clinic_id AND pr.id = $5
       WHERE dt.clinic_id = $1 AND dt.id = $2 AND dt.active
         AND ($3 IS NULL OR p.id IS NOT NULL)
         AND ($6 IS NULL OR s.id IS NOT NULL)
         AND (p.id IS NOT NULL OR s.id IS NOT NULL)
         AND ($4 IS NULL OR pp.id IS NOT NULL)
         AND ($5 IS NULL OR pr.id IS NOT NULL)`,
    [
      clinicId,
      input.templateId,
      input.patientId || null,
      input.planId || null,
      professionalId || null,
      input.supplierId || null,
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
    if (input.patientId) {
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
    }
    if (input.supplierId) {
      const supplier = await client.query(
        `SELECT 1 FROM suppliers WHERE clinic_id = $1 AND id = $2`,
        [clinicId, input.supplierId],
      );
      if (!supplier.rows[0])
        throw new DomainError(
          "SUPPLIER_NOT_FOUND",
          "Fornecedor não encontrado.",
          404,
        );
    }
    if (!input.patientId && !input.supplierId)
      throw new DomainError(
        "DOCUMENT_PARTY_REQUIRED",
        "Informe o cliente ou o fornecedor do documento.",
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
    timeZone: item.clinicTimezone,
  }).format(new Date());
  const branding = documentBranding({
    name: item.clinicName,
    logoDataUrl: item.clinicLogo ?? "",
    timezone: item.clinicTimezone,
    ...(item.clinicLegalName ? { legalName: item.clinicLegalName } : {}),
    ...(item.clinicTaxId ? { taxId: item.clinicTaxId } : {}),
    ...(item.clinicAddress ? { address: item.clinicAddress } : {}),
    ...(item.clinicPhone ? { phone: item.clinicPhone } : {}),
    ...(item.clinicEmail ? { email: item.clinicEmail } : {}),
  });
  const values = documentTemplateValues({
    clinic: {
      name: item.clinicName,
      legalName: item.clinicLegalName,
      taxId: item.clinicTaxId,
      address: item.clinicAddress,
      phone: item.clinicPhone,
      email: item.clinicEmail,
    },
    ...(item.patientName !== null
      ? {
          patient: {
            residenceType: item.patientProfile?.residenceType,
            address: item.patientProfile?.address,
            addressNumber: item.patientProfile?.addressNumber,
            complement: item.patientProfile?.complement,
            buildingName: item.patientProfile?.buildingName,
            block: item.patientProfile?.block,
            floor: item.patientProfile?.floor,
            unit: item.patientProfile?.unit,
            neighborhood: item.patientProfile?.neighborhood,
            city: item.patientProfile?.city,
            state: item.patientProfile?.state,
            postalCode: item.patientProfile?.postalCode,
            fullName: item.patientName,
            cpf: item.patientCpf,
          },
        }
      : {}),
    ...(item.supplier
      ? {
          supplier: json<NonNullable<DocumentTemplateContext["supplier"]>>(
            item.supplier,
          ),
        }
      : {}),
    ...(item.planName !== null
      ? {
          plan: {
            name: item.planName,
            services: formatPlanServices(
              orderedItems<PatientPlanService>(item.planServices),
            ),
            totalValueInCents: item.planTotalValueInCents ?? 0,
            installments: item.planInstallments ?? 1,
            validFrom: item.planValidFrom ?? "",
            validUntil: item.planValidUntil,
          },
        }
      : {}),
    ...(item.professionalName !== null
      ? {
          professional: {
            fullName: item.professionalName,
            crefito: item.professionalCrefito,
          },
        }
      : {}),
    issuedOn: emissionDate,
  });
  return {
    ...prepareDocumentContent(
      item.templateBody,
      input.content ?? item.templateContent ?? undefined,
      values,
    ),
    branding,
    templateName: item.templateName,
    templateVersion: item.templateVersion,
    patientName:
      item.patientName ??
      json<NonNullable<DocumentTemplateContext["supplier"]>>(item.supplier)
        .name,
    ...(item.planName ? { planName: item.planName } : {}),
  };
}
