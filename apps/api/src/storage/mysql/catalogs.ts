import {
  patientTagKey,
  type ClinicCatalogEntry,
  type ClinicCatalogInput,
  type ClinicCatalogKind,
} from "@crm/contracts";
import { DomainError } from "../../repository.js";
import type { MysqlRepositoryContext } from "./context.js";
import { randomUUID } from "node:crypto";
import { hasDatabaseCode, json } from "./helpers.js";

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
export function createCatalogsRepository(context: MysqlRepositoryContext) {
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
          await client.lock(clinicId);
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
          const catalogId = id ?? randomUUID();
          if (id)
            await client.query(
                `UPDATE clinic_catalogs SET name=$4,name_key=$5,active=$6,parent_id=$7,updated_at=NOW(6) WHERE clinic_id=$1 AND kind=$2 AND id=$3`,
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
              );
          else
            await client.query(
                `INSERT INTO clinic_catalogs(clinic_id,kind,name,name_key,active,parent_id,id) VALUES($1,$2,$3,$4,$5,$6,$7)`,
                [
                  clinicId,
                  kind,
                  input.name,
                  patientTagKey(input.name),
                  input.active,
                  input.parentId ?? null,
                  catalogId,
                ],
              );
          const result = await client.query<Row>(
            `SELECT ${columns} FROM clinic_catalogs WHERE id=$1`,
            [catalogId],
          );
          if (current && current.name !== input.name) {
            if (kind === "interest") {
              const affected = await client.query<{
                id: string;
                profile: { interests: string[] };
              }>(
                `SELECT id, profile FROM patients WHERE clinic_id=$1 AND JSON_CONTAINS(JSON_EXTRACT(profile, '$.interests'), JSON_QUOTE($2)) FOR UPDATE`,
                [clinicId, current.name],
              );
              for (const patient of affected.rows) {
                const profile = json<{ interests: string[] }>(patient.profile);
                await client.query(
                  "UPDATE patients SET profile=$2 WHERE id=$1",
                  [
                    patient.id,
                    {
                      ...profile,
                      interests: profile.interests.map((value) =>
                        value === current.name ? input.name : value,
                      ),
                    },
                  ],
                );
              }
            }
            if (kind === "level")
              await client.query(
                `UPDATE patients SET profile=JSON_SET(profile,'$.level',$3) WHERE clinic_id=$1 AND JSON_VALUE(profile, '$.level')=$2`,
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
