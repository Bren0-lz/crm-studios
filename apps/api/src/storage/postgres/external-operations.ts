import type {
  ExternalOperationInput,
  ExternalOperation,
  ExternalOperationContent,
} from "@crm/contracts";
import { DomainError } from "../../repository.js";
import { inspectClinicalAttachment } from "../../modules/clinical/clinical-integrity.js";
import type { PostgresRepositoryContext } from "./context.js";
import { branchClause, hasDatabaseCode } from "./helpers.js";
const columns = `id,clinic_id AS "clinicId",branch_id AS "branchId",kind,counterpart,reference,occurred_on::text AS "occurredOn",patient_id AS "patientId",patient_name AS "patientName",receivable_id AS "receivableId",notes,file_name AS "fileName",mime_type AS "mimeType",size_in_bytes AS "sizeInBytes",sha256,author_user_id AS "authorId",author_name AS "authorName",created_at AS "createdAt"`;
type Row = Omit<
  ExternalOperation,
  "createdAt" | "patientId" | "patientName" | "receivableId"
> & {
  createdAt: Date;
  patientId: string | null;
  patientName: string | null;
  receivableId: string | null;
};
const map = ({
  patientId,
  patientName,
  receivableId,
  ...row
}: Row): ExternalOperation => ({
  ...row,
  ...(patientId ? { patientId } : {}),
  ...(patientName ? { patientName } : {}),
  ...(receivableId ? { receivableId } : {}),
  createdAt: row.createdAt.toISOString(),
});
export function createExternalOperationsRepository(
  context: PostgresRepositoryContext,
) {
  return {
    async listExternalOperations(clinicId: string, patientId?: string) {
      const result = await context.pool.query<Row>(
        `SELECT ${columns} FROM external_operations WHERE clinic_id=$1 AND CASE WHEN $2::uuid IS NULL THEN ${branchClause("branch_id", 3)} ELSE patient_id=$2 END ORDER BY created_at DESC,id`,
        [clinicId, patientId ?? null, context.branchReadIds()],
      );
      return result.rows.map(map);
    },
    async createExternalOperation(
      clinicId: string,
      actorUserId: string,
      input: ExternalOperationInput,
    ) {
      try {
        return await context.inTransaction(async (client) => {
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
          const receivable = input.receivableId
            ? (
                await client.query<{ patientId: string }>(
                  'SELECT patient_id AS "patientId" FROM receivables WHERE clinic_id=$1 AND id=$2 FOR SHARE',
                  [clinicId, input.receivableId],
                )
              ).rows[0]
            : undefined;
          if (
            input.receivableId &&
            (!receivable ||
              (input.patientId && input.patientId !== receivable.patientId))
          )
            throw new DomainError(
              "EXTERNAL_OPERATION_RECEIVABLE",
              "Conta a receber ou cliente incompatível.",
              404,
            );
          const patientId = input.patientId ?? receivable?.patientId,
            patient = patientId
              ? (
                  await client.query<{ name: string }>(
                    "SELECT full_name AS name FROM patients WHERE clinic_id=$1 AND id=$2 FOR SHARE",
                    [clinicId, patientId],
                  )
                ).rows[0]
              : undefined;
          if (patientId && !patient)
            throw new DomainError(
              "PATIENT_NOT_FOUND",
              "Cliente não encontrado.",
              404,
            );
          const { sha256, content } = inspectClinicalAttachment({
            ...input,
            patientId: patientId ?? clinicId,
          });
          const result = await client.query<Row>(
            `INSERT INTO external_operations(clinic_id,kind,counterpart,reference,occurred_on,patient_id,patient_name,receivable_id,notes,file_name,mime_type,size_in_bytes,sha256,content,author_user_id,author_name,branch_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING ${columns}`,
            [
              clinicId,
              input.kind,
              input.counterpart,
              input.reference,
              input.occurredOn,
              patientId ?? null,
              patient?.name ?? null,
              input.receivableId ?? null,
              input.notes,
              input.fileName,
              input.mimeType,
              input.sizeInBytes,
              sha256,
              content,
              actorUserId,
              actor.rows[0].name,
              context.branchWriteId(),
            ],
          );
          const record = map(result.rows[0]!);
          await context.addAdminAudit(
            client,
            clinicId,
            actorUserId,
            "external.operation_recorded",
            "external_operation",
            record.id,
            { kind: input.kind, reference: input.reference, sha256 },
          );
          return record;
        });
      } catch (error) {
        if (hasDatabaseCode(error, "23505"))
          throw new DomainError(
            "EXTERNAL_OPERATION_EXISTS",
            "Esta referência já possui um registro para o emissor ou parceiro informado.",
            409,
          );
        throw error;
      }
    },
    async getExternalOperationContent(
      clinicId: string,
      actorUserId: string,
      id: string,
    ): Promise<ExternalOperationContent | null> {
      return context.inTransaction(async (client) => {
        const result = await client.query<{
          fileName: string;
          mimeType: ExternalOperationInput["mimeType"];
          sizeInBytes: number;
          sha256: string;
          content: Buffer;
        }>(
          'SELECT file_name AS "fileName",mime_type AS "mimeType",size_in_bytes AS "sizeInBytes",sha256,content FROM external_operations WHERE clinic_id=$1 AND id=$2',
          [clinicId, id],
        );
        const file = result.rows[0];
        if (!file) return null;
        await context.addAdminAudit(
          client,
          clinicId,
          actorUserId,
          "external.operation_downloaded",
          "external_operation",
          id,
          { sha256: file.sha256 },
        );
        const { content, ...metadata } = file;
        return { ...metadata, contentBase64: content.toString("base64") };
      });
    },
  };
}
