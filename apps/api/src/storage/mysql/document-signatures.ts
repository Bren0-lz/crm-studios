import type { DocumentSignatureInput, DocumentSignature } from "@crm/contracts";
import type { MysqlRepositoryContext } from "./context.js";
import { DomainError } from "../../repository.js";
import { inspectClinicalAttachment } from "../../modules/clinical/clinical-integrity.js";
import {
  issuedDocumentColumns,
  issuedDocumentJoins,
  mapIssuedDocument,
  type IssuedDocumentRow,
} from "./helpers.js";
export function createDocumentSignaturesRepository(
  context: MysqlRepositoryContext,
) {
  return {
    async recordDocumentSignature(
      clinicId: string,
      actorUserId: string,
      id: string,
      input: DocumentSignatureInput,
    ) {
      return context.inTransaction(async (client) => {
        const documents = await client.query<{
            patientId: string;
            status: string;
            signature: unknown;
          }>(
            `SELECT patient_id AS "patientId",status,manual_signature AS signature FROM issued_documents WHERE clinic_id=$1 AND id=$2 FOR UPDATE`,
            [clinicId, id],
          ),
          document = documents.rows[0];
        if (!document)
          throw new DomainError(
            "DOCUMENT_NOT_FOUND",
            "Documento não encontrado.",
            404,
          );
        if (document.status !== "issued" || document.signature)
          throw new DomainError(
            "DOCUMENT_SIGNATURE_CONFLICT",
            "Somente documentos emitidos sem assinatura registrada aceitam este registro.",
            409,
          );
        const actor = await client.query<{ name: string }>(
          "SELECT full_name AS name FROM users WHERE clinic_id=$1 AND id=$2",
          [clinicId, actorUserId],
        );
        if (!actor.rows[0])
          throw new DomainError(
            "USER_NOT_FOUND",
            "Usuário não encontrado.",
            404,
          );
        const { content, sha256 } = inspectClinicalAttachment({
          ...input,
          patientId: document.patientId,
        });
        const { contentBase64: _, ...metadata } = input;
        void _;
        const signature: DocumentSignature = {
          ...metadata,
          actorId: actorUserId,
          actorName: actor.rows[0].name,
          sha256,
          recordedAt: new Date().toISOString(),
        };
        await client.query(
          "UPDATE issued_documents SET manual_signature=$3,manual_signature_content=$4,updated_at=NOW(6) WHERE clinic_id=$1 AND id=$2",
          [clinicId, id, JSON.stringify(signature), content],
        );
        await context.addAdminAudit(
          client,
          clinicId,
          actorUserId,
          "document.signature_recorded",
          "document",
          id,
          { signedOn: input.signedOn, sha256 },
        );
        const result = await client.query<IssuedDocumentRow>(
          `SELECT ${issuedDocumentColumns} FROM issued_documents d ${issuedDocumentJoins} WHERE d.clinic_id=$1 AND d.id=$2`,
          [clinicId, id],
        );
        return mapIssuedDocument(result.rows[0]!);
      });
    },
    async getDocumentSignatureContent(
      clinicId: string,
      actorUserId: string,
      id: string,
    ) {
      return context.inTransaction(async (client) => {
        const result = await client.query<{
          signature: DocumentSignature;
          content: Buffer;
        }>(
          "SELECT manual_signature AS signature,manual_signature_content AS content FROM issued_documents WHERE clinic_id=$1 AND id=$2 AND manual_signature IS NOT NULL",
          [clinicId, id],
        );
        if (!result.rows[0]) return null;
        await context.addAdminAudit(
          client,
          clinicId,
          actorUserId,
          "document.signature_downloaded",
          "document",
          id,
          { sha256: result.rows[0].signature.sha256 },
        );
        return {
          ...result.rows[0].signature,
          contentBase64: result.rows[0].content.toString("base64"),
        };
      });
    },
  };
}
