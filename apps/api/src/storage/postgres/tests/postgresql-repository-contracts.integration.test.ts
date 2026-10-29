import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runMigrations, seedDemoData } from "../../../database.js";
import { databaseConnectionConfig } from "../../../infrastructure/database-connection.js";
import { PostgresClinicRepository } from "../../../postgres-repository.js";
import {
  appointmentMarker,
  birthdayCpf,
  clinicId,
  dailyCashMarker,
  databaseUrl,
  duplicateCpf,
  exportAuditMarker,
  financeClassificationMarker,
  leadAppointmentDay,
  leadAppointmentMarker,
  leadAppointmentPhone,
  leadConversionMarker,
  leadConversionPhones,
  ownerId,
  permissionsUserEmail,
  recurringPayableMarker,
  relationshipCpf,
  renewalMarker,
  rescheduleMarker,
  salesMarker,
  satisfactionCpf,
  satisfactionMarker,
  testCpf,
  timelineCpf,
  timelineMarker,
  trialConversionMarker,
  trialConversionPhones,
} from "../../../test-support/postgres-fixtures.js";
import "../../../test-support/postgres-setup.js";

describe.skipIf(!databaseUrl)("PostgreSQL repository", () => {
  let pool: Pool;

  let repository: PostgresClinicRepository;

  const templateIds: string[] = [];

  async function cleanupRecurringPayables() {
    const models = `SELECT id FROM recurring_payables WHERE clinic_id = $1 AND description = $2`;
    await pool.query(
      `DELETE FROM payable_events WHERE payable_id IN
       (SELECT id FROM payables WHERE recurring_payable_id IN (${models}))`,
      [clinicId, recurringPayableMarker],
    );
    await pool.query(
      `DELETE FROM payables WHERE recurring_payable_id IN (${models})`,
      [clinicId, recurringPayableMarker],
    );
    await pool.query(
      "DELETE FROM recurring_payables WHERE clinic_id = $1 AND description = $2",
      [clinicId, recurringPayableMarker],
    );
  }

  async function cleanupDailyCash() {
    const plans =
      "SELECT id FROM patient_plans WHERE clinic_id = $1 AND name = $2";
    await pool.query(
      `DELETE FROM financial_events WHERE receivable_id IN
         (SELECT id FROM receivables WHERE plan_id IN (${plans}))`,
      [clinicId, dailyCashMarker],
    );
    await pool.query(
      `DELETE FROM session_movements WHERE plan_id IN (${plans})`,
      [clinicId, dailyCashMarker],
    );
    await pool.query(`DELETE FROM receivables WHERE plan_id IN (${plans})`, [
      clinicId,
      dailyCashMarker,
    ]);
    await pool.query(
      "DELETE FROM patient_plans WHERE clinic_id = $1 AND name = $2",
      [clinicId, dailyCashMarker],
    );
    const payables =
      "SELECT id FROM payables WHERE clinic_id = $1 AND description = $2";
    await pool.query(
      `DELETE FROM payable_events WHERE payable_id IN (${payables})`,
      [clinicId, dailyCashMarker],
    );
    await pool.query(
      "DELETE FROM payables WHERE clinic_id = $1 AND description = $2",
      [clinicId, dailyCashMarker],
    );
  }

  async function cleanupLeadConversion() {
    await pool.query(
      `DELETE FROM satisfaction_surveys WHERE patient_id IN
         (SELECT id FROM patients WHERE clinic_id = $1 AND phone = ANY($2::text[]))`,
      [clinicId, leadConversionPhones],
    );
    await pool.query("DELETE FROM appointments WHERE notes = $1", [
      leadConversionMarker,
    ]);
    await pool.query(
      `DELETE FROM lead_stage_history WHERE lead_id IN
         (SELECT id FROM leads WHERE clinic_id = $1 AND phone = ANY($2::text[]))`,
      [clinicId, leadConversionPhones],
    );
    await pool.query(
      "DELETE FROM leads WHERE clinic_id = $1 AND phone = ANY($2::text[])",
      [clinicId, leadConversionPhones],
    );
    await pool.query(
      "DELETE FROM patients WHERE clinic_id = $1 AND phone = ANY($2::text[])",
      [clinicId, leadConversionPhones],
    );
  }

  async function cleanupTrialConversion() {
    const planFilter =
      "SELECT id FROM patient_plans WHERE clinic_id = $1 AND name = $2";
    await pool.query(
      `DELETE FROM financial_events WHERE receivable_id IN
         (SELECT id FROM receivables WHERE plan_id IN (${planFilter}))`,
      [clinicId, trialConversionMarker],
    );
    await pool.query(
      `DELETE FROM session_movements WHERE plan_id IN (${planFilter})`,
      [clinicId, trialConversionMarker],
    );
    await pool.query(
      `DELETE FROM receivables WHERE plan_id IN (${planFilter})`,
      [clinicId, trialConversionMarker],
    );
    await pool.query(
      "DELETE FROM patient_plans WHERE clinic_id = $1 AND name = $2",
      [clinicId, trialConversionMarker],
    );
    await pool.query("DELETE FROM appointments WHERE notes = $1", [
      trialConversionMarker,
    ]);
    await pool.query(
      `DELETE FROM lead_stage_history WHERE lead_id IN
         (SELECT id FROM leads WHERE clinic_id = $1 AND phone = ANY($2::text[]))`,
      [clinicId, trialConversionPhones],
    );
    await pool.query(
      "DELETE FROM leads WHERE clinic_id = $1 AND phone = ANY($2::text[])",
      [clinicId, trialConversionPhones],
    );
    await pool.query(
      "DELETE FROM patients WHERE clinic_id = $1 AND phone = ANY($2::text[])",
      [clinicId, trialConversionPhones],
    );
  }

  async function cleanupLeadAppointments() {
    const effectiveFrom = leadAppointmentDay.toISOString().slice(0, 10);
    await pool.query(
      `DELETE FROM commission_entries WHERE appointment_id IN
         (SELECT id FROM appointments WHERE notes = $1)
       OR rule_id IN (SELECT id FROM commission_rules WHERE clinic_id = $2 AND effective_from = $3::date)`,
      [leadAppointmentMarker, clinicId, effectiveFrom],
    );
    await pool.query(
      "DELETE FROM commission_rules WHERE clinic_id = $1 AND effective_from = $2::date",
      [clinicId, effectiveFrom],
    );
    await pool.query("DELETE FROM appointments WHERE notes = $1", [
      leadAppointmentMarker,
    ]);
    await pool.query(
      `DELETE FROM appointments WHERE lead_id IN
         (SELECT id FROM leads WHERE clinic_id = $1 AND phone = $2)`,
      [clinicId, leadAppointmentPhone],
    );
    await pool.query(
      `DELETE FROM lead_stage_history WHERE lead_id IN
         (SELECT id FROM leads WHERE clinic_id = $1 AND phone = $2)`,
      [clinicId, leadAppointmentPhone],
    );
    await pool.query("DELETE FROM leads WHERE clinic_id = $1 AND phone = $2", [
      clinicId,
      leadAppointmentPhone,
    ]);
  }

  beforeAll(async () => {
    pool = new Pool(
      databaseConnectionConfig({
        url: databaseUrl!,
        ssl:
          (process.env.DATABASE_SSL as
            "auto" | "disable" | "require" | "verify" | undefined) ?? "auto",
        ...(process.env.DATABASE_SSL_CA
          ? { caCertPath: process.env.DATABASE_SSL_CA }
          : {}),
      }),
    );
    await runMigrations(pool);
    await seedDemoData(pool);
    repository = new PostgresClinicRepository(pool);
  });

  async function cleanupExportAudit() {
    await pool.query(
      "DELETE FROM audit_events WHERE clinic_id = $1 AND action = 'patients.exported' AND metadata->>'marker' = $2",
      [clinicId, exportAuditMarker],
    );
  }

  async function cleanupPermissionsUser() {
    const ids = `SELECT id FROM users WHERE clinic_id = $1 AND email = $2`;
    await pool.query(
      `DELETE FROM audit_events WHERE clinic_id = $1 AND entity_type = 'user' AND entity_id IN (${ids})`,
      [clinicId, permissionsUserEmail],
    );
    await pool.query(
      `DELETE FROM commission_entries WHERE clinic_id = $1 AND rule_id IN
         (SELECT id FROM commission_rules WHERE clinic_id = $1 AND user_id IN (${ids}))`,
      [clinicId, permissionsUserEmail],
    );
    await pool.query(
      `DELETE FROM commission_rules WHERE clinic_id = $1 AND user_id IN (${ids})`,
      [clinicId, permissionsUserEmail],
    );
    await pool.query(
      `UPDATE professionals SET user_id = NULL WHERE clinic_id = $1 AND user_id IN (${ids})`,
      [clinicId, permissionsUserEmail],
    );
    await pool.query("DELETE FROM users WHERE clinic_id = $1 AND email = $2", [
      clinicId,
      permissionsUserEmail,
    ]);
  }

  afterAll(async () => {
    if (!pool) return;
    await cleanupPermissionsUser();
    await cleanupExportAudit();
    await cleanupLeadAppointments();
    await cleanupLeadConversion();
    await cleanupTrialConversion();
    await cleanupRecurringPayables();
    await cleanupDailyCash();
    await pool.query(
      "DELETE FROM financial_categories WHERE clinic_id = $1 AND name = $2",
      [clinicId, financeClassificationMarker],
    );
    await pool.query(
      "DELETE FROM cost_centers WHERE clinic_id = $1 AND name = $2",
      [clinicId, financeClassificationMarker],
    );
    await pool.query(
      `DELETE FROM financial_events WHERE receivable_id IN
       (SELECT r.id FROM receivables r JOIN patient_plans pp ON pp.id=r.plan_id WHERE pp.name = ANY($1::text[]))`,
      [[salesMarker, renewalMarker, timelineMarker]],
    );
    await pool.query(
      `DELETE FROM session_movements WHERE plan_id IN (SELECT id FROM patient_plans WHERE name = ANY($1::text[]))`,
      [[salesMarker, renewalMarker, timelineMarker]],
    );
    await pool.query(
      `DELETE FROM receivables WHERE plan_id IN (SELECT id FROM patient_plans WHERE name = ANY($1::text[]))`,
      [[salesMarker, renewalMarker, timelineMarker]],
    );
    await pool.query("DELETE FROM patient_plans WHERE name = ANY($1::text[])", [
      [salesMarker, renewalMarker, timelineMarker],
    ]);
    await pool.query("TRUNCATE appointment_reschedules");
    await pool.query(
      `DELETE FROM satisfaction_surveys WHERE patient_id IN
       (SELECT id FROM patients WHERE clinic_id = $1 AND cpf = ANY($2::text[]))`,
      [clinicId, [satisfactionCpf, timelineCpf]],
    );
    await pool.query(
      `DELETE FROM outbound_messages WHERE patient_id IN
       (SELECT id FROM patients WHERE clinic_id = $1 AND cpf = $2)`,
      [clinicId, timelineCpf],
    );
    // Surveys can belong to other seeded patients; remove references to these
    // fixture appointments before deleting the appointments themselves.
    await pool.query(
      `DELETE FROM satisfaction_surveys WHERE appointment_id IN
       (SELECT id FROM appointments WHERE clinic_id = $1 AND notes = ANY($2::text[]))`,
      [
        clinicId,
        [
          appointmentMarker,
          rescheduleMarker,
          satisfactionMarker,
          timelineMarker,
        ],
      ],
    );
    await pool.query("DELETE FROM appointments WHERE notes = ANY($1::text[])", [
      [appointmentMarker, rescheduleMarker, satisfactionMarker, timelineMarker],
    ]);
    await pool.query(
      `DELETE FROM contact_activities WHERE patient_id IN
       (SELECT id FROM patients WHERE clinic_id = $1 AND cpf = ANY($2::text[]))`,
      [clinicId, [relationshipCpf, birthdayCpf, timelineCpf]],
    );
    await pool.query(
      "DELETE FROM patients WHERE clinic_id = $1 AND cpf = ANY($2::text[])",
      [
        clinicId,
        [
          testCpf,
          duplicateCpf,
          relationshipCpf,
          birthdayCpf,
          satisfactionCpf,
          timelineCpf,
        ],
      ],
    );
    await pool.query("DELETE FROM relationship_settings WHERE clinic_id = $1", [
      clinicId,
    ]);
    await pool.query(
      "DELETE FROM plan_templates WHERE id = ANY($1::uuid[]) AND NOT EXISTS (SELECT 1 FROM patient_plans WHERE plan_template_id=plan_templates.id)",
      [templateIds],
    );
    await pool.end();
  });

  it("versions contract templates without changing issued snapshots", async () => {
    const name = "postgres-document-version-test";
    const cleanup = async () => {
      await pool.query(
        `DELETE FROM issued_documents WHERE template_id IN
           (SELECT id FROM document_templates WHERE clinic_id = $1 AND name = $2)`,
        [clinicId, name],
      );
      await pool.query(
        "DELETE FROM document_templates WHERE clinic_id = $1 AND name = $2",
        [clinicId, name],
      );
    };
    await cleanup();
    try {
      const columns = await pool.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = current_schema() AND table_name = 'issued_documents'`,
      );
      const columnNames = columns.rows.map((row) => row.column_name);
      expect(columnNames).toContain("professional_id");
      expect(columnNames).not.toContain("appointment_id");

      const [patient] = await repository.listPatients(clinicId);
      const template = await repository.createDocumentTemplate(clinicId, {
        name,
        kind: "contract",
        body: "Versão original para {{paciente_nome}} em {{clinica_nome}}.",
      });
      expect(template).toMatchObject({ version: 1, active: true });
      await expect(
        repository.createDocumentTemplate(clinicId, {
          name,
          kind: "contract",
          body: "Outro modelo ativo com o mesmo nome.",
        }),
      ).rejects.toMatchObject({
        code: "DOCUMENT_TEMPLATE_DUPLICATE",
        statusCode: 409,
      });
      const document = await repository.createIssuedDocument(
        clinicId,
        ownerId,
        {
          templateId: template.id,
          patientId: patient!.id,
          title: "Contrato preservado",
        },
      );
      expect(document).toMatchObject({ status: "draft", templateVersion: 1 });
      expect(document.snapshotBody).toBe(
        `Versão original para ${patient!.fullName} em Studios Aryana.`,
      );

      const next = await repository.createDocumentTemplateVersion(
        clinicId,
        template.id,
        "Nova versão do contrato para {{paciente_nome}}.",
      );
      expect(next).toMatchObject({
        version: 2,
        active: true,
        previousVersionId: template.id,
      });
      const versions = (
        await repository.listDocumentTemplates(clinicId)
      ).filter((item) => item.name === name);
      expect(versions.map((item) => [item.version, item.active])).toEqual([
        [2, true],
        [1, false],
      ]);
      await expect(
        repository.createIssuedDocument(clinicId, ownerId, {
          templateId: template.id,
          patientId: patient!.id,
          title: "Versão inativa",
        }),
      ).rejects.toMatchObject({
        code: "DOCUMENT_TEMPLATE_NOT_FOUND",
        statusCode: 404,
      });
      expect(
        (await repository.listIssuedDocuments(clinicId)).find(
          (item) => item.id === document.id,
        )?.snapshotBody,
      ).toContain("Versão original");

      const issued = await repository.updateIssuedDocumentStatus(
        clinicId,
        document.id,
        "issued",
      );
      expect(issued).toMatchObject({ status: "issued" });
      expect(issued?.issuedAt).toBeTruthy();
      const cancelled = await repository.updateIssuedDocumentStatus(
        clinicId,
        document.id,
        "cancelled",
      );
      expect(cancelled).toMatchObject({ status: "cancelled" });
      expect(cancelled?.cancelledAt).toBeTruthy();
      await expect(
        repository.updateIssuedDocumentStatus(clinicId, document.id, "issued"),
      ).rejects.toMatchObject({
        code: "DOCUMENT_ALREADY_CANCELLED",
        statusCode: 409,
      });
    } finally {
      await cleanup();
    }
  });

  it("records views and the client's signature through the public link", async () => {
    const name = "postgres-document-signature-link-test";
    const cleanup = async () => {
      await pool.query(
        `DELETE FROM issued_documents WHERE template_id IN
           (SELECT id FROM document_templates WHERE clinic_id = $1 AND name = $2)`,
        [clinicId, name],
      );
      await pool.query(
        "DELETE FROM document_templates WHERE clinic_id = $1 AND name = $2",
        [clinicId, name],
      );
    };
    await cleanup();
    try {
      const [patient] = await repository.listPatients(clinicId);
      const template = await repository.createDocumentTemplate(clinicId, {
        name,
        kind: "contract",
        body: "Contrato de {{paciente_nome}} para assinatura pelo link.",
      });
      const document = await repository.createIssuedDocument(
        clinicId,
        ownerId,
        { templateId: template.id, patientId: patient!.id, title: name },
      );
      await expect(
        repository.createDocumentSignatureLink(clinicId, ownerId, document.id),
      ).rejects.toMatchObject({ code: "DOCUMENT_NOT_ISSUED" });
      await repository.updateIssuedDocumentStatus(
        clinicId,
        document.id,
        "issued",
      );
      const share = await repository.createDocumentSignatureLink(
        clinicId,
        ownerId,
        document.id,
      );
      expect(share?.document.signatureLink).toMatchObject({ viewCount: 0 });
      const link = share!.document.signatureLink!;
      expect(
        new Date(link.expiresAt).getTime() - new Date(link.createdAt).getTime(),
      ).toBe(7 * 86_400_000);
      expect(
        (
          await repository.createDocumentSignatureLink(
            clinicId,
            ownerId,
            document.id,
          )
        )?.token,
      ).toBe(share!.token);
      const opened = await repository.openPublicSignatureDocument(
        share!.token,
        { ipAddress: "203.0.113.7", userAgent: "Celular" },
      );
      expect(opened).toMatchObject({ status: "pending", title: name });
      const signatureImage = "data:image/png;base64,cG5n";
      const signed = await repository.signPublicDocument(
        share!.token,
        { signerName: patient!.fullName, accepted: true, signatureImage },
        { ipAddress: "203.0.113.7", userAgent: "Celular" },
      );
      expect(signed).toMatchObject({
        status: "signed",
        signerName: patient!.fullName,
      });
      await expect(
        repository.signPublicDocument(
          share!.token,
          { signerName: "Outra pessoa", accepted: true, signatureImage },
          {},
        ),
      ).rejects.toMatchObject({ code: "DOCUMENT_ALREADY_SIGNED" });
      expect(
        await repository.getDocumentSignatureLink(clinicId, document.id),
      ).toMatchObject({
        viewCount: 1,
        views: [{ ipAddress: "203.0.113.7", userAgent: "Celular" }],
        signatureImage,
        signerIpAddress: "203.0.113.7",
        documentSha256: signed!.documentSha256,
      });
      const listed = (await repository.listIssuedDocuments(clinicId)).find(
        (item) => item.id === document.id,
      );
      expect(listed?.signatureLink).toMatchObject({
        viewCount: 1,
        signerName: patient!.fullName,
      });
      expect(listed?.signatureLink?.signedAt).toBeTruthy();
    } finally {
      await cleanup();
    }
  });

  it("expires the public signature link and renews the token on a new send", async () => {
    const name = "postgres-document-signature-link-expiry-test";
    const cleanup = async () => {
      await pool.query(
        `DELETE FROM issued_documents WHERE template_id IN
           (SELECT id FROM document_templates WHERE clinic_id = $1 AND name = $2)`,
        [clinicId, name],
      );
      await pool.query(
        "DELETE FROM document_templates WHERE clinic_id = $1 AND name = $2",
        [clinicId, name],
      );
    };
    await cleanup();
    try {
      const [patient] = await repository.listPatients(clinicId);
      const template = await repository.createDocumentTemplate(clinicId, {
        name,
        kind: "contract",
        body: "Contrato de {{paciente_nome}} com link que expira.",
      });
      const document = await repository.createIssuedDocument(
        clinicId,
        ownerId,
        { templateId: template.id, patientId: patient!.id, title: name },
      );
      await repository.updateIssuedDocumentStatus(
        clinicId,
        document.id,
        "issued",
      );
      const first = await repository.createDocumentSignatureLink(
        clinicId,
        ownerId,
        document.id,
      );
      await repository.openPublicSignatureDocument(first!.token, {});
      // Simula o fim do prazo: o link foi gerado há 8 dias.
      await pool.query(
        `UPDATE document_signature_links
            SET created_at = now() - interval '8 days',
                expires_at = now() - interval '1 day'
          WHERE clinic_id = $1 AND document_id = $2`,
        [clinicId, document.id],
      );
      await expect(
        repository.openPublicSignatureDocument(first!.token, {}),
      ).rejects.toMatchObject({
        code: "DOCUMENT_SIGNATURE_LINK_EXPIRED",
        statusCode: 410,
      });
      const signatureImage = "data:image/png;base64,cG5n";
      await expect(
        repository.signPublicDocument(
          first!.token,
          { signerName: "Cliente", accepted: true, signatureImage },
          {},
        ),
      ).rejects.toMatchObject({ code: "DOCUMENT_SIGNATURE_LINK_EXPIRED" });
      expect(
        (await repository.getDocumentSignatureLink(clinicId, document.id))
          ?.viewCount,
      ).toBe(1);

      const renewed = await repository.createDocumentSignatureLink(
        clinicId,
        ownerId,
        document.id,
      );
      expect(renewed!.token).not.toBe(first!.token);
      expect(
        new Date(renewed!.document.signatureLink!.expiresAt).getTime(),
      ).toBeGreaterThan(Date.now());
      expect(
        await repository.openPublicSignatureDocument(first!.token, {}),
      ).toBeNull();
      await repository.signPublicDocument(
        renewed!.token,
        { signerName: "Cliente", accepted: true, signatureImage },
        {},
      );
      // Assinado, continua visível depois do prazo e um novo envio não troca o link.
      await pool.query(
        `UPDATE document_signature_links
            SET created_at = now() - interval '8 days',
                expires_at = now() - interval '1 day'
          WHERE clinic_id = $1 AND document_id = $2`,
        [clinicId, document.id],
      );
      expect(
        await repository.openPublicSignatureDocument(renewed!.token, {}),
      ).toMatchObject({ status: "signed" });
      expect(
        (
          await repository.createDocumentSignatureLink(
            clinicId,
            ownerId,
            document.id,
          )
        )?.token,
      ).toBe(renewed!.token);
    } finally {
      await cleanup();
    }
  });
});
