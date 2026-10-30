import {
  paymentProofLimits,
  type PaymentProof,
  type PaymentProofContent,
  type PaymentProofEntity,
  type PaymentProofInput,
} from "@crm/contracts";
import { randomUUID } from "node:crypto";
import type {
  Pool,
  PoolClient,
} from "../../infrastructure/mysql-client.js";
import { DomainError } from "../../repository.js";
import { inspectClinicalAttachment } from "../../modules/clinical/clinical-integrity.js";
import type { MysqlRepositoryContext } from "./context.js";
import { bool } from "./helpers.js";
const columns = `id,clinic_id AS "clinicId",entity_type AS "entityType",entity_id AS "entityId",file_name AS "fileName",mime_type AS "mimeType",size_in_bytes AS "sizeInBytes",sha256,author_user_id AS "authorId",author_name AS "authorName",created_at AS "createdAt",reversed_at AS "reversedAt"`;
type Row = Omit<PaymentProof, "createdAt" | "reversedAt"> & {
  createdAt: Date;
  reversedAt: Date | null;
};
const map = ({ reversedAt, ...row }: Row): PaymentProof => ({
  ...row,
  createdAt: row.createdAt.toISOString(),
  ...(reversedAt ? { reversedAt: reversedAt.toISOString() } : {}),
});
// Situação e filial do registro (a baixa conciliada segue a filial do profissional).
// `lock` trava o registro para serializar anexos simultâneos (limite por registro).
const entityQuery = (entityType: PaymentProofEntity, lock: boolean) =>
  ({
    receivable: `SELECT status='paid' AS settled,branch_id AS "branchId" FROM receivables WHERE clinic_id=$1 AND id=$2`,
    payable: `SELECT status='paid' AS settled,branch_id AS "branchId" FROM payables WHERE clinic_id=$1 AND id=$2`,
    commission_account_payment: `SELECT cap.reversed_at IS NULL AS settled,pr.branch_id AS "branchId" FROM commission_account_payments cap JOIN professionals pr ON pr.id=cap.professional_id WHERE cap.clinic_id=$1 AND cap.id=$2`,
  })[entityType] +
  (lock ? " FOR UPDATE" : "");

/** Estorno da baixa: os comprovantes ficam no histórico, marcados como da baixa estornada. */
export async function markPaymentProofsReversed(
  client: Pool | PoolClient,
  clinicId: string,
  entityType: PaymentProofEntity,
  entityId: string,
) {
  await client.query(
    "UPDATE payment_proofs SET reversed_at=NOW(6) WHERE clinic_id=$1 AND entity_type=$2 AND entity_id=$3 AND reversed_at IS NULL AND deleted_at IS NULL",
    [clinicId, entityType, entityId],
  );
}

export function createPaymentProofsRepository(
  context: MysqlRepositoryContext,
) {
  /** Registro da baixa nas filiais da leitura em curso (fora delas = não encontrado). */
  async function entityOf(
    client: Pool | PoolClient,
    clinicId: string,
    entityType: PaymentProofEntity,
    entityId: string,
    lock = false,
  ) {
    const entry = (
      await client.query<{ settled: unknown; branchId: string }>(
        entityQuery(entityType, lock),
        [clinicId, entityId],
      )
    ).rows[0];
    const readIds = context.branchReadIds();
    return entry && (!readIds || readIds.includes(entry.branchId))
      ? { ...entry, settled: bool(entry.settled) }
      : null;
  }
  /** Comprovante não excluído cujo registro está nas filiais da leitura. */
  async function visibleProof(
    client: Pool | PoolClient,
    clinicId: string,
    id: string,
  ) {
    const row = (
      await client.query<Row>(
        `SELECT ${columns} FROM payment_proofs WHERE clinic_id=$1 AND id=$2 AND deleted_at IS NULL`,
        [clinicId, id],
      )
    ).rows[0];
    return row &&
      (await entityOf(client, clinicId, row.entityType, row.entityId))
      ? row
      : null;
  }
  return {
    async listPaymentProofs(
      clinicId: string,
      entityType: PaymentProofEntity,
      entityId: string,
    ) {
      if (!(await entityOf(context.pool, clinicId, entityType, entityId)))
        return [];
      const result = await context.pool.query<Row>(
        `SELECT ${columns} FROM payment_proofs WHERE clinic_id=$1 AND entity_type=$2 AND entity_id=$3 AND deleted_at IS NULL ORDER BY created_at,id`,
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
        const entry = await entityOf(
          client,
          clinicId,
          entityType,
          entityId,
          true,
        );
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
          "SELECT COUNT(*) AS total FROM payment_proofs WHERE clinic_id=$1 AND entity_type=$2 AND entity_id=$3 AND deleted_at IS NULL AND reversed_at IS NULL",
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
        const proofId = randomUUID();
        await client.query(
          `INSERT INTO payment_proofs(clinic_id,entity_type,entity_id,file_name,mime_type,size_in_bytes,sha256,content,author_user_id,author_name,id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
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
            proofId,
          ],
        );
        const result = await client.query<Row>(
          `SELECT ${columns} FROM payment_proofs WHERE id=$1`,
          [proofId],
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
        if (!(await visibleProof(client, clinicId, id))) return null;
        const file = (
          await client.query<{
            fileName: string;
            mimeType: PaymentProofInput["mimeType"];
            sizeInBytes: number;
            sha256: string;
            content: Buffer;
          }>(
            'SELECT file_name AS "fileName",mime_type AS "mimeType",size_in_bytes AS "sizeInBytes",sha256,content FROM payment_proofs WHERE clinic_id=$1 AND id=$2',
            [clinicId, id],
          )
        ).rows[0]!;
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
    async deletePaymentProof(
      clinicId: string,
      actorUserId: string,
      id: string,
      reason: string,
    ) {
      return context.inTransaction(async (client) => {
        const row = await visibleProof(client, clinicId, id);
        if (!row) return null;
        await client.query(
          "UPDATE payment_proofs SET deleted_at=NOW(6),deleted_by_user_id=$3,deletion_reason=$4 WHERE clinic_id=$1 AND id=$2",
          [clinicId, id, actorUserId, reason],
        );
        await context.addAdminAudit(
          client,
          clinicId,
          actorUserId,
          "finance.payment_proof_deleted",
          "payment_proof",
          id,
          {
            entityType: row.entityType,
            entityId: row.entityId,
            fileName: row.fileName,
            sha256: row.sha256,
            reason,
          },
        );
        return map(row);
      });
    },
    /** Tipo do registro do comprovante (para a permissão de excluir). */
    async findPaymentProofEntity(clinicId: string, id: string) {
      const row = await visibleProof(context.pool, clinicId, id);
      return row ? row.entityType : null;
    },
  };
}
