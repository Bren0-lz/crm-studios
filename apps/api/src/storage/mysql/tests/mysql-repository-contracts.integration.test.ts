import type { Database as Pool } from "../../../infrastructure/mysql-client.js";
import {
  createTestDatabase,
  type TestDatabase,
} from "../../../test-support/mysql-database.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MysqlClinicRepository } from "../../../mysql-repository.js";
import {
  clinicId,
  databaseUrl,
  ownerId,
} from "../../../test-support/mysql-fixtures.js";
import "../../../test-support/mysql-setup.js";

describe.skipIf(!databaseUrl)("MySQL repository", () => {
  let database: TestDatabase | undefined;
  let pool: Pool;

  let repository: MysqlClinicRepository;

  beforeAll(async () => {
    database = await createTestDatabase("contracts");
    pool = database.pool;
    repository = new MysqlClinicRepository(pool);
  }, 60_000);

  afterAll(async () => {
    await database?.drop();
  });

  it("versions contract templates without changing issued snapshots", async () => {
    const name = "postgres-document-version-test";
    const cleanup = async () => {
      await pool.query(
        `DELETE FROM issued_documents WHERE template_id IN
           (SELECT id FROM document_templates WHERE clinic_id = $1 AND name = $2)`,
        [clinicId, name],
      );
      // O MySQL confere a chave estrangeira linha a linha: solta a cadeia de versões antes.
      await pool.query(
        "UPDATE document_templates SET previous_version_id = NULL WHERE clinic_id = $1 AND name = $2",
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
        `SELECT column_name AS column_name FROM information_schema.columns
         WHERE table_schema = DATABASE() AND table_name = 'issued_documents'`,
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

  it("deletes every template version keeping issued documents and freeing the name", async () => {
    const name = "mysql-document-delete-test";
    const cleanup = async () => {
      await pool.query(
        `DELETE FROM issued_documents WHERE template_id IN
           (SELECT id FROM document_templates WHERE clinic_id = $1 AND name = $2)`,
        [clinicId, name],
      );
      // O MySQL confere a chave estrangeira linha a linha: solta a cadeia de versões antes.
      await pool.query(
        "UPDATE document_templates SET previous_version_id = NULL WHERE clinic_id = $1 AND name = $2",
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
      const body = "Contrato de {{paciente_nome}} em {{clinica_nome}}.";
      const template = await repository.createDocumentTemplate(clinicId, {
        name,
        kind: "contract",
        body,
      });
      const next = await repository.createDocumentTemplateVersion(
        clinicId,
        template.id,
        `${body} Revisado.`,
      );
      const document = await repository.createIssuedDocument(
        clinicId,
        ownerId,
        { templateId: next!.id, patientId: patient!.id, title: "Contrato" },
      );

      expect(await repository.deleteDocumentTemplate(clinicId, next!.id)).toBe(
        true,
      );
      expect(
        (await repository.listDocumentTemplates(clinicId)).some(
          (item) => item.name === name,
        ),
      ).toBe(false);
      expect(
        (await repository.listIssuedDocuments(clinicId)).find(
          (item) => item.id === document.id,
        ),
      ).toMatchObject({ templateName: name, templateVersion: 2 });
      expect(
        await repository.deleteDocumentTemplate(clinicId, template.id),
      ).toBe(false);
      expect(
        await repository.createDocumentTemplateVersion(
          clinicId,
          next!.id,
          `${body} Depois de excluído.`,
        ),
      ).toBeNull();

      const recreated = await repository.createDocumentTemplate(clinicId, {
        name,
        kind: "contract",
        body,
      });
      expect(recreated).toMatchObject({ version: 1, active: true });
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
      // O MySQL confere a chave estrangeira linha a linha: solta a cadeia de versões antes.
      await pool.query(
        "UPDATE document_templates SET previous_version_id = NULL WHERE clinic_id = $1 AND name = $2",
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
        {
          signerName: patient!.fullName,
          accepted: true,
          signerCpf: "52998224725",
          signatureImage,
        },
        { ipAddress: "203.0.113.7", userAgent: "Celular" },
      );
      expect(signed).toMatchObject({
        status: "signed",
        signerName: patient!.fullName,
      });
      await expect(
        repository.signPublicDocument(
          share!.token,
          {
            signerName: "Outra pessoa",
            accepted: true,
            signerCpf: "52998224725",
            signatureImage,
          },
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
      // O MySQL confere a chave estrangeira linha a linha: solta a cadeia de versões antes.
      await pool.query(
        "UPDATE document_templates SET previous_version_id = NULL WHERE clinic_id = $1 AND name = $2",
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
            SET created_at = NOW(6) - INTERVAL 8 DAY,
                expires_at = NOW(6) - INTERVAL 1 DAY
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
          {
            signerName: "Cliente",
            accepted: true,
            signerCpf: "52998224725",
            signatureImage,
          },
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
        {
          signerName: "Cliente",
          accepted: true,
          signerCpf: "52998224725",
          signatureImage,
        },
        {},
      );
      // Assinado, continua visível depois do prazo e um novo envio não troca o link.
      await pool.query(
        `UPDATE document_signature_links
            SET created_at = NOW(6) - INTERVAL 8 DAY,
                expires_at = NOW(6) - INTERVAL 1 DAY
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
