import type {
  WaitlistEntry,
  WaitlistEntryData,
  WaitlistEntryUpdate,
} from "@crm/contracts";
import { DomainError } from "../../repository.js";
import type { PostgresRepositoryContext } from "./context.js";
import { branchClause } from "./helpers.js";

type EntryRow = Omit<
  WaitlistEntry,
  "createdAt" | "updatedAt" | "resolvedAt"
> & { createdAt: Date; updatedAt: Date; resolvedAt: Date | null };

const columns = `w.id, w.clinic_id AS "clinicId", w.branch_id AS "branchId", w.patient_id AS "patientId",
 p.full_name AS "patientName", p.phone AS "patientPhone", w.kind, w.service_id AS "serviceId",
 w.product_id AS "productId", COALESCE(s.name, pr.name) AS "itemName", w.status, w.notes,
 w.created_at AS "createdAt", w.updated_at AS "updatedAt", w.resolved_at AS "resolvedAt"`;
const from = `waitlist_entries w JOIN patients p ON p.id = w.patient_id
 LEFT JOIN services s ON s.id = w.service_id LEFT JOIN products pr ON pr.id = w.product_id`;

function mapEntry(row: EntryRow): WaitlistEntry {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
  };
}

export function createWaitlistRepository(context: PostgresRepositoryContext) {
  async function findEntry(clinicId: string, id: string) {
    const result = await context.pool.query<EntryRow>(
      `SELECT ${columns} FROM ${from} WHERE w.clinic_id=$1 AND w.id=$2`,
      [clinicId, id],
    );
    return result.rows[0] ? mapEntry(result.rows[0]) : null;
  }
  return {
    async listWaitlist(clinicId: string) {
      return (
        await context.pool.query<EntryRow>(
          `SELECT ${columns} FROM ${from} WHERE w.clinic_id=$1 AND ${branchClause("w.branch_id", 2)} ORDER BY w.created_at, w.id`,
          [clinicId, context.branchReadIds()],
        )
      ).rows.map(mapEntry);
    },
    async createWaitlistEntry(
      clinicId: string,
      _actorUserId: string,
      input: WaitlistEntryData,
    ) {
      const id = await context.inTransaction(async (client) => {
        // Serializa entradas da clínica: duas inclusões simultâneas não duplicam o cliente.
        await client.query(
          "SELECT pg_advisory_xact_lock(hashtextextended($1::text || ':waitlist',0))",
          [clinicId],
        );
        if (
          !(
            await client.query(
              "SELECT 1 FROM patients WHERE clinic_id=$1 AND id=$2",
              [clinicId, input.patientId],
            )
          ).rowCount
        )
          throw new DomainError(
            "PATIENT_NOT_FOUND",
            "Cliente não encontrado.",
            404,
          );
        if (
          input.serviceId &&
          !(
            await client.query(
              "SELECT 1 FROM services WHERE clinic_id=$1 AND id=$2",
              [clinicId, input.serviceId],
            )
          ).rowCount
        )
          throw new DomainError(
            "SERVICE_NOT_FOUND",
            "Serviço não encontrado.",
            404,
          );
        if (
          input.productId &&
          !(
            await client.query(
              `SELECT 1 FROM products WHERE clinic_id=$1 AND id=$2 AND ${branchClause("branch_id", 3)}`,
              [clinicId, input.productId, context.branchReadIds()],
            )
          ).rowCount
        )
          throw new DomainError(
            "PRODUCT_NOT_FOUND",
            "Produto não encontrado.",
            404,
          );
        const duplicate = await client.query<{ itemName: string }>(
          `SELECT COALESCE(s.name, pr.name) AS "itemName" FROM ${from}
           WHERE w.clinic_id=$1 AND w.patient_id=$2 AND w.service_id IS NOT DISTINCT FROM $3
             AND w.product_id IS NOT DISTINCT FROM $4 AND w.status IN ('waiting','contacted')
             AND ${branchClause("w.branch_id", 5)}`,
          [
            clinicId,
            input.patientId,
            input.serviceId,
            input.productId,
            context.branchReadIds(),
          ],
        );
        if (duplicate.rows[0])
          throw new DomainError(
            "WAITLIST_DUPLICATE",
            `O cliente já está na lista de espera de ${duplicate.rows[0].itemName}.`,
            409,
          );
        return (
          await client.query<{ id: string }>(
            `INSERT INTO waitlist_entries (clinic_id,branch_id,patient_id,kind,service_id,product_id,notes)
             VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
            [
              clinicId,
              context.branchWriteId(),
              input.patientId,
              input.kind,
              input.serviceId,
              input.productId,
              input.notes,
            ],
          )
        ).rows[0]!.id;
      });
      return (await findEntry(clinicId, id))!;
    },
    async updateWaitlistEntry(
      clinicId: string,
      _actorUserId: string,
      id: string,
      input: WaitlistEntryUpdate,
    ) {
      const result = await context.pool.query(
        `UPDATE waitlist_entries SET
           status = COALESCE($4, status),
           resolved_at = CASE
             WHEN $4::text IS NULL OR $4 = status THEN resolved_at
             WHEN $4 IN ('waiting','contacted') THEN NULL
             ELSE now() END,
           notes = COALESCE($5, notes),
           updated_at = now()
         WHERE clinic_id=$1 AND id=$2 AND ${branchClause("branch_id", 3)}`,
        [
          clinicId,
          id,
          context.branchReadIds(),
          input.status ?? null,
          input.notes ?? null,
        ],
      );
      return result.rowCount ? findEntry(clinicId, id) : null;
    },
    async deleteWaitlistEntry(clinicId: string, id: string) {
      return Boolean(
        (
          await context.pool.query(
            `DELETE FROM waitlist_entries WHERE clinic_id=$1 AND id=$2 AND ${branchClause("branch_id", 3)}`,
            [clinicId, id, context.branchReadIds()],
          )
        ).rowCount,
      );
    },
  };
}
