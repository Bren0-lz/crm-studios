import {
  patientTagKey,
  type ClinicCatalogEntry,
  type ClinicCatalogInput,
  type ClinicCatalogKind,
} from "@crm/contracts";
import { DomainError } from "../../repository.js";
import type { PostgresRepositoryContext } from "./context.js";
import { hasDatabaseCode } from "./helpers.js";

const columns = `id,clinic_id AS "clinicId",kind,name,active,parent_id AS "parentId",created_at AS "createdAt",updated_at AS "updatedAt"`;
type Row = Omit<ClinicCatalogEntry, "createdAt" | "updatedAt"> & {
  createdAt: Date;
  updatedAt: Date;
};
const map = (row: Row): ClinicCatalogEntry => ({
  ...row,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});
export function createCatalogsRepository(context: PostgresRepositoryContext) {
  return {
    async listClinicCatalog(clinicId: string, kind: ClinicCatalogKind) {
      const result = await context.pool.query<Row>(
        `SELECT ${columns} FROM clinic_catalogs WHERE clinic_id=$1 AND kind=$2 ORDER BY name`,
        [clinicId, kind],
      );
      return result.rows.map(map);
    },
    async saveClinicCatalog(
      clinicId: string,
      actorUserId: string,
      kind: ClinicCatalogKind,
      input: ClinicCatalogInput,
      id?: string,
    ) {
      try {
        return await context.inTransaction(async (client) => {
          await client.query(
            "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
            [clinicId],
          );
          const current = id
            ? (
                await client.query<Row>(
                  `SELECT ${columns} FROM clinic_catalogs WHERE clinic_id=$1 AND kind=$2 AND id=$3 FOR UPDATE`,
                  [clinicId, kind, id],
                )
              ).rows[0]
            : undefined;
          if (id && !current) return null;
          if (input.parentId) {
            if (
              id &&
              (
                await client.query(
                  "SELECT id FROM clinic_catalogs WHERE clinic_id=$1 AND parent_id=$2",
                  [clinicId, id],
                )
              ).rowCount
            )
              throw new DomainError(
                "CATALOG_HAS_SUBCATEGORIES",
                "Uma categoria com subcategorias não pode se tornar subcategoria.",
                409,
              );
            const parent = await client.query(
              "SELECT id FROM clinic_catalogs WHERE clinic_id=$1 AND kind='product_category' AND id=$2 AND parent_id IS NULL AND (active OR id=$3) FOR UPDATE",
              [clinicId, input.parentId, current?.parentId ?? null],
            );
            if (
              kind !== "product_category" ||
              input.parentId === id ||
              !parent.rowCount
            )
              throw new DomainError(
                "CATALOG_INVALID_PARENT",
                "Categoria principal inválida.",
                400,
              );
          }
          const result = id
            ? await client.query<Row>(
                `UPDATE clinic_catalogs SET name=$4,name_key=$5,active=$6,parent_id=$7,updated_at=now() WHERE clinic_id=$1 AND kind=$2 AND id=$3 RETURNING ${columns}`,
                [
                  clinicId,
                  kind,
                  id,
                  input.name,
                  patientTagKey(input.name),
                  input.active,
                  input.parentId === undefined
                    ? (current?.parentId ?? null)
                    : input.parentId,
                ],
              )
            : await client.query<Row>(
                `INSERT INTO clinic_catalogs(clinic_id,kind,name,name_key,active,parent_id) VALUES($1,$2,$3,$4,$5,$6) RETURNING ${columns}`,
                [
                  clinicId,
                  kind,
                  input.name,
                  patientTagKey(input.name),
                  input.active,
                  input.parentId ?? null,
                ],
              );
          if (current && current.name !== input.name) {
            if (kind === "interest")
              await client.query(
                `UPDATE patients SET profile=jsonb_set(profile,'{interests}',(SELECT jsonb_agg(CASE WHEN value=$2 THEN $3 ELSE value END) FROM jsonb_array_elements_text(profile->'interests'))) WHERE clinic_id=$1 AND profile->'interests' ? $2`,
                [clinicId, current.name, input.name],
              );
            if (kind === "level")
              await client.query(
                `UPDATE patients SET profile=jsonb_set(profile,'{level}',to_jsonb($3::text)) WHERE clinic_id=$1 AND profile->>'level'=$2`,
                [clinicId, current.name, input.name],
              );
          }
          const item = map(result.rows[0]!);
          await context.addAdminAudit(
            client,
            clinicId,
            actorUserId,
            "catalog.saved",
            "catalog",
            item.id,
            { kind, name: item.name, active: item.active },
          );
          return item;
        });
      } catch (error) {
        if (hasDatabaseCode(error, "23505"))
          throw new DomainError(
            "CATALOG_DUPLICATE",
            "Já existe um cadastro com este nome.",
            409,
          );
        throw error;
      }
    },
  };
}
