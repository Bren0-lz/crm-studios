import {
  paymentProofLimits,
  type PaymentProof,
  type PaymentProofContent,
  type PaymentProofEntity,
  type PaymentProofInput,
} from "@crm/contracts";
import { DomainError } from "../../repository.js";
import { inspectClinicalAttachment } from "../../modules/clinical/clinical-integrity.js";
import type { PostgresRepositoryContext } from "./context.js";
const columns = `id,clinic_id AS "clinicId",entity_type AS "entityType",entity_id AS "entityId",file_name AS "fileName",mime_type AS "mimeType",size_in_bytes AS "sizeInBytes",sha256,author_user_id AS "authorId",author_name AS "authorName",created_at AS "createdAt"`;
type Row = Omit<PaymentProof, "createdAt"> & { createdAt: Date };
const map = (row: Row): PaymentProof => ({
  ...row,
  createdAt: row.createdAt.toISOString(),
});
// Trava o registro pago para serializar anexos simultâneos (limite por registro).
const settledQuery: Record<PaymentProofEntity, string> = {
  receivable:
    "SELECT status='paid' AS settled FROM receivables WHERE clinic_id=$1 AND id=$2 FOR UPDATE",
  payable:
    "SELECT status='paid' AS settled FROM payables WHERE clinic_id=$1 AND id=$2 FOR UPDATE",
  commission_account_payment:
    "SELECT reversed_at IS NULL AS settled FROM commission_account_payments WHERE clinic_id=$1 AND id=$2 FOR UPDATE",
};
export function createPaymentProofsRepository(
  context: PostgresRepositoryContext,
) {
  return {
    async listPaymentProofs(
      clinicId: string,
      entityType: PaymentProofEntity,
      entityId: string,
    ) {
      const result = await context.pool.query<Row>(
        `SELECT ${columns} FROM payment_proofs WHERE clinic_id=$1 AND entity_type=$2 AND entity_id=$3 ORDER BY created_at,id`,
        [clinicId, entityType, entityId],
      );
      return result.rows.map(map);
    },
    async createPaymentProof(
      clinicId: string,
      actorUserId: string,
      entityType: PaymentProofEntity,
      entityId: string,
      input: PaymentProofInput,
    ) {
      return context.inTransaction(async (client) => {
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
        const entry = (
          await client.query<{ settled: boolean }>(settledQuery[entityType], [
            clinicId,
            entityId,
          ])
        ).rows[0];
        if (!entry)
          throw new DomainError(
            "PAYMENT_PROOF_ENTITY_NOT_FOUND",
            "Registro financeiro não encontrado.",
            404,
          );
        if (!entry.settled)
          throw new DomainError(
            "PAYMENT_PROOF_NOT_SETTLED",
            "Registre o pagamento antes de anexar comprovantes.",
            409,
          );
        const count = await client.query<{ total: number }>(
          "SELECT count(*)::int AS total FROM payment_proofs WHERE clinic_id=$1 AND entity_type=$2 AND entity_id=$3",
          [clinicId, entityType, entityId],
        );
        if (count.rows[0]!.total >= paymentProofLimits.maxFiles)
          throw new DomainError(
            "PAYMENT_PROOF_LIMIT",
            `Cada registro aceita até ${paymentProofLimits.maxFiles} comprovantes.`,
            409,
          );
        const { sha256, content } = inspectClinicalAttachment({
          ...input,
          patientId: clinicId,
          notes: "",
        });
        const result = await client.query<Row>(
          `INSERT INTO payment_proofs(clinic_id,entity_type,entity_id,file_name,mime_type,size_in_bytes,sha256,content,author_user_id,author_name) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING ${columns}`,
          [
            clinicId,
            entityType,
            entityId,
            input.fileName,
            input.mimeType,
            input.sizeInBytes,
            sha256,
            content,
            actorUserId,
            actor.rows[0].name,
          ],
        );
        const record = map(result.rows[0]!);
        await context.addAdminAudit(
          client,
          clinicId,
          actorUserId,
          "finance.payment_proof_attached",
          "payment_proof",
          record.id,
          { entityType, entityId, fileName: input.fileName, sha256 },
        );
        return record;
      });
    },
    async getPaymentProofContent(
      clinicId: string,
      actorUserId: string,
      id: string,
    ): Promise<PaymentProofContent | null> {
      return context.inTransaction(async (client) => {
        const result = await client.query<{
          fileName: string;
          mimeType: PaymentProofInput["mimeType"];
          sizeInBytes: number;
          sha256: string;
          content: Buffer;
        }>(
          'SELECT file_name AS "fileName",mime_type AS "mimeType",size_in_bytes AS "sizeInBytes",sha256,content FROM payment_proofs WHERE clinic_id=$1 AND id=$2',
          [clinicId, id],
        );
        const file = result.rows[0];
        if (!file) return null;
        await context.addAdminAudit(
          client,
          clinicId,
          actorUserId,
          "finance.payment_proof_downloaded",
          "payment_proof",
          id,
          { sha256: file.sha256 },
        );
        const { content, ...metadata } = file;
        return { ...metadata, contentBase64: content.toString("base64") };
      });
    },
  };
}
